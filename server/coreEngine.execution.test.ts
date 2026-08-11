import { describe, expect, it, vi } from "vitest";

const { executeTool, logAgentEvent } = vi.hoisted(() => ({
  executeTool: vi.fn(async () => ({ success: true, output: "ok" })),
  logAgentEvent: vi.fn(async () => undefined),
}));

vi.mock("./db", () => ({
  getDb: vi.fn(),
}));
vi.mock("./agentRuntime", () => ({
  executeTool,
  logAgentEvent,
}));

import { getDb } from "./db";
import { executeTaskWithSelfCorrection } from "./coreEngine";

function createFakeDb() {
  const updatePayloads: unknown[] = [];
  const insertedSteps: unknown[] = [];
  const task = { id: 17, status: "pending", goal: "Research and compare AI colleges", userId: 42 };
  const makeChain = () => {
    const chain: Record<string, any> = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: async () => [task],
      set: (payload: unknown) => {
        updatePayloads.push(payload);
        return chain;
      },
      values: async (payload: unknown) => {
        insertedSteps.push(payload);
        return { insertId: insertedSteps.length };
      },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve([]).then(resolve),
    };
    return chain;
  };
  return {
    updatePayloads,
    insertedSteps,
    select: () => makeChain(),
    update: () => makeChain(),
    insert: () => makeChain(),
  };
}

describe("executeTaskWithSelfCorrection", () => {
  it("executes a real research plan through tools and closes the task", async () => {
    const db = createFakeDb();
    vi.mocked(getDb).mockResolvedValue(db as never);

    await executeTaskWithSelfCorrection(17);

    expect(executeTool).toHaveBeenCalledWith(17, "search_web", expect.any(Object));
    expect(executeTool).toHaveBeenCalledWith(17, "analyze_dataset", expect.any(Object));
    expect(executeTool).toHaveBeenCalledWith(17, "create_pdf", expect.any(Object));
    expect(db.insertedSteps).toHaveLength(5);
    expect(db.updatePayloads).toContainEqual(expect.objectContaining({ status: "completed", progressPercent: 100 }));
    expect(logAgentEvent).toHaveBeenCalledWith(17, "Orchestrator", "result observed", "Task completed with 100% success.");
  });
});
