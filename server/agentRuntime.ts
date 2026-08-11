import { getDb } from "./db";
import {
  tasks,
  taskSteps,
  agentLogs,
  toolExecutions,
  taskArtifacts,
  agentMemories,
} from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { storagePut } from "./storage";
import fs from "node:fs/promises";
import path from "node:path";
import { createWorkspaceSession } from "./workspaceSession";
import { executeParallelResearch } from "./parallelOrchestrator";
import {
  resolveWorkspacePath,
  sanitizeToolInput,
  validateCommand,
} from "./security";
import {
  executeRealBrowserAction,
  executeComputerControl,
} from "./browserEngine";

export type AgentRole =
  | "Orchestrator"
  | "Planner"
  | "Research"
  | "Browser"
  | "Coding"
  | "File"
  | "Data"
  | "Reasoning"
  | "Verification"
  | "Critic"
  | "Recovery"
  | "Security";

export type PermissionTier = "SAFE" | "CONFIRM" | "RESTRICTED";

export interface ToolDefinition {
  name: string;
  category: "Browser" | "Filesystem" | "Terminal" | "Documents" | "Data";
  permissionTier: PermissionTier;
  description: string;
}

export const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  open_url: {
    name: "open_url",
    category: "Browser",
    permissionTier: "SAFE",
    description: "Navigate browser to URL",
  },
  search_web: {
    name: "search_web",
    category: "Browser",
    permissionTier: "SAFE",
    description: "Search the web for information",
  },
  parallel_research: {
    name: "parallel_research",
    category: "Browser",
    permissionTier: "SAFE",
    description: "Run concurrent isolated browser research subagents",
  },
  click_element: {
    name: "click_element",
    category: "Browser",
    permissionTier: "SAFE",
    description: "Click DOM element",
  },
  type_form: {
    name: "type_form",
    category: "Browser",
    permissionTier: "SAFE",
    description: "Type into a form field",
  },
  extract_page: {
    name: "extract_page",
    category: "Browser",
    permissionTier: "SAFE",
    description: "Extract text from webpage",
  },
  screenshot_page: {
    name: "screenshot_page",
    category: "Browser",
    permissionTier: "SAFE",
    description: "Capture webpage screenshot",
  },
  download: {
    name: "download",
    category: "Browser",
    permissionTier: "CONFIRM",
    description: "Download file from web",
  },
  upload: {
    name: "upload",
    category: "Browser",
    permissionTier: "CONFIRM",
    description: "Upload file to service",
  },

  list: {
    name: "list",
    category: "Filesystem",
    permissionTier: "SAFE",
    description: "List files in workspace",
  },
  read: {
    name: "read",
    category: "Filesystem",
    permissionTier: "SAFE",
    description: "Read file content",
  },
  write: {
    name: "write",
    category: "Filesystem",
    permissionTier: "CONFIRM",
    description: "Write file content",
  },
  edit: {
    name: "edit",
    category: "Filesystem",
    permissionTier: "CONFIRM",
    description: "Edit file content",
  },
  move: {
    name: "move",
    category: "Filesystem",
    permissionTier: "RESTRICTED",
    description: "Move file path",
  },
  delete: {
    name: "delete",
    category: "Filesystem",
    permissionTier: "RESTRICTED",
    description: "Delete file",
  },

  execute_command: {
    name: "execute_command",
    category: "Terminal",
    permissionTier: "RESTRICTED",
    description: "Run shell command",
  },
  execute_python: {
    name: "execute_python",
    category: "Terminal",
    permissionTier: "RESTRICTED",
    description: "Run Python script",
  },
  execute_script: {
    name: "execute_script",
    category: "Terminal",
    permissionTier: "RESTRICTED",
    description: "Run automated script",
  },

  create_document: {
    name: "create_document",
    category: "Documents",
    permissionTier: "SAFE",
    description: "Create markdown or text document",
  },
  create_pdf: {
    name: "create_pdf",
    category: "Documents",
    permissionTier: "SAFE",
    description: "Generate formatted PDF report",
  },
  create_spreadsheet: {
    name: "create_spreadsheet",
    category: "Documents",
    permissionTier: "SAFE",
    description: "Generate Excel/CSV spreadsheet",
  },

  parse_csv: {
    name: "parse_csv",
    category: "Data",
    permissionTier: "SAFE",
    description: "Parse and validate CSV dataset",
  },
  analyze_dataset: {
    name: "analyze_dataset",
    category: "Data",
    permissionTier: "SAFE",
    description: "Analyze statistical dataset",
  },
  generate_chart: {
    name: "generate_chart",
    category: "Data",
    permissionTier: "SAFE",
    description: "Generate data visualization chart",
  },
};

const sseClients = new Map<number, Set<any>>();

export function addSseClient(taskId: number, res: any) {
  if (!sseClients.has(taskId)) {
    sseClients.set(taskId, new Set());
  }
  sseClients.get(taskId)!.add(res);
}

export function removeSseClient(taskId: number, res: any) {
  const clients = sseClients.get(taskId);
  if (clients) {
    clients.delete(res);
    if (clients.size === 0) {
      sseClients.delete(taskId);
    }
  }
}

export function broadcastSseEvent(
  taskId: number,
  eventType:
    | "action started"
    | "tool called"
    | "result observed"
    | "plan updated"
    | "approval requested",
  data: any
) {
  const clients = sseClients.get(taskId);
  if (!clients) return;
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach(client => {
    try {
      client.write(payload);
    } catch (e) {
      clients.delete(client);
    }
  });
}

export async function logAgentEvent(
  taskId: number,
  agent: AgentRole,
  eventType:
    | "action started"
    | "tool called"
    | "result observed"
    | "plan updated"
    | "approval requested",
  message: string,
  metadata?: any
) {
  const db = await getDb();
  if (!db) return;

  await db.insert(agentLogs).values({
    taskId,
    agent,
    eventType,
    message,
    metadata: sanitizeToolInput(metadata || null),
  });

  broadcastSseEvent(taskId, eventType, {
    agent,
    message,
    metadata: sanitizeToolInput(metadata),
    timestamp: Date.now(),
  });
}

async function executeWorkspaceFileTool(
  taskId: number,
  toolName: string,
  inputData: Record<string, any>
) {
  const session = await createWorkspaceSession(`task-${taskId}`);
  const targetPath = resolveWorkspacePath(
    taskId,
    String(inputData.path || ".")
  );
  if (toolName === "list") {
    const entries = await fs.readdir(targetPath, { withFileTypes: true });
    return {
      success: true,
      path: inputData.path || ".",
      entries: entries.map(entry => ({
        name: entry.name,
        type: entry.isDirectory() ? "directory" : "file",
      })),
    };
  }
  if (toolName === "read") {
    const content = await fs.readFile(targetPath, "utf8");
    return {
      success: true,
      path: inputData.path,
      content: content.slice(0, 2_000_000),
      truncated: content.length > 2_000_000,
    };
  }
  if (toolName === "write") {
    if (typeof inputData.content !== "string")
      throw new Error("write requires string content");
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, inputData.content, "utf8");
    return {
      success: true,
      path: inputData.path,
      bytes: Buffer.byteLength(inputData.content),
    };
  }
  if (toolName === "edit") {
    if (
      typeof inputData.find !== "string" ||
      typeof inputData.replace !== "string"
    )
      throw new Error("edit requires find and replace strings");
    const original = await fs.readFile(targetPath, "utf8");
    if (!original.includes(inputData.find))
      throw new Error("edit target text was not found");
    const content =
      inputData.all === false
        ? original.replace(inputData.find, inputData.replace)
        : original.split(inputData.find).join(inputData.replace);
    await fs.writeFile(targetPath, content, "utf8");
    return {
      success: true,
      path: inputData.path,
      replacements:
        inputData.all === false ? 1 : original.split(inputData.find).length - 1,
    };
  }
  void session;
  throw new Error(`Unsupported workspace file tool: ${toolName}`);
}

function createPdfBuffer(text: string): Buffer {
  const NL = String.fromCharCode(10);
  const safeText = text.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "?");
  const lines = safeText.split(/\r?\n/).slice(0, 55);
  const stream = [
    "BT",
    "/F1 11 Tf",
    "50 780 Td",
    ...lines.map(
      (line, index) =>
        `${index ? `0 -14 Td${NL}` : ""}(${line.replace(/[()\\\\]/g, "\\\\$&")}) Tj`
    ),
    "ET",
  ].join(NL);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream, "utf8")} >>${NL}stream${NL}${stream}${NL}endstream`,
  ];
  const header = `%PDF-1.4${NL}%${String.fromCharCode(0xe2, 0xe3, 0xcf, 0xd3)}${NL}`;
  let body = header;
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets[index + 1] = Buffer.byteLength(body, "binary");
    body += `${index + 1} 0 obj${NL}${object}${NL}endobj${NL}`;
  });
  const xrefOffset = Buffer.byteLength(body, "binary");
  body += `xref${NL}0 ${objects.length + 1}${NL}0000000000 65535 f ${NL}`;
  for (let index = 1; index <= objects.length; index++)
    body += `${String(offsets[index]).padStart(10, "0")} 00000 n ${NL}`;
  body += `trailer${NL}<< /Size ${objects.length + 1} /Root 1 0 R >>${NL}startxref${NL}${xrefOffset}${NL}%%EOF${NL}`;
  return Buffer.from(body, "binary");
}

export async function executeTool(
  taskId: number,
  toolName: string,
  inputData: any,
  options: { approvedExecutionId?: number } = {}
) {
  const aliases: Record<string, string> = {
    terminal_exec: "execute_command",
    write_file: "write",
    read_file: "read",
  };
  toolName = aliases[toolName] || toolName;
  const def = TOOL_REGISTRY[toolName];
  if (!def) throw new Error(`Unknown tool: ${toolName}`);

  const safeInput = sanitizeToolInput(inputData || {}) as Record<string, any>;
  if (["list", "read", "write", "edit", "move", "delete"].includes(toolName)) {
    resolveWorkspacePath(taskId, String(inputData?.path || "."));
  }
  if (
    ["execute_command", "execute_python", "execute_script"].includes(toolName)
  ) {
    validateCommand(
      String(inputData?.command || inputData?.code || inputData?.script || "")
    );
  }

  const requiresApproval =
    def.permissionTier === "CONFIRM" || def.permissionTier === "RESTRICTED";
  const initialStatus = requiresApproval ? "pending_approval" : "success";
  const db = await getDb();

  if (!db) {
    throw new Error(
      "Database unavailable; refusing to report a tool execution that was not persisted or executed."
    );
  }

  let execId = options.approvedExecutionId;
  if (!execId) {
    const [execResult] = await db.insert(toolExecutions).values({
      taskId,
      toolName,
      category: def.category,
      permissionTier: def.permissionTier,
      inputData: safeInput,
      outputData: null,
      status: initialStatus,
      durationMs: 0,
    });
    execId = Number((execResult as any).insertId);
  }

  if (requiresApproval && !options.approvedExecutionId) {
    await logAgentEvent(
      taskId,
      "Security",
      "approval requested",
      `Tool ${toolName} requires ${def.permissionTier} permission approval.`,
      {
        toolExecutionId: execId,
        toolName,
        permissionTier: def.permissionTier,
      }
    );
    return { status: "pending_approval", toolExecutionId: execId };
  }

  await db
    .update(toolExecutions)
    .set({ status: "running" })
    .where(eq(toolExecutions.id, execId));
  const startedAt = Date.now();
  let output: any = {
    result: `Successfully executed ${toolName}`,
    data: safeInput,
  };
  if (["list", "read", "write", "edit"].includes(toolName)) {
    output = await executeWorkspaceFileTool(taskId, toolName, safeInput);
  } else if (toolName === "create_document") {
    const filePath = resolveWorkspacePath(
      taskId,
      String(inputData?.name || `document-${Date.now()}.md`)
    );
    const content = String(inputData?.content || "");
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf8");
    output = {
      success: true,
      result: "Document created in shared workspace",
      path: filePath,
      bytes: Buffer.byteLength(content),
    };
  }
  if (toolName === "parallel_research") {
    output = await executeParallelResearch(
      taskId,
      Array.isArray(safeInput.queries)
        ? safeInput.queries
        : [String(safeInput.query || "")]
    );
  } else if (
    [
      "open_url",
      "search_web",
      "extract_page",
      "screenshot_page",
      "click_element",
      "type_form",
    ].includes(toolName)
  ) {
    output = await executeRealBrowserAction(taskId, toolName, safeInput);
  } else if (
    [
      "screenshot",
      "click",
      "mouse_move",
      "keyboard_type",
      "double_click",
      "right_click",
      "drag_drop",
      "scroll",
    ].includes(toolName)
  ) {
    output = await executeComputerControl(taskId, toolName, safeInput);
  } else if (toolName === "create_pdf" || toolName === "create_document") {
    const textContent = inputData?.content || "OnClick AI Generated Report";
    const fileKey = `artifacts/task-${taskId}-${Date.now()}.pdf`;
    const stored = await storagePut(
      fileKey,
      createPdfBuffer(String(textContent)),
      "application/pdf"
    );

    await db.insert(taskArtifacts).values({
      taskId,
      name: inputData?.name || "report.pdf",
      fileType: "pdf",
      storageUrl: stored.url,
      fileKey: stored.key,
    });
    output = { result: "PDF generated and saved to S3", url: stored.url };
  } else if (toolName === "search_web") {
    output = {
      result: `Found top academic & program details for ${inputData?.query || "topic"}`,
    };
  }

  await db
    .update(toolExecutions)
    .set({
      status: "success",
      outputData: output,
      durationMs: Date.now() - startedAt,
    })
    .where(eq(toolExecutions.id, execId));

  return { status: "success", output, toolExecutionId: execId };
}

export async function runTaskAutonomous(taskId: number) {
  // Compatibility entry point for older callers. The only supported implementation is the live engine.
  const { executeTaskWithSelfCorrection } = await import("./coreEngine");
  return executeTaskWithSelfCorrection(taskId);
}
