"""Order placement, listing, cancellation."""
from __future__ import annotations
from typing import Annotated
import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from ..aml import evaluate_after_trade
from ..db import get_db
from ..deps import get_current_user, require_kyc_approved
from ..matching import place_order, cancel_order
from ..models import AmlAlertStatus, Market, Order, OrderStatus, User
from ..schemas import OrderIn, OrderOut
from ..ws import broadcast_admin_event, broadcast_market_event

router = APIRouter(prefix="/orders", tags=["orders"])


@router.post("", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
async def place(
    payload: OrderIn,
    user: Annotated[User, Depends(require_kyc_approved)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    order, fills = await place_order(db, user, payload)
    await db.commit()
    await db.refresh(order)

    for f in fills:
        await broadcast_market_event(f.market_id, {
            "type": "trade", "market_id": f.market_id,
            "side": f.side.value, "price": f.price, "quantity": f.quantity,
        })

    if fills:
        market_ids = {f.market_id for f in fills}
        # El precio en vivo ahora lo mueve el flujo de órdenes reales (ya no hay
        # motor de deriva): al ejecutarse un trade, emitimos el precio actualizado.
        for mid in market_ids:
            yes = (await db.execute(
                select(Market.current_yes_price).where(Market.id == mid)
            )).scalar_one_or_none()
            if yes is not None:
                await broadcast_market_event(mid, {
                    "type": "price", "market_id": mid,
                    "yes": round(yes, 6), "no": round(1.0 - yes, 6),
                })
        for mid in market_ids:
            new_alerts = await evaluate_after_trade(db, user.id, mid)
            await db.commit()
            for a in new_alerts:
                if a.status == AmlAlertStatus.OPEN:
                    await broadcast_admin_event({
                        "type": "aml_alert",
                        "alert_id": str(a.id), "user_id": str(a.user_id),
                        "rule_code": a.rule_code, "severity": a.severity.value,
                        "market_id": a.market_id, "message": a.message,
                    })
    return order


@router.get("", response_model=list[OrderOut])
async def list_my_orders(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    open_only: bool = False,
    limit: int = 100,
):
    stmt = select(Order).where(Order.user_id == user.id).order_by(desc(Order.created_at)).limit(limit)
    if open_only:
        stmt = stmt.where(Order.status.in_((OrderStatus.OPEN, OrderStatus.PARTIAL)))
    rs = await db.execute(stmt)
    return list(rs.scalars().all())


@router.delete("/{order_id}", response_model=OrderOut)
async def cancel(
    order_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    order = await cancel_order(db, user, order_id)
    await db.commit()
    await db.refresh(order)
    return order
