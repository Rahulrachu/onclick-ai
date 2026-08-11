import { describe, it, expect, vi } from "vitest";
const { callLLMProvider } = vi.hoisted(() => ({
  callLLMProvider: vi.fn(async () =>
    JSON.stringify({
      thought: "Inspect workspace",
      tool: "terminal_exec",
      args: { command: "true" },
      isComplete: true,
      summary: "Workspace command completed",
    })
  ),
}));
vi.mock("./llmProvider", () => ({
  callLLMProvider,
  parseJsonObject: (raw: string) => JSON.parse(raw),
}));

import { runAutonomousAgentLoop } from "./autonomousAgentLoop";

describe("Autonomous Agent Loop", () => {
  it("runs the autonomous loop for a given task and goal", async () => {
    const res = await runAutonomousAgentLoop(
      999,
      "Test autonomous loop execution",
      2
    );
    expect(res).toBeDefined();
    expect(typeof res.success).toBe("boolean");
  });
});
