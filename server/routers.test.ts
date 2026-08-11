import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({
  getDb: vi.fn(async () => null),
}));

import { appRouter } from "./routers";

function context(user: TrpcContext["user"] = null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

const user = {
  id: 42,
  openId: "router-test-user",
  email: "router@example.com",
  name: "Router Test",
  loginMethod: "test",
  role: "user" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

describe("task router contract", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires authentication for task list", async () => {
    const caller = appRouter.createCaller(context());
    await expect(caller.tasks.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("exposes task history and safe database fallbacks", async () => {
    const caller = appRouter.createCaller(context(user));
    await expect(caller.tasks.list()).resolves.toEqual([]);
    await expect(caller.tasks.getById({ taskId: 1 })).resolves.toBeNull();
    await expect(caller.tasks.pause({ taskId: 1 })).resolves.toEqual({ success: false });
    await expect(caller.tasks.resume({ taskId: 1 })).resolves.toEqual({ success: false });
    await expect(caller.tasks.cancel({ taskId: 1 })).resolves.toEqual({ success: false });
    await expect(caller.tasks.retry({ taskId: 1 })).resolves.toEqual({ success: false });
    await expect(caller.tasks.duplicate({ taskId: 1 })).resolves.toEqual({ success: false });
    await expect(caller.tasks.create({ title: "Test", goal: "Test goal" })).rejects.toThrow("Database unavailable");
  });

  it("keeps the tool registry public while guarding execution", async () => {
    const publicCaller = appRouter.createCaller(context());
    const registry = await publicCaller.tools.list();
    expect(registry.some((tool) => tool.name === "create_pdf")).toBe(true);

    const caller = appRouter.createCaller(context(user));
    await expect(caller.tools.execute({ taskId: 1, toolName: "create_pdf", inputData: {} })).resolves.toEqual({ success: false });
    await expect(caller.tools.approve({ taskId: 1, toolExecutionId: 1, approved: true })).resolves.toEqual({ success: false });
  });
});
