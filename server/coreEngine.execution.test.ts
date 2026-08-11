import { describe, expect, it, vi } from "vitest";

const { executeTool, logAgentEvent, callLLMProvider } = vi.hoisted(() => ({
  executeTool: vi.fn(async () => ({
    status: "success",
    success: true,
    output: "ok",
  })),
  logAgentEvent: vi.fn(async () => undefined),
  callLLMProvider: vi.fn(),
}));

vi.mock("./db", () => ({
  getDb: vi.fn(),
}));
vi.mock("./agentRuntime", () => ({
  executeTool,
  logAgentEvent,
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

import { getDb } from "./db";
import { executeTaskWithSelfCorrection } from "./coreEngine";

function createFakeDb() {
  const updatePayloads: unknown[] = [];
  const insertedSteps: unknown[] = [];
  const task = {
    id: 17,
    status: "pending",
    goal: "Research and compare AI colleges",
    userId: 42,
  };
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
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve([]).then(resolve),
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
    callLLMProvider
      .mockResolvedValueOnce(
        JSON.stringify({
          steps: [
            {
              stepIndex: 1,
              title: "Research",
              description: "Gather sources",
              agent: "Research",
              dependencies: [],
            },
            {
              stepIndex: 2,
              title: "Analysis",
              description: "Analyze findings",
              agent: "Data",
              dependencies: [1],
            },
            {
              stepIndex: 3,
              title: "Report",
              description: "Create report",
              agent: "File",
              dependencies: [2],
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          thought: "Search sources",
          tool: "search_web",
          args: { query: "AI colleges" },
          isComplete: false,
          summary: "Sources gathered",
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          thought: "Analyze sources",
          tool: "analyze_dataset",
          args: { data: "source results" },
          isComplete: false,
          summary: "Analysis complete",
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          thought: "Create report",
          tool: "create_pdf",
          args: { name: "report.pdf", content: "Verified report" },
          isComplete: true,
          summary: "Report created",
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          verified: true,
          reason:
            "The report artifact and workspace evidence satisfy the goal.",
        })
      );

    await executeTaskWithSelfCorrection(17);

    expect(executeTool).toHaveBeenCalledWith(
      17,
      "search_web",
      expect.any(Object)
    );
    expect(executeTool).toHaveBeenCalledWith(
      17,
      "analyze_dataset",
      expect.any(Object)
    );
    expect(executeTool).toHaveBeenCalledWith(
      17,
      "create_pdf",
      expect.any(Object)
    );
    expect(db.insertedSteps).toHaveLength(3);
    expect(db.updatePayloads).toContainEqual(
      expect.objectContaining({ status: "completed", progressPercent: 100 })
    );
    expect(logAgentEvent).toHaveBeenCalledWith(
      17,
      "Orchestrator",
      "result observed",
      "Mission completed with independent verification."
    );
  });
});
