"""
LLM-assisted resolver.

Asks an LLM to read the market's resolution rules + a brief evidence preview
and return a structured outcome. Because the model can hallucinate, this
resolver NEVER auto-finalizes — it always queues for admin review.

Config shape on the market:
    {
      "type": "llm_search",
      "prompt_extras": "Focus on official FDA press releases.",
      "primary_sources": ["fda.gov/drugs/news-events"],
      "model": "claude-haiku-4-5-20251001"        # optional override
    }

Environment / settings:
    LLM_RESOLVER_API_KEY     Anthropic API key. If unset, the resolver returns
                             None (the loop will retry once a key is set).
    LLM_RESOLVER_BASE_URL    Defaults to Anthropic. Override to point at a
                             gateway / proxy.

If your provider has different request semantics, swap the body inside
`_call_llm()` — the rest of the resolver is provider-agnostic.
"""
from __future__ import annotations
import json
import logging
import os
from typing import Any

from ..models import ResolutionOutcome
from .base import ResolverResult

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "claude-haiku-4-5-20251001"
DEFAULT_BASE = "https://api.anthropic.com/v1/messages"


SYSTEM_PROMPT = """You are a market-resolution analyst. Read the market's
resolution rules carefully and decide YES, NO, or VOID.

Return ONLY a single JSON object on its own line with this schema:
  {"outcome": "YES" | "NO" | "VOID",
   "confidence": float between 0 and 1,
   "reasoning": "short justification, 1-3 sentences",
   "sources": ["url", ...]}

VOID is for: event canceled, ambiguous resolution conditions, or insufficient
public information to decide.
"""


def _build_user_prompt(market, cfg: dict[str, Any]) -> str:
    extras = (cfg.get("prompt_extras") or "").strip()
    sources = cfg.get("primary_sources") or []
    src_text = "\n".join(f"  - {s}" for s in sources) if sources else "  (none specified)"
    return (
        f"MARKET ID: {market.id}\n"
        f"TITLE: {market.title}\n\n"
        f"RESOLUTION RULES:\n{market.description}\n\n"
        f"PRIMARY SOURCES TO CONSIDER:\n{src_text}\n\n"
        f"ADDITIONAL GUIDANCE:\n{extras or '(none)'}\n\n"
        f"Resolve this market now."
    )


async def _call_llm(model: str, system: str, user: str, api_key: str, base_url: str) -> dict[str, Any] | None:
    try:
        import httpx
    except ImportError:
        logger.error("httpx not installed; cannot run LlmSearchResolver")
        return None
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(
                base_url,
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": model,
                    "max_tokens": 600,
                    "system": system,
                    "messages": [{"role": "user", "content": user}],
                },
            )
            r.raise_for_status()
            data = r.json()
    except Exception as e:
        logger.warning("LLM call failed: %s", e)
        return None

    # Anthropic Messages API: data["content"] is a list of blocks with "text".
    try:
        text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text").strip()
    except Exception:
        text = ""

    # Parse the JSON object — be lenient.
    try:
        start = text.find("{"); end = text.rfind("}")
        if start < 0 or end < 0:
            return None
        return json.loads(text[start:end + 1])
    except Exception:
        logger.warning("Could not parse LLM JSON: %r", text[:240])
        return None


class LlmSearchResolver:
    code = "llm_search"

    async def evaluate(self, market) -> ResolverResult | None:
        cfg = market.resolution_config or {}
        api_key = os.environ.get("LLM_RESOLVER_API_KEY", "").strip()
        base_url = os.environ.get("LLM_RESOLVER_BASE_URL", DEFAULT_BASE).strip()
        model = cfg.get("model") or DEFAULT_MODEL

        if not api_key:
            logger.info("LlmSearchResolver: LLM_RESOLVER_API_KEY not set — skipping market %s", market.id)
            return ResolverResult(
                outcome=None, confidence=0.0,
                evidence={"error": "LLM_RESOLVER_API_KEY not configured — admin must decide manually",
                          "instructions": cfg.get("instructions") or market.description},
                source_name="LLM analyst (unconfigured)",
                source_url=None,
                auto_finalize_hours=None,  # always queue for admin
            )

        user_prompt = _build_user_prompt(market, cfg)
        parsed = await _call_llm(model, SYSTEM_PROMPT, user_prompt, api_key, base_url)
        if parsed is None:
            return None  # transient — retry next tick

        raw_outcome = str(parsed.get("outcome", "")).upper()
        if raw_outcome not in ("YES", "NO", "VOID"):
            return ResolverResult(
                outcome=None, confidence=0.0,
                evidence={"error": "LLM returned non-{YES,NO,VOID} outcome",
                          "raw": parsed},
                source_name="LLM analyst",
                source_url=None,
                auto_finalize_hours=None,
            )

        try:
            confidence = float(parsed.get("confidence", 0.5))
        except (TypeError, ValueError):
            confidence = 0.5

        return ResolverResult(
            outcome=ResolutionOutcome[raw_outcome],
            confidence=max(0.0, min(1.0, confidence)),
            evidence={
                "reasoning": parsed.get("reasoning", ""),
                "sources":   parsed.get("sources", []),
                "model":     model,
                "raw":       parsed,
            },
            source_name=f"LLM analyst ({model})",
            source_url=None,
            # IMPORTANT: never auto-finalize LLM-decided outcomes. The admin
            # queue is the trust boundary.
            auto_finalize_hours=None,
        )
