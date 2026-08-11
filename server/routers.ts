import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import {
  tasks,
  taskSteps,
  agentLogs,
  toolExecutions,
  taskArtifacts,
  agentMemories,
} from "../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";
import { executeTaskWithSelfCorrection } from "./coreEngine";
import { executeTool, TOOL_REGISTRY } from "./agentRuntime";
import {
  createWorkspaceSession,
  destroyWorkspaceSession,
  executeInWorkspace,
  getWorkspaceSession,
  observeWorkspace,
  pauseWorkspaceSession,
  resumeWorkspaceSession,
  snapshotWorkspace,
  restoreWorkspace,
} from "./workspaceSession";

function parseIdInput(val: unknown): number {
  if (typeof val === "number") return val;
  if (val && typeof val === "object") {
    if ("taskId" in val && typeof (val as any).taskId === "number")
      return (val as any).taskId;
    if ("id" in val && typeof (val as any).id === "number")
      return (val as any).id;
  }
  throw new Error("Invalid id input");
}

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

  tools: router({
    list: publicProcedure.query(() => {
      return Object.values(TOOL_REGISTRY);
    }),
    execute: protectedProcedure
      .input((val: unknown): any => val)
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { success: false };
        return { success: true };
      }),
    approve: protectedProcedure
      .input((val: unknown): any => val)
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { success: false };
        return { success: true };
      }),
  }),

  workspace: router({
    status: protectedProcedure
      .input((val: unknown): number => parseIdInput(val))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (db) {
          const [task] = await db
            .select()
            .from(tasks)
            .where(and(eq(tasks.id, input), eq(tasks.userId, ctx.user.id)))
            .limit(1);
          if (!task) throw new Error("Task not found or unauthorized");
        }
        const session = getWorkspaceSession(`task-${input}`);
        return session
          ? {
              sessionId: session.sessionId,
              status: session.status,
              workspaceDir: session.workspaceDir,
              createdAt: session.createdAt,
              updatedAt: session.updatedAt,
            }
          : null;
      }),
    start: protectedProcedure
      .input((val: unknown): { taskId: number } => {
        const taskId = parseIdInput(val);
        return { taskId };
      })
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (db) {
          const [task] = await db
            .select()
            .from(tasks)
            .where(
              and(eq(tasks.id, input.taskId), eq(tasks.userId, ctx.user.id))
            )
            .limit(1);
          if (!task) throw new Error("Task not found or unauthorized");
        }
        const session = await createWorkspaceSession(`task-${input.taskId}`);
        return {
          sessionId: session.sessionId,
          status: session.status,
          workspaceDir: session.workspaceDir,
        };
      }),
    observe: protectedProcedure
      .input((val: unknown): number => parseIdInput(val))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (db) {
          const [task] = await db
            .select()
            .from(tasks)
            .where(and(eq(tasks.id, input), eq(tasks.userId, ctx.user.id)))
            .limit(1);
          if (!task) throw new Error("Task not found or unauthorized");
        }
        return observeWorkspace(`task-${input}`);
      }),
    execute: protectedProcedure
      .input((val: unknown): { taskId: number; command: string } => {
        if (
          val &&
          typeof val === "object" &&
          "taskId" in val &&
          "command" in val
        )
          return val as { taskId: number; command: string };
        throw new Error("Invalid workspace execution input");
      })
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (db) {
          const [task] = await db
            .select()
            .from(tasks)
            .where(
              and(eq(tasks.id, input.taskId), eq(tasks.userId, ctx.user.id))
            )
            .limit(1);
          if (!task) throw new Error("Task not found or unauthorized");
        }
        return executeInWorkspace(`task-${input.taskId}`, input.command);
      }),
    pause: protectedProcedure
      .input((val: unknown): number => parseIdInput(val))
      .mutation(({ input }) => ({
        success: pauseWorkspaceSession(`task-${input}`),
      })),
    resume: protectedProcedure
      .input((val: unknown): number => parseIdInput(val))
      .mutation(({ input }) => ({
        success: resumeWorkspaceSession(`task-${input}`),
      })),
    snapshot: protectedProcedure
      .input((val: unknown): number => parseIdInput(val))
      .mutation(async ({ input }) => ({
        path: await snapshotWorkspace(`task-${input}`),
      })),
    restore: protectedProcedure
      .input((val: unknown): { taskId: number; snapshotPath: string } => {
        if (
          val &&
          typeof val === "object" &&
          "taskId" in val &&
          "snapshotPath" in val
        )
          return val as { taskId: number; snapshotPath: string };
        throw new Error("Invalid workspace restore input");
      })
      .mutation(async ({ input }) => {
        await restoreWorkspace(`task-${input.taskId}`, input.snapshotPath);
        return { success: true };
      }),
    destroy: protectedProcedure
      .input((val: unknown): number => parseIdInput(val))
      .mutation(async ({ input }) => {
        await destroyWorkspaceSession(`task-${input}`);
        return { success: true };
      }),
  }),

  tasks: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return await db
        .select()
        .from(tasks)
        .where(eq(tasks.userId, ctx.user.id))
        .orderBy(desc(tasks.createdAt));
    }),

    getById: protectedProcedure
      .input(parseIdInput)
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return null;
        const [task] = await db
          .select()
          .from(tasks)
          .where(and(eq(tasks.id, input), eq(tasks.userId, ctx.user.id)))
          .limit(1);
        if (!task) return null;

        const steps = await db
          .select()
          .from(taskSteps)
          .where(eq(taskSteps.taskId, input))
          .orderBy(taskSteps.stepIndex);
        const logs = await db
          .select()
          .from(agentLogs)
          .where(eq(agentLogs.taskId, input))
          .orderBy(desc(agentLogs.createdAt));
        const tools = await db
          .select()
          .from(toolExecutions)
          .where(eq(toolExecutions.taskId, input))
          .orderBy(desc(toolExecutions.createdAt));
        const artifacts = await db
          .select()
          .from(taskArtifacts)
          .where(eq(taskArtifacts.taskId, input))
          .orderBy(desc(taskArtifacts.createdAt));

        return { task, steps, logs, tools, artifacts };
      }),

    create: protectedProcedure
      .input(
        (
          val: unknown
        ): { goal: string; missionTemplate?: string; title?: string } => {
          if (val && typeof val === "object" && "goal" in val) {
            return val as {
              goal: string;
              missionTemplate?: string;
              title?: string;
            };
          }
          throw new Error("Invalid goal input");
        }
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");

        const [res] = await db.insert(tasks).values({
          userId: ctx.user.id,
          title: input.title || input.goal.slice(0, 50),
          goal: input.goal,
          status: "pending",
          progressPercent: 0,
          activeAgent: "Orchestrator",
          currentAction: "Queued in orchestration engine",
        });

        const taskId = Number(res.insertId);

        executeTaskWithSelfCorrection(taskId).catch(err => {
          console.error(`[Task ${taskId}] Background execution failed:`, err);
        });

        return { taskId, success: true };
      }),

    pause: protectedProcedure
      .input(parseIdInput)
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { success: false };
        await db
          .update(tasks)
          .set({ status: "paused", currentAction: "Execution paused by user" })
          .where(and(eq(tasks.id, input), eq(tasks.userId, ctx.user.id)));
        return { success: true };
      }),

    resume: protectedProcedure
      .input(parseIdInput)
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { success: false };
        await db
          .update(tasks)
          .set({ status: "pending", currentAction: "Resuming task execution" })
          .where(and(eq(tasks.id, input), eq(tasks.userId, ctx.user.id)));
        executeTaskWithSelfCorrection(input).catch(console.error);
        return { success: true };
      }),

    cancel: protectedProcedure
      .input(parseIdInput)
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { success: false };
        await db
          .update(tasks)
          .set({ status: "cancelled", currentAction: "Cancelled by user" })
          .where(and(eq(tasks.id, input), eq(tasks.userId, ctx.user.id)));
        return { success: true };
      }),

    retry: protectedProcedure
      .input(parseIdInput)
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { success: false };
        await db
          .update(tasks)
          .set({
            status: "pending",
            currentAction: "Retrying task execution",
            error: null,
          })
          .where(and(eq(tasks.id, input), eq(tasks.userId, ctx.user.id)));
        executeTaskWithSelfCorrection(input).catch(console.error);
        return { success: true };
      }),

    duplicate: protectedProcedure
      .input(parseIdInput)
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { success: false };
        const [original] = await db
          .select()
          .from(tasks)
          .where(and(eq(tasks.id, input), eq(tasks.userId, ctx.user.id)))
          .limit(1);
        if (!original) return { success: false };

        const [res] = await db.insert(tasks).values({
          userId: ctx.user.id,
          title: `${original.title} (Duplicated)`,
          goal: `${original.goal} (Duplicated)`,
          status: "pending",
          progressPercent: 0,
          activeAgent: "Orchestrator",
          currentAction: "Queued duplicate task",
        });

        const newTaskId = Number(res.insertId);
        executeTaskWithSelfCorrection(newTaskId).catch(console.error);
        return { taskId: newTaskId, success: true };
      }),

    approveTool: protectedProcedure
      .input((val: unknown): { executionId: number; approved: boolean } => {
        if (val && typeof val === "object" && "executionId" in val) {
          return val as { executionId: number; approved: boolean };
        }
        throw new Error("Invalid approval input");
      })
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { success: false };

        const [toolExec] = await db
          .select()
          .from(toolExecutions)
          .where(eq(toolExecutions.id, input.executionId))
          .limit(1);
        if (!toolExec) throw new Error("Tool execution not found");

        if (!input.approved) {
          await db
            .update(toolExecutions)
            .set({
              status: "failed",
              outputData: { reason: "Rejected by user" },
            })
            .where(eq(toolExecutions.id, input.executionId));
          return { success: true, status: "failed" };
        }

        try {
          const parsedArgs =
            typeof toolExec.inputData === "string"
              ? JSON.parse(toolExec.inputData)
              : toolExec.inputData || {};
          const result = await executeTool(
            toolExec.taskId,
            toolExec.toolName,
            parsedArgs,
            { approvedExecutionId: input.executionId }
          );
          return { success: true, status: result.status };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await db
            .update(toolExecutions)
            .set({ status: "failed", outputData: { error: message } })
            .where(eq(toolExecutions.id, input.executionId));
          throw err;
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
