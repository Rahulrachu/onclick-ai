import { afterEach, describe, expect, it } from "vitest";
import {
  createWorkspaceSession,
  destroyWorkspaceSession,
  executeInWorkspace,
  observeWorkspace,
  restoreWorkspace,
  snapshotWorkspace,
} from "./workspaceSession";

const sessionId = `workspace-test-${process.pid}`;

afterEach(async () => {
  await destroyWorkspaceSession(sessionId);
});

describe("workspace session", () => {
  it("executes a real command, observes files, snapshots, restores, and tears down", async () => {
    const session = await createWorkspaceSession(sessionId);
    expect(session.status).toBe("running");

    const executed = await executeInWorkspace(sessionId, "printf 'hello from workspace' > hello.txt && cat hello.txt");
    expect(executed.exitCode).toBe(0);
    expect(executed.stdout).toContain("hello from workspace");

    const observed = await observeWorkspace(sessionId);
    expect(observed?.files.some((file) => file.name === "hello.txt")).toBe(true);

    const snapshot = await snapshotWorkspace(sessionId);
    expect(snapshot).toContain("snapshot-");

    await executeInWorkspace(sessionId, "rm -f hello.txt");
    expect((await observeWorkspace(sessionId))?.files.some((file) => file.name === "hello.txt")).toBe(false);

    await restoreWorkspace(sessionId, snapshot);
    expect((await observeWorkspace(sessionId))?.files.some((file) => file.name === "hello.txt")).toBe(true);
  }, 30_000);
});
