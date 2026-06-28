"""Notification service (item #8).

A single helper, `notify`, that appends a lean inbox item for a user and prunes
their history to the latest `MAX_PER_USER` rows so the table never grows
unbounded. Callers are responsible for committing the surrounding transaction.
"""
from __future__ import annotations
import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Notification

MAX_PER_USER = 50


async def notify(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    kind: str,
    title: str,
    body: str,
    market_id: str | None = None,
) -> None:
    """Add one notification for `user_id` and prune older ones beyond the cap.

    Does NOT commit — the caller's transaction owns the flush/commit. Keeps the
    table bounded: at most MAX_PER_USER rows survive per user.
    """
    db.add(Notification(
        user_id=user_id, kind=kind, title=title[:120], body=body[:280], market_id=market_id,
    ))
    await db.flush()  # assign id/created_at so the new row is included in the keep set

    # Prune: keep only the newest MAX_PER_USER ids for this user.
    keep_ids = (await db.execute(
        select(Notification.id)
        .where(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
        .limit(MAX_PER_USER)
    )).scalars().all()
    if len(keep_ids) >= MAX_PER_USER:
        await db.execute(
            delete(Notification).where(
                Notification.user_id == user_id,
                Notification.id.notin_(keep_ids),
            )
        )
