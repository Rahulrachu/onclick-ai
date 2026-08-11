import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { tasks, taskSteps, agentLogs, toolExecutions, taskArtifacts, agentMemories } from "../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";
import { addSseClient, removeSseClient, executeTool, TOOL_REGISTRY, PermissionTier } from "./agentRuntime";
import { executeTaskWithSelfCorrection } from "./coreEngine";
import { z } from "zod";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  tasks: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return await db.select().from(tasks).where(eq(tasks.userId, ctx.user.id)).orderBy(desc(tasks.createdAt));
    }),

    getById: protectedProcedure.input(z.object({ taskId: z.number() })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      const [task] = await db.select().from(tasks).where(and(eq(tasks.id, input.taskId), eq(tasks.userId, ctx.user.id))).limit(1);
      if (!task) return null;

      const steps = await db.select().from(taskSteps).where(eq(taskSteps.taskId, input.taskId));
      const logs = await db.select().from(agentLogs).where(eq(agentLogs.taskId, input.taskId)).orderBy(desc(agentLogs.createdAt));
      const tools = await db.select().from(toolExecutions).where(eq(toolExecutions.taskId, input.taskId)).orderBy(desc(toolExecutions.createdAt));
      const artifacts = await db.select().from(taskArtifacts).where(eq(taskArtifacts.taskId, input.taskId));

      return { task, steps, logs, tools, artifacts };
    }),

    create: protectedProcedure.input(z.object({ title: z.string(), goal: z.string() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const [res] = await db.insert(tasks).values({
        userId: ctx.user.id,
        title: input.title,
        goal: input.goal,
        status: "pending",
        currentStepIndex: 0,
        totalSteps: 1,
        progressPercent: 0,
        activeAgent: "Orchestrator",
        currentAction: "Task initialized",
      });

      const taskId = res.insertId;

      // Trigger asynchronous autonomous execution loop
      executeTaskWithSelfCorrection(taskId).catch(err => {
        console.error(`[Autonomous Engine] Task ${taskId} failed:`, err);
      });

      return { success: true, taskId };
    }),

    pause: protectedProcedure.input(z.object({ taskId: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      await db.update(tasks).set({ status: "paused", currentAction: "Task paused by user" }).where(and(eq(tasks.id, input.taskId), eq(tasks.userId, ctx.user.id)));
      return { success: true };
    }),

    resume: protectedProcedure.input(z.object({ taskId: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      await db.update(tasks).set({ status: "running", currentAction: "Task resumed" }).where(and(eq(tasks.id, input.taskId), eq(tasks.userId, ctx.user.id)));
      executeTaskWithSelfCorrection(input.taskId).catch(console.error);
      return { success: true };
    }),

    cancel: protectedProcedure.input(z.object({ taskId: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      await db.update(tasks).set({ status: "cancelled", currentAction: "Task cancelled by user" }).where(and(eq(tasks.id, input.taskId), eq(tasks.userId, ctx.user.id)));
      return { success: true };
    }),

    retry: protectedProcedure.input(z.object({ taskId: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      await db.update(tasks).set({ status: "pending", currentAction: "Retrying task execution", error: null }).where(and(eq(tasks.id, input.taskId), eq(tasks.userId, ctx.user.id)));
      executeTaskWithSelfCorrection(input.taskId).catch(console.error);
      return { success: true };
    }),

    duplicate: protectedProcedure.input(z.object({ taskId: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      const [original] = await db.select().from(tasks).where(and(eq(tasks.id, input.taskId), eq(tasks.userId, ctx.user.id))).limit(1);
      if (!original) return { success: false };

      const [res] = await db.insert(tasks).values({
        userId: ctx.user.id,
        title: `${original.title} (Copy)`,
        goal: original.goal,
        status: "pending",
        currentStepIndex: 0,
        totalSteps: original.totalSteps,
        progressPercent: 0,
        activeAgent: "Orchestrator",
        currentAction: "Duplicated task initialized",
      });

      return { success: true, taskId: res.insertId };
    }),
  }),

  tools: router({
    list: publicProcedure.query(() => {
      return Object.values(TOOL_REGISTRY);
    }),

    execute: protectedProcedure.input(z.object({
      taskId: z.number(),
      toolName: z.string(),
      inputData: z.any(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      const [ownedTask] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, input.taskId), eq(tasks.userId, ctx.user.id))).limit(1);
      if (!ownedTask) throw new Error("Task not found");
      const result = await executeTool(input.taskId, input.toolName, input.inputData);
      return result;
    }),

    approve: protectedProcedure.input(z.object({
      toolExecutionId: z.number(),
      taskId: z.number(),
      approved: z.boolean(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      const [ownedTask] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, input.taskId), eq(tasks.userId, ctx.user.id))).limit(1);
      if (!ownedTask) throw new Error("Task not found");
      const [execution] = await db.select({ id: toolExecutions.id }).from(toolExecutions).where(and(eq(toolExecutions.id, input.toolExecutionId), eq(toolExecutions.taskId, input.taskId))).limit(1);
      if (!execution) throw new Error("Tool execution not found");

      const newStatus = input.approved ? "success" : "failed";
      await db.update(toolExecutions)
        .set({ status: newStatus, outputData: { approved: input.approved } })
        .where(and(eq(toolExecutions.id, input.toolExecutionId), eq(toolExecutions.taskId, input.taskId)));

      return { success: true };
    }),
  }),

  memory: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return await db.select().from(agentMemories).where(eq(agentMemories.userId, ctx.user.id));
    }),

    upsert: protectedProcedure.input(z.object({
      memoryTier: z.enum(["short-term", "working", "long-term", "episodic", "user preferences"]),
      key: z.string(),
      content: z.string(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { success: false };

      await db.insert(agentMemories).values({
        userId: ctx.user.id,
        memoryTier: input.memoryTier,
        key: input.key,
        content: input.content,
      });

      return { success: true };
    }),

    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { success: false };

      await db.delete(agentMemories).where(and(eq(agentMemories.id, input.id), eq(agentMemories.userId, ctx.user.id)));
      return { success: true };
    }),
  }),
});

export type AppRouter = typeof appRouter;
