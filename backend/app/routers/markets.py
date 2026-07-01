"""Public market routes."""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..models import Activity, Market, Order, OrderStatus, OrderAction, Side, Trade, User
from ..schemas import (
    MarketBase, MarketHistoryOut, MarketsOut, MarketSummaryOut, OrderOut,
    PricePoint, TradeOut,
)

router = APIRouter(prefix="/markets", tags=["markets"])

_HIST_RANGES: dict[str, timedelta | None] = {
    "24h": timedelta(hours=24), "1w": timedelta(weeks=1),
    "1m": timedelta(days=30), "1y": timedelta(days=365), "all": None,
}


def _downsample_points(rows: list, max_points: int) -> list:
    n = len(rows)
    if n <= max_points:
        return rows
    step = (n - 1) / (max_points - 1)
    idx = sorted({round(i * step) for i in range(max_points)} | {0, n - 1})
    return [rows[i] for i in idx]


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
        raise HTTPException(404, "Mercado no encontrado")
    return m


@router.get("/{market_id}/summary", response_model=MarketSummaryOut)
async def market_summary(market_id: str, db: Annotated[AsyncSession, Depends(get_db)]):
    """Aggregate stats for a market (useful once it's resolved): participants,
    total movement, contracts traded and total payout distributed to winners."""
    m = (await db.execute(select(Market).where(Market.id == market_id))).scalar_one_or_none()
    if not m:
        raise HTTPException(404, "Mercado no encontrado")

    vol, contracts = (await db.execute(
        select(
            func.coalesce(func.sum(Trade.price * Trade.quantity), 0.0),
            func.coalesce(func.sum(Trade.quantity), 0.0),
        ).where(Trade.market_id == market_id)
    )).one()

    buyer_ids = (await db.execute(
        select(Trade.buyer_id).where(Trade.market_id == market_id).distinct()
    )).scalars().all()
    seller_ids = (await db.execute(
        select(Trade.seller_id).where(Trade.market_id == market_id, Trade.seller_id.isnot(None)).distinct()
    )).scalars().all()
    participants = len(set(buyer_ids) | set(seller_ids))

    total_payout = (await db.execute(
        select(func.coalesce(func.sum(Activity.total), 0.0))
        .where(Activity.market_id == market_id, Activity.kind == "RESOLVED", Activity.total > 0)
    )).scalar_one()

    return MarketSummaryOut(
        market_id=m.id, status=m.status, resolved_outcome=m.resolved_outcome,
        resolved_at=m.resolved_at, closes_at=m.closes_at,
        participants=participants, total_volume=float(vol or 0.0),
        total_contracts=float(contracts or 0.0), total_payout=float(total_payout or 0.0),
    )


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


@router.get("/{market_id}/history", response_model=MarketHistoryOut)
async def market_history(
    market_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    range: str = Query("all", pattern="^(24h|1w|1m|1y|all)$"),
):
    """Curva de probabilidad YES a lo largo del tiempo, derivada de las
    operaciones (cada trade YES imprime su precio; cada trade NO imprime 1−precio)."""
    m = await db.get(Market, market_id)
    if not m:
        raise HTTPException(404, "Mercado no encontrado")
    now = datetime.now(timezone.utc)
    delta = _HIST_RANGES[range]
    start = None if delta is None else now - delta

    q = select(Trade.created_at, Trade.side, Trade.price).where(Trade.market_id == market_id)
    if start is not None:
        q = q.where(Trade.created_at >= start)
    q = q.order_by(Trade.created_at)
    rows = (await db.execute(q)).all()

    points = [
        PricePoint(ts=ts, p=(price if side == Side.YES else 1.0 - price))
        for ts, side, price in rows
    ]
    points = _downsample_points(points, 200)
    # La punta siempre es el precio actual del mercado.
    points.append(PricePoint(ts=now, p=m.current_yes_price))
    return MarketHistoryOut(market_id=market_id, range=range, points=points)


@router.get("/{market_id}/trades", response_model=list[TradeOut])
async def get_trades(market_id: str, db: Annotated[AsyncSession, Depends(get_db)], limit: int = 50):
    rs = await db.execute(
        select(Trade, User.handle)
        .join(User, User.id == Trade.buyer_id)
        .where(Trade.market_id == market_id)
        .order_by(desc(Trade.created_at)).limit(limit)
    )
    return [
        TradeOut(
            id=t.id, market_id=t.market_id, side=t.side, price=t.price,
            quantity=t.quantity, created_at=t.created_at, handle=handle,
        )
        for t, handle in rs.all()
    ]
