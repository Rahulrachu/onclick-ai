import { describe, it, expect, vi } from "vitest";

const { callLLMProvider } = vi.hoisted(() => ({
  callLLMProvider: vi
    .fn()
    .mockResolvedValueOnce(
      JSON.stringify({
        thought: "Inspect workspace",
        tool: "none",
        args: {},
        isComplete: true,
        summary: "Inspected workspace",
      })
    )
    .mockResolvedValueOnce(
      JSON.stringify({
        verified: true,
        reason: "The workspace observation is consistent with the mission.",
      })
    ),
}));
vi.mock("./llmProvider", () => ({
  callLLMProvider,
  parseJsonObject: (raw: string) =>
    JSON.parse(
      raw
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim()
    ),
}));

import { executeRealAutonomousMission } from "./truthAuditor";

describe("Truth Auditor & Real Execution Loop", () => {
  it("executes the mission and returns execution traces", async () => {
    const result = await executeRealAutonomousMission(
      888,
      "Test audit mission",
      1
    );
    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("traces");
    expect(result.traces.length).toBeGreaterThan(0);
  });
});
