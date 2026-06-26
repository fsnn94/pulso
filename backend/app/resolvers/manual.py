"""Manual resolver — no automatic decision; surfaces market in admin queue."""
from __future__ import annotations
from .base import ResolverResult


class ManualResolver:
    code = "manual"

    async def evaluate(self, market) -> ResolverResult:
        cfg = market.resolution_config or {}
        return ResolverResult(
            outcome=None,
            confidence=0.0,
            evidence={"instructions": cfg.get("instructions") or market.description},
            source_name="Revisión manual del admin",
            source_url=None,
            auto_finalize_hours=None,
            )
