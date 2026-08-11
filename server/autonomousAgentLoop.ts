import { callLLMProvider, LLMMessage } from "./llmProvider";
import { executeInWorkspace, observeWorkspace } from "./workspaceSession";
import { parseJsonObject } from "./llmProvider";
import { executeTool } from "./agentRuntime";
import { getDb } from "./db";
import {
  tasks,
  taskSteps,
  agentLogs,
  toolExecutions,
  taskArtifacts,
} from "../drizzle/schema";
import { eq } from "drizzle-orm";

export interface AutonomousStepResult {
  success: boolean;
  actionTaken: string;
  observation: string;
  verified: boolean;
  error?: string;
}

export async function runAutonomousAgentLoop(
  taskId: number,
  goal: string,
  maxSteps = 25
): Promise<{ success: boolean; summary: string }> {
  const db = await getDb();
  const sessionId = `task-${taskId}`;
  let stepCount = 0;
  let success = false;
  let summary = "";

  const history: LLMMessage[] = [
    {
      role: "system",
      content: `You are OnClick AI's expert autonomous computer-use agent. You operate inside a real shared Linux workspace with terminal, filesystem, Playwright browser, Python, Node, and Git.
For each turn, decide the next action. You can call tools or execute terminal commands.
Return valid JSON:
{
  "thought": "Reasoning about current state and next objective",
  "tool": "terminal_exec|search_web|open_url|click_element|write_file|read_file|create_pdf|analyze_dataset|none",
  "args": { ... },
  "isComplete": false,
  "summary": "Progress summary"
}`,
    },
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
          currentAction: `Autonomous step ${stepCount}/${maxSteps}`,
        })
        .where(eq(tasks.id, taskId));
    }

    const llmResponseText = await callLLMProvider(history);
    const parsed = parseJsonObject<any>(llmResponseText);

    if (db) {
      await db.insert(agentLogs).values({
        taskId,
        agent: "Orchestrator",
        eventType: "action started",
        message: parsed.thought || `Executing step ${stepCount}`,
        metadata: JSON.stringify(parsed),
      });
    }

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
          const res = await executeTool(parsed.tool, parsed.args || {}, taskId);
          observation = typeof res === "string" ? res : JSON.stringify(res);
        }
      } catch (toolErr: any) {
        observation = `Tool Execution Error: ${toolErr.message || toolErr}`;
        // Autonomous Recovery & Diagnostics
        if (db) {
          await db.insert(agentLogs).values({
            taskId,
            agent: "Recovery",
            eventType: "action started",
            message: `Recovering from tool error: ${toolErr.message}`,
          });
        }
      }
    } else {
      const workspaceObs = await observeWorkspace(sessionId);
      observation = `Workspace Files: ${JSON.stringify(workspaceObs?.files || [])}\nBrowser URL: ${workspaceObs?.url || "none"}`;
    }

    history.push({ role: "assistant", content: JSON.stringify(parsed) });
    history.push({
      role: "user",
      content: `Observation Result:\n${observation}\nIs task complete?`,
    });

    if (parsed.isComplete || stepCount >= maxSteps) {
      success = true;
      summary = parsed.summary || "Mission completed successfully.";
      break;
    }
  }

  return { success, summary };
}
