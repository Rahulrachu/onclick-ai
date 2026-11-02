"""Real-model eval: runs the agent against a live model on small tasks with automatic checkers.

Usage: python tests/eval/run_eval.py --provider ollama --model qwen2.5:7b [--out docs/EVAL.md]
Exit code is always 0 unless the harness itself breaks; the pass rate goes to the report.
"""
from __future__ import annotations

import argparse
import functools
import http.server
import json
import tempfile
import threading
import time
from datetime import date
from pathlib import Path

from onclick.agent import Agent
from onclick.config import Config
from onclick.context import Context

PAGE = "<html><body><h1>Mount Verdant</h1><p>The summit of Mount Verdant is 3,417 metres above sea level.</p></body></html>"


def serve(root: Path):
    (root / "mountain.html").write_text(PAGE)
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root))
    h.log_message = lambda *a, **k: None
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def setup_organize(ws: Path):
    d = ws / "inbox"
    d.mkdir()
    for n in ("a.txt", "b.txt", "c.jpg", "d.jpg", "e.pdf"):
        (d / n).write_text(n)


def task_list(port: int):
    return [
        ("write_file", "Create a file named hello.txt in the workspace containing exactly: onclick works",
         None, lambda ws, ans: (ws / "hello.txt").exists() and (ws / "hello.txt").read_text().strip() == "onclick works"),
        ("fetch_fact", f"Open http://127.0.0.1:{port}/mountain.html and tell me the summit height of Mount Verdant in metres.",
         None, lambda ws, ans: "3417" in ans.replace(",", "").replace(" ", "")),
        ("run_code", "Write a Python script sq.py that prints the squares of 1 to 5 separated by spaces, run it, and save its output into out.txt.",
         None, lambda ws, ans: (ws / "out.txt").exists() and (ws / "out.txt").read_text().split() == ["1", "4", "9", "16", "25"]),
        ("organize", "In the folder inbox, move every .txt file into inbox/text and every .jpg into inbox/images. Leave the pdf where it is.",
         setup_organize, lambda ws, ans: sorted(p.name for p in (ws / "inbox/text").glob("*")) == ["a.txt", "b.txt"]
         and sorted(p.name for p in (ws / "inbox/images").glob("*")) == ["c.jpg", "d.jpg"] and (ws / "inbox/e.pdf").exists()),
    ]


def run(provider: str, model: str, key: str, max_steps: int):
    results = []
    with tempfile.TemporaryDirectory() as srvdir:
        srv = serve(Path(srvdir))
        port = srv.server_address[1]
        for name, prompt, setup, check in task_list(port):
            with tempfile.TemporaryDirectory() as td:
                ws = Path(td)
                if setup:
                    setup(ws)
                ctx = Context(cfg=Config(provider=provider, model=model, api_key=key, max_steps=max_steps, headless_browser=True), workspace=ws)
                steps = {"n": 0}

                def on_event(kind, data, steps=steps):
                    if kind == "tool":
                        steps["n"] += 1

                agent = Agent(ctx, on_event=on_event, approve=lambda *a: False)
                t0 = time.time()
                ans, err = "", ""
                try:
                    ans = agent.run(prompt)
                except Exception as e:  # a crash is a failed task, not a failed harness
                    err = f"{type(e).__name__}: {e}"
                try:
                    ok = bool(check(ws, ans))
                except Exception as e:
                    ok, err = False, err or f"checker: {e}"
                ctx.close()
                results.append({"task": name, "ok": ok, "tool_calls": steps["n"], "secs": round(time.time() - t0), "error": err[:160]})
                print(json.dumps(results[-1]), flush=True)
        srv.shutdown()
    return results


def report(results, provider, model) -> str:
    passed = sum(r["ok"] for r in results)
    lines = [f"## {date.today()} - {provider}/{model}: {passed}/{len(results)} passed", "",
             "| task | result | tool calls | seconds | note |", "|---|---|---|---|---|"]
    for r in results:
        lines.append(f"| {r['task']} | {'pass' if r['ok'] else 'FAIL'} | {r['tool_calls']} | {r['secs']} | {r['error']} |")
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--provider", default="ollama")
    ap.add_argument("--model", default="qwen2.5:7b")
    ap.add_argument("--key", default="")
    ap.add_argument("--max-steps", type=int, default=15)
    ap.add_argument("--out", default="")
    a = ap.parse_args()
    res = run(a.provider, a.model, a.key, a.max_steps)
    text = report(res, a.provider, a.model)
    print(text)
    if a.out:
        p = Path(a.out)
        old = p.read_text() if p.exists() else "# Real-model eval results\n\nWritten by CI (tests/eval/run_eval.py). Newest first.\n\n"
        head, _, rest = old.partition("\n\n## ")
        p.write_text(head + "\n\n" + text + ("\n## " + rest if rest else ""))


if __name__ == "__main__":
    main()
