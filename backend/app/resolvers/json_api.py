"""
JSON-API resolver.

Fetches a URL, extracts a value via JSONPath-lite (dot/bracket path), compares
it against a threshold, and emits YES/NO.

Config shape:
    {
      "type": "json_api",
      "url":  "https://api.coingecko.com/.../market_data",
      "jsonpath": "$.market_data.current_price.usd",
      "comparator": ">=",         # ==, !=, >, >=, <, <=
      "threshold": 150000,
      "headers": {"User-Agent": "PulsoBot/1.0"},
      "source_name": "CoinGecko BTC price",
      "auto_finalize_hours": 24
    }

If the fetch fails or the path is missing, returns None (the loop will retry).
"""
from __future__ import annotations
import json
import logging
import re
from typing import Any

from ..models import ResolutionOutcome
from .base import ResolverResult

logger = logging.getLogger(__name__)


def _jsonpath_lite(obj: Any, path: str) -> Any:
    """Tiny subset of JSONPath: $.a.b[0].c.  Returns None on miss."""
    if not path.startswith("$"):
        return None
    cur = obj
    for tok in re.findall(r"\.([A-Za-z0-9_]+)|\[(-?\d+)\]", path):
        key, idx = tok
        try:
            if key:
                cur = cur[key]
            else:
                cur = cur[int(idx)]
        except (KeyError, IndexError, TypeError):
            return None
    return cur


def _cmp(value: Any, op: str, threshold: Any) -> bool:
    try:
        # numeric compare when both sides look numeric
        v = float(value); t = float(threshold)
        return {">": v > t, ">=": v >= t, "<": v < t, "<=": v <= t,
                "==": v == t, "!=": v != t}[op]
    except (TypeError, ValueError):
        return {"==": value == threshold, "!=": value != threshold}.get(op, False)


class JsonApiResolver:
    code = "json_api"

    async def evaluate(self, market) -> ResolverResult | None:
        cfg = market.resolution_config or {}
        url = cfg.get("url")
        path = cfg.get("jsonpath", "$")
        op = cfg.get("comparator", ">=")
        threshold = cfg.get("threshold")
        headers = cfg.get("headers") or {}
        source_name = cfg.get("source_name") or url or "JSON feed"
        auto_h = cfg.get("auto_finalize_hours", 24)

        if not url or threshold is None:
            return ResolverResult(
                outcome=None, confidence=0.0,
                evidence={"error": "missing url or threshold in resolution_config"},
                source_name=source_name, source_url=url,
                auto_finalize_hours=None,
            )

        try:
            import httpx
        except ImportError:
            logger.error("httpx not installed; cannot run JsonApiResolver")
            return None

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                r = await client.get(url, headers=headers)
                r.raise_for_status()
                data = r.json()
        except Exception as e:
            logger.warning("JsonApi fetch failed for %s: %s", market.id, e)
            return None  # retry next tick

        value = _jsonpath_lite(data, path)
        if value is None:
            return ResolverResult(
                outcome=None, confidence=0.0,
                evidence={"error": "jsonpath returned None", "path": path, "got": _short(data)},
                source_name=source_name, source_url=url,
                auto_finalize_hours=None,
            )

        decided = _cmp(value, op, threshold)
        return ResolverResult(
            outcome=ResolutionOutcome.YES if decided else ResolutionOutcome.NO,
            confidence=1.0,
            evidence={"value": value, "comparator": op, "threshold": threshold,
                      "jsonpath": path, "raw_preview": _short(data)},
            source_name=source_name, source_url=url,
            auto_finalize_hours=auto_h,
        )


def _short(obj: Any, n: int = 240) -> str:
    try:
        s = json.dumps(obj, default=str)
    except Exception:
        s = str(obj)
    return s if len(s) <= n else s[:n] + "…"
