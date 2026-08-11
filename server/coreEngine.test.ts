import { describe, expect, it } from "vitest";
import { decomposeGoalToPlan } from "./coreEngine";

describe("autonomous planning engine", () => {
  it("creates a dependency-ordered research plan with exact specialized roles", () => {
    const plan = decomposeGoalToPlan("Research and compare the best MCA AI/ML colleges in India");
    expect(plan.steps.map((step) => step.agent)).toEqual(["Research", "Browser", "Data", "Verification", "File"]);
    expect(plan.steps[0]?.dependencies).toEqual([]);
    expect(plan.steps[4]?.dependencies).toEqual([4]);
    expect(plan.steps.length).toBe(5);
  });

  it("creates a coding plan with security and recovery stages", () => {
    const plan = decomposeGoalToPlan("Build a Flask application and run tests");
    expect(plan.steps.map((step) => step.agent)).toEqual(["Coding", "Coding", "Security", "Recovery", "File"]);
    expect(plan.steps[2]?.dependencies).toEqual([2]);
    expect(plan.steps[3]?.dependencies).toEqual([3]);
  });

  it("keeps a general goal executable with sequential dependencies", () => {
    const plan = decomposeGoalToPlan("Prepare a concise operational brief");
    expect(plan.steps).toHaveLength(4);
    expect(plan.steps.map((step) => step.dependencies)).toEqual([[], [1], [2], [3]]);
  });
});
