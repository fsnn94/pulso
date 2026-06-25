"""Public market routes."""
from __future__ import annotations
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..models import Market, Order, OrderStatus, OrderAction, Side, Trade
from ..schemas import MarketBase, MarketsOut, OrderOut, TradeOut

router = APIRouter(prefix="/markets", tags=["markets"])


@router.get("", response_model=MarketsOut)
async def list_markets(
    db: Annotated[AsyncSession, Depends(get_db)],
    category: str | None = None,
    q: str | None = None,
    sort: str = Query("volume", pattern="^(volume|closing|newest)$"),
    limit: int = Query(60, ge=1, le=200),
):
    stmt = select(Market)
    if category and category.lower() != "all":
        stmt = stmt.where(Market.category == category)
    if q:
        like = f"%{q.lower()}%"
        from sqlalchemy import func, or_
        stmt = stmt.where(or_(
            func.lower(Market.title).like(like),
            func.lower(Market.short_title).like(like),
            func.lower(Market.category).like(like),
        ))
    if sort == "volume":
        stmt = stmt.order_by(desc(Market.volume_24h))
    elif sort == "closing":
        stmt = stmt.order_by(Market.closes_at.asc())
    else:
        stmt = stmt.order_by(desc(Market.created_at))
    stmt = stmt.limit(limit)
    res = await db.execute(stmt)
    return MarketsOut(items=list(res.scalars().all()))


@router.get("/{market_id}", response_model=MarketBase)
async def get_market(market_id: str, db: Annotated[AsyncSession, Depends(get_db)]):
    res = await db.execute(select(Market).where(Market.id == market_id))
    m = res.scalar_one_or_none()
    if not m:
        raise HTTPException(404, "Market not found")
    return m


@router.get("/{market_id}/book")
async def get_book(market_id: str, db: Annotated[AsyncSession, Depends(get_db)], depth: int = 5):
    """Top-of-book snapshot: best bids/asks for YES and NO sides."""
    async def side_levels(side: Side, action: OrderAction, top_high: bool):
        stmt = select(Order).where(
            Order.market_id == market_id,
            Order.side == side,
            Order.action == action,
            Order.status.in_((OrderStatus.OPEN, OrderStatus.PARTIAL)),
        )
        stmt = stmt.order_by(desc(Order.limit_price) if top_high else Order.limit_price.asc()).limit(50)
        rs = await db.execute(stmt)
        rows = list(rs.scalars().all())
        # aggregate by price
        levels: dict[float, float] = {}
        for o in rows:
            if o.limit_price is None:
                continue
            remaining = max(o.quantity - o.filled_quantity, 0.0)
            levels[o.limit_price] = levels.get(o.limit_price, 0.0) + remaining
        result = sorted(levels.items(), key=lambda x: -x[0] if top_high else x[0])[:depth]
        return [{"price": p, "size": s} for p, s in result]

    return {
        "yes_bids": await side_levels(Side.YES, OrderAction.BUY,  top_high=True),
        "yes_asks": await side_levels(Side.YES, OrderAction.SELL, top_high=False),
        "no_bids":  await side_levels(Side.NO,  OrderAction.BUY,  top_high=True),
        "no_asks":  await side_levels(Side.NO,  OrderAction.SELL, top_high=False),
    }


@router.get("/{market_id}/trades", response_model=list[TradeOut])
async def get_trades(market_id: str, db: Annotated[AsyncSession, Depends(get_db)], limit: int = 50):
    rs = await db.execute(
        select(Trade).where(Trade.market_id == market_id).order_by(desc(Trade.created_at)).limit(limit)
    )
    return list(rs.scalars().all())
