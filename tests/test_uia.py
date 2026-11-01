from onclick.tools import build_registry, uia


class Ctx:
    def __init__(self):
        self.state = {}


def test_describe():
    s = uia.describe({"ref": 3, "type": "Button", "name": "Save", "auto_id": "btn", "value": ""})
    assert s == '[3] Button "Save" id=btn'


def test_non_windows_is_graceful(monkeypatch):
    monkeypatch.setattr(uia, "IS_WIN", False)
    t = {x.name: x.func for x in uia.tools(Ctx())}
    assert "only works on Windows" in t["ui_inspect"]("x").text
    assert "only works on Windows" in t["ui_act"](1, "click").text


def test_unknown_ref(monkeypatch):
    monkeypatch.setattr(uia, "IS_WIN", True)
    t = {x.name: x.func for x in uia.tools(Ctx())}
    assert "Unknown ref" in t["ui_act"](9, "click").text


def test_registered():
    assert {"ui_list_windows", "ui_focus", "ui_inspect", "ui_act"} <= set(build_registry(Ctx()).tools)
