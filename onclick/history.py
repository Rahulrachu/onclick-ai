"""Saved chats: one small JSON file per chat in %APPDATA%/OnClickAI/history."""
from __future__ import annotations

import json
import time
import uuid
from pathlib import Path

from .config import app_dir

MAX_CHATS = 200


def _dir() -> Path:
    d = app_dir() / "history"
    d.mkdir(parents=True, exist_ok=True)
    return d


def new_id() -> str:
    return time.strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:6]


def add_turn(chat_id: str, prompt: str, answer: str) -> None:
    """Append one (prompt, answer) pair; the first prompt becomes the title."""
    p = _dir() / f"{chat_id}.json"
    data = {"id": chat_id, "title": prompt[:60], "updated": time.time(), "turns": []}
    if p.exists():
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            pass
    data["turns"].append({"prompt": prompt, "answer": answer})
    data["updated"] = time.time()
    p.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    for old in sorted(_dir().glob("*.json"), key=lambda f: f.stat().st_mtime)[:-MAX_CHATS]:
        old.unlink(missing_ok=True)


def list_chats() -> list[dict]:
    out = []
    for f in _dir().glob("*.json"):
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
            out.append({"id": d["id"], "title": d.get("title", ""), "updated": d.get("updated", 0), "turns": len(d.get("turns", []))})
        except (OSError, ValueError, KeyError):
            continue
    return sorted(out, key=lambda d: d["updated"], reverse=True)


def load(chat_id: str) -> dict | None:
    p = _dir() / f"{Path(chat_id).name}.json"
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def delete(chat_id: str) -> None:
    (_dir() / f"{Path(chat_id).name}.json").unlink(missing_ok=True)


def as_messages(turns: list[dict]) -> list[dict]:
    """Prior turns as plain chat messages so a reopened chat keeps its context."""
    msgs = []
    for t in turns:
        msgs.append({"role": "user", "content": t["prompt"]})
        if t.get("answer"):
            msgs.append({"role": "assistant", "content": t["answer"]})
    return msgs
