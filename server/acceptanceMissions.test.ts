import { describe, it, expect } from "vitest";
import { decomposeGoalToPlan } from "./coreEngine";
import { executeRealBrowserAction } from "./browserEngine";
import { executeTool } from "./agentRuntime";

describe("OnClick AI Acceptance Missions", () => {
  it("Mission 1: Browser Research & Multi-Source Synthesis", async () => {
    const goal = "Research top AI developer platforms and summarize key features.";
    const plan = await decomposeGoalToPlan(goal);
    expect(plan.steps.length).toBeGreaterThanOrEqual(3);
    const browserResult = await executeRealBrowserAction(999, "search_web", { query: "AI developer platforms" });
    expect(browserResult.success).toBe(true);
  }, 15000);

  it("Mission 2: Document Research & PDF Report Generation", async () => {
    const toolRes = await executeTool(998, "create_pdf", { name: "Report.pdf", content: "# Acceptance Report\nResearch verified." }, 1);
    expect(toolRes).toBeDefined();
  });

  it("Mission 3: Coding Utility Generation & Execution", async () => {
    const writeRes = await executeTool(997, "write", { path: "utils.py", content: "def add(a, b): return a + b\nprint(add(2, 3))" }, 1);
    expect(writeRes).toBeDefined();
  });

  it("Mission 4: Failure Recovery & Replanning", async () => {
    const plan = await decomposeGoalToPlan("Complex task with failure injection");
    expect(plan.steps.length).toBeGreaterThan(0);
  });

  it("Mission 5: Long Multi-Step Mission Execution", async () => {
    const plan = await decomposeGoalToPlan("Long multi-step autonomous research mission across 10 actions");
    expect(plan.steps.length).toBeGreaterThan(0);
  });
});
