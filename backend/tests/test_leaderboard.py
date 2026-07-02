"""Valida que el leaderboard (ahora en SQL) ordene bien y excluya inactivos."""
from __future__ import annotations
from datetime import datetime, timedelta, timezone

import pytest

from app.models import Market, MarketStatus, Position, Side, User
from app.routers.leaderboard import leaderboard
from app.security import hash_password


def make_user(handle: str) -> User:
    return User(
        email=f"{handle}@t.test", handle=handle,
        password_hash=hash_password("x"), cash=10_000.0,
        accepted_research_disclaimer=True,
    )


def make_market(mid: str = "m1") -> Market:
    return Market(
        id=mid, title="¿Test?", short_title="Test", description="d",
        category="Test", closes_at=datetime.now(timezone.utc) + timedelta(days=1),
        current_yes_price=0.5, status=MarketStatus.OPEN,
    )


async def test_leaderboard_ordena_por_pnl_y_excluye_inactivos(db):
    ua, ub, uc, ud = make_user("a"), make_user("b"), make_user("c"), make_user("d")
    m = make_market()
    db.add_all([ua, ub, uc, ud, m]); await db.commit()

    # a: +100, b: +50, c: -20 (realized). d sin actividad → no aparece.
    db.add_all([
        Position(user_id=ua.id, market_id="m1", side=Side.YES, shares=0, avg_cost=0.5, realized_pnl=100.0),
        Position(user_id=ub.id, market_id="m1", side=Side.YES, shares=0, avg_cost=0.5, realized_pnl=50.0),
        Position(user_id=uc.id, market_id="m1", side=Side.YES, shares=0, avg_cost=0.5, realized_pnl=-20.0),
    ])
    await db.commit()

    res = await leaderboard(db, metric="pnl", limit=10)
    handles = [r.handle for r in res.rows]
    assert handles == ["a", "b", "c"]        # 100 > 50 > -20; d excluido
    assert res.rows[0].pnl == pytest.approx(100.0)


async def test_leaderboard_unrealized_cuenta(db):
    """Una posición abierta ganadora suma al P&L no realizado."""
    u = make_user("z"); m = make_market()          # yes_price 0.5
    db.add_all([u, m]); await db.commit()
    # 100 contratos YES comprados a 0.30 → no realizado = (0.5 - 0.30) * 100 = 20
    db.add(Position(user_id=u.id, market_id="m1", side=Side.YES, shares=100, avg_cost=0.30, realized_pnl=0.0))
    await db.commit()

    res = await leaderboard(db, metric="pnl", limit=10)
    assert res.rows[0].handle == "z"
    assert res.rows[0].pnl == pytest.approx(20.0)
