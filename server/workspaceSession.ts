import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { chromium, Browser, BrowserContext, Page } from "playwright";
import { vmManager } from "./localVmProvider";

const execFileAsync = promisify(execFile);
const WORKSPACES_ROOT = "/home/ubuntu/onclick-ai/workspaces";
const activeSessions = new Map<string, WorkspaceSession>();

export type WorkspaceSession = {
  sessionId: string;
  workspaceDir: string;
  snapshotDir: string;
  status: "starting" | "running" | "paused" | "destroyed";
  mode: "temporary" | "persistent";
  createdAt: number;
  updatedAt: number;
  browser?: Browser;
  context?: BrowserContext;
  page?: Page;
};

function assertSessionId(sessionId: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$/.test(sessionId)) {
    throw new Error("Invalid workspace session id");
  }
}

function assertSafeCommand(command: string) {
  if (!command.trim() || command.length > 20_000)
    throw new Error("Invalid workspace command");
  if (
    /(^|\s)(rm\s+-rf\s+\/|mkfs|shutdown|reboot|poweroff)(\s|$)/i.test(command)
  ) {
    throw new Error("Dangerous workspace command blocked");
  }
}

export async function createWorkspaceSession(
  sessionId: string,
  mode: "temporary" | "persistent" = "temporary"
): Promise<WorkspaceSession> {
  assertSessionId(sessionId);
  const vm = await vmManager.createVm({ missionId: sessionId, mode });
  const workspaceDir = path.join(vm.vmPath, "workspace");
  const snapshotDir = path.join(vm.vmPath, "state");
  fs.mkdirSync(workspaceDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(snapshotDir, { recursive: true, mode: 0o700 });

  const existing = activeSessions.get(sessionId);
  if (existing && existing.status !== "destroyed") return existing;

  const session: WorkspaceSession = {
    sessionId,
    workspaceDir,
    snapshotDir,
    status: "starting",
    mode,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  try {
    session.browser = await chromium.launch({ headless: true });
    session.context = await session.browser.newContext({
      viewport: { width: 1280, height: 720 },
      acceptDownloads: true,
    });
    session.page = await session.context.newPage();
  } catch (error) {
    console.warn("[WorkspaceSession] Browser capability unavailable:", error);
  }

  session.status = "running";
  session.updatedAt = Date.now();
  activeSessions.set(sessionId, session);
  return session;
}

export function getWorkspaceSession(
  sessionId: string
): WorkspaceSession | undefined {
  return activeSessions.get(sessionId);
}

export function listWorkspaceSessions(): WorkspaceSession[] {
  return Array.from(activeSessions.values()).filter(
    session => session.status !== "destroyed"
  );
}

export async function executeInWorkspace(
  sessionId: string,
  command: string,
  options: { timeoutMs?: number } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  assertSessionId(sessionId);
  assertSafeCommand(command);
  const session =
    activeSessions.get(sessionId) ?? (await createWorkspaceSession(sessionId));
  if (session.status === "paused")
    throw new Error("Workspace session is paused");
  if (session.status === "destroyed")
    throw new Error("Workspace session is destroyed");

  session.updatedAt = Date.now();
  try {
    const result = await vmManager.execute(session.sessionId, "bash", [
      "-lc",
      command,
    ]);
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  } catch (error: any) {
    return {
      stdout: String(error.stdout || ""),
      stderr: String(error.stderr || error.message || "Execution error"),
      exitCode: Number(error.code) || 1,
    };
  }
}

export async function observeWorkspace(sessionId: string) {
  const session = activeSessions.get(sessionId);
  if (!session) return null;
  const files = fs
    .readdirSync(session.workspaceDir, { withFileTypes: true })
    .map(entry => ({
      name: entry.name,
      type: entry.isDirectory() ? "directory" : "file",
    }));
  let screenshotBase64: string | null = null;
  let url: string | null = null;
  if (session.page) {
    url = session.page.url();
    screenshotBase64 = (
      await session.page.screenshot({ type: "png" })
    ).toString("base64");
  }
  return {
    sessionId,
    status: session.status,
    workspaceDir: session.workspaceDir,
    files,
    url,
    screenshotBase64,
  };
}

export async function snapshotWorkspace(sessionId: string): Promise<string> {
  const session = activeSessions.get(sessionId);
  if (!session) throw new Error("Workspace session not found");
  const snapshotName = `snapshot-${Date.now()}.tar.gz`;
  const snapshotPath = path.join(session.snapshotDir, snapshotName);
  const result = await execFileAsync(
    "tar",
    ["-czf", snapshotPath, "-C", session.workspaceDir, "."],
    { timeout: 30_000 }
  );
  void result;
  return snapshotPath;
}

export async function restoreWorkspace(
  sessionId: string,
  snapshotPath: string
): Promise<void> {
  const session = activeSessions.get(sessionId);
  if (!session) throw new Error("Workspace session not found");
  if (!snapshotPath.startsWith(session.snapshotDir + path.sep))
    throw new Error("Snapshot path outside session boundary");
  await execFileAsync(
    "tar",
    ["-xzf", snapshotPath, "-C", session.workspaceDir],
    { timeout: 30_000 }
  );
  session.updatedAt = Date.now();
}

export function pauseWorkspaceSession(sessionId: string) {
  const session = activeSessions.get(sessionId);
  if (!session || session.status === "destroyed") return false;
  session.status = "paused";
  session.updatedAt = Date.now();
  return true;
}

export function resumeWorkspaceSession(sessionId: string) {
  const session = activeSessions.get(sessionId);
  if (!session || session.status === "destroyed") return false;
  session.status = "running";
  session.updatedAt = Date.now();
  return true;
}

export async function destroyWorkspaceSession(
  sessionId: string
): Promise<void> {
  const session = activeSessions.get(sessionId);
  if (!session) return;
  if (session.browser) await session.browser.close().catch(() => undefined);
  await vmManager.destroy(session.sessionId);
  session.status = "destroyed";
  session.updatedAt = Date.now();
  activeSessions.delete(sessionId);
}
