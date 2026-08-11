import { describe, it, expect, vi } from "vitest";

const { callLLMProvider } = vi.hoisted(() => ({
  callLLMProvider: vi.fn(
    async (messages: any[]) =>
      `Live test response for ${messages.at(-1)?.content || "objective"}`
  ),
}));
vi.mock("./llmProvider", () => ({ callLLMProvider }));

import { runParallelSubAgents } from "./parallelAgents";

describe("Parallel SubAgents", () => {
  it("orchestrates multiple subagents concurrently", async () => {
    const results = await runParallelSubAgents([
      {
        subAgentId: "sub-1",
        role: "Research",
        objective: "Find top AI trends",
      },
      { subAgentId: "sub-2", role: "Data", objective: "Analyze market share" },
    ]);
    expect(results).toHaveLength(2);
    expect(results[0].subAgentId).toBe("sub-1");
    expect(results[1].subAgentId).toBe("sub-2");
  });
});
