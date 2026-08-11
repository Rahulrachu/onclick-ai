import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { getPendingApproval, mergeTimeline } from "@/lib/orchestration";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Copy,
  FileText,
  FolderOpen,
  Gauge,
  Layers3,
  LockKeyhole,
  Menu,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Square,
  TerminalSquare,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type AgentRole = "Orchestrator" | "Planner" | "Research" | "Browser" | "Coding" | "File" | "Data" | "Reasoning" | "Verification" | "Critic" | "Recovery" | "Security";
type EventType = "action started" | "tool called" | "result observed" | "plan updated" | "approval requested";
type LiveEvent = { eventType: EventType; agent: string; message: string; timestamp: number; toolExecutionId?: number | null; toolName?: string; permissionTier?: string };

const agentRoles: AgentRole[] = [
  "Orchestrator", "Planner", "Research", "Browser", "Coding", "File", "Data", "Reasoning", "Verification", "Critic", "Recovery", "Security",
];

const defaultToolNames = [
  "open_url", "search_web", "click_element", "extract_page", "screenshot_page", "download", "upload",
  "list", "read", "write", "edit", "move", "delete", "execute_command", "execute_python", "execute_script",
  "create_document", "create_pdf", "create_spreadsheet", "parse_csv", "analyze_dataset", "generate_chart",
];

const permissionColor: Record<string, string> = {
  SAFE: "text-[#d7ff55] border-[#d7ff55]/50 bg-[#d7ff55]/10",
  CONFIRM: "text-[#ffb800] border-[#ffb800]/50 bg-[#ffb800]/10",
  RESTRICTED: "text-[#ff4b3e] border-[#ff4b3e]/50 bg-[#ff4b3e]/10",
};

const eventLabels: Record<EventType, string> = {
  "action started": "ACTION STARTED",
  "tool called": "TOOL CALLED",
  "result observed": "RESULT OBSERVED",
  "plan updated": "PLAN UPDATED",
  "approval requested": "APPROVAL REQUESTED",
};

function formatTime(value: Date | string | number | null | undefined) {
  if (!value) return "--:--:--";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function statusTone(status?: string) {
  if (status === "completed") return "text-[#d7ff55]";
  if (status === "running") return "text-[#ff4b3e]";
  if (status === "failed") return "text-[#ff4b3e]";
  if (status === "paused") return "text-[#ffb800]";
  return "text-white/50";
}

export default function Home() {
  const { user, isAuthenticated, loading, logout } = useAuth();
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [goal, setGoal] = useState("");
  const [title, setTitle] = useState("New autonomous task");
  const [showLaunch, setShowLaunch] = useState(false);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [activeView, setActiveView] = useState<"mission" | "memory" | "tools">("mission");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const tasksQuery = trpc.tasks.list.useQuery(undefined, { enabled: isAuthenticated, refetchInterval: isAuthenticated ? 5000 : false });
  const taskQuery = trpc.tasks.getById.useQuery(
    { taskId: selectedTaskId ?? 0 },
    { enabled: isAuthenticated && selectedTaskId !== null, refetchInterval: isAuthenticated && selectedTaskId !== null ? 3000 : false },
  );
  const memoryQuery = trpc.memory.list.useQuery(undefined, { enabled: isAuthenticated && activeView === "memory" });
  const toolsQuery = trpc.tools.list.useQuery();
  const createTask = trpc.tasks.create.useMutation();
  const pauseTask = trpc.tasks.pause.useMutation();
  const resumeTask = trpc.tasks.resume.useMutation();
  const cancelTask = trpc.tasks.cancel.useMutation();
  const retryTask = trpc.tasks.retry.useMutation();
  const duplicateTask = trpc.tasks.duplicate.useMutation();
  const approveTool = trpc.tools.approve.useMutation();
  const utils = trpc.useUtils();

  const selectedTask = taskQuery.data?.task ?? tasksQuery.data?.find((task) => task.id === selectedTaskId) ?? null;
  const taskSteps = taskQuery.data?.steps ?? [];
  const taskLogs = taskQuery.data?.logs ?? [];
  const taskTools = taskQuery.data?.tools ?? [];
  const artifacts = taskQuery.data?.artifacts ?? [];
  const tools = toolsQuery.data ?? [];

  useEffect(() => {
    if (selectedTaskId === null && tasksQuery.data?.[0]) {
      setSelectedTaskId(tasksQuery.data[0].id);
    }
  }, [selectedTaskId, tasksQuery.data]);

  useEffect(() => {
    if (!selectedTaskId) return;
    const stream = new EventSource(`/api/events/${selectedTaskId}`);
    const eventTypes: EventType[] = ["action started", "tool called", "result observed", "plan updated", "approval requested"];
    const handlers = eventTypes.map((eventType) => {
      const handler = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          setLiveEvents((previous) => [{ eventType, ...data }, ...previous].slice(0, 20));
          void taskQuery.refetch();
          void tasksQuery.refetch();
        } catch {
          // Ignore malformed events; the persisted task state remains authoritative.
        }
      };
      stream.addEventListener(eventType, handler);
      return [eventType, handler] as const;
    });
    return () => {
      handlers.forEach(([eventType, handler]) => stream.removeEventListener(eventType, handler));
      stream.close();
    };
  }, [selectedTaskId]);

  const currentStep = useMemo(() => taskSteps.find((step) => step.status === "running") ?? taskSteps.at(-1), [taskSteps]);
  const pendingApproval = getPendingApproval(liveEvents, taskTools, selectedTask?.activeAgent || "Orchestrator");
  const persistedEvents: LiveEvent[] = taskLogs.map((log) => ({
    eventType: log.eventType as EventType,
    agent: log.agent,
    message: log.message,
    timestamp: new Date(log.createdAt).getTime(),
  }));
  const displayEvents = mergeTimeline(liveEvents, persistedEvents);

  async function launchTask() {
    if (!goal.trim()) {
      toast.error("Add a goal before launching the team.");
      return;
    }
    if (!isAuthenticated) {
      startLogin();
      return;
    }
    try {
      const result = await createTask.mutateAsync({ title: title.trim() || "Autonomous task", goal: goal.trim() });
      setGoal("");
      setShowLaunch(false);
      setSelectedTaskId(Number(result.taskId));
      setLiveEvents([]);
      await utils.tasks.list.invalidate();
      toast.success("Mission launched. The orchestration loop is running.");
    } catch {
      toast.error("The task could not be launched. Check the server logs and try again.");
    }
  }

  async function mutateTask(action: "pause" | "resume" | "cancel" | "retry" | "duplicate") {
    if (!selectedTaskId) return;
    try {
      const mutation = { pause: pauseTask, resume: resumeTask, cancel: cancelTask, retry: retryTask, duplicate: duplicateTask }[action];
      const result = await mutation.mutateAsync({ taskId: selectedTaskId });
      if (action === "duplicate" && "taskId" in result) setSelectedTaskId(Number(result.taskId));
      await utils.tasks.list.invalidate();
      await taskQuery.refetch();
      toast.success(`Task ${action}d.`);
    } catch {
      toast.error(`Could not ${action} this task.`);
    }
  }

  async function approvePending(approved: boolean) {
    if (!selectedTaskId || !pendingApproval?.toolExecutionId) return;
    try {
      await approveTool.mutateAsync({ taskId: selectedTaskId, toolExecutionId: pendingApproval.toolExecutionId, approved });
      setLiveEvents((previous) => previous.filter((event) => event !== pendingApproval));
      await taskQuery.refetch();
      toast.success(approved ? "Tool approved." : "Tool denied.");
    } catch {
      toast.error("Could not update the approval state.");
    }
  }
  const completedCount = taskSteps.filter((step) => step.status === "completed").length;
  const totalSteps = selectedTask?.totalSteps ?? taskSteps.length;
  const progress = selectedTask?.progressPercent ?? 0;

  if (loading) {
    return <div className="min-h-screen bg-[#050505] flex items-center justify-center text-white font-mono">BOOTING ONCLICK AI<span className="blink ml-2">_</span></div>;
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-[#ff4b3e] selection:text-white">
      <header className="border-b border-white/15 bg-[#050505] sticky top-0 z-30">
        <div className="h-16 px-4 md:px-7 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <button className="md:hidden brutal-icon-button" onClick={() => setMobileMenuOpen((value) => !value)} aria-label="Toggle navigation"><Menu size={18} /></button>
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 bg-[#ff4b3e] inline-block" />
              <span className="font-display text-xl md:text-2xl tracking-[-0.06em]">ONCLICK AI</span>
            </div>
            <span className="hidden md:block text-[10px] font-mono text-white/35 uppercase tracking-[0.22em]">Autonomous orchestration system / v0.1</span>
          </div>
          <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.15em]">
            <span className="hidden sm:flex items-center gap-2 text-white/45"><span className="w-2 h-2 rounded-full bg-[#d7ff55]" /> core online</span>
            {user ? <button onClick={logout} className="text-white/45 hover:text-white transition-colors">{user.name || "operator"} / exit</button> : <button onClick={startLogin} className="text-[#ff4b3e] hover:text-white transition-colors">sign in</button>}
          </div>
        </div>
        <div className="h-[3px] bg-[#ff4b3e]" />
      </header>

      <div className="grid-lines min-h-[calc(100vh-67px)]">
        <div className="max-w-[1800px] mx-auto grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)_340px] min-h-[calc(100vh-67px)]">
          <aside className={`${mobileMenuOpen ? "block" : "hidden"} lg:block border-r border-white/15 bg-[#080808]`}>
            <div className="p-5 lg:sticky lg:top-[67px]">
              <div className="section-kicker mb-5">Control surface</div>
              <nav className="space-y-1">
                {[
                  ["mission", Activity, "Mission control"],
                  ["memory", Layers3, "Memory"],
                  ["tools", TerminalSquare, "Tool registry"],
                ].map(([view, Icon, label]) => (
                  <button key={String(view)} onClick={() => { setActiveView(view as typeof activeView); setMobileMenuOpen(false); }} className={`rail-link ${activeView === view ? "rail-link-active" : ""}`}>
                    <Icon size={15} /> <span>{label as string}</span><ChevronRight size={13} className="ml-auto opacity-35" />
                  </button>
                ))}
              </nav>

              <div className="mt-10 section-kicker mb-4">Agent roles / 12</div>
              <div className="space-y-2">
                {agentRoles.map((role) => <div key={role} className={`flex items-center gap-2 text-[11px] font-mono ${selectedTask?.activeAgent === role ? "text-[#ff4b3e]" : "text-white/40"}`}><span className={`role-dot ${selectedTask?.activeAgent === role ? "role-dot-active" : ""}`} />{role}</div>)}
              </div>

              <div className="mt-10 border-t border-white/10 pt-5">
                <div className="section-kicker mb-3">Permission protocol</div>
                {(["SAFE", "CONFIRM", "RESTRICTED"] as const).map((tier) => <div key={tier} className="flex items-center justify-between py-1.5 text-[10px] font-mono"><span className="text-white/45">{tier}</span><span className={`border px-1.5 py-0.5 ${permissionColor[tier]}`}>{tier === "SAFE" ? "AUTO" : tier === "CONFIRM" ? "ASK" : "LOCK"}</span></div>)}
              </div>
            </div>
          </aside>

          <main className="min-w-0">
            {activeView === "mission" && <>
              <section className="px-5 py-7 md:px-8 md:py-10 border-b border-white/15">
                <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-7">
                  <div>
                    <div className="section-kicker mb-4">Mission control / live execution</div>
                    <h1 className="font-display text-[clamp(3.5rem,8vw,8.5rem)] uppercase leading-[0.78] tracking-[-0.09em] max-w-4xl">Make the<br /><span className="text-[#ff4b3e]">complex</span><br />simple.</h1>
                  </div>
                  <div className="w-full xl:w-[340px]">
                    <button onClick={() => setShowLaunch(true)} className="brutal-primary w-full justify-between"><span className="flex items-center gap-3"><Plus size={17} /> Launch new task</span><ArrowUpRight size={17} /></button>
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/30 mt-3">Give the team a goal. Watch it plan, act, verify.</p>
                  </div>
                </div>
              </section>

              <section className="border-b border-white/15">
                <div className="px-5 md:px-8 py-4 flex items-center justify-between gap-4 border-b border-white/10">
                  <div className="flex items-center gap-3"><CircleDot size={14} className={selectedTask?.status === "running" ? "text-[#ff4b3e] animate-pulse" : "text-white/30"} /><span className="section-kicker">Selected mission</span></div>
                  {selectedTask && <div className={`text-[10px] font-mono uppercase tracking-[0.2em] ${statusTone(selectedTask.status)}`}>{selectedTask.status}</div>}
                </div>
                <div className="px-5 md:px-8 py-6">
                  {selectedTask ? <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_200px] gap-7">
                    <div className="min-w-0"><div className="text-[10px] text-white/35 font-mono uppercase tracking-[0.16em] mb-2">{selectedTask.title}</div><p className="text-xl md:text-2xl font-display uppercase leading-tight tracking-[-0.02em]">{selectedTask.goal}</p><div className="flex flex-wrap items-center gap-2 mt-5"><span className="tag"><Gauge size={12} /> {selectedTask.activeAgent}</span><span className="tag"><Clock3 size={12} /> {formatTime(selectedTask.updatedAt)}</span><span className="tag"><ShieldCheck size={12} /> verification-aware</span></div></div>
                    <div className="md:border-l md:border-white/15 md:pl-7"><div className="font-display text-5xl tracking-[-0.08em] text-[#ff4b3e]">{progress}%</div><div className="font-mono text-[10px] text-white/45 uppercase mt-1">Task {completedCount}/{totalSteps || 0}</div><div className="progress-track mt-4"><div className="progress-fill" style={{ width: `${progress}%` }} /></div></div>
                  </div> : <div className="py-6"><div className="font-display text-3xl uppercase tracking-[-0.04em]">No mission selected.</div><p className="text-sm text-white/45 mt-2 max-w-lg">Launch a real task to activate the planner, agents, tools, and live verification stream.</p></div>}
                </div>
              </section>

              <section className="grid grid-cols-1 xl:grid-cols-2 border-b border-white/15">
                <div className="border-b xl:border-b-0 xl:border-r border-white/15">
                  <div className="px-5 md:px-8 py-4 flex items-center justify-between border-b border-white/10"><span className="section-kicker">Execution plan</span><span className="font-mono text-[10px] text-white/30">dependency graph</span></div>
                  <div className="p-5 md:p-8 space-y-2">
                    {taskSteps.length ? taskSteps.map((step) => <div key={step.id} className={`plan-row ${step.status === "running" ? "plan-row-active" : ""}`}><div className={`plan-index ${step.status === "completed" ? "plan-index-done" : step.status === "running" ? "plan-index-live" : ""}`}>{step.status === "completed" ? <Check size={13} /> : String(step.stepIndex).padStart(2, "0")}</div><div className="min-w-0"><div className="font-mono text-[11px] uppercase tracking-[0.08em] truncate">{step.title}</div><div className="font-mono text-[10px] text-white/35 mt-1 truncate">{step.agent} / {step.status}</div></div><ChevronRight size={15} className="ml-auto text-white/25" /></div>) : <div className="empty-block"><Search size={18} /><span>Plan output will appear here after launch.</span></div>}
                  </div>
                </div>
                <div>
                  <div className="px-5 md:px-8 py-4 flex items-center justify-between border-b border-white/10"><span className="section-kicker">Active execution</span><span className="font-mono text-[10px] text-[#ff4b3e]">{selectedTask?.activeAgent || "standby"}</span></div>
                  <div className="p-5 md:p-8">
                    <div className="active-agent-card"><div className="flex items-start justify-between gap-3"><div><div className="font-display text-4xl uppercase tracking-[-0.06em]">{selectedTask?.activeAgent || "Orchestrator"}</div><div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#ff4b3e] mt-2">{selectedTask?.status === "running" ? "executing now" : "awaiting mission"}</div></div><div className="agent-sigil"><Users size={22} /></div></div><div className="border-t border-white/15 mt-7 pt-5"><div className="section-kicker mb-2">Current action</div><p className="font-mono text-sm leading-relaxed text-white/75">{selectedTask?.currentAction || "The system is ready to receive a goal."}</p></div></div>
                    {pendingApproval && <div className="mt-4 border border-[#ffb800]/60 bg-[#ffb800]/10 p-4"><div className="flex items-center justify-between gap-3"><span className="section-kicker text-[#ffb800]">Approval requested</span><span className="permission-chip text-[#ffb800] border-[#ffb800]/50">{pendingApproval.permissionTier || "CONFIRM"}</span></div><p className="font-mono text-xs text-white/75 mt-3">{pendingApproval.toolName || "A guarded tool"} is waiting for operator approval.</p><div className="grid grid-cols-2 gap-2 mt-4"><button className="action-button" onClick={() => approvePending(false)} disabled={approveTool.isPending}>Deny</button><button className="brutal-primary justify-center" onClick={() => approvePending(true)} disabled={approveTool.isPending}>Approve</button></div></div>}
                    <div className="mt-5 grid grid-cols-2 gap-2"><div className="metric-cell"><span>Steps</span><b>{completedCount}/{totalSteps || 0}</b></div><div className="metric-cell"><span>Tools</span><b>{taskTools.length}</b></div><div className="metric-cell"><span>Artifacts</span><b>{artifacts.length}</b></div><div className="metric-cell"><span>State</span><b className={statusTone(selectedTask?.status)}>{selectedTask?.status || "idle"}</b></div></div>
                  </div>
                </div>
              </section>

              <section className="border-b border-white/15">
                <div className="px-5 md:px-8 py-4 flex items-center justify-between border-b border-white/10"><span className="section-kicker">Activity timeline</span><span className="font-mono text-[10px] text-white/30">SSE / no polling</span></div>
                <div className="max-h-[330px] overflow-y-auto">{displayEvents.length ? displayEvents.map((event, index) => <div key={`${event.timestamp}-${index}`} className="timeline-row"><div className="timeline-time">{formatTime(event.timestamp)}</div><div className="timeline-dot" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`event-label event-${event.eventType.replaceAll(" ", "-")}`}>{eventLabels[event.eventType as EventType] || event.eventType}</span><span className="text-[10px] text-[#ff4b3e] font-mono uppercase">{event.agent}</span></div><div className="font-mono text-xs text-white/65 mt-1 truncate">{event.message}</div></div></div>) : <div className="empty-block m-5 md:m-8"><Activity size={18} /><span>Events will stream into this timeline as agents work.</span></div>}</div>
              </section>
            </>}

            {activeView === "memory" && <section className="px-5 py-7 md:px-8 md:py-10"><div className="section-kicker mb-4">Inspectable memory</div><h2 className="font-display text-6xl uppercase leading-none tracking-[-0.08em]">Memory<br /><span className="text-[#ff4b3e]">layers.</span></h2><div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-10">{["short-term", "working", "long-term", "episodic", "user preferences"].map((tier) => <div key={tier} className="brutal-card"><div className="flex items-center justify-between"><span className="section-kicker">{tier}</span><LockKeyhole size={15} className="text-white/35" /></div><div className="font-display text-3xl uppercase mt-8">{memoryQuery.data?.filter((memory) => memory.memoryTier === tier).length ?? 0} records</div><div className="font-mono text-[10px] text-white/35 mt-2">Persistent, inspectable, user-controlled.</div></div>)}</div></section>}

            {activeView === "tools" && <section className="px-5 py-7 md:px-8 md:py-10"><div className="section-kicker mb-4">Modular tool registry</div><h2 className="font-display text-6xl uppercase leading-none tracking-[-0.08em]">Tools<br /><span className="text-[#ff4b3e]">are actions.</span></h2><div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-10">{(tools.length ? tools : defaultToolNames.map((name) => ({ name, category: "Runtime", permissionTier: "SAFE", description: "Registered tool" }))).map((tool) => <div key={tool.name} className="tool-row"><div className="flex items-center gap-3 min-w-0"><TerminalSquare size={15} className="text-[#ff4b3e] shrink-0" /><span className="font-mono text-xs truncate">{tool.name}</span></div><span className={`permission-chip ${permissionColor[tool.permissionTier] || "text-white/45 border-white/20"}`}>{tool.permissionTier}</span></div>)}</div></section>}
          </main>

          <aside className="border-l border-white/15 bg-[#080808]">
            <div className="p-5 lg:sticky lg:top-[67px]">
              <div className="section-kicker mb-5">Task queue</div>
              <div className="space-y-2">{tasksQuery.data?.length ? tasksQuery.data.map((task) => <button key={task.id} onClick={() => setSelectedTaskId(task.id)} className={`queue-row ${selectedTaskId === task.id ? "queue-row-active" : ""}`}><div className="flex items-center justify-between gap-2"><span className="font-mono text-[10px] text-white/35">TASK {String(task.id).padStart(3, "0")}</span><span className={`w-2 h-2 rounded-full ${task.status === "running" ? "bg-[#ff4b3e] animate-pulse" : task.status === "completed" ? "bg-[#d7ff55]" : "bg-white/20"}`} /></div><div className="text-sm uppercase font-display tracking-[-0.02em] mt-2 line-clamp-2 text-left">{task.title}</div><div className="font-mono text-[10px] text-white/35 mt-2 text-left">{task.progressPercent}% / {task.status}</div></button>) : <div className="empty-block"><FolderOpen size={17} /><span>No tasks yet.</span></div>}</div>
              <button onClick={() => setShowLaunch(true)} className="brutal-secondary w-full mt-3"><Plus size={15} /> Add task</button>

              {selectedTask && <div className="mt-8 border-t border-white/15 pt-5"><div className="section-kicker mb-4">Task actions</div><div className="grid grid-cols-2 gap-2"><button className="action-button" onClick={() => mutateTask(selectedTask.status === "paused" ? "resume" : "pause")}><Pause size={14} /> {selectedTask.status === "paused" ? "Resume" : "Pause"}</button><button className="action-button" onClick={() => mutateTask("retry")}><RotateCcw size={14} /> Retry</button><button className="action-button" onClick={() => mutateTask("duplicate")}><Copy size={14} /> Duplicate</button><button className="action-button action-danger" onClick={() => mutateTask("cancel")}><Square size={14} /> Cancel</button></div></div>}

              <div className="mt-8 border-t border-white/15 pt-5"><div className="section-kicker mb-4">Generated workspace</div>{artifacts.length ? artifacts.map((artifact) => <a key={artifact.id} href={artifact.storageUrl} target="_blank" rel="noreferrer" className="artifact-row"><FileText size={15} className="text-[#d7ff55]" /><span className="truncate">{artifact.name}</span><ArrowUpRight size={14} className="ml-auto" /></a>) : <div className="font-mono text-[10px] leading-relaxed text-white/35">Artifacts, downloads, source files, and reports will be indexed per task.</div>}</div>

              <div className="mt-8 border-t border-white/15 pt-5"><div className="section-kicker mb-4">System posture</div><div className="space-y-3 font-mono text-[10px] uppercase tracking-[0.08em]"><div className="flex justify-between"><span className="text-white/35">SSE stream</span><span className="text-[#d7ff55]">ready</span></div><div className="flex justify-between"><span className="text-white/35">Storage</span><span className="text-[#d7ff55]">durable</span></div><div className="flex justify-between"><span className="text-white/35">Approval gates</span><span className="text-[#ffb800]">armed</span></div><div className="flex justify-between"><span className="text-white/35">Chain of thought</span><span className="text-white/45">hidden</span></div></div></div>
            </div>
          </aside>
        </div>
      </div>

      {showLaunch && <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true"><div className="w-full max-w-2xl bg-[#0b0b0b] border border-white/25 shadow-[12px_12px_0_#ff4b3e]"><div className="flex items-center justify-between px-5 py-4 border-b border-white/15"><div><div className="section-kicker">New mission</div><div className="font-display text-3xl uppercase tracking-[-0.05em] mt-2">Set the team in motion.</div></div><button className="brutal-icon-button" onClick={() => setShowLaunch(false)} aria-label="Close"><X size={17} /></button></div><div className="p-5 space-y-5"><label className="block"><span className="section-kicker block mb-2">Task label</span><input className="brutal-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Research brief / build / automate" /></label><label className="block"><span className="section-kicker block mb-2">User goal</span><textarea className="brutal-input min-h-36 resize-y" value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Research the best MCA AI/ML colleges in India, compare fees and placements, create a report, and save it as a PDF." /></label><div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-t border-white/10 pt-5"><div className="flex items-center gap-2 text-[10px] font-mono text-white/40 uppercase"><ShieldCheck size={14} className="text-[#d7ff55]" /> SAFE actions run automatically</div><button className="brutal-primary" onClick={launchTask} disabled={createTask.isPending}>{createTask.isPending ? <><span className="spinner" /> Launching...</> : <><Play size={15} /> Launch task</>}</button></div></div></div></div>}
    </div>
  );
}

