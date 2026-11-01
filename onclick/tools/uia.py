"""Windows UI Automation: drive desktop apps by named controls instead of blind pixel clicks."""
from __future__ import annotations

import sys

from . import Tool, ToolResult, params

IS_WIN = sys.platform == "win32"
MAX_CONTROLS = 120
NEED_WIN = "UI Automation only works on Windows."


def _desktop():
    from pywinauto import Desktop

    return Desktop(backend="uia")


def describe(info: dict) -> str:
    """One line per control: '[12] Button "Save" id=btnSave value=...'."""
    parts = [f'[{info["ref"]}] {info.get("type") or "Control"}']
    if info.get("name"):
        parts.append(f'"{info["name"][:80]}"')
    if info.get("auto_id"):
        parts.append(f'id={info["auto_id"]}')
    if info.get("value"):
        parts.append(f'value={info["value"][:120]!r}')
    return " ".join(parts)


def _find_window(title: str):
    t = title.lower()
    for w in _desktop().windows():
        try:
            if t in (w.window_text() or "").lower():
                return w
        except Exception:
            continue
    return None


def _value(el) -> str:
    try:
        return el.get_value()
    except Exception:
        pass
    try:
        return el.window_text() if el.element_info.control_type in ("Edit", "Document") else ""
    except Exception:
        return ""


def tools(ctx):
    refs: dict[int, object] = ctx.state.setdefault("uia_refs", {})

    def ui_list_windows() -> ToolResult:
        if not IS_WIN:
            return ToolResult(NEED_WIN)
        rows = []
        for w in _desktop().windows():
            try:
                if w.is_visible() and w.window_text():
                    rows.append(f'"{w.window_text()[:90]}" ({w.element_info.class_name})')
            except Exception:
                continue
        return ToolResult("Open windows:\n" + "\n".join(rows) if rows else "No visible windows.")

    def ui_focus(title: str) -> ToolResult:
        if not IS_WIN:
            return ToolResult(NEED_WIN)
        w = _find_window(title)
        if not w:
            return ToolResult(f'No window with "{title}" in its title. Use ui_list_windows.')
        try:
            w.restore()
        except Exception:
            pass
        w.set_focus()
        return ToolResult(f'Focused "{w.window_text()}". Use ui_inspect to see its controls.')

    def ui_inspect(title: str, filter: str = "") -> ToolResult:
        if not IS_WIN:
            return ToolResult(NEED_WIN)
        w = _find_window(title)
        if not w:
            return ToolResult(f'No window with "{title}" in its title.')
        refs.clear()
        f = filter.lower()
        lines = []
        for el in w.descendants():
            try:
                ei = el.element_info
                info = {"ref": len(refs) + 1, "type": ei.control_type, "name": ei.name or "",
                        "auto_id": ei.automation_id or "", "value": _value(el)}
                if not (info["name"] or info["auto_id"] or info["value"]):
                    continue
                if f and f not in (info["name"] + info["auto_id"] + info["type"]).lower():
                    continue
                refs[info["ref"]] = el
                lines.append(describe(info))
            except Exception:
                continue
            if len(lines) >= MAX_CONTROLS:
                lines.append(f"... truncated at {MAX_CONTROLS} controls; pass filter to narrow.")
                break
        return ToolResult(f'Controls in "{w.window_text()}":\n' + "\n".join(lines) if lines else "No named controls found.")

    def ui_act(ref: int, action: str, text: str = "") -> ToolResult:
        if not IS_WIN:
            return ToolResult(NEED_WIN)
        el = refs.get(int(ref))
        if el is None:
            return ToolResult(f"Unknown ref {ref}. Run ui_inspect again (refs reset on each inspect).")
        a = action.lower()
        try:
            if a == "click":
                try:
                    el.invoke()
                except Exception:
                    el.click_input()
                return ToolResult(f"Clicked [{ref}].")
            if a == "type":
                try:
                    el.set_edit_text(text)
                except Exception:
                    el.set_focus()
                    el.type_keys(text, with_spaces=True, with_newlines=True, pause=0.02)
                return ToolResult(f"Typed {len(text)} chars into [{ref}].")
            if a == "select":
                try:
                    el.select(text) if text else el.select()
                except Exception:
                    el.click_input()
                return ToolResult(f"Selected {text or 'item'} in [{ref}].")
            if a == "read":
                return ToolResult(f"[{ref}] text: {_value(el) or el.window_text()}")
        except Exception as e:  # noqa: BLE001
            return ToolResult(f"UI action failed: {e}. Re-inspect the window or fall back to screenshot.")
        return ToolResult("action must be click, type, select or read.")

    return [
        Tool("ui_list_windows", "List visible desktop windows (titles). Start here for any desktop app task.", params(), ui_list_windows),
        Tool("ui_focus", "Bring a window to the front by (part of) its title.", params(["title"], title={"type": "string"}), ui_focus),
        Tool("ui_inspect", "List a window's controls as numbered refs (type, name, automation id, value). Optional filter narrows by text/type.",
             params(["title"], title={"type": "string"}, filter={"type": "string"}), ui_inspect),
        Tool("ui_act", "Act on a control ref from the latest ui_inspect: click, type (text), select (text optional), read.",
             params(["ref", "action"], ref={"type": "integer"}, action={"type": "string", "enum": ["click", "type", "select", "read"]}, text={"type": "string"}), ui_act),
    ]
