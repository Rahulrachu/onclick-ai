import { describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => {
  const taskRow = {
    id: 101,
    userId: 42,
    title: "Test Mission",
    goal: "Test goal",
    status: "running",
    currentStepIndex: 1,
    totalSteps: 4,
    progressPercent: 25,
    activeAgent: "Research",
    currentAction: "Gathering sources",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => [taskRow],
          }),
          limit: async () => [taskRow],
          then: (resolve: any) => Promise.resolve([taskRow]).then(resolve),
        }),
        then: (resolve: any) => Promise.resolve([taskRow]).then(resolve),
      }),
    }),
    insert: () => ({
      values: async () => [{ insertId: 101 }],
    }),
    update: () => ({
      set: () => ({
        where: async () => ({ success: true }),
      }),
    }),
  };

  return { mockDb: db };
});

vi.mock("./db", () => ({
  getDb: vi.fn(async () => mockDb),
}));

vi.mock("./coreEngine", () => ({
  executeTaskWithSelfCorrection: vi.fn(async () => undefined),
}));

import { appRouter } from "./routers";

const user = {
  id: 42,
  openId: "success-test-user",
  email: "success@example.com",
  name: "Success Test",
  loginMethod: "test",
  role: "user" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

function createContext() {
  return {
    user,
    req: { protocol: "https", headers: {} } as any,
    res: { clearCookie: vi.fn() } as any,
  };
}

describe("task router success paths", () => {
  it("executes create, getById, pause, resume, cancel, retry, and duplicate successfully against a controlled database", async () => {
    const caller = appRouter.createCaller(createContext());

    const created = await caller.tasks.create({ title: "New Mission", goal: "Build AI app" });
    expect(created).toEqual({ success: true, taskId: 101 });

    const detail = await caller.tasks.getById({ taskId: 101 });
    expect(detail?.task).toMatchObject({ id: 101, title: "Test Mission" });

    await expect(caller.tasks.pause({ taskId: 101 })).resolves.toEqual({ success: true });
    await expect(caller.tasks.resume({ taskId: 101 })).resolves.toEqual({ success: true });
    await expect(caller.tasks.cancel({ taskId: 101 })).resolves.toEqual({ success: true });
    await expect(caller.tasks.retry({ taskId: 101 })).resolves.toEqual({ success: true });

    const duplicated = await caller.tasks.duplicate({ taskId: 101 });
    expect(duplicated).toEqual({ success: true, taskId: 101 });
  });
});
