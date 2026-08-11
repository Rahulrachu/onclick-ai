import { callLLMProvider, LLMMessage } from "./llmProvider";
import { executeInWorkspace } from "./workspaceSession";

export interface SubAgentTask {
  subAgentId: string;
  role: string;
  objective: string;
}

export interface SubAgentResult {
  subAgentId: string;
  role: string;
  output: string;
  success: boolean;
}

export async function runParallelSubAgents(tasks: SubAgentTask[]): Promise<SubAgentResult[]> {
  const promises = tasks.map(async (task) => {
    const messages: LLMMessage[] = [
      {
        role: "system",
        content: `You are an independent specialized subagent with role: ${task.role}. Execute your objective and return your findings.`
      },
      { role: "user", content: task.objective }
    ];

    try {
      const output = await callLLMProvider(messages);
      return {
        subAgentId: task.subAgentId,
        role: task.role,
        output,
        success: true,
      };
    } catch (err: any) {
      return {
        subAgentId: task.subAgentId,
        role: task.role,
        output: `Subagent failed: ${err.message || err}`,
        success: false,
      };
    }
  });

  return Promise.all(promises);
}
