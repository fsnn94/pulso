"""User-submitted market proposals (any signed-in user can propose; admin reviews)."""
from __future__ import annotations
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user
from ..models import Market, MarketProposal, ProposalStatus, User
from ..schemas import ProposalIn, ProposalOut
from ..ws import broadcast_market_event

router = APIRouter(prefix="/markets/proposals", tags=["proposals"])


@router.post("", response_model=ProposalOut, status_code=status.HTTP_201_CREATED)
async def submit_proposal(
    payload: ProposalIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    # avoid clashes with existing markets and pending proposals
    if (await db.execute(select(Market).where(Market.id == payload.slug))).scalar_one_or_none():
        raise HTTPException(409, "El identificador ya está en uso")
    pending = await db.execute(
        select(MarketProposal).where(
            MarketProposal.slug == payload.slug,
            MarketProposal.status == ProposalStatus.PENDING,
        )
    )
    if pending.scalar_one_or_none():
        raise HTTPException(409, "Ya existe una propuesta pendiente con este identificador")

    p = MarketProposal(
        submitter_id=user.id,
        slug=payload.slug,
        title=payload.title,
        short_title=payload.short_title,
        description=payload.description,
        category=payload.category,
        closes_at=payload.closes_at,
        initial_yes_price=payload.initial_yes_price,
        resolution_source=payload.resolution_source,
        rationale=payload.rationale,
    )
    db.add(p)
    await db.commit()
    await db.refresh(p)
    # Notify admin subscribers (they can listen for "proposal" events)
    await broadcast_market_event(None, {"type": "proposal", "proposal_id": str(p.id), "slug": p.slug, "title": p.title})
    return p


@router.get("/mine", response_model=list[ProposalOut])
async def list_mine(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    rs = await db.execute(
        select(MarketProposal).where(MarketProposal.submitter_id == user.id)
        .order_by(desc(MarketProposal.created_at))
    )
    return list(rs.scalars().all())
