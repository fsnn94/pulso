"""
Background price-drift engine.

For each open market, every `price_engine_interval` seconds, apply a small
mean-reverting random walk to the cached `current_yes_price`. This simulates
ambient market activity in the absence of a flood of real orders, and lets
the WebSocket feed feel alive during demos. In production, this loop would
be replaced (or supplemented) by real order-flow events.
"""
from __future__ import annotations
import asyncio
import logging
import random

from sqlalchemy import select

from .config import get_settings
from .db import session_scope
from .models import Market, MarketStatus
from .ws import broadcast_market_event

logger = logging.getLogger(__name__)


def _drift(current: float) -> float:
    # mean-reverting toward 0.5 with noise; tighter near extremes
    pull = (0.5 - current) * 0.005
    noise = random.gauss(0, 0.0035)
    next_p = current + pull + noise
    return max(0.02, min(0.98, next_p))


async def price_engine_loop() -> None:
    settings = get_settings()
    interval = settings.price_engine_interval
    logger.info("price engine starting (interval=%.2fs)", interval)

    while True:
        try:
            async with session_scope() as db:
                rs = await db.execute(select(Market).where(Market.status == MarketStatus.OPEN))
                markets = list(rs.scalars().all())
                updates = []
                for m in markets:
                    new_p = _drift(m.current_yes_price)
                    if abs(new_p - m.current_yes_price) > 1e-4:
                        m.current_yes_price = new_p
                        updates.append((m.id, new_p))
                await db.commit()

            for mid, p in updates:
                await broadcast_market_event(mid, {
                    "type": "price", "market_id": mid, "yes": round(p, 6),
                    "no": round(1.0 - p, 6),
                })
        except Exception:  # pragma: no cover
            logger.exception("price engine tick failed")
        await asyncio.sleep(interval)
