import { describe, expect, it } from "vitest";
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
