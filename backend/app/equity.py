"""Cálculo de patrimonio (equity) por usuario — compartido por el snapshot loop
y el endpoint de historial (item #9).

equity = cash + valor de mercado de las posiciones abiertas, donde
YES vale current_yes_price y NO vale (1 - current_yes_price).
"""
from __future__ import annotations
from dataclasses import dataclass
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import EquitySnapshot, Market, Position, User


@dataclass
class EquityRow:
    user_id: uuid.UUID
    cash: float
    positions_value: float
    realized_pnl: float

    @property
    def equity(self) -> float:
        return self.cash + self.positions_value


async def compute_equity_rows(db: AsyncSession) -> list[EquityRow]:
    """Equity de todos los usuarios en una sola pasada (para el snapshot loop)."""
    users = (await db.execute(select(User.id, User.cash))).all()
    cash_by_user = {uid: float(cash) for uid, cash in users}

    # Valor de posiciones abiertas, valuadas a precio actual.
    pos_rows = (await db.execute(
        select(Position.user_id, Position.side, Position.shares, Market.current_yes_price)
        .join(Market, Market.id == Position.market_id)
        .where(Position.shares > 0)
    )).all()
    value_by_user: dict[uuid.UUID, float] = {}
    for uid, side, shares, yes_price in pos_rows:
        px = yes_price if side.value == "YES" else (1.0 - yes_price)
        value_by_user[uid] = value_by_user.get(uid, 0.0) + px * shares

    # Realizado acumulado (neto de comisión, ya descontado en realized_pnl).
    realized_rows = (await db.execute(
        select(Position.user_id, func.coalesce(func.sum(Position.realized_pnl), 0.0))
        .group_by(Position.user_id)
    )).all()
    realized_by_user = {uid: float(r or 0.0) for uid, r in realized_rows}

    return [
        EquityRow(
            user_id=uid,
            cash=cash,
            positions_value=value_by_user.get(uid, 0.0),
            realized_pnl=realized_by_user.get(uid, 0.0),
        )
        for uid, cash in cash_by_user.items()
    ]


async def compute_user_equity(db: AsyncSession, user: User) -> EquityRow:
    """Equity en vivo de un solo usuario (para la punta fresca del gráfico)."""
    pos_rows = (await db.execute(
        select(Position.side, Position.shares, Market.current_yes_price)
        .join(Market, Market.id == Position.market_id)
        .where(Position.user_id == user.id, Position.shares > 0)
    )).all()
    positions_value = 0.0
    for side, shares, yes_price in pos_rows:
        px = yes_price if side.value == "YES" else (1.0 - yes_price)
        positions_value += px * shares

    realized = (await db.execute(
        select(func.coalesce(func.sum(Position.realized_pnl), 0.0))
        .where(Position.user_id == user.id)
    )).scalar_one()

    return EquityRow(
        user_id=user.id,
        cash=float(user.cash),
        positions_value=positions_value,
        realized_pnl=float(realized or 0.0),
    )


async def take_snapshots(db: AsyncSession) -> int:
    """Escribe un EquitySnapshot por usuario. Devuelve cuántos escribió."""
    rows = await compute_equity_rows(db)
    for r in rows:
        db.add(EquitySnapshot(
            user_id=r.user_id,
            cash=r.cash,
            positions_value=r.positions_value,
            equity=r.equity,
            realized_pnl=r.realized_pnl,
        ))
    return len(rows)
