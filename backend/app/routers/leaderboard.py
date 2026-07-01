"""Leaderboard público: ranking de traders por P&L, volumen u operaciones.

Sin autenticación (como los perfiles públicos). Nunca expone email/KYC.
"""
from __future__ import annotations
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..models import Market, Position, Trade, User
from ..schemas import LeaderboardOut, LeaderboardRow

router = APIRouter(prefix="/leaderboard", tags=["leaderboard"])


@router.get("", response_model=LeaderboardOut)
async def leaderboard(
    db: Annotated[AsyncSession, Depends(get_db)],
    metric: str = Query("pnl", pattern="^(pnl|volume|trades)$"),
    limit: int = Query(50, ge=1, le=200),
):
    # Usuarios visibles (no deshabilitados).
    users = {
        uid: handle
        for uid, handle in (await db.execute(
            select(User.id, User.handle).where(User.disabled.is_(False))
        )).all()
    }

    # Realizado acumulado (neto de comisión) por usuario.
    realized: dict = {
        uid: float(r or 0.0)
        for uid, r in (await db.execute(
            select(Position.user_id, func.coalesce(func.sum(Position.realized_pnl), 0.0))
            .group_by(Position.user_id)
        )).all()
    }

    # No realizado: posiciones abiertas valuadas al precio actual.
    unreal: dict = {}
    for uid, side, shares, avg_cost, yes_price in (await db.execute(
        select(Position.user_id, Position.side, Position.shares, Position.avg_cost, Market.current_yes_price)
        .join(Market, Market.id == Position.market_id)
        .where(Position.shares > 0)
    )).all():
        px = yes_price if side.value == "YES" else (1.0 - yes_price)
        unreal[uid] = unreal.get(uid, 0.0) + (px - avg_cost) * shares

    # Volumen / operaciones / mercados por usuario (como comprador ejecutor).
    trade_stats: dict = {
        uid: (float(vol or 0.0), int(cnt or 0), int(mk or 0))
        for uid, vol, cnt, mk in (await db.execute(
            select(
                Trade.buyer_id,
                func.coalesce(func.sum(Trade.price * Trade.quantity), 0.0),
                func.count(Trade.id),
                func.count(func.distinct(Trade.market_id)),
            ).group_by(Trade.buyer_id)
        )).all()
    }

    rows: list[LeaderboardRow] = []
    for uid, handle in users.items():
        vol, cnt, mk = trade_stats.get(uid, (0.0, 0, 0))
        r = realized.get(uid, 0.0)
        u = unreal.get(uid, 0.0)
        # Solo traders con actividad.
        if cnt == 0 and abs(r) < 1e-9 and abs(u) < 1e-9:
            continue
        rows.append(LeaderboardRow(
            handle=handle, pnl=r + u, realized_pnl=r,
            volume=vol, trades=cnt, markets=mk,
        ))

    key = {"pnl": lambda x: x.pnl, "volume": lambda x: x.volume, "trades": lambda x: x.trades}[metric]
    rows.sort(key=key, reverse=True)
    return LeaderboardOut(metric=metric, rows=rows[:limit])
