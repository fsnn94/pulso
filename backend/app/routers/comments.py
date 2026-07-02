"""Comentarios por mercado (capa social)."""
from __future__ import annotations
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user, require_verified
from ..models import Market, MarketComment, User
from ..ratelimit import rate_limit
from ..schemas import CommentIn, CommentOut

router = APIRouter(prefix="/markets", tags=["comments"])


@router.get("/{market_id}/comments", response_model=list[CommentOut])
async def list_comments(
    market_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(100, ge=1, le=300),
):
    rows = (await db.execute(
        select(MarketComment, User.handle)
        .join(User, User.id == MarketComment.user_id)
        .where(MarketComment.market_id == market_id, MarketComment.hidden.is_(False))
        .order_by(desc(MarketComment.created_at))
        .limit(limit)
    )).all()
    return [
        CommentOut(id=c.id, market_id=c.market_id, handle=handle, body=c.body, created_at=c.created_at)
        for c, handle in rows
    ]


@router.post("/{market_id}/comments", response_model=CommentOut, status_code=201,
             dependencies=[Depends(rate_limit("comment", 6, 60))])
async def post_comment(
    market_id: str,
    payload: CommentIn,
    user: Annotated[User, Depends(require_verified)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if not await db.get(Market, market_id):
        raise HTTPException(404, "Mercado no encontrado")
    c = MarketComment(market_id=market_id, user_id=user.id, body=payload.body.strip())
    db.add(c)
    await db.commit(); await db.refresh(c)
    return CommentOut(id=c.id, market_id=c.market_id, handle=user.handle, body=c.body, created_at=c.created_at)


@router.delete("/{market_id}/comments/{comment_id}")
async def delete_comment(
    market_id: str,
    comment_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Oculta un comentario. Permitido al autor o a cualquier admin."""
    c = await db.get(MarketComment, comment_id)
    if not c or c.market_id != market_id:
        raise HTTPException(404, "Comentario no encontrado")
    if c.user_id != user.id and not user.is_admin:
        raise HTTPException(403, "No podés eliminar este comentario")
    c.hidden = True
    await db.commit()
    return {"ok": True}
