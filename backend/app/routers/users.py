"""Public user profiles: handle, P&L and trade history (item #7).

These endpoints are intentionally unauthenticated — anyone can look up another
trader's public profile by handle. They never expose email or KYC data.
"""
from __future__ import annotations
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..models import Market, Position, Trade, User
from ..schemas import PublicProfileOut, PublicTradeOut

router = APIRouter(prefix="/users", tags=["users"])


async def _get_public_user(handle: str, db: AsyncSession) -> User:
    """Resolve a non-disabled user by handle (case-insensitive)."""
    u = (await db.execute(
        select(User).where(func.lower(User.handle) == handle.lower())
    )).scalar_one_or_none()
    if not u or u.disabled:
        raise HTTPException(404, "Usuario no encontrado")
    return u


@router.get("/{handle}", response_model=PublicProfileOut)
async def public_profile(handle: str, db: Annotated[AsyncSession, Depends(get_db)]):
    user = await _get_public_user(handle, db)

    realized = (await db.execute(
        select(func.coalesce(func.sum(Position.realized_pnl), 0.0))
        .where(Position.user_id == user.id)
    )).scalar_one()

    # P&L no realizado: posiciones abiertas valuadas al precio actual del mercado.
    # YES vale current_yes_price; NO vale 1 - current_yes_price.
    open_rows = (await db.execute(
        select(Position, Market.current_yes_price)
        .join(Market, Market.id == Position.market_id)
        .where(Position.user_id == user.id, Position.shares > 0)
    )).all()
    unrealized = 0.0
    for pos, yes_price in open_rows:
        px = yes_price if pos.side.value == "YES" else (1.0 - yes_price)
        unrealized += (px - pos.avg_cost) * pos.shares

    vol, trades_count = (await db.execute(
        select(
            func.coalesce(func.sum(Trade.price * Trade.quantity), 0.0),
            func.count(Trade.id),
        ).where(Trade.buyer_id == user.id)
    )).one()

    markets_traded = (await db.execute(
        select(func.count(func.distinct(Trade.market_id))).where(Trade.buyer_id == user.id)
    )).scalar_one()

    return PublicProfileOut(
        handle=user.handle,
        created_at=user.created_at,
        realized_pnl=float(realized or 0.0),
        unrealized_pnl=float(unrealized),
        open_positions=len(open_rows),
        markets_traded=int(markets_traded or 0),
        trades_count=int(trades_count or 0),
        total_volume=float(vol or 0.0),
    )


@router.get("/{handle}/trades", response_model=list[PublicTradeOut])
async def public_trades(
    handle: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(50, ge=1, le=200),
):
    user = await _get_public_user(handle, db)
    rows = (await db.execute(
        select(Trade, Market.short_title, Market.status)
        .join(Market, Market.id == Trade.market_id)
        .where(Trade.buyer_id == user.id)
        .order_by(desc(Trade.created_at))
        .limit(limit)
    )).all()
    return [
        PublicTradeOut(
            id=t.id, market_id=t.market_id, market_short_title=short_title,
            market_status=status, side=t.side, price=t.price,
            quantity=t.quantity, created_at=t.created_at,
        )
        for t, short_title, status in rows
    ]
