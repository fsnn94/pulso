"""Tests del motor financiero: matching, payouts, void y — lo más importante —
el invariante de conservación de dinero (Σ users.cash + Σ house = créditos otorgados)."""
from __future__ import annotations
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select

from app.matching import place_order, resolve_market, void_market
from app.models import (
    HouseLedger, Market, MarketStatus, OrderAction, OrderStatus, OrderType,
    Position, Side, User,
)
from app.schemas import OrderIn
from app.security import hash_password

START = 10_000.0


def make_user(handle: str, cash: float = START) -> User:
    return User(
        email=f"{handle}@t.test", handle=handle,
        password_hash=hash_password("x"), cash=cash,
        accepted_research_disclaimer=True,
    )


def make_market(mid: str = "m1", price: float = 0.5) -> Market:
    return Market(
        id=mid, title="¿Test?", short_title="Test", description="reglas",
        category="Test", closes_at=datetime.now(timezone.utc) + timedelta(days=1),
        current_yes_price=price, status=MarketStatus.OPEN,
    )


def _buy(mid: str, side: Side, qty: float) -> OrderIn:
    return OrderIn(market_id=mid, side=side, action=OrderAction.BUY, type=OrderType.MARKET, quantity=qty)


def _limit(mid: str, side: Side, qty: float, price: float) -> OrderIn:
    return OrderIn(market_id=mid, side=side, action=OrderAction.BUY, type=OrderType.LIMIT, quantity=qty, limit_price=price)


async def _house_balance(db) -> float:
    return float((await db.execute(
        select(func.coalesce(func.sum(HouseLedger.amount), 0.0))
    )).scalar_one())


async def _total_cash(db) -> float:
    return float((await db.execute(
        select(func.coalesce(func.sum(User.cash), 0.0))
    )).scalar_one())


async def test_market_buy_debita_cash_y_crea_posicion(db):
    u = make_user("alice"); m = make_market()
    db.add_all([u, m]); await db.commit()

    order, fills = await place_order(db, u, _buy("m1", Side.YES, 100))
    await db.commit(); await db.refresh(u)

    assert order.status == OrderStatus.FILLED
    assert len(fills) == 1
    assert u.cash < START  # pagó
    pos = (await db.execute(select(Position).where(Position.user_id == u.id))).scalar_one()
    assert pos.side == Side.YES and pos.shares == pytest.approx(100)
    # La casa recibió exactamente lo que salió del usuario (premium).
    assert await _house_balance(db) == pytest.approx(START - u.cash)


async def test_cruce_de_limites_acuna_set_completo(db):
    a = make_user("a"); b = make_user("b"); m = make_market()
    db.add_all([a, b, m]); await db.commit()

    await place_order(db, a, _limit("m1", Side.YES, 100, 0.60)); await db.commit()
    await place_order(db, b, _limit("m1", Side.NO, 100, 0.50)); await db.commit()  # suma 1.10 ≥ 1 → cruza
    await db.refresh(a); await db.refresh(b)

    pa = (await db.execute(select(Position).where(Position.user_id == a.id))).scalar_one()
    pb = (await db.execute(select(Position).where(Position.user_id == b.id))).scalar_one()
    assert pa.side == Side.YES and pa.shares == pytest.approx(100)
    assert pb.side == Side.NO and pb.shares == pytest.approx(100)
    assert a.cash == pytest.approx(START - 60.0)   # reservó 0.60 * 100
    assert b.cash == pytest.approx(START - 50.0)   # reservó 0.50 * 100


async def test_resolucion_paga_al_ganador(db):
    u = make_user("alice"); m = make_market()
    db.add_all([u, m]); await db.commit()
    await place_order(db, u, _buy("m1", Side.YES, 100)); await db.commit(); await db.refresh(u)
    cash_post_compra = u.cash

    await resolve_market(db, m, Side.YES); await db.commit()
    await db.refresh(u); await db.refresh(m)

    assert m.status == MarketStatus.RESOLVED
    assert u.cash > cash_post_compra  # cobró $1 por contrato ganador (neto de comisión)
    pos = (await db.execute(select(Position).where(Position.user_id == u.id))).scalar_one()
    assert pos.shares == pytest.approx(0)  # liquidada


async def test_void_reembolsa_costo_promedio(db):
    u = make_user("alice"); m = make_market()
    db.add_all([u, m]); await db.commit()
    await place_order(db, u, _buy("m1", Side.YES, 100)); await db.commit(); await db.refresh(u)
    cash_post_compra = u.cash
    pos = (await db.execute(select(Position).where(Position.user_id == u.id))).scalar_one()
    reembolso = pos.avg_cost * pos.shares

    await void_market(db, m); await db.commit()
    await db.refresh(u); await db.refresh(m)

    assert m.status == MarketStatus.VOIDED
    assert u.cash == pytest.approx(cash_post_compra + reembolso)  # P&L neto cero


async def test_invariante_conservacion_de_dinero(db):
    """Σ users.cash + Σ house = créditos otorgados. Ninguna moneda se escapa."""
    users = [make_user(f"u{i}") for i in range(3)]
    m = make_market()
    db.add_all(users + [m]); await db.commit()
    total0 = START * len(users)

    await place_order(db, users[0], _buy("m1", Side.YES, 50)); await db.commit()
    await place_order(db, users[1], _buy("m1", Side.NO, 30)); await db.commit()
    await resolve_market(db, m, Side.YES); await db.commit()

    total = await _total_cash(db) + await _house_balance(db)
    assert total == pytest.approx(total0, abs=1e-6)
