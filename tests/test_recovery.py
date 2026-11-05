from onclick.llm import LLMReply, ToolCall
from tests.test_agent import make


def test_hint_after_two_failures(tmp_path):
    bad = {"path": "nope/missing.txt"}
    agent, _ = make(tmp_path, [
        LLMReply(tool_calls=[ToolCall("1", "read_file", bad)]),
        LLMReply(tool_calls=[ToolCall("2", "read_file", bad)]),
        LLMReply(text="done"),
    ])
    agent.run("x")
    tools = [m["content"] for m in agent.messages if m["role"] == "tool"]
    assert "failed 2 times" in tools[1] or "failed" not in tools[0]
    assert "Do not repeat" not in tools[0]
