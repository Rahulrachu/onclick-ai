import { describe, expect, it } from "vitest";
import { getPendingApproval, mergeTimeline } from "./orchestration";

describe("getPendingApproval", () => {
  it("prefers the newest live approval event", () => {
    const result = getPendingApproval([
      {
        eventType: "approval requested",
        agent: "Security",
        message: "execute_command is waiting",
        timestamp: 200,
        toolExecutionId: 9,
        toolName: "execute_command",
        permissionTier: "CONFIRM",
      },
    ], [{ id: 4, toolName: "create_pdf", permissionTier: "CONFIRM", status: "pending_approval", createdAt: 100 }]);

    expect(result?.toolExecutionId).toBe(9);
    expect(result?.agent).toBe("Security");
  });

  it("reconstructs a pending approval after reload from persisted tools", () => {
    const result = getPendingApproval([], [{ id: 7, toolName: "create_pdf", permissionTier: "CONFIRM", status: "pending_approval", createdAt: "2026-08-11T12:00:00.000Z" }], "File");

    expect(result).toMatchObject({
      eventType: "approval requested",
      agent: "File",
      toolExecutionId: 7,
      toolName: "create_pdf",
      permissionTier: "CONFIRM",
    });
  });

  it("keeps persisted logs visible after live SSE events arrive", () => {
    const result = mergeTimeline(
      [{ eventType: "tool called", agent: "Browser", message: "Live search", timestamp: 300 }],
      [{ eventType: "action started", agent: "Research", message: "Persisted start", timestamp: 200 }],
    );

    expect(result.map((event) => event.message)).toEqual(["Live search", "Persisted start"]);
  });

  it("returns null when all persisted tools are resolved", () => {
    expect(getPendingApproval([], [{ id: 7, toolName: "create_pdf", permissionTier: "SAFE", status: "success", createdAt: 100 }])).toBeNull();
  });
});
