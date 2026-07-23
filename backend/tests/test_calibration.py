"""Tests de calibración/Brier: solo cuenta adquisiciones (seller_id NULL) en
mercados resueltos; excluye ventas y mercados anulados."""
from __future__ import annotations
from datetime import datetime, timedelta, timezone

import pytest

from app.calibration import compute_calibration
from app.models import Market, MarketStatus, Side, Trade, User
from app.security import hash_password


def _user(h="u"):
    return User(email=f"{h}@t.test", handle=h, password_hash=hash_password("x"), accepted_research_disclaimer=True)


def _resolved_market(mid, outcome=Side.YES):
    return Market(id=mid, title="¿T?", short_title="T", description="d", category="Test",
                  closes_at=datetime.now(timezone.utc) - timedelta(days=1),
                  status=MarketStatus.RESOLVED, resolved_outcome=outcome)


def _acq(uid, mid, side, price, qty):
    return Trade(market_id=mid, side=side, price=price, quantity=qty, buyer_id=uid, seller_id=None)


def _sell(uid, mid, side, price, qty):
    return Trade(market_id=mid, side=side, price=price, quantity=qty, buyer_id=uid, seller_id=uid)


@pytest.mark.asyncio
async def test_empty(db):
    u = _user(); db.add(u); await db.commit(); await db.refresh(u)
    out = await compute_calibration(db, u.id)
    assert out["brier"] is None and out["forecasts"] == 0


@pytest.mark.asyncio
async def test_brier_over_acquisitions(db):
    u = _user(); m = _resolved_market("m1", Side.YES)
    db.add_all([u, m]); await db.commit(); await db.refresh(u)

    # Adquisiciones: YES@0.8 x10 (gana, err .04) ; NO@0.3 x10 (pierde, err .09)
    db.add_all([
        _acq(u.id, "m1", Side.YES, 0.8, 10),
        _acq(u.id, "m1", Side.NO, 0.3, 10),
        _sell(u.id, "m1", Side.YES, 0.9, 5),   # venta → NO cuenta
    ])
    await db.commit()

    out = await compute_calibration(db, u.id)
    assert out["forecasts"] == 2
    assert out["markets"] == 1
    # (10*0.04 + 10*0.09) / 20 = 0.065
    assert out["brier"] == pytest.approx(0.065)


@pytest.mark.asyncio
async def test_voided_excluded(db):
    u = _user(); m = Market(id="mv", title="?", short_title="V", description="d", category="Test",
                            closes_at=datetime.now(timezone.utc) - timedelta(days=1),
                            status=MarketStatus.VOIDED, resolved_outcome=None)
    db.add_all([u, m]); await db.commit(); await db.refresh(u)
    db.add(_acq(u.id, "mv", Side.YES, 0.7, 10)); await db.commit()
    out = await compute_calibration(db, u.id)
    assert out["brier"] is None
