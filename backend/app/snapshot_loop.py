"""
Background equity-snapshot loop (item #9).

Cada `equity_snapshot_interval_minutes` escribe un punto de patrimonio por
usuario (ver app.equity.take_snapshots) para poder graficar la curva de P&L
por timeframe. Además poda snapshots más viejos que la retención configurada.

Best-effort: solo corre mientras el servicio está arriba; los snapshots no
reconstruyen historia pasada, la curva acumula hacia adelante.
"""
from __future__ import annotations
import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete

from .config import get_settings
from .db import LOCK_SNAPSHOT, advisory_lock, session_scope
from .equity import take_snapshots
from .models import EquitySnapshot

logger = logging.getLogger(__name__)


async def _prune(db, retention_days: int) -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    await db.execute(delete(EquitySnapshot).where(EquitySnapshot.ts < cutoff))


async def snapshot_loop() -> None:
    settings = get_settings()
    interval = max(60, settings.equity_snapshot_interval_minutes * 60)
    logger.info("equity snapshot loop starting (every %dm)", interval // 60)

    while True:
        try:
            async with session_scope() as db:
                async with advisory_lock(db, LOCK_SNAPSHOT) as got:
                    if got:
                        n = await take_snapshots(db)
                        await _prune(db, settings.equity_snapshot_retention_days)
                        await db.commit()
                        logger.debug("equity snapshot: wrote %d rows", n)
        except Exception:  # pragma: no cover
            logger.exception("equity snapshot loop tick failed")
        await asyncio.sleep(interval)
