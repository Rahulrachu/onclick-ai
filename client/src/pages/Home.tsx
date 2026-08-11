import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Play, Pause, RotateCcw, Copy, Trash2, CheckCircle2, AlertTriangle, 
  Terminal, ShieldAlert, Cpu, Globe, FileText, Database, Code, Eye, Lock, Zap, ArrowRight, Check, X, Sparkles, Layers, Activity, Server
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import { getPendingApprovalFromTask, mergeTimeline } from "@/lib/orchestration";
import WorkspacePanel from "@/components/WorkspacePanel";

const MISSION_TEMPLATES = [
  { id: "research", title: "Deep Web Research & PDF Report", icon: Globe, goal: "Research top AI universities, extract program details, tuition fees, and placements, then generate a formatted PDF report." },
  { id: "coding", title: "Full-Stack Web App Generator", icon: Code, goal: "Scaffold a full-stack Next.js application with Tailwind CSS, database schema, authentication, and REST API." },
  { id: "scraping", title: "Automated Data Scraping & CSV", icon: Database, goal: "Scrape real-time market data across multiple financial web portals and export clean CSV datasets." },
  { id: "recovery", title: "Self-Healing Bug Fixer & Test Suite", icon: Terminal, goal: "Audit local project codebase, run test suite, identify failing test cases, fix code, and verify successfully." },
];

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const [goal, setGoal] = useState("");
  const [title, setTitle] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [showLaunch, setShowLaunch] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [liveEvents, setLiveEvents] = useState<any[]>([]);

  const utils = trpc.useUtils();
  const tasksQuery = trpc.tasks.list.useQuery(undefined, { enabled: isAuthenticated });
  const taskQuery = trpc.tasks.getById.useQuery(selectedTaskId ?? 0, { enabled: !!selectedTaskId && isAuthenticated, refetchInterval: 3000 });

  const createTask = trpc.tasks.create.useMutation();
  const pauseTask = trpc.tasks.pause.useMutation();
  const resumeTask = trpc.tasks.resume.useMutation();
  const cancelTask = trpc.tasks.cancel.useMutation();
  const retryTask = trpc.tasks.retry.useMutation();
  const duplicateTask = trpc.tasks.duplicate.useMutation();
  const approveTool = trpc.tasks.approveTool.useMutation();

  // Select first task by default if none selected
  useEffect(() => {
    if (tasksQuery.data && tasksQuery.data.length > 0 && !selectedTaskId) {
      setSelectedTaskId(tasksQuery.data[0].id);
    }
  }, [tasksQuery.data, selectedTaskId]);

  // SSE Real-time event stream
  useEffect(() => {
    if (!selectedTaskId) return;
    const eventSource = new EventSource(`/api/tasks/${selectedTaskId}/events`);
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setLiveEvents((prev) => [data, ...prev].slice(0, 100));
        if (data.eventType === "plan updated" || data.eventType === "result observed") {
          taskQuery.refetch();
        }
      } catch (err) {
        console.error("Failed to parse SSE event:", err);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [selectedTaskId]);

  async function handleCreateTask(presetGoal?: string) {
    const targetGoal = presetGoal || goal;
    if (!targetGoal.trim()) {
      toast.error("Add a goal before launching the team.");
      return;
    }
    if (!isAuthenticated) {
      startLogin();
      return;
    }
    try {
      const result = await createTask.mutateAsync({ goal: targetGoal.trim() });
      setGoal("");
      setTitle("");
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
      const result = await mutation.mutateAsync(selectedTaskId);
      if (action === "duplicate" && result && typeof result === "object" && "taskId" in result) {
        setSelectedTaskId(Number(result.taskId));
      }
      await utils.tasks.list.invalidate();
      await taskQuery.refetch();
      toast.success(`Task ${action}d.`);
    } catch {
      toast.error(`Could not ${action} this task.`);
    }
  }

  async function approvePending(approved: boolean) {
    const pending = pendingApproval;
    if (!pending) return;
    try {
      await approveTool.mutateAsync({ executionId: pending.id, approved });
      toast.success(approved ? "Tool execution approved and resumed." : "Tool execution rejected.");
      await taskQuery.refetch();
    } catch {
      toast.error("Failed to process approval.");
    }
  }

  const currentTask = taskQuery.data?.task;
  const currentSteps = taskQuery.data?.steps || [];
  const currentLogs = taskQuery.data?.logs || [];
  const currentTools = taskQuery.data?.tools || [];
  const currentArtifacts = taskQuery.data?.artifacts || [];

  const pendingApproval = useMemo(() => {
    return getPendingApprovalFromTask(currentTools, liveEvents);
  }, [currentTools, liveEvents]);

  const mergedTimeline = useMemo(() => {
    return mergeTimeline(currentLogs, liveEvents);
  }, [currentLogs, liveEvents]);

  return (
    <div className="min-h-screen bg-black text-white font-sans antialiased selection:bg-red-600 selection:text-white">
      {/* Top Brutalist Header */}
      <header className="border-b border-red-600 px-6 py-4 flex items-center justify-between bg-zinc-950 sticky top-0 z-50">
        <div className="flex items-center space-x-4">
          <div className="bg-red-600 px-3 py-1 font-black tracking-widest text-black text-sm">ONCLICK AI</div>
          <span className="text-xs uppercase tracking-widest text-zinc-400">Autonomous Multi-Agent Orchestration Platform</span>
        </div>
        <div className="flex items-center space-x-4">
          <div className="hidden md:flex items-center space-x-2 text-xs font-mono text-zinc-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>ENGINE: ONLINE</span>
            <span className="text-zinc-600">|</span>
            <span>PLAYWRIGHT & VIRTUALIZATION ACTIVE</span>
          </div>
          {isAuthenticated ? (
            <div className="flex items-center space-x-3">
              <span className="text-xs font-mono text-zinc-300">{user?.name || user?.email || "Agent Operator"}</span>
              <Button onClick={() => setShowLaunch(true)} className="bg-red-600 hover:bg-red-700 text-white font-black tracking-wider text-xs uppercase px-4 py-2">
                + New Mission
              </Button>
            </div>
          ) : (
            <Button onClick={() => startLogin()} className="bg-red-600 hover:bg-red-700 text-white font-black tracking-wider text-xs uppercase px-4 py-2">
              Sign In
            </Button>
          )}
        </div>
      </header>

      {/* Red Structural Divider */}
      <div className="w-full h-[2px] bg-red-600"></div>

      {/* Main App Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 min-h-[calc(100vh-65px)]">
        {/* Sidebar: Mission List & Quick Starters */}
        <div className="border-r border-zinc-800 p-4 bg-zinc-950/80 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs uppercase tracking-widest font-black text-zinc-400 flex items-center gap-2">
                <Layers className="w-4 h-4 text-red-600" /> Active Missions
              </h2>
              <Button onClick={() => setShowLaunch(true)} variant="outline" className="border-zinc-800 text-zinc-300 hover:bg-zinc-900 text-xs py-1 h-7">
                + Launch
              </Button>
            </div>

            {/* Mission Template Quick Starters */}
            <div className="mb-6 space-y-2">
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">Quick Templates</div>
              {MISSION_TEMPLATES.map((tmpl) => {
                const Icon = tmpl.icon;
                return (
                  <button
                    key={tmpl.id}
                    onClick={() => handleCreateTask(tmpl.goal)}
                    className="w-full text-left p-2.5 bg-zinc-900/50 hover:bg-red-950/30 border border-zinc-800/80 hover:border-red-600/60 transition group rounded-none flex items-center space-x-2"
                  >
                    <Icon className="w-4 h-4 text-red-500 shrink-0" />
                    <span className="text-xs font-medium text-zinc-300 group-hover:text-white truncate">{tmpl.title}</span>
                  </button>
                );
              })}
            </div>

            {/* Task History */}
            <div className="space-y-2">
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">Task History</div>
              <ScrollArea className="h-[320px] pr-2">
                {tasksQuery.data && tasksQuery.data.length > 0 ? (
                  tasksQuery.data.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTaskId(t.id)}
                      className={`w-full text-left p-3 mb-2 border transition ${
                        selectedTaskId === t.id
                          ? "bg-red-950/40 border-red-600 text-white"
                          : "bg-zinc-900/40 border-zinc-800/60 text-zinc-400 hover:border-zinc-700"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-xs text-red-500">TASK #{t.id}</span>
                        <span className={`text-[10px] uppercase font-mono px-1.5 py-0.5 ${
                          t.status === "completed" ? "bg-emerald-950 text-emerald-400 border border-emerald-800" :
                          t.status === "running" ? "bg-amber-950 text-amber-400 border border-amber-800 animate-pulse" :
                          t.status === "failed" ? "bg-red-950 text-red-400 border border-red-800" :
                          "bg-zinc-800 text-zinc-300"
                        }`}>
                          {t.status}
                        </span>
                      </div>
                      <div className="text-xs font-semibold truncate text-zinc-200">{t.title || t.goal}</div>
                      <div className="text-[10px] text-zinc-500 mt-1 font-mono">{t.progressPercent}% complete</div>
                    </button>
                  ))
                ) : (
                  <div className="text-xs text-zinc-600 text-center py-8 font-mono">No tasks found. Launch your first mission above.</div>
                )}
              </ScrollArea>
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-900 text-[10px] font-mono text-zinc-600 flex justify-between">
            <span>ENGINE: v3.5-PROD</span>
            <span>SECURE SANDBOX</span>
          </div>
        </div>

        {/* Center/Right Main Panel: Live Dashboard & Execution */}
        <div className="col-span-1 lg:col-span-3 flex flex-col bg-black">
          {currentTask ? (
            <div className="flex-1 flex flex-col">
              {/* Task Header & Controls */}
              <div className="p-6 border-b border-zinc-800 bg-zinc-950/40 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <div className="flex items-center space-x-3 mb-1">
                    <span className="font-mono text-red-500 text-sm">MISSION #{currentTask.id}</span>
                    <Badge variant="outline" className="border-red-600 text-red-400 uppercase text-xs font-mono">
                      {currentTask.status}
                    </Badge>
                    <span className="text-xs font-mono text-zinc-400">Task {currentTask.currentStepIndex}/{currentTask.totalSteps}, {currentTask.progressPercent}%</span>
                  </div>
                  <h1 className="text-xl font-bold tracking-tight text-white max-w-3xl">{currentTask.goal}</h1>
                </div>

                {/* Task Control Actions */}
                <div className="flex items-center space-x-2">
                  {currentTask.status === "running" ? (
                    <Button onClick={() => mutateTask("pause")} variant="outline" className="border-amber-600 text-amber-400 hover:bg-amber-950/50 text-xs font-mono">
                      <Pause className="w-3.5 h-3.5 mr-1.5" /> Pause
                    </Button>
                  ) : currentTask.status === "paused" ? (
                    <Button onClick={() => mutateTask("resume")} variant="outline" className="border-emerald-600 text-emerald-400 hover:bg-emerald-950/50 text-xs font-mono">
                      <Play className="w-3.5 h-3.5 mr-1.5" /> Resume
                    </Button>
                  ) : null}

                  {currentTask.status !== "cancelled" && currentTask.status !== "completed" && (
                    <Button onClick={() => mutateTask("cancel")} variant="outline" className="border-red-600 text-red-400 hover:bg-red-950/50 text-xs font-mono">
                      <X className="w-3.5 h-3.5 mr-1.5" /> Cancel
                    </Button>
                  )}

                  <Button onClick={() => mutateTask("retry")} variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-900 text-xs font-mono">
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Retry
                  </Button>

                  <Button onClick={() => mutateTask("duplicate")} variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-900 text-xs font-mono">
                    <Copy className="w-3.5 h-3.5 mr-1.5" /> Duplicate
                  </Button>
                </div>
              </div>

              {/* Active Approval Gate if Pending */}
              {pendingApproval && (
                <div className="bg-amber-950/30 border-b border-amber-600/50 p-4 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <ShieldAlert className="w-6 h-6 text-amber-500 animate-bounce" />
                    <div>
                      <div className="text-xs font-mono uppercase tracking-widest text-amber-400 font-bold">Human Approval Required</div>
                      <div className="text-sm text-zinc-200">Agent requested permission to execute tool <code className="bg-zinc-900 px-1.5 py-0.5 text-red-400 font-mono">{pendingApproval.toolName}</code> under tier <span className="text-amber-400 font-mono">{pendingApproval.permissionTier}</span>.</div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Button onClick={() => approvePending(false)} variant="outline" className="border-red-600 text-red-400 hover:bg-red-950 text-xs font-mono">
                      Reject
                    </Button>
                    <Button onClick={() => approvePending(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-mono font-bold">
                      Approve & Execute
                    </Button>
                  </div>
                </div>
              )}

              {/* Tabbed Workspace */}
              <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
                <div className="border-b border-zinc-800 px-6 bg-zinc-950/20">
                  <TabsList className="bg-transparent h-12 space-x-6">
                    <TabsTrigger value="overview" className="data-[state=active]:bg-transparent data-[state=active]:text-red-500 data-[state=active]:border-b-2 data-[state=active]:border-red-600 rounded-none text-zinc-400 font-mono text-xs uppercase">
                      Overview & Plan
                    </TabsTrigger>
                    <TabsTrigger value="timeline" className="data-[state=active]:bg-transparent data-[state=active]:text-red-500 data-[state=active]:border-b-2 data-[state=active]:border-red-600 rounded-none text-zinc-400 font-mono text-xs uppercase">
                      Live Timeline & Logs
                    </TabsTrigger>
                    <TabsTrigger value="browser" className="data-[state=active]:bg-transparent data-[state=active]:text-red-500 data-[state=active]:border-b-2 data-[state=active]:border-red-600 rounded-none text-zinc-400 font-mono text-xs uppercase">
                      Browser & Terminal
                    </TabsTrigger>
                    <TabsTrigger value="artifacts" className="data-[state=active]:bg-transparent data-[state=active]:text-red-500 data-[state=active]:border-b-2 data-[state=active]:border-red-600 rounded-none text-zinc-400 font-mono text-xs uppercase">
                      Artifacts ({currentArtifacts.length})
                    </TabsTrigger>
                  </TabsList>
                </div>

                {/* Overview Tab */}
                <TabsContent value="overview" className="flex-1 p-6 space-y-6 overflow-y-auto">
                  {/* Current Active Agent Status Card */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="bg-zinc-950 border-zinc-800 rounded-none">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs uppercase font-mono text-zinc-400 flex items-center justify-between">
                          <span>Active Agent</span>
                          <Cpu className="w-4 h-4 text-red-500 animate-spin" />
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-lg font-black text-white">{currentTask.activeAgent}</div>
                        <div className="text-xs text-zinc-400 mt-1 truncate">{currentTask.currentAction || "Ready"}</div>
                      </CardContent>
                    </Card>

                    <Card className="bg-zinc-950 border-zinc-800 rounded-none">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs uppercase font-mono text-zinc-400 flex items-center justify-between">
                          <span>Progress</span>
                          <Activity className="w-4 h-4 text-emerald-500" />
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-lg font-black text-white">{currentTask.progressPercent}%</div>
                        <div className="w-full bg-zinc-800 h-1.5 mt-2">
                          <div className="bg-red-600 h-1.5 transition-all duration-500" style={{ width: `${currentTask.progressPercent}%` }}></div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-zinc-950 border-zinc-800 rounded-none">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs uppercase font-mono text-zinc-400 flex items-center justify-between">
                          <span>Execution Mode</span>
                          <Server className="w-4 h-4 text-blue-500" />
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-lg font-black text-white">Local VM + Playwright</div>
                        <div className="text-xs text-zinc-400 mt-1">Isolated Sandbox & SSE Active</div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Hierarchical Execution Plan */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-mono uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-red-600" /> Hierarchical Execution Plan ({currentSteps.length} Steps)
                    </h3>
                    <div className="space-y-2">
                      {currentSteps.map((step) => (
                        <div key={step.id} className={`p-4 border flex items-center justify-between ${
                          step.status === "completed" ? "bg-zinc-900/40 border-emerald-800/60 text-zinc-300" :
                          step.status === "running" ? "bg-red-950/30 border-red-600 text-white animate-pulse" :
                          "bg-zinc-950/30 border-zinc-800 text-zinc-500"
                        }`}>
                          <div className="flex items-center space-x-3">
                            <span className="font-mono text-xs text-red-500 font-bold">0{step.stepIndex}</span>
                            <div>
                              <div className="text-sm font-bold text-zinc-200">{step.title}</div>
                              <div className="text-xs text-zinc-400 mt-0.5">{step.description}</div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-3">
                            <Badge variant="outline" className="border-zinc-700 text-zinc-300 font-mono text-[10px]">
                              {step.agent}
                            </Badge>
                            <span className={`text-xs font-mono uppercase px-2 py-0.5 ${
                              step.status === "completed" ? "text-emerald-400 bg-emerald-950/50" :
                              step.status === "running" ? "text-red-400 bg-red-950/50" :
                              "text-zinc-500 bg-zinc-900"
                            }`}>
                              {step.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>

                {/* Timeline & Logs Tab */}
                <TabsContent value="timeline" className="flex-1 p-6 overflow-y-auto font-mono text-xs">
                  <div className="space-y-3">
                    {mergedTimeline.map((log: any, idx: number) => (
                      <div key={idx} className="p-3 bg-zinc-950 border border-zinc-800 flex items-start space-x-3">
                        <span className="text-red-500 font-bold shrink-0">[{log.agent || "SYSTEM"}]</span>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-zinc-300 font-bold uppercase text-[10px] bg-zinc-900 px-1 py-0.5">{log.eventType}</span>
                            <span className="text-[10px] text-zinc-600">{new Date(log.createdAt).toLocaleTimeString()}</span>
                          </div>
                          <div className="text-zinc-200">{log.message}</div>
                        </div>
                      </div>
                    ))}
                    {mergedTimeline.length === 0 && (
                      <div className="text-center text-zinc-600 py-12">No activity logs recorded yet.</div>
                    )}
                  </div>
                </TabsContent>

                {/* Browser & Terminal Tab */}
                <TabsContent value="browser" className="flex-1 p-6 overflow-y-auto">
                  <WorkspacePanel taskId={currentTask.id} />
                </TabsContent>

                {/* Artifacts Tab */}
                <TabsContent value="artifacts" className="flex-1 p-6 overflow-y-auto">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {currentArtifacts.map((art) => (
                      <div key={art.id} className="p-4 bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                        <div>
                          <div className="text-sm font-bold text-white">{art.name}</div>
                          <div className="text-xs font-mono text-red-500 uppercase mt-1">{art.fileType}</div>
                        </div>
                        <a href={art.storageUrl} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-200 hover:bg-zinc-900 text-xs font-mono">
                            Download
                          </Button>
                        </a>
                      </div>
                    ))}
                    {currentArtifacts.length === 0 && (
                      <div className="text-center text-zinc-600 py-12 col-span-2 font-mono">No artifacts generated yet for this task.</div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="max-w-md space-y-4">
                <div className="w-12 h-12 bg-red-950 border border-red-600 flex items-center justify-center mx-auto text-red-500 font-black">AI</div>
                <h2 className="text-xl font-bold text-white tracking-tight">Select or Launch a Mission</h2>
                <p className="text-xs text-zinc-400 font-mono">Choose a quick template from the sidebar or type a custom goal to start the multi-agent orchestration runtime.</p>
                <Button onClick={() => setShowLaunch(true)} className="bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase px-6 py-3">
                  + Launch New Mission
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Launch Mission Modal */}
      {showLaunch && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="bg-zinc-950 border-red-600 w-full max-w-lg rounded-none shadow-2xl">
            <CardHeader className="border-b border-zinc-800">
              <CardTitle className="text-sm uppercase font-mono tracking-widest text-red-500 flex items-center justify-between">
                <span>Launch Autonomous Mission</span>
                <button onClick={() => setShowLaunch(false)} className="text-zinc-500 hover:text-white">✕</button>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-mono uppercase tracking-widest text-zinc-400">Mission Goal</label>
                <textarea
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="e.g. Research top universities for computer science, compare tuition, and generate a PDF report..."
                  className="w-full bg-black border border-zinc-800 p-3 text-sm text-white focus:border-red-600 focus:outline-none h-32 font-mono"
                ></textarea>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-zinc-900">
                <Button onClick={() => setShowLaunch(false)} variant="outline" className="border-zinc-800 text-zinc-400 hover:bg-zinc-900 text-xs font-mono">
                  Cancel
                </Button>
                <Button onClick={() => handleCreateTask()} className="bg-red-600 hover:bg-red-700 text-white text-xs font-mono font-black uppercase">
                  Launch Mission
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
