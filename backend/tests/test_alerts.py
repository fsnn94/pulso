"""Tests de alertas de precio: creación (rechaza si ya se cumple) y disparo."""
from __future__ import annotations
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from app.alerts import check_price_alerts
from app.models import AlertDirection, Market, MarketStatus, Notification, PriceAlert, User
from app.routers.alerts import create_alert
from app.schemas import PriceAlertIn
from app.security import hash_password


def _user(h="u"):
    return User(email=f"{h}@t.test", handle=h, password_hash=hash_password("x"), accepted_research_disclaimer=True)


def _market(mid="m1", price=0.5):
    return Market(id=mid, title="¿Test?", short_title="Test", description="d", category="Test",
                  closes_at=datetime.now(timezone.utc) + timedelta(days=1), status=MarketStatus.OPEN,
                  current_yes_price=price)


@pytest.mark.asyncio
async def test_create_rejects_already_met(db):
    u, m = _user(), _market(price=0.5)
    db.add_all([u, m]); await db.commit(); await db.refresh(u)
    # ABOVE con umbral por debajo del precio actual → ya se cumple → 400
    with pytest.raises(HTTPException) as e:
        await create_alert(PriceAlertIn(market_id=m.id, direction="ABOVE", threshold=0.4), u, db)
    assert e.value.status_code == 400


@pytest.mark.asyncio
async def test_create_and_fire(db):
    u, m = _user(), _market(price=0.5)
    db.add_all([u, m]); await db.commit(); await db.refresh(u)

    alert = await create_alert(PriceAlertIn(market_id=m.id, direction="ABOVE", threshold=0.7), u, db)
    assert alert.active is True

    # Precio aún no cruza → no dispara.
    fired = await check_price_alerts(db, m.id, 0.65); await db.commit()
    assert fired == 0

    # Precio cruza el umbral → dispara una vez + notificación.
    fired = await check_price_alerts(db, m.id, 0.72); await db.commit()
    assert fired == 1

    a = await db.get(PriceAlert, alert.id)
    assert a.active is False and a.triggered_at is not None

    notes = (await db.execute(
        select(func.count(Notification.id)).where(Notification.user_id == u.id, Notification.kind == "PRICE_ALERT")
    )).scalar_one()
    assert notes == 1

    # No se vuelve a disparar (ya está inactiva).
    fired = await check_price_alerts(db, m.id, 0.9); await db.commit()
    assert fired == 0
