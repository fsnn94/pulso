"""Watchlist (favoritos): mercados que el usuario sigue."""
from __future__ import annotations
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user
from ..models import Market, User, Watchlist
from ..schemas import MarketBase

router = APIRouter(prefix="/watchlist", tags=["watchlist"])


@router.get("", response_model=list[MarketBase])
async def my_watchlist(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    rs = await db.execute(
        select(Market).join(Watchlist, Watchlist.market_id == Market.id)
        .where(Watchlist.user_id == user.id)
        .order_by(desc(Watchlist.created_at))
    )
    return list(rs.scalars().all())


@router.get("/ids", response_model=list[str])
async def my_watchlist_ids(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    rs = await db.execute(select(Watchlist.market_id).where(Watchlist.user_id == user.id))
    return [mid for (mid,) in rs.all()]


@router.post("/{market_id}", status_code=status.HTTP_201_CREATED)
async def add_watch(
    market_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if not await db.get(Market, market_id):
        raise HTTPException(404, "Mercado no encontrado")
    exists = (await db.execute(
        select(Watchlist).where(Watchlist.user_id == user.id, Watchlist.market_id == market_id)
    )).scalar_one_or_none()
    if not exists:
        db.add(Watchlist(user_id=user.id, market_id=market_id))
        await db.commit()
    return {"ok": True, "watching": True, "market_id": market_id}


@router.delete("/{market_id}")
async def remove_watch(
    market_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await db.execute(
        delete(Watchlist).where(Watchlist.user_id == user.id, Watchlist.market_id == market_id)
    )
    await db.commit()
    return {"ok": True, "watching": False, "market_id": market_id}
