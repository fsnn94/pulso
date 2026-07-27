"""
Resolution lifecycle scheduler.

Every `resolution_loop_interval_seconds`:

  1) Transition OPEN markets whose `closes_at` has elapsed to CLOSED.
     Trading halts at that point (the orders router already blocks
     non-OPEN markets via `_load_open_market`).

  2) For each CLOSED market without an active proposal, dispatch to the
     resolver named in `resolution_config["type"]` (default "manual").
       - If the resolver produces an outcome → create a ResolutionProposal
         with `finalizes_at = now + auto_finalize_hours` and bump the market
         to PROPOSED.
       - If the resolver returns None → no proposal is created and the
         market sits in the admin queue.
       - If a manual resolver applies → a stub proposal with `outcome=None`
         is created so the admin queue has a single source of truth.

  3) For each PENDING proposal whose challenge window has elapsed without
     dispute → confirm it: write final outcome, call the matching engine's
     resolve_market (payouts), mark proposal CONFIRMED, market RESOLVED.

  4) Broadcast over WS at each lifecycle change.
"""
from __future__ import annotations
import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .db import LOCK_RESOLUTION, advisory_lock, session_scope
from .matching import resolve_market, void_market
from .models import (
    Market, MarketStatus, Position, ResolutionOutcome, ResolutionProposal,
    ResolutionProposalStatus, Side,
)
from .notifications import notify
from .resolvers import RESOLVERS
from .ws import broadcast_market_event

logger = logging.getLogger(__name__)


# -------- transitions --------

async def _close_expired(db: AsyncSession) -> list[Market]:
    now = datetime.now(timezone.utc)
    rs = await db.execute(
        select(Market).where(
            Market.status == MarketStatus.OPEN, Market.closes_at <= now,
        )
    )
    closed: list[Market] = []
    for m in rs.scalars().all():
        m.status = MarketStatus.CLOSED
        m.closed_at = now
        # Notify everyone who ever held a position in this market.
        participants = (await db.execute(
            select(Position.user_id).where(Position.market_id == m.id).distinct()
        )).scalars().all()
        for uid in participants:
            await notify(
                db, user_id=uid, kind="MARKET_CLOSED", market_id=m.id,
                title=f"Mercado cerrado · {m.short_title}",
                body="Se cerró la operatoria de un mercado en el que participás. "
                     "Queda a la espera de resolución.",
            )
        closed.append(m)
    return closed


async def _markets_needing_resolution(db: AsyncSession) -> list[Market]:
    """CLOSED markets that don't already have a non-terminal proposal."""
    rs = await db.execute(select(Market).where(Market.status == MarketStatus.CLOSED))
    out: list[Market] = []
    for m in rs.scalars().all():
        # Skip if there's an in-flight proposal already
        existing = await db.execute(
            select(ResolutionProposal).where(
                ResolutionProposal.market_id == m.id,
                ResolutionProposal.status.in_((
                    ResolutionProposalStatus.PENDING,
                    ResolutionProposalStatus.DISPUTED,
                )),
            ).limit(1)
        )
        if existing.scalar_one_or_none() is None:
            out.append(m)
    return out


async def _run_resolver(db: AsyncSession, market: Market) -> ResolutionProposal | None:
    cfg = market.resolution_config or {"type": "manual"}
    code = cfg.get("type", "manual")
    resolver = RESOLVERS.get(code)
    if resolver is None:
        logger.warning("Unknown resolver %r for market %s — falling back to manual", code, market.id)
        resolver = RESOLVERS["manual"]

    try:
        result = await resolver.evaluate(market)
    except Exception:
        logger.exception("Resolver %s crashed for market %s", code, market.id)
        return None
    if result is None:
        return None  # transient failure; retry next tick

    # Contrato de ResolverResult: auto_finalize_hours=None significa NUNCA
    # auto-finalizar (lo confirma un admin). Antes se pisaba con la ventana por
    # defecto "para que no quede trabado", lo que hacía que un resultado decidido
    # por el LLM se pagara solo a las 24h sin revisión humana. No queda trabado:
    # la propuesta PENDING aparece en la cola de /admin/resolutions.
    auto_h = result.auto_finalize_hours

    finalizes_at = (
        datetime.now(timezone.utc) + timedelta(hours=auto_h)
        if auto_h is not None and result.outcome is not None
        else None
    )

    proposal = ResolutionProposal(
        market_id=market.id,
        proposed_outcome=result.outcome,
        resolver_code=resolver.code,
        source_name=result.source_name,
        source_url=result.source_url,
        confidence=result.confidence,
        evidence=result.evidence or {},
        finalizes_at=finalizes_at,
        status=ResolutionProposalStatus.PENDING,
    )
    db.add(proposal)

    # Only flip to PROPOSED if we actually have an outcome with an auto-window.
    # Otherwise the market stays CLOSED in the admin queue.
    if result.outcome is not None and finalizes_at is not None:
        market.status = MarketStatus.PROPOSED
    return proposal


async def _finalize_ready_proposals(db: AsyncSession) -> list[tuple[ResolutionProposal, Market]]:
    now = datetime.now(timezone.utc)
    rs = await db.execute(
        select(ResolutionProposal).where(
            ResolutionProposal.status == ResolutionProposalStatus.PENDING,
            ResolutionProposal.finalizes_at.is_not(None),
            ResolutionProposal.finalizes_at <= now,
            ResolutionProposal.proposed_outcome.is_not(None),
            ResolutionProposal.dispute_count == 0,
        )
    )
    finalized: list[tuple[ResolutionProposal, Market]] = []
    for p in rs.scalars().all():
        m = await db.get(Market, p.market_id)
        if not m:
            continue
        if m.status not in (MarketStatus.PROPOSED, MarketStatus.CLOSED):
            continue
        outcome = p.proposed_outcome
        try:
            if outcome == ResolutionOutcome.VOID:
                await void_market(db, m)
            else:
                await resolve_market(db, m, Side(outcome.value))
        except Exception:
            logger.exception("Failed to finalize proposal %s for market %s", p.id, m.id)
            continue
        p.status = ResolutionProposalStatus.CONFIRMED
        p.confirmed_outcome = outcome
        p.confirmed_at = now
        finalized.append((p, m))
    return finalized


# -------- main loop --------

async def resolution_loop() -> None:
    settings = get_settings()
    interval = settings.resolution_loop_interval_seconds
    logger.info("resolution loop starting (every %ds)", interval)

    while True:
        events: list[tuple[str | None, dict]] = []
        try:
            async with session_scope() as db:
                # Advisory lock: si otra instancia está corriendo la resolución,
                # salteamos este tick para no pagar/finalizar dos veces.
                async with advisory_lock(db, LOCK_RESOLUTION) as got:
                    if got:
                        # 1) close expired
                        for m in await _close_expired(db):
                            events.append((m.id, {"type": "market_closed", "market_id": m.id, "closed_at": m.closed_at.isoformat()}))

                        # 2) run resolvers on CLOSED markets without active proposals
                        for m in await _markets_needing_resolution(db):
                            proposal = await _run_resolver(db, m)
                            if proposal is None:
                                continue
                            events.append((m.id, {
                                "type": "resolution_proposed",
                                "market_id": m.id, "proposal_id": str(proposal.id),
                                "outcome": proposal.proposed_outcome.value if proposal.proposed_outcome else None,
                                "resolver": proposal.resolver_code, "source": proposal.source_name,
                                "finalizes_at": proposal.finalizes_at.isoformat() if proposal.finalizes_at else None,
                                "confidence": proposal.confidence,
                            }))

                        # 3) auto-finalize PENDING proposals past their window
                        for p, m in await _finalize_ready_proposals(db):
                            events.append((m.id, {
                                "type": "resolution_finalized",
                                "market_id": m.id, "proposal_id": str(p.id),
                                "outcome": p.confirmed_outcome.value,
                                "via": "auto",
                            }))
                        await db.commit()
        except Exception:
            logger.exception("resolution loop tick failed")

        for mid, payload in events:
            try:
                await broadcast_market_event(mid, payload)
            except Exception:
                pass
        await asyncio.sleep(interval)
