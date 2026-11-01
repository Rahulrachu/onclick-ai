"""Windows-only CI smoke: open Notepad, type via UI Automation, read it back."""
import subprocess
import sys
import time

sys.path.insert(0, ".")
from onclick.tools import uia  # noqa: E402


class Ctx:
    state: dict = {}


t = {x.name: x.func for x in uia.tools(Ctx())}
subprocess.Popen(["notepad.exe"])
for _ in range(20):
    time.sleep(1)
    if "Notepad" in t["ui_list_windows"]().text:
        break
print(t["ui_list_windows"]().text)
print(t["ui_focus"]("Notepad").text)
out = t["ui_inspect"]("Notepad").text
print(out)
ref = next(int(l[1:l.index("]")]) for l in out.splitlines() if l.startswith("[") and ("Edit" in l or "Document" in l))
print(t["ui_act"](ref, "type", "hello from onclick").text)
got = t["ui_act"](ref, "read").text
print(got)
subprocess.run(["taskkill", "/f", "/im", "notepad.exe"])
assert "hello from onclick" in got, got
