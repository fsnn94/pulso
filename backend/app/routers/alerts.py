"""Alertas de precio del usuario (CRUD). El disparo lo hace app/alerts.py al
moverse el precio (ver routers/orders.py)."""
from __future__ import annotations
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user
from ..models import AlertDirection, Market, PriceAlert, User
from ..schemas import PriceAlertIn, PriceAlertOut

router = APIRouter(prefix="/alerts", tags=["alerts"])

MAX_ACTIVE_PER_USER = 100


@router.get("", response_model=list[PriceAlertOut])
async def my_alerts(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    market_id: str | None = None,
    active_only: bool = False,
):
    stmt = select(PriceAlert).where(PriceAlert.user_id == user.id).order_by(desc(PriceAlert.created_at))
    if market_id:
        stmt = stmt.where(PriceAlert.market_id == market_id)
    if active_only:
        stmt = stmt.where(PriceAlert.active.is_(True))
    return list((await db.execute(stmt)).scalars().all())


@router.post("", response_model=PriceAlertOut, status_code=status.HTTP_201_CREATED)
async def create_alert(
    payload: PriceAlertIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    market = await db.get(Market, payload.market_id)
    if not market:
        raise HTTPException(404, "Mercado no encontrado")

    direction = AlertDirection[payload.direction]
    yes = market.current_yes_price
    # La condición no debe cumplirse ya (si no, se dispararía de inmediato).
    if direction == AlertDirection.ABOVE and yes >= payload.threshold:
        raise HTTPException(400, "La probabilidad ya está en o por encima de ese valor.")
    if direction == AlertDirection.BELOW and yes <= payload.threshold:
        raise HTTPException(400, "La probabilidad ya está en o por debajo de ese valor.")

    active_count = (await db.execute(
        select(PriceAlert).where(PriceAlert.user_id == user.id, PriceAlert.active.is_(True))
    )).scalars().all()
    if len(active_count) >= MAX_ACTIVE_PER_USER:
        raise HTTPException(400, "Alcanzaste el máximo de alertas activas.")

    alert = PriceAlert(
        user_id=user.id, market_id=payload.market_id,
        direction=direction, threshold=payload.threshold, active=True,
    )
    db.add(alert)
    await db.commit()
    await db.refresh(alert)
    return alert


@router.delete("/{alert_id}")
async def delete_alert(
    alert_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await db.execute(
        delete(PriceAlert).where(PriceAlert.id == alert_id, PriceAlert.user_id == user.id)
    )
    await db.commit()
    return {"ok": True}
