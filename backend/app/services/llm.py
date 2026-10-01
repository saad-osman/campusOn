"""Thin wrapper around the Anthropic SDK used by every AI feature.

Callers always have a deterministic fallback, so these helpers raise
`LLMUnavailable` instead of returning partial output: no API key (demo mode),
a refusal, a truncated response, an API error, or JSON that doesn't parse.
"""
import json
import logging
from pathlib import Path

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


def _call(model: str, system: str, user: str, max_tokens: int):
    import anthropic

    if not llm_enabled():
        raise LLMUnavailable("demo mode: no ANTHROPIC_API_KEY")
    client = _client()
    try:
        if model in _FALLBACK_DEFAULT_MODELS:
            # On a safety decline the API re-runs the request on Anthropic's
            # recommended fallback model instead of returning a refusal.
            return client.beta.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": user}],
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
            )
        return client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system,
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
    model = model or settings.EXTRACTION_MODEL
    last_error = None
    for _attempt in range(2):
        text = _text_of(_call(model, system, user, max_tokens))
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
    return _text_of(_call(model or settings.WRITING_MODEL, system, user, max_tokens))
