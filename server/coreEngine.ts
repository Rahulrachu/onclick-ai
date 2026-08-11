import { getDb } from "./db";
import { tasks, taskSteps } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { executeTool, logAgentEvent, AgentRole } from "./agentRuntime";
import { callLLMProvider, LLMMessage, parseJsonObject } from "./llmProvider";
import {
  createWorkspaceSession,
  executeInWorkspace,
  observeWorkspace,
  snapshotWorkspace,
  getWorkspaceSession,
} from "./workspaceSession";
import { validateCommand } from "./security";

export interface ExecutionPlan {
  goal: string;
  steps: {
    stepIndex: number;
    title: string;
    description: string;
    agent: AgentRole;
    dependencies: number[];
  }[];
}

type AgentDecision = {
  thought: string;
  tool: string;
  args: Record<string, any>;
  isComplete?: boolean;
  summary?: string;
};

type VerificationDecision = {
  verified: boolean;
  reason: string;
  requiredRecovery?: string;
};

const AGENT_ROLES: AgentRole[] = [
  "Orchestrator",
  "Planner",
  "Research",
  "Browser",
  "Coding",
  "File",
  "Data",
  "Reasoning",
  "Verification",
  "Critic",
  "Recovery",
  "Security",
];

const DECISION_TOOLS = new Set([
  "terminal_exec",
  "execute_command",
  "search_web",
  "parallel_research",
  "open_url",
  "extract_page",
  "screenshot_page",
  "click_element",
  "type_form",
  "list",
  "read",
  "write",
  "edit",
  "create_document",
  "create_pdf",
  "create_spreadsheet",
  "parse_csv",
  "analyze_dataset",
  "generate_chart",
  "none",
]);

function normalizeAgentRole(value: unknown): AgentRole {
  return AGENT_ROLES.includes(value as AgentRole)
    ? (value as AgentRole)
    : "Orchestrator";
}

function normalizeDecision(raw: string): AgentDecision {
  const parsed = parseJsonObject<Partial<AgentDecision>>(raw);
  const tool = typeof parsed.tool === "string" ? parsed.tool : "none";
  if (!DECISION_TOOLS.has(tool)) {
    throw new Error(`Model selected unsupported tool: ${tool}`);
  }
  return {
    thought:
      typeof parsed.thought === "string"
        ? parsed.thought
        : "Model did not provide a thought summary.",
    tool,
    args: parsed.args && typeof parsed.args === "object" ? parsed.args : {},
    isComplete: Boolean(parsed.isComplete),
    summary: typeof parsed.summary === "string" ? parsed.summary : undefined,
  };
}

async function markTaskFailed(taskId: number, message: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(tasks)
    .set({
      status: "failed",
      error: message,
      activeAgent: "Recovery",
      currentAction: "Execution stopped because a live dependency failed",
    })
    .where(eq(tasks.id, taskId));
  await logAgentEvent(taskId, "Recovery", "result observed", message);
}

async function verifyMissionIndependently(
  taskId: number,
  goal: string,
  sessionId: string,
  latestObservation: string
): Promise<VerificationDecision> {
  const workspace = await observeWorkspace(sessionId);
  const files = workspace?.files || [];
  const verificationPrompt = `You are an independent Verification agent. Do not assume the primary agent is correct. Inspect the real execution evidence below and decide whether the mission is complete. Return JSON only: {"verified":boolean,"reason":"...","requiredRecovery":"..."}. A mission is verified only when the evidence demonstrates that the stated goal was actually completed, not merely that a tool returned success.\n\nGoal:\n${goal}\n\nLatest observation:\n${latestObservation}\n\nWorkspace files:\n${JSON.stringify(files)}`;
  const raw = await callLLMProvider([
    {
      role: "system",
      content:
        "You are a skeptical independent verifier for autonomous computer-use missions.",
    },
    { role: "user", content: verificationPrompt },
  ]);
  const result = parseJsonObject<VerificationDecision>(raw);
  return {
    verified:
      Boolean(result.verified) &&
      !latestObservation.includes("Tool Execution Error"),
    reason:
      typeof result.reason === "string"
        ? result.reason
        : "Verifier did not provide a reason.",
    requiredRecovery:
      typeof result.requiredRecovery === "string"
        ? result.requiredRecovery
        : undefined,
  };
}

// Autonomous Planner Engine. Planning is live-model-only; no keyword or deterministic fallback is used.
export async function decomposeGoalToPlan(
  goal: string
): Promise<ExecutionPlan> {
  const messages: LLMMessage[] = [
    {
      role: "system",
      content:
        'You are OnClick AI\'s expert Planner. Decompose the user goal into 4 to 6 sequential collaborative steps across specialized agents (Research, Browser, Data, Coding, Verification, File). Return valid JSON only: {"steps":[{"stepIndex":1,"title":"...","description":"...","agent":"Research|Browser|Data|Coding|Verification|File","dependencies":[]}]}. Do not invent completed results.',
    },
    { role: "user", content: goal },
  ];
  const raw = await callLLMProvider(messages);
  const parsed = parseJsonObject<{ steps?: any[] }>(raw);
  if (!parsed || !Array.isArray(parsed.steps) || parsed.steps.length === 0) {
    throw new Error("Planner returned an empty execution plan.");
  }
  return {
    goal,
    steps: parsed.steps.map((step: any, index: number) => ({
      stepIndex: Number.isInteger(step.stepIndex) ? step.stepIndex : index + 1,
      title: typeof step.title === "string" ? step.title : `Step ${index + 1}`,
      description: typeof step.description === "string" ? step.description : "",
      agent: normalizeAgentRole(step.agent),
      dependencies: Array.isArray(step.dependencies)
        ? step.dependencies.filter((value: unknown) => Number.isInteger(value))
        : [],
    })),
  };
}

// Full autonomous execution loop with shared workspace state, observation feedback, independent verification, and recovery.
export async function executeTaskWithSelfCorrection(
  taskId: number,
  maxSteps = 30
) {
  const db = await getDb();
  if (!db) return { success: false, reason: "Database unavailable" };
  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!task || !["pending", "running"].includes(task.status))
    return { success: false, reason: "Task is not runnable" };

  const sessionId = `task-${taskId}`;
  try {
    const workspace = await createWorkspaceSession(sessionId);
    await db
      .update(tasks)
      .set({
        status: "running",
        activeAgent: "Orchestrator",
        currentAction: `Workspace session ${workspace.status} initialized`,
      })
      .where(eq(tasks.id, taskId));
    await logAgentEvent(
      taskId,
      "Orchestrator",
      "result observed",
      `Shared workspace initialized at ${workspace.workspaceDir}.`,
      { sessionId }
    );

    const plan = await decomposeGoalToPlan(task.goal);
    await db
      .update(tasks)
      .set({
        activeAgent: "Planner",
        currentAction: "Live model plan accepted",
        totalSteps: plan.steps.length,
      })
      .where(eq(tasks.id, taskId));
    await logAgentEvent(
      taskId,
      "Planner",
      "plan updated",
      `Live model generated ${plan.steps.length} plan steps.`,
      { plan }
    );

    for (const step of plan.steps) {
      await db.insert(taskSteps).values({
        taskId,
        stepIndex: step.stepIndex,
        title: step.title,
        description: step.description,
        agent: step.agent,
        status: step.stepIndex === 1 ? "running" : "pending",
      });
    }

    const history: LLMMessage[] = [
      {
        role: "system",
        content: `You are OnClick AI's autonomous execution agent. Work only from real observations in the shared workspace session. Select exactly one supported tool per turn and return JSON only: {"thought":"...","tool":"terminal_exec|execute_command|search_web|parallel_research|open_url|extract_page|screenshot_page|click_element|type_form|list|read|write|edit|create_document|create_pdf|create_spreadsheet|parse_csv|analyze_dataset|generate_chart|none","args":{},"isComplete":false,"summary":"..."}. Never claim completion without evidence. Use terminal_exec for commands in the shared workspace, and use the browser/filesystem/document tools for their actual operations. Replan after errors.`,
      },
      {
        role: "user",
        content: `Mission goal: ${task.goal}\nInitial live plan: ${JSON.stringify(plan)}`,
      },
    ];

    let latestObservation =
      "Workspace initialized; no action has executed yet.";
    let finalSummary = "";
    for (let stepNumber = 1; stepNumber <= maxSteps; stepNumber++) {
      const [liveTask] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, taskId))
        .limit(1);
      if (
        !liveTask ||
        liveTask.status === "cancelled" ||
        liveTask.status === "failed"
      )
        return { success: false, reason: "Task stopped by state transition" };
      if (liveTask.status === "paused")
        return { success: false, reason: "Task paused awaiting user action" };

      await db
        .update(tasks)
        .set({
          currentStepIndex: Math.min(stepNumber, plan.steps.length),
          progressPercent: Math.min(
            95,
            Math.round((stepNumber / maxSteps) * 100)
          ),
          activeAgent: "Orchestrator",
          currentAction: `Reasoning from live observation at autonomous step ${stepNumber}`,
        })
        .where(eq(tasks.id, taskId));

      const decision = normalizeDecision(await callLLMProvider(history));
      await logAgentEvent(
        taskId,
        "Orchestrator",
        "action started",
        decision.thought,
        { stepNumber, tool: decision.tool, args: decision.args }
      );

      let observation = "";
      let executionSucceeded = true;
      if (decision.tool === "none") {
        const current = await observeWorkspace(sessionId);
        observation = JSON.stringify({
          kind: "workspace_observation",
          files: current?.files || [],
          url: current?.url || null,
        });
      } else if (
        decision.tool === "terminal_exec" ||
        decision.tool === "execute_command"
      ) {
        const command = validateCommand(String(decision.args.command || ""));
        const result = await executeInWorkspace(sessionId, command);
        executionSucceeded = result.exitCode === 0;
        observation = JSON.stringify({
          kind: "terminal_observation",
          ...result,
        });
      } else {
        const result = await executeTool(taskId, decision.tool, decision.args);
        observation =
          typeof result === "string" ? result : JSON.stringify(result);
        executionSucceeded =
          (result as any)?.status !== "failed" &&
          (result as any)?.status !== "pending_approval" &&
          (result as any)?.output?.success !== false;
        if ((result as any)?.status === "pending_approval") {
          await db
            .update(tasks)
            .set({
              status: "paused",
              currentAction: `Waiting for approval to run ${decision.tool}`,
            })
            .where(eq(tasks.id, taskId));
          await logAgentEvent(
            taskId,
            "Security",
            "approval requested",
            `Mission paused while ${decision.tool} awaits approval.`
          );
          return { success: false, reason: "Approval required" };
        }
      }

      latestObservation = observation;
      await logAgentEvent(
        taskId,
        "Orchestrator",
        "result observed",
        `Observation captured after autonomous step ${stepNumber}.`,
        { observation, executionSucceeded }
      );
      history.push({ role: "assistant", content: JSON.stringify(decision) });
      history.push({
        role: "user",
        content: `REAL OBSERVATION after step ${stepNumber}:\n${observation}\nExecution success: ${executionSucceeded}\nDecide the next action or request verification.`,
      });

      if (!executionSucceeded) {
        await logAgentEvent(
          taskId,
          "Recovery",
          "action started",
          `The last action failed; re-planning from the real error observation.`
        );
        continue;
      }

      if (decision.isComplete) {
        await logAgentEvent(
          taskId,
          "Verification",
          "action started",
          "Independent verifier is checking the real workspace and latest observation."
        );
        const verification = await verifyMissionIndependently(
          taskId,
          task.goal,
          sessionId,
          latestObservation
        );
        await logAgentEvent(
          taskId,
          "Verification",
          "result observed",
          verification.reason,
          {
            verified: verification.verified,
            requiredRecovery: verification.requiredRecovery,
          }
        );
        if (verification.verified) {
          finalSummary = decision.summary || verification.reason;
          const snapshotPath = getWorkspaceSession(sessionId)
            ? await snapshotWorkspace(sessionId)
            : null;
          await db
            .update(tasks)
            .set({
              status: "completed",
              activeAgent: "Orchestrator",
              currentAction: "Mission completed and independently verified",
              progressPercent: 100,
              summary: `${finalSummary}${snapshotPath ? ` Snapshot: ${snapshotPath}` : ""}`,
            })
            .where(eq(tasks.id, taskId));
          await logAgentEvent(
            taskId,
            "Orchestrator",
            "result observed",
            "Mission completed with independent verification."
          );
          return { success: true, summary: finalSummary };
        }
        history.push({
          role: "user",
          content: `Independent verification rejected completion: ${verification.reason}. Recovery required: ${verification.requiredRecovery || "inspect the evidence and continue."}`,
        });
        await logAgentEvent(
          taskId,
          "Recovery",
          "action started",
          "Verifier rejected completion; continuing with replanning."
        );
      }
    }

    throw new Error(
      `Autonomous loop reached the ${maxSteps}-step limit without independent verification.`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markTaskFailed(taskId, message);
    return { success: false, reason: message };
  }
}
