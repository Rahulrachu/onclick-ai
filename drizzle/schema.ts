import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, longtext, json } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  goal: longtext("goal").notNull(),
  status: mysqlEnum("status", ["pending", "running", "paused", "completed", "failed", "cancelled"]).default("pending").notNull(),
  currentStepIndex: int("currentStepIndex").default(0).notNull(),
  totalSteps: int("totalSteps").default(1).notNull(),
  progressPercent: int("progressPercent").default(0).notNull(),
  activeAgent: varchar("activeAgent", { length: 64 }).default("Orchestrator").notNull(),
  currentAction: text("currentAction"),
  summary: longtext("summary"),
  error: longtext("error"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;

export const taskSteps = mysqlTable("task_steps", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  stepIndex: int("stepIndex").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  agent: varchar("agent", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["pending", "running", "completed", "failed", "skipped"]).default("pending").notNull(),
  output: longtext("output"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TaskStep = typeof taskSteps.$inferSelect;
export type InsertTaskStep = typeof taskSteps.$inferInsert;

export const agentLogs = mysqlTable("agent_logs", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  agent: varchar("agent", { length: 64 }).notNull(),
  eventType: varchar("eventType", { length: 64 }).notNull(), // action started, tool called, result observed, plan updated, approval requested
  message: text("message").notNull(),
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AgentLog = typeof agentLogs.$inferSelect;
export type InsertAgentLog = typeof agentLogs.$inferInsert;

export const toolExecutions = mysqlTable("tool_executions", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  toolName: varchar("toolName", { length: 64 }).notNull(),
  category: varchar("category", { length: 32 }).notNull(), // Browser, Filesystem, Terminal, Documents, Data
  permissionTier: mysqlEnum("permissionTier", ["SAFE", "CONFIRM", "RESTRICTED"]).default("SAFE").notNull(),
  inputData: json("inputData"),
  outputData: json("outputData"),
  status: mysqlEnum("status", ["pending_approval", "running", "success", "failed"]).default("success").notNull(),
  durationMs: int("durationMs").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ToolExecution = typeof toolExecutions.$inferSelect;
export type InsertToolExecution = typeof toolExecutions.$inferInsert;

export const agentMemories = mysqlTable("agent_memories", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  memoryTier: mysqlEnum("memoryTier", ["short-term", "working", "long-term", "episodic", "user preferences"]).notNull(),
  key: varchar("key", { length: 255 }).notNull(),
  content: longtext("content").notNull(),
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AgentMemory = typeof agentMemories.$inferSelect;
export type InsertAgentMemory = typeof agentMemories.$inferInsert;

export const taskArtifacts = mysqlTable("task_artifacts", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  fileType: varchar("fileType", { length: 64 }).notNull(), // document, pdf, spreadsheet, image, csv, code, download
  storageUrl: text("storageUrl").notNull(),
  fileKey: varchar("fileKey", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TaskArtifact = typeof taskArtifacts.$inferSelect;
export type InsertTaskArtifact = typeof taskArtifacts.$inferInsert;
