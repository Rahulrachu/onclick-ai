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
};

export function mergeTimeline(liveEvents: TimelineEvent[], persistedEvents: TimelineEvent[], limit = 24): TimelineEvent[] {
  return [...liveEvents, ...persistedEvents].slice(0, limit);
}

export function getPendingApproval(
  liveEvents: Array<ApprovalLiveEvent | { eventType: string }>,
  tools: PersistedToolExecution[],
  activeAgent = "Orchestrator",
): ApprovalLiveEvent | null {
  const live = liveEvents.find(
    (event): event is ApprovalLiveEvent => event.eventType === "approval requested" && "toolExecutionId" in event && Boolean(event.toolExecutionId),
  );
  if (live) return live;

  const persisted = tools.find((tool) => tool.status === "pending_approval");
  if (!persisted) return null;

  return {
    eventType: "approval requested",
    agent: activeAgent,
    message: `${persisted.toolName} is waiting for operator approval.`,
    timestamp: new Date(persisted.createdAt).getTime(),
    toolExecutionId: persisted.id,
    toolName: persisted.toolName,
    permissionTier: persisted.permissionTier,
  };
}
