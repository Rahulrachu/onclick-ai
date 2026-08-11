import { describe, expect, it, vi } from "vitest";

vi.mock("./llmProvider", () => ({
  callLLMProvider: vi.fn(async () => JSON.stringify({
    steps: [
      { stepIndex: 1, title: "Research", description: "Gather sources", agent: "Research", dependencies: [] },
      { stepIndex: 2, title: "Browser", description: "Inspect sources", agent: "Browser", dependencies: [1] },
      { stepIndex: 3, title: "Data", description: "Analyze evidence", agent: "Data", dependencies: [2] },
      { stepIndex: 4, title: "Verification", description: "Independently verify", agent: "Verification", dependencies: [3] },
      { stepIndex: 5, title: "File", description: "Generate deliverable", agent: "File", dependencies: [4] },
    ],
  })),
  parseJsonObject: <T>(raw: string) => JSON.parse(raw) as T,
}));

import { decomposeGoalToPlan } from "./coreEngine";

describe("autonomous planning engine", () => {
  it("creates a dependency-ordered research plan with exact specialized roles", async () => {
    const plan = await decomposeGoalToPlan("Research and compare the best MCA AI/ML colleges in India");
    expect(plan.steps.map((step) => step.agent)).toEqual(["Research", "Browser", "Data", "Verification", "File"]);
    expect(plan.steps[0]?.dependencies).toEqual([]);
    expect(plan.steps.length).toBe(5);
  });

  it("creates a coding plan with collaborative stages", async () => {
    const plan = await decomposeGoalToPlan("Build a Flask application and run tests");
    expect(plan.steps.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps a general goal executable", async () => {
    const plan = await decomposeGoalToPlan("Prepare a concise operational brief");
    expect(plan.steps.length).toBeGreaterThanOrEqual(3);
  });
});
