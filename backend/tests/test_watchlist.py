"""Tests de watchlist: agregar (idempotente), listar y quitar."""
from __future__ import annotations
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select

from app.models import Market, MarketStatus, User, Watchlist
from app.routers.watchlist import add_watch, my_watchlist, remove_watch
from app.security import hash_password


def _user(h="u"):
    return User(email=f"{h}@t.test", handle=h, password_hash=hash_password("x"), accepted_research_disclaimer=True)


def _market(mid="m1"):
    return Market(id=mid, title="¿Test?", short_title="Test", description="d", category="Test",
                  closes_at=datetime.now(timezone.utc) + timedelta(days=1), status=MarketStatus.OPEN)


@pytest.mark.asyncio
async def test_add_is_idempotent_and_listable(db):
    u, m = _user(), _market()
    db.add_all([u, m]); await db.commit(); await db.refresh(u)

    await add_watch(m.id, u, db)
    await add_watch(m.id, u, db)   # segunda vez: no duplica
    count = (await db.execute(select(func.count(Watchlist.id)).where(Watchlist.user_id == u.id))).scalar_one()
    assert count == 1

    listed = await my_watchlist(u, db)
    assert [x.id for x in listed] == [m.id]


@pytest.mark.asyncio
async def test_remove(db):
    u, m = _user(), _market()
    db.add_all([u, m]); await db.commit(); await db.refresh(u)
    await add_watch(m.id, u, db)
    await remove_watch(m.id, u, db)
    listed = await my_watchlist(u, db)
    assert listed == []
