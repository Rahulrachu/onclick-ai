export type ApprovalLiveEvent = {
  eventType: "approval requested";
  agent: string;
  message: string;
  timestamp: number;
  toolExecutionId: number;
  toolName: string;
  permissionTier: string;
};

export type PersistedToolExecution = {
  id: number;
  toolName: string;
  permissionTier: string;
  status: string;
  createdAt: Date | string | number;
};

export type TimelineEvent = {
  eventType: string;
  agent: string;
  message: string;
  timestamp: number;
  createdAt?: Date | string | number;
};

export function mergeTimeline(liveEvents: any[], persistedEvents: any[], limit = 50): TimelineEvent[] {
  const combined = [...liveEvents, ...persistedEvents].map((e) => ({
    eventType: e.eventType || "action started",
    agent: e.agent || "Orchestrator",
    message: e.message || "",
    timestamp: e.timestamp ? Number(e.timestamp) : e.createdAt ? new Date(e.createdAt).getTime() : Date.now(),
  }));
  return combined.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
}

export function getPendingApproval(
  tools: any[],
  liveEvents: any[] = [],
  activeAgent = "Orchestrator",
): { id: number; toolName: string; permissionTier: string; taskId?: number } | null {
  const persisted = tools.find((tool) => tool.status === "pending_approval");
  if (persisted) {
    return {
      id: persisted.id,
      toolName: persisted.toolName,
      permissionTier: persisted.permissionTier,
      taskId: persisted.taskId,
    };
  }

  const live = liveEvents.find((event) => event.eventType === "approval requested");
  if (live && live.metadata?.executionId) {
    return {
      id: Number(live.metadata.executionId),
      toolName: live.metadata.toolName || "execute_command",
      permissionTier: live.metadata.permissionTier || "CONFIRM",
      taskId: live.taskId,
    };
  }

  return null;
}

export const getPendingApprovalFromTask = getPendingApproval;
