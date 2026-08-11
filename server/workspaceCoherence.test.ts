import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createWorkspaceSession, destroyWorkspaceSession, executeInWorkspace, observeWorkspace } from "./workspaceSession";
import { executeRealBrowserAction } from "./browserEngine";
import { executeTool } from "./agentRuntime";
import fs from "node:fs/promises";
import path from "node:path";

describe("Shared Workspace Coherence Integration", () => {
  const sessionId = "task-99";

  beforeEach(async () => {
    await createWorkspaceSession(sessionId, "temporary");
    await fs.mkdir(`/home/ubuntu/onclick-ai/workspaces/task-99`, { recursive: true });
  });

  afterEach(async () => {
    await destroyWorkspaceSession(sessionId);
  });

  it("shares file system state between terminal execution, filesystem tools, and observation", { timeout: 15000 }, async () => {
    // 1. Write a file inside the session workspace directly or via terminal
    const session = await createWorkspaceSession(sessionId);
    const termRes = await executeInWorkspace(sessionId, "echo 'hello from terminal' > shared-evidence.txt");
    expect(termRes.exitCode).toBe(0);

    // 2. Read the same file via the filesystem tool (executeTool with "read")
    const readResult = await executeTool(99, "read", { path: "shared-evidence.txt" });
    expect(readResult.status).toBe("success");
    expect(String(readResult.output?.content || readResult.output)).toContain("hello from terminal");

    // 3. Open a URL in the shared workspace browser session
    const browserRes = await executeRealBrowserAction(sessionId, "open_url", { url: "https://example.com" });
    expect(browserRes.success).toBe(true);
    expect(browserRes.url).toBe("https://example.com/");

    // 4. Observe workspace files and URL state
    const observation = await observeWorkspace(sessionId);
    expect(observation?.files.some((f: any) => f.name === "shared-evidence.txt")).toBe(true);
    expect(observation?.url).toBe("https://example.com/");
  });
});
