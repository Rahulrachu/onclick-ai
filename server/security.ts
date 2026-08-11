import path from "node:path";

export const WORKSPACE_ROOT = path.resolve(process.env.ONCLICK_WORKSPACE_ROOT || "/tmp/onclick-ai-workspaces");

const BLOCKED_COMMANDS = [
  /\brm\s+-rf\b/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /:\(\)\s*\{/, 
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bpoweroff\b/i,
  /\bcurl\b[^\n]*\|\s*(sh|bash)/i,
  /\bwget\b[^\n]*\|\s*(sh|bash)/i,
];

const SECRET_KEYS = /(token|secret|password|api[_-]?key|authorization|cookie)/i;

export function resolveWorkspacePath(taskId: number, candidate: string) {
  if (!Number.isInteger(taskId) || taskId < 1) throw new Error("Invalid task ID");
  if (!candidate || candidate.includes("\0")) throw new Error("Invalid workspace path");

  const taskRoot = path.resolve(WORKSPACE_ROOT, `task-${taskId}`);
  const resolved = path.resolve(taskRoot, candidate);
  if (resolved !== taskRoot && !resolved.startsWith(`${taskRoot}${path.sep}`)) {
    throw new Error("Path escapes task workspace");
  }
  return resolved;
}

export function validateCommand(command: string) {
  const normalized = command.trim();
  if (!normalized) throw new Error("Command is required");
  if (normalized.length > 4000) throw new Error("Command exceeds the safety limit");
  if (BLOCKED_COMMANDS.some((pattern) => pattern.test(normalized))) {
    throw new Error("Command blocked by security policy");
  }
  return normalized;
}

export function sanitizeToolInput(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(sanitizeToolInput);
  if (!input || typeof input !== "object") return input;

  return Object.fromEntries(Object.entries(input as Record<string, unknown>).map(([key, value]) => [
    key,
    SECRET_KEYS.test(key) ? "[REDACTED]" : sanitizeToolInput(value),
  ]));
}

export function isPermissionTier(value: unknown): value is "SAFE" | "CONFIRM" | "RESTRICTED" {
  return value === "SAFE" || value === "CONFIRM" || value === "RESTRICTED";
}
