"""El contrato de auto-finalización: solo los resolutores deterministas
(json_api) pueden cerrar un mercado solos. Un resultado decidido por el LLM
NUNCA se finaliza sin que un admin lo confirme."""
from __future__ import annotations
from datetime import datetime, timedelta, timezone

import pytest

from app.models import Market, MarketStatus, ResolutionOutcome, ResolutionProposalStatus
from app.resolution_loop import _run_resolver
from app.resolvers.base import ResolverResult


def _closed_market(mid="m1", cfg=None):
    return Market(
        id=mid, title="¿T?", short_title="T", description="d", category="Test",
        closes_at=datetime.now(timezone.utc) - timedelta(hours=1),
        status=MarketStatus.CLOSED, resolution_config=cfg or {"type": "manual"},
    )


class _FakeResolver:
    """Resolver de prueba que devuelve un resultado fijo."""
    def __init__(self, code, result):
        self.code = code
        self._result = result

    async def evaluate(self, market):
        return self._result


@pytest.mark.asyncio
async def test_llm_outcome_never_auto_finalizes(db, monkeypatch):
    """auto_finalize_hours=None (lo que devuelve llm_search) => sin ventana de
    auto-cierre y el mercado NO pasa a PROPOSED: queda en la cola del admin."""
    from app import resolution_loop as rl

    m = _closed_market("m-llm", {"type": "llm_search"})
    db.add(m); await db.commit()

    fake = _FakeResolver("llm_search", ResolverResult(
        outcome=ResolutionOutcome.YES, confidence=0.9,
        evidence={}, source_name="LLM", source_url=None,
        auto_finalize_hours=None,          # el resolver dice: que confirme un admin
    ))
    monkeypatch.setitem(rl.RESOLVERS, "llm_search", fake)

    proposal = await _run_resolver(db, m)
    await db.commit()

    assert proposal is not None
    assert proposal.proposed_outcome == ResolutionOutcome.YES
    assert proposal.finalizes_at is None, "un resultado del LLM no debe auto-finalizar"
    assert proposal.status == ResolutionProposalStatus.PENDING
    assert m.status == MarketStatus.CLOSED, "debe quedar en la cola del admin, no PROPOSED"


@pytest.mark.asyncio
async def test_json_api_outcome_does_auto_finalize(db, monkeypatch):
    """Una fuente de datos determinista sí puede cerrar sola tras su ventana."""
    from app import resolution_loop as rl

    m = _closed_market("m-api", {"type": "json_api"})
    db.add(m); await db.commit()

    fake = _FakeResolver("json_api", ResolverResult(
        outcome=ResolutionOutcome.NO, confidence=1.0,
        evidence={}, source_name="API", source_url="https://x.test",
        auto_finalize_hours=24,
    ))
    monkeypatch.setitem(rl.RESOLVERS, "json_api", fake)

    proposal = await _run_resolver(db, m)
    await db.commit()

    assert proposal.finalizes_at is not None
    assert m.status == MarketStatus.PROPOSED
