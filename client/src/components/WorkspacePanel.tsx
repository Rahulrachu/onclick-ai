import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { Globe, Monitor, Play, Square, Terminal, FolderOpen, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export default function WorkspacePanel({ taskId }: { taskId: number }) {
  const [command, setCommand] = useState("pwd && find . -maxdepth 2 -type f | sort | head -50");
  const [output, setOutput] = useState("");
  const status = trpc.workspace.status.useQuery(taskId, { refetchInterval: 2500 });
  const observation = trpc.workspace.observe.useQuery(taskId, { refetchInterval: 3500 });
  const start = trpc.workspace.start.useMutation();
  const execute = trpc.workspace.execute.useMutation();
  const pause = trpc.workspace.pause.useMutation();
  const resume = trpc.workspace.resume.useMutation();
  const destroy = trpc.workspace.destroy.useMutation();

  useEffect(() => {
    if (!status.data && !start.isPending) {
      start.mutate({ taskId });
    }
  }, [taskId, status.data, start.isPending]);

  async function runCommand() {
    if (!command.trim()) return;
    try {
      const result = await execute.mutateAsync({ taskId, command });
      setOutput([result.stdout, result.stderr].filter(Boolean).join("\n") || `exit ${result.exitCode}`);
      await observation.refetch();
    } catch (error: any) {
      setOutput(error.message || "Workspace command failed");
      toast.error("Workspace command failed");
    }
  }

  async function togglePause() {
    if (status.data?.status === "paused") {
      await resume.mutateAsync(taskId);
    } else {
      await pause.mutateAsync(taskId);
    }
    await status.refetch();
  }

  async function destroySession() {
    await destroy.mutateAsync(taskId);
    await status.refetch();
    await observation.refetch();
    toast.success("Workspace session destroyed");
  }

  const screenshot = observation.data?.screenshotBase64;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="bg-zinc-950 border-zinc-800 rounded-none xl:col-span-2">
          <CardHeader className="border-b border-zinc-800 py-3">
            <CardTitle className="text-xs uppercase font-mono text-zinc-300 flex items-center justify-between">
              <span className="flex items-center gap-2"><Monitor className="w-4 h-4 text-red-500" /> Live Workspace</span>
              <span className={`text-[10px] font-mono uppercase ${status.data?.status === "running" ? "text-emerald-400" : "text-amber-400"}`}>
                {status.data?.status || "starting"}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="flex gap-2">
              <Input value={command} onChange={(event) => setCommand(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void runCommand(); }} className="rounded-none bg-black border-zinc-700 text-white font-mono text-xs" aria-label="Workspace command" />
              <Button onClick={() => void runCommand()} disabled={execute.isPending || status.data?.status === "paused"} className="rounded-none bg-red-600 hover:bg-red-700 text-xs font-mono"><Play className="w-3 h-3 mr-1" />Run</Button>
            </div>
            <pre className="min-h-36 max-h-56 overflow-auto whitespace-pre-wrap bg-black border border-zinc-800 p-3 text-xs text-emerald-300 font-mono">{output || "Workspace terminal ready. Commands run inside the task workspace."}</pre>
            <div className="flex gap-2">
              <Button onClick={() => void togglePause()} variant="outline" className="rounded-none border-zinc-700 text-zinc-300 text-xs font-mono"><RefreshCw className="w-3 h-3 mr-1" />{status.data?.status === "paused" ? "Resume" : "Pause"}</Button>
              <Button onClick={() => void destroySession()} variant="outline" className="rounded-none border-red-800 text-red-400 text-xs font-mono"><Square className="w-3 h-3 mr-1" />Destroy</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-950 border-zinc-800 rounded-none">
          <CardHeader className="border-b border-zinc-800 py-3">
            <CardTitle className="text-xs uppercase font-mono text-zinc-300 flex items-center gap-2"><FolderOpen className="w-4 h-4 text-amber-500" /> Workspace Files</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-2 max-h-64 overflow-auto font-mono text-xs">
              {observation.data?.files?.map((file) => <div key={file.name} className="flex items-center gap-2 text-zinc-300"><span className="text-red-500">{file.type === "directory" ? "/" : "·"}</span>{file.name}</div>)}
              {!observation.data?.files?.length && <div className="text-zinc-600">No workspace files yet.</div>}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-zinc-950 border-zinc-800 rounded-none">
        <CardHeader className="border-b border-zinc-800 py-3"><CardTitle className="text-xs uppercase font-mono text-zinc-300 flex items-center gap-2"><Globe className="w-4 h-4 text-blue-500" /> Browser / Computer Observation</CardTitle></CardHeader>
        <CardContent className="p-4 space-y-3">
          <div className="text-xs font-mono text-zinc-400">URL: <span className="text-zinc-200">{observation.data?.url || "about:blank"}</span></div>
          {screenshot ? <img src={`data:image/png;base64,${screenshot}`} alt="Live browser workspace observation" className="w-full max-h-[420px] object-contain object-left bg-black border border-zinc-800" /> : <div className="h-32 bg-black border border-zinc-800 flex items-center justify-center text-xs font-mono text-zinc-600">No browser observation available yet.</div>}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-zinc-600 font-mono"><Terminal className="w-3 h-3" /> Prompt → plan → real workspace tools → observation → verified result</div>
    </div>
  );
}
