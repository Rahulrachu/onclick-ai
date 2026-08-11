import fs from "node:fs/promises";
import path from "node:path";
import {
  createWorkspaceSession,
  getWorkspaceSession,
} from "./workspaceSession";
import { executeRealBrowserAction } from "./browserEngine";

export interface ParallelSubagentResult {
  index: number;
  query: string;
  sessionId: string;
  success: boolean;
  output?: unknown;
  error?: string;
}

export async function executeParallelResearch(
  taskId: number,
  queries: string[]
): Promise<{
  success: boolean;
  results: ParallelSubagentResult[];
  consolidatedPath: string;
}> {
  if (!Number.isInteger(taskId) || taskId < 1)
    throw new Error("Parallel research requires a valid task id");
  const normalizedQueries = queries
    .map(query => String(query).trim())
    .filter(Boolean)
    .slice(0, 12);
  if (normalizedQueries.length === 0)
    throw new Error("parallel_research requires at least one query");

  const results = await Promise.all(
    normalizedQueries.map(
      async (query, index): Promise<ParallelSubagentResult> => {
        const sessionId = `task-${taskId}-sub-${index + 1}`;
        try {
          await createWorkspaceSession(sessionId, "temporary");
          const output = await executeRealBrowserAction(
            sessionId,
            "search_web",
            { query }
          );
          const success = (output as any)?.success === true;
          return {
            index,
            query,
            sessionId,
            success,
            output,
            ...(success
              ? {}
              : {
                  error: String(
                    (output as any)?.error || "Browser search failed"
                  ),
                }),
          };
        } catch (error) {
          return {
            index,
            query,
            sessionId,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }
    )
  );

  const parent =
    getWorkspaceSession(`task-${taskId}`) ??
    (await createWorkspaceSession(`task-${taskId}`, "persistent"));
  const relativePath = path.join("parallel", `research-${Date.now()}.json`);
  const consolidatedPath = path.join(parent.workspaceDir, relativePath);
  await fs.mkdir(path.dirname(consolidatedPath), { recursive: true });
  await fs.writeFile(
    consolidatedPath,
    JSON.stringify({ taskId, queries: normalizedQueries, results }, null, 2),
    "utf8"
  );

  return {
    success: results.length > 0 && results.every(result => result.success),
    results,
    consolidatedPath,
  };
}
