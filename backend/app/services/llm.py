"""Thin wrapper around the LLM provider used by every AI feature.

LLM_PROVIDER selects Anthropic (SDK) or any OpenAI-compatible chat API (Gemini's free
tier, Groq, the Hugging Face router...), called over httpx.

Callers always have a deterministic fallback, so these helpers raise
`LLMUnavailable` instead of returning partial output: no API key (demo mode),
a refusal, a truncated response, an API error, or JSON that doesn't parse.
"""
import json
import logging
from pathlib import Path

import httpx

from app.config import get_settings

logger = logging.getLogger("scholarradar.llm")
settings = get_settings()

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"

# Models that accept the server-side refusal fallback in its "default" form.
_FALLBACK_DEFAULT_MODELS = {"claude-sonnet-5-5", "claude-opus-5-5", "claude-opus-5", "claude-fable-5-1"}


class LLMUnavailable(Exception):
    pass


def llm_enabled() -> bool:
    return not settings.demo_mode_effective


def load_prompt(name: str) -> str:
    return (PROMPTS_DIR / name).read_text(encoding="utf-8")


def _client():
    import anthropic

    return anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=90.0)


def _text_of(response) -> str:
    if response.stop_reason == "refusal":
        raise LLMUnavailable("model declined the request")
    if response.stop_reason == "max_tokens":
        raise LLMUnavailable("response was truncated")
    text = "".join(block.text for block in response.content if block.type == "text").strip()
    if not text:
        raise LLMUnavailable("empty response")
    return text


def _strip_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else ""
        if text.rstrip().endswith("```"):
            text = text.rstrip()[:-3]
    return text.strip()


def _call(model: str, system: str, user: str, max_tokens: int) -> str:
    """One chat turn; returns the response text or raises LLMUnavailable."""
    if not llm_enabled():
        raise LLMUnavailable("demo mode: no LLM API key")
    if settings.LLM_PROVIDER == "anthropic":
        return _text_of(_call_anthropic(model, system, user, max_tokens))
    return _call_openai_compatible(model, system, user, max_tokens)


def _call_openai_compatible(model: str, system: str, user: str, max_tokens: int) -> str:
    base = (settings.llm_base_url or "").rstrip("/")
    if not base:
        raise LLMUnavailable("LLM_BASE_URL is not set")
    messages = ([{"role": "system", "content": system}] if system else []) + [{"role": "user", "content": user}]
    if settings.LLM_PROVIDER == "gemini":
        # Gemini 2.5 counts its thinking tokens against the output budget; leave room.
        max_tokens = max(max_tokens, 8192)
    try:
        r = httpx.post(
            f"{base}/chat/completions",
            headers={"Authorization": f"Bearer {settings.llm_api_key}"},
            json={"model": model, "messages": messages, "max_tokens": max_tokens},
            timeout=90.0,
        )
    except httpx.HTTPError as e:
        raise LLMUnavailable("network error") from e
    if r.status_code == 429:
        raise LLMUnavailable("rate limited")
    if r.status_code >= 400:
        logger.warning("LLM API error %s: %s", r.status_code, r.text[:300])
        raise LLMUnavailable(f"API error {r.status_code}")
    try:
        choice = r.json()["choices"][0]
    except (ValueError, KeyError, IndexError) as e:
        raise LLMUnavailable("unexpected response shape") from e
    if choice.get("finish_reason") == "length":
        raise LLMUnavailable("response was truncated")
    if choice.get("finish_reason") == "content_filter":
        raise LLMUnavailable("model declined the request")
    text = ((choice.get("message") or {}).get("content") or "").strip()
    if not text:
        raise LLMUnavailable("empty response")
    return text


def _call_anthropic(model: str, system: str, user: str, max_tokens: int):
    import anthropic

    client = _client()
    # Anthropic rejects an empty system prompt; omit it instead.
    sys_kw = {"system": system} if system else {}
    try:
        if model in _FALLBACK_DEFAULT_MODELS:
            # On a safety decline the API re-runs the request on Anthropic's
            # recommended fallback model instead of returning a refusal.
            return client.beta.messages.create(
                model=model,
                max_tokens=max_tokens,
                **sys_kw,
                messages=[{"role": "user", "content": user}],
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
            )
        return client.messages.create(
            model=model,
            max_tokens=max_tokens,
            **sys_kw,
            messages=[{"role": "user", "content": user}],
        )
    except anthropic.RateLimitError as e:
        raise LLMUnavailable("rate limited") from e
    except anthropic.APIStatusError as e:
        logger.warning("Anthropic API error %s: %s", e.status_code, e.message)
        raise LLMUnavailable(f"API error {e.status_code}") from e
    except anthropic.APIConnectionError as e:
        raise LLMUnavailable("network error") from e


def complete_json(system: str, user: str, *, model: str | None = None, max_tokens: int = 2000) -> dict:
    """One extraction-style call that must return a JSON object. Retries once on bad JSON."""
    model = model or settings.extraction_model
    last_error = None
    for _attempt in range(2):
        text = _call(model, system, user, max_tokens)
        try:
            data = json.loads(_strip_fences(text))
            if isinstance(data, dict):
                return data
            last_error = "JSON was not an object"
        except json.JSONDecodeError as e:
            last_error = str(e)
    raise LLMUnavailable(f"invalid JSON from model: {last_error}")


def complete_text(system: str, user: str, *, model: str | None = None, max_tokens: int = 16000) -> str:
    """One drafting call (SOPs, emails) returning plain markdown text."""
    return _call(model or settings.writing_model, system, user, max_tokens)
