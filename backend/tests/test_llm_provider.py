"""OpenAI-compatible provider path in app.services.llm (Gemini / Groq / HF router)."""
import httpx
import pytest

from app.services import llm


class _Resp:
    def __init__(self, status, payload):
        self.status_code = status
        self._payload = payload
        self.text = str(payload)

    def json(self):
        return self._payload


@pytest.fixture
def gemini(monkeypatch):
    monkeypatch.setattr(llm.settings, "LLM_PROVIDER", "gemini")
    monkeypatch.setattr(llm.settings, "LLM_API_KEY", "test-key")
    monkeypatch.setattr(llm.settings, "DEMO_MODE", False)
    monkeypatch.setattr(llm.settings, "EXTRACTION_MODEL", "")
    monkeypatch.setattr(llm.settings, "WRITING_MODEL", "")
    calls = []

    def install(status, payload):
        def fake_post(url, headers, json, timeout):
            calls.append({"url": url, "headers": headers, "json": json})
            return _Resp(status, payload)

        monkeypatch.setattr(llm.httpx, "post", fake_post)
        return calls

    return install


def _ok(content, finish="stop"):
    return {"choices": [{"message": {"content": content}, "finish_reason": finish}]}


def test_gemini_defaults_and_json(gemini):
    calls = gemini(200, _ok('```json\n{"a": 1}\n```'))
    assert llm.llm_enabled()
    assert llm.complete_json("sys", "user") == {"a": 1}
    sent = calls[0]
    assert sent["url"] == "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
    assert sent["headers"]["Authorization"] == "Bearer test-key"
    assert sent["json"]["model"] == "gemini-flash-lite-latest"
    assert sent["json"]["messages"][0] == {"role": "system", "content": "sys"}
    assert sent["json"]["max_tokens"] >= 8192


def test_empty_system_prompt_is_omitted(gemini):
    calls = gemini(200, _ok("hello"))
    assert llm.complete_text("", "user") == "hello"
    assert [m["role"] for m in calls[0]["json"]["messages"]] == ["user"]


@pytest.mark.parametrize(
    "status,payload,reason",
    [
        (200, _ok("partial", finish="length"), "truncated"),
        (200, _ok("", finish="content_filter"), "declined"),
        (429, {"error": "slow down"}, "rate limited"),
        (500, {"error": "boom"}, "API error 500"),
        (200, {"unexpected": True}, "unexpected response"),
    ],
)
def test_failures_raise_llm_unavailable(gemini, status, payload, reason):
    gemini(status, payload)
    with pytest.raises(llm.LLMUnavailable, match=reason):
        llm.complete_text("s", "u")


def test_network_error(gemini, monkeypatch):
    gemini(200, _ok("x"))

    def boom(*a, **k):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(llm.httpx, "post", boom)
    with pytest.raises(llm.LLMUnavailable, match="network"):
        llm.complete_text("s", "u")


def test_no_key_is_demo_mode(monkeypatch):
    monkeypatch.setattr(llm.settings, "LLM_PROVIDER", "gemini")
    monkeypatch.setattr(llm.settings, "LLM_API_KEY", None)
    monkeypatch.setattr(llm.settings, "DEMO_MODE", False)
    assert not llm.llm_enabled()
    with pytest.raises(llm.LLMUnavailable, match="demo mode"):
        llm.complete_text("s", "u")
