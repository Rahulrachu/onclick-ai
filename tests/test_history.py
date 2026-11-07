from onclick import history


def test_history_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path))
    monkeypatch.setenv("APPDATA", str(tmp_path))
    cid = history.new_id()
    history.add_turn(cid, "tidy my downloads", "Done, 12 files moved.")
    history.add_turn(cid, "now undo", "Undone.")
    chats = history.list_chats()
    assert chats[0]["id"] == cid and chats[0]["turns"] == 2 and chats[0]["title"] == "tidy my downloads"
    msgs = history.as_messages(history.load(cid)["turns"])
    assert [m["role"] for m in msgs] == ["user", "assistant", "user", "assistant"]
    history.delete(cid)
    assert history.list_chats() == [] and history.load(cid) is None
    assert history.load("../../etc/passwd") is None
