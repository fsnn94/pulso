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

# Herramienta de búsqueda web server-side de Anthropic: Claude busca y lee
# fuentes por su cuenta durante la misma llamada y devuelve el resultado final.
WEB_SEARCH_TOOL = {"type": "web_search_20250305", "name": "web_search", "max_uses": 6}


SYSTEM_PROMPT = """You are a market-resolution analyst WITH web search.

Use web search to find the CURRENT, real-world outcome of the market's question,
relying on authoritative primary sources (official bodies, major outlets). Then
apply the market's resolution rules exactly and decide YES, NO, or VOID.

Return ONLY a single JSON object on its own line with this schema:
  {"outcome": "YES" | "NO" | "VOID",
   "confidence": float between 0 and 1,
   "reasoning": "short justification, 1-3 sentences, citing what you found",
   "sources": ["url", ...]}

Rules:
- Do NOT guess. If, even after searching, the outcome is not yet decided or you
  cannot verify it from reliable sources, return "VOID" with low confidence.
- "YES"/"NO" are relative to the market's own resolution rules, not intuition.
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


def _extract_search_urls(content: list) -> list[str]:
    """URLs que Claude efectivamente consultó (bloques web_search_tool_result)."""
    urls: list[str] = []
    for b in content:
        if b.get("type") == "web_search_tool_result":
            for item in (b.get("content") or []):
                u = item.get("url")
                if u and u not in urls:
                    urls.append(u)
    return urls


async def _call_llm(
    model: str, system: str, user: str, api_key: str, base_url: str, use_web_search: bool = True,
) -> dict[str, Any] | None:
    """Devuelve {"parsed": {...}|None, "sources": [urls]} o None si la llamada falla."""
    try:
        import httpx
    except ImportError:
        logger.error("httpx not installed; cannot run LlmSearchResolver")
        return None
    body: dict[str, Any] = {
        "model": model,
        "max_tokens": 1500,
        "system": system,
        "messages": [{"role": "user", "content": user}],
    }
    if use_web_search:
        body["tools"] = [WEB_SEARCH_TOOL]
    try:
        # La búsqueda web agrega varias iteraciones server-side → timeout amplio.
        async with httpx.AsyncClient(timeout=90.0) as client:
            r = await client.post(
                base_url,
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json=body,
            )
            r.raise_for_status()
            data = r.json()
    except Exception as e:
        logger.warning("LLM call failed: %s", e)
        return None

    content = data.get("content", []) or []
    try:
        text = "".join(b.get("text", "") for b in content if b.get("type") == "text").strip()
    except Exception:
        text = ""
    sources = _extract_search_urls(content)

    parsed = None
    try:
        start = text.find("{"); end = text.rfind("}")
        if start >= 0 and end >= 0:
            parsed = json.loads(text[start:end + 1])
    except Exception:
        logger.warning("Could not parse LLM JSON: %r", text[:240])
    return {"parsed": parsed, "sources": sources}


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
                evidence={"error": "LLM_RESOLVER_API_KEY no configurado — el admin debe decidir manualmente",
                          "instructions": cfg.get("instructions") or market.description},
                source_name="Analista LLM (sin configurar)",
                source_url=None,
                auto_finalize_hours=None,  # always queue for admin
            )

        user_prompt = _build_user_prompt(market, cfg)
        # Búsqueda web activada por defecto; se puede apagar con {"web_search": false}.
        use_web = cfg.get("web_search", True)
        result = await _call_llm(model, SYSTEM_PROMPT, user_prompt, api_key, base_url, use_web)
        if result is None:
            return None  # transient — retry next tick
        parsed = result.get("parsed")
        web_sources = result.get("sources") or []
        if parsed is None:
            return None  # no se pudo parsear — reintentar

        raw_outcome = str(parsed.get("outcome", "")).upper()
        if raw_outcome not in ("YES", "NO", "VOID"):
            return ResolverResult(
                outcome=None, confidence=0.0,
                evidence={"error": "El LLM devolvió un resultado distinto de {YES,NO,VOID}",
                          "raw": parsed, "searched": web_sources},
                source_name="Analista LLM",
                source_url=None,
                auto_finalize_hours=None,
            )

        try:
            confidence = float(parsed.get("confidence", 0.5))
        except (TypeError, ValueError):
            confidence = 0.5

        cited = parsed.get("sources") or web_sources
        return ResolverResult(
            outcome=ResolutionOutcome[raw_outcome],
            confidence=max(0.0, min(1.0, confidence)),
            evidence={
                "reasoning":  parsed.get("reasoning", ""),
                "sources":    cited,
                "web_search": web_sources,
                "model":      model,
                "raw":        parsed,
            },
            source_name=f"Analista LLM ({model}, con búsqueda web)" if use_web else f"Analista LLM ({model})",
            source_url=(web_sources[0] if web_sources else None),
            # IMPORTANT: never auto-finalize LLM-decided outcomes. The admin
            # queue is the trust boundary.
            auto_finalize_hours=None,
        )
