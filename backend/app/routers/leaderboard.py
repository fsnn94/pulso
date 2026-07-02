"""Leaderboard público: ranking de traders por P&L, volumen u operaciones.

Sin autenticación (como los perfiles públicos). Nunca expone email/KYC.
"""
from __future__ import annotations
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..models import Market, Position, Side, Trade, User
from ..schemas import LeaderboardOut, LeaderboardRow

router = APIRouter(prefix="/leaderboard", tags=["leaderboard"])


@router.get("", response_model=LeaderboardOut)
async def leaderboard(
    db: Annotated[AsyncSession, Depends(get_db)],
    metric: str = Query("pnl", pattern="^(pnl|volume|trades)$"),
    limit: int = Query(50, ge=1, le=200),
):
    """Ranking calculado y ordenado en SQL, materializando solo el top N
    (antes cargaba todos los usuarios/posiciones/trades a Python)."""
    # Realizado acumulado por usuario.
    realized_sq = (
        select(
            Position.user_id.label("uid"),
            func.coalesce(func.sum(Position.realized_pnl), 0.0).label("realized"),
        ).group_by(Position.user_id).subquery()
    )
    # No realizado: posiciones abiertas valuadas al precio actual.
    px = case((Position.side == Side.YES, Market.current_yes_price),
              else_=1.0 - Market.current_yes_price)
    unreal_sq = (
        select(
            Position.user_id.label("uid"),
            func.coalesce(func.sum((px - Position.avg_cost) * Position.shares), 0.0).label("unreal"),
        ).join(Market, Market.id == Position.market_id)
        .where(Position.shares > 0)
        .group_by(Position.user_id).subquery()
    )
    # Volumen / operaciones / mercados (como comprador ejecutor).
    trade_sq = (
        select(
            Trade.buyer_id.label("uid"),
            func.coalesce(func.sum(Trade.price * Trade.quantity), 0.0).label("vol"),
            func.count(Trade.id).label("trades"),
            func.count(func.distinct(Trade.market_id)).label("markets"),
        ).group_by(Trade.buyer_id).subquery()
    )

    realized = func.coalesce(realized_sq.c.realized, 0.0)
    unreal = func.coalesce(unreal_sq.c.unreal, 0.0)
    vol = func.coalesce(trade_sq.c.vol, 0.0)
    trades = func.coalesce(trade_sq.c.trades, 0)
    markets = func.coalesce(trade_sq.c.markets, 0)
    pnl = realized + unreal

    q = (
        select(
            User.handle, pnl.label("pnl"), realized.label("realized"),
            vol.label("vol"), trades.label("trades"), markets.label("markets"),
        )
        .select_from(User)
        .outerjoin(realized_sq, realized_sq.c.uid == User.id)
        .outerjoin(unreal_sq, unreal_sq.c.uid == User.id)
        .outerjoin(trade_sq, trade_sq.c.uid == User.id)
        .where(User.disabled.is_(False))
        .where(or_(trades > 0, realized != 0.0, unreal != 0.0))  # solo con actividad
    )
    order_col = {"pnl": pnl, "volume": vol, "trades": trades}[metric]
    q = q.order_by(desc(order_col)).limit(limit)

    rows = (await db.execute(q)).all()
    return LeaderboardOut(
        metric=metric,
        rows=[
            LeaderboardRow(
                handle=r.handle, pnl=float(r.pnl), realized_pnl=float(r.realized),
                volume=float(r.vol), trades=int(r.trades), markets=int(r.markets),
            )
            for r in rows
        ],
    )
