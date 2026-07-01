"""Resolution endpoints: admin queue + admin confirm/override + user disputes."""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Annotated
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user, require_resolutions, require_verified
from ..matching import resolve_market, void_market
from ..models import (
    Market, MarketDispute, MarketStatus, ResolutionOutcome, ResolutionProposal,
    ResolutionProposalStatus, Side, User,
)
from ..schemas import DisputeIn, ResolutionConfirmIn, ResolutionProposalOut
from ..ws import broadcast_market_event

admin_router = APIRouter(prefix="/admin/resolutions", tags=["resolutions"])
user_router  = APIRouter(prefix="/markets",            tags=["resolutions"])


# ---------- admin: list / confirm / override ----------

@admin_router.get("", response_model=list[ResolutionProposalOut])
async def list_proposals(
    admin: Annotated[User, Depends(require_resolutions)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: str | None = Query(None, alias="status",
        pattern="^(PENDING|CONFIRMED|OVERRIDDEN|DISPUTED)$"),
    limit: int = 200,
):
    stmt = select(ResolutionProposal).order_by(desc(ResolutionProposal.proposed_at)).limit(limit)
    if status_filter:
        stmt = stmt.where(ResolutionProposal.status == ResolutionProposalStatus[status_filter])
    rs = await db.execute(stmt)
    return list(rs.scalars().all())


@admin_router.get("/queue", response_model=list[ResolutionProposalOut])
async def queue(
    admin: Annotated[User, Depends(require_resolutions)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Active queue: PENDING + DISPUTED, oldest first."""
    rs = await db.execute(
        select(ResolutionProposal).where(
            ResolutionProposal.status.in_((
                ResolutionProposalStatus.PENDING,
                ResolutionProposalStatus.DISPUTED,
            ))
        ).order_by(ResolutionProposal.proposed_at.asc())
    )
    return list(rs.scalars().all())


@admin_router.post("/{proposal_id}/confirm", response_model=ResolutionProposalOut)
async def confirm(
    proposal_id: uuid.UUID,
    payload: ResolutionConfirmIn,
    admin: Annotated[User, Depends(require_resolutions)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Admin finalizes a proposal — either confirming the resolver's outcome or
    overriding it. If the outcome differs from `proposed_outcome`, the
    proposal is marked OVERRIDDEN (and `note` becomes required).
    """
    p = await db.get(ResolutionProposal, proposal_id)
    if not p:
        raise HTTPException(404, "Propuesta de resolución no encontrada")
    if p.status not in (ResolutionProposalStatus.PENDING, ResolutionProposalStatus.DISPUTED):
        raise HTTPException(400, f"La propuesta ya está en estado {p.status.value}")

    market = await db.get(Market, p.market_id)
    if not market:
        raise HTTPException(404, "Mercado no encontrado")
    if market.status == MarketStatus.RESOLVED:
        raise HTTPException(400, "El mercado ya está resuelto")

    overriding = (p.proposed_outcome is not None and payload.outcome != p.proposed_outcome)
    if overriding and not (payload.note or "").strip():
        raise HTTPException(400, "Se requiere una nota cuando hay anulación")

    if payload.outcome == ResolutionOutcome.VOID:
        await void_market(db, market)
    else:
        # YES / NO route through the existing payout path
        await resolve_market(db, market, Side(payload.outcome.value))

    p.status = (ResolutionProposalStatus.OVERRIDDEN if overriding
                else ResolutionProposalStatus.CONFIRMED)
    p.confirmed_outcome = payload.outcome
    p.confirmed_by = admin.id
    p.confirmed_at = datetime.now(timezone.utc)
    p.confirm_note = payload.note

    await db.commit()
    await db.refresh(p)
    await broadcast_market_event(market.id, {
        "type": "resolution_finalized",
        "market_id": market.id, "proposal_id": str(p.id),
        "outcome": payload.outcome.value,
        "via": "admin_override" if overriding else "admin_confirm",
    })
    return p


# ---------- user: dispute ----------

@user_router.post("/{market_id}/dispute", response_model=ResolutionProposalOut)
async def dispute(
    market_id: str,
    payload: DisputeIn,
    user: Annotated[User, Depends(require_verified)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    File a dispute against the active proposal for a market. One dispute is
    enough to flip the proposal to DISPUTED and freeze auto-finalization —
    an admin then resolves manually via /admin/resolutions/{id}/confirm.
    """
    market = await db.get(Market, market_id)
    if not market:
        raise HTTPException(404, "Mercado no encontrado")

    rs = await db.execute(
        select(ResolutionProposal).where(
            ResolutionProposal.market_id == market_id,
            ResolutionProposal.status.in_((
                ResolutionProposalStatus.PENDING,
                ResolutionProposalStatus.DISPUTED,
            )),
        ).order_by(desc(ResolutionProposal.proposed_at)).limit(1)
    )
    p = rs.scalar_one_or_none()
    if not p:
        raise HTTPException(400, "No hay una resolución activa para disputar en este mercado")

    # Window check: only allow disputes before finalization
    if p.finalizes_at and p.finalizes_at < datetime.now(timezone.utc):
        raise HTTPException(400, "La ventana para disputar ya expiró")

    # Idempotent per user (unique index on proposal_id + user_id)
    existing = await db.execute(
        select(MarketDispute).where(
            MarketDispute.proposal_id == p.id, MarketDispute.user_id == user.id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Ya disputaste esta propuesta")

    db.add(MarketDispute(
        proposal_id=p.id, user_id=user.id,
        reason=payload.reason, evidence_url=payload.evidence_url,
    ))
    p.dispute_count = (p.dispute_count or 0) + 1
    p.status = ResolutionProposalStatus.DISPUTED
    market.status = MarketStatus.DISPUTED
    await db.commit()
    await db.refresh(p)

    await broadcast_market_event(market_id, {
        "type": "resolution_disputed",
        "market_id": market_id, "proposal_id": str(p.id),
        "dispute_count": p.dispute_count,
        "by_user": user.handle,
    })
    return p
