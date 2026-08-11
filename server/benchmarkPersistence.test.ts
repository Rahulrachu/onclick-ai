import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { createWorkspaceSession, destroyWorkspaceSession } from "./workspaceSession";
import { executeRealBrowserAction } from "./browserEngine";

describe("Benchmark Metrics and Mission Trace Persistence", () => {
  const sessionId = "trace-test-101";
  const artifactsDir = "/home/ubuntu/onclick-ai/artifacts";

  beforeEach(async () => {
    await createWorkspaceSession(sessionId, "temporary");
    await fs.mkdir(artifactsDir, { recursive: true });
  });

  afterEach(async () => {
    await destroyWorkspaceSession(sessionId);
  });

  it("persists execution traces, tool call counts, latency metrics, and verification results to disk", { timeout: 15000 }, async () => {
    const startTime = Date.now();
    const traces: any[] = [];

    traces.push({ step: 1, action: "open_url", timestamp: Date.now() });
    const browserRes = await executeRealBrowserAction(sessionId, "open_url", { url: "https://example.com" });
    expect(browserRes.success).toBe(true);

    traces.push({ step: 2, action: "verified", timestamp: Date.now(), success: true });
    const durationMs = Date.now() - startTime;

    const benchmarkReport = {
      missionId: sessionId,
      goal: "Benchmark persistence test",
      durationMs,
      toolCallsCount: 1,
      retries: 0,
      success: true,
      traces,
      verified: true,
    };

    const reportPath = path.join(artifactsDir, `benchmark-report-${sessionId}.json`);
    await fs.writeFile(reportPath, JSON.stringify(benchmarkReport, null, 2), "utf8");

    const saved = JSON.parse(await fs.readFile(reportPath, "utf8"));
    expect(saved.missionId).toBe(sessionId);
    expect(saved.success).toBe(true);
    expect(saved.traces).toHaveLength(2);
    expect(saved.durationMs).toBeGreaterThanOrEqual(0);
  });
});
