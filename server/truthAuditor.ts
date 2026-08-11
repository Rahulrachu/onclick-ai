import { callLLMProvider, LLMMessage } from "./llmProvider";
import { executeInWorkspace, observeWorkspace } from "./workspaceSession";
import { parseJsonObject } from "./llmProvider";
import { executeTool } from "./agentRuntime";
import { getDb } from "./db";
import { tasks, agentLogs } from "../drizzle/schema";
import { eq } from "drizzle-orm";

export interface ExecutionTraceStep {
  stepIndex: number;
  thought: string;
  tool: string;
  args: any;
  observation: string;
  verified: boolean;
}

export async function executeRealAutonomousMission(
  taskId: number,
  goal: string,
  maxSteps = 30
): Promise<{
  success: boolean;
  summary: string;
  traces: ExecutionTraceStep[];
}> {
  const db = await getDb();
  const sessionId = `task-${taskId}`;
  const traces: ExecutionTraceStep[] = [];
  let stepCount = 0;
  let success = false;
  let summary = "";

  const systemPrompt = `You are OnClick AI's supreme autonomous agent. You operate inside a real shared Linux workspace with terminal, filesystem, Playwright browser, Python, Node, Git, and network access.
For each turn, you MUST use real tool execution and analyze real observations. Never simulate or fake results.
Return valid JSON:
{
  "thought": "Deep reasoning about current observation and next step",
  "tool": "terminal_exec|search_web|open_url|click_element|write_file|read_file|create_pdf|analyze_dataset|none",
  "args": { ... },
  "isComplete": false,
  "summary": "Current progress summary"
}`;

  const history: LLMMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `Mission Goal: ${goal}` },
  ];

  while (stepCount < maxSteps) {
    stepCount++;
    if (db) {
      await db
        .update(tasks)
        .set({
          progressPercent: Math.min(
            95,
            Math.round((stepCount / maxSteps) * 100)
          ),
          currentAction: `Truth audit step ${stepCount}/${maxSteps}`,
        })
        .where(eq(tasks.id, taskId));
    }

    let responseText = "";
    try {
      responseText = await callLLMProvider(history);
    } catch (err: any) {
      // Enforce strict unconfigured model reporting as requested in the specification
      const errMessage = err?.message || String(err);
      if (
        errMessage.includes("404") ||
        errMessage.includes("API key") ||
        errMessage.includes("unconfigured")
      ) {
        throw new Error(
          "No live model configured. Please configure valid LLM credentials to execute autonomous missions."
        );
      }
      throw err;
    }

    const parsed = parseJsonObject<any>(responseText);
    if (typeof parsed.tool !== "string")
      throw new Error("Live model did not select a tool.");

    let observation = "";
    if (parsed.tool && parsed.tool !== "none") {
      try {
        if (parsed.tool === "terminal_exec") {
          if (
            typeof parsed.args?.command !== "string" ||
            !parsed.args.command.trim()
          )
            throw new Error("terminal_exec requires a real command");
          const res = await executeInWorkspace(sessionId, parsed.args.command);
          observation = `Exit Code: ${res.exitCode}\nSTDOUT:\n${res.stdout}\nSTDERR:\n${res.stderr}`;
        } else {
          const res = await executeTool(taskId, parsed.tool, parsed.args || {});
          observation = typeof res === "string" ? res : JSON.stringify(res);
        }
      } catch (toolErr: any) {
        observation = `Tool Error: ${toolErr.message || toolErr}`;
      }
    } else {
      const obs = await observeWorkspace(sessionId);
      observation = `Workspace Files: ${JSON.stringify(obs?.files || [])}\nURL: ${obs?.url || "none"}`;
    }

    // Independent Verification Pass: evidence is only verified when a separate verifier model accepts it.
    let verified = false;
    try {
      const verification = await callLLMProvider([
        {
          role: "system",
          content:
            'You are an independent verifier. Return JSON only: {"verified":boolean,"reason":"..."}. Do not trust a success flag without evidence.',
        },
        {
          role: "user",
          content: `Goal: ${goal}\nTool: ${parsed.tool}\nObservation: ${observation}`,
        },
      ]);
      const verificationResult = parseJsonObject<{ verified?: boolean }>(
        verification
      );
      verified =
        verificationResult.verified === true &&
        !observation.includes("Error") &&
        !observation.includes("Exit Code: 1");
    } catch {
      verified = false;
    }

    traces.push({
      stepIndex: stepCount,
      thought: parsed.thought || "Executing autonomous action",
      tool: parsed.tool || "none",
      args: parsed.args || {},
      observation,
      verified,
    });

    history.push({ role: "assistant", content: JSON.stringify(parsed) });
    history.push({
      role: "user",
      content: `Observation:\n${observation}\nVerified: ${verified}\nIs mission complete?`,
    });

    if (parsed.isComplete || stepCount >= maxSteps) {
      success = verified;
      summary =
        parsed.summary || "Mission completed with verified observation state.";
      break;
    }
  }

  return { success, summary, traces };
}
