"""Resolver protocol + result type."""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Protocol, TYPE_CHECKING

if TYPE_CHECKING:
    from ..models import Market, ResolutionOutcome


@dataclass
class ResolverResult:
    """
    Outcome of a single resolver evaluation.

    Fields:
        outcome             Final answer from the resolver. None means
                            "no decision yet — try again later" (e.g. data
                            source unavailable, ManualResolver).
        confidence          0.0–1.0; informational, surfaced in admin UI.
        evidence            Arbitrary JSON payload describing how we got here
                            (raw API response, URL fetched, threshold etc.).
                            Stored on the proposal for audit.
        source_name         Human-readable name (e.g. "Coinbase daily close").
        source_url          Optional URL to the primary evidence.
        auto_finalize_hours How long the soft challenge window should be.
                            None = never auto-finalize (admin must confirm).
    """
    outcome: "ResolutionOutcome | None"
    confidence: float = 1.0
    evidence: dict = field(default_factory=dict)
    source_name: str = ""
    source_url: str | None = None
    auto_finalize_hours: int | None = 24


class Resolver(Protocol):
    code: str

    async def evaluate(self, market: "Market") -> "ResolverResult | None": ...
