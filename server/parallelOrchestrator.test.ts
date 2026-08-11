import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";

const workspaceRoot = "/tmp/onclick-parallel-orchestrator-test";
let active = 0;
let peak = 0;

vi.mock("./workspaceSession", () => ({
  createWorkspaceSession: vi.fn(async (sessionId: string) => ({
    sessionId,
    workspaceDir: workspaceRoot,
    snapshotDir: `${workspaceRoot}/state`,
    status: "running",
    mode: "temporary",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })),
  getWorkspaceSession: vi.fn(() => ({
    sessionId: "task-1",
    workspaceDir: workspaceRoot,
    snapshotDir: `${workspaceRoot}/state`,
    status: "running",
    mode: "persistent",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })),
}));

vi.mock("./browserEngine", () => ({
  executeRealBrowserAction: vi.fn(
    async (_sessionId: string, _action: string, params: { query: string }) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise(resolve =>
        setTimeout(resolve, params.query === "slow" ? 20 : 1)
      );
      active--;
      return {
        success: true,
        query: params.query,
        observation: `Real browser observation for ${params.query}`,
      };
    }
  ),
}));

describe("Parallel research orchestration", () => {
  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
    active = 0;
    peak = 0;
  });

  it("runs isolated browser subagents concurrently and writes a consolidated artifact", async () => {
    const { executeParallelResearch } = await import("./parallelOrchestrator");
    const result = await executeParallelResearch(1, ["slow", "fast"]);

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(peak).toBeGreaterThan(1);
    const artifact = JSON.parse(
      await fs.readFile(result.consolidatedPath, "utf8")
    );
    expect(artifact.results).toHaveLength(2);
    expect(artifact.results.every((item: any) => item.success)).toBe(true);
  });
});
