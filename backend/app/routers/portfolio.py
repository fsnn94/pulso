"""User portfolio + activity."""
from __future__ import annotations
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user
from ..models import Activity, Position, User
from ..schemas import PortfolioOut, PositionOut, ActivityOut

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


@router.get("", response_model=PortfolioOut)
async def get_portfolio(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    pos_res = await db.execute(
        select(Position).where(Position.user_id == user.id, Position.shares > 0)
        .order_by(desc(Position.updated_at))
    )
    act_res = await db.execute(
        select(Activity).where(Activity.user_id == user.id)
        .order_by(desc(Activity.created_at)).limit(100)
    )
    return PortfolioOut(
        cash=user.cash,
        positions=[PositionOut.model_validate(p) for p in pos_res.scalars().all()],
        activity=[ActivityOut.model_validate(a) for a in act_res.scalars().all()],
    )
