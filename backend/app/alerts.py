"""Chequeo de alertas de precio. Se llama al actualizarse el precio de un mercado
(tras un trade). Como el precio solo se mueve por órdenes reales, este es el punto
natural para evaluar las alertas — no hace falta un loop aparte."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import AlertDirection, Market, PriceAlert
from .notifications import notify


def _pct(p: float) -> str:
    return f"{round(p * 100)}%"


async def check_price_alerts(db: AsyncSession, market_id: str, yes: float) -> int:
    """Dispara (una vez) las alertas activas cuyo umbral cruzó el precio actual.
    Encola una notificación por cada una y las marca disparadas. NO commitea — el
    llamador es dueño de la transacción. Devuelve cuántas se dispararon."""
    from datetime import datetime, timezone

    alerts = (await db.execute(
        select(PriceAlert).where(PriceAlert.market_id == market_id, PriceAlert.active.is_(True))
    )).scalars().all()
    if not alerts:
        return 0

    title = (await db.execute(select(Market.short_title).where(Market.id == market_id))).scalar_one_or_none() or market_id

    fired = 0
    now = datetime.now(timezone.utc)
    for a in alerts:
        hit = (a.direction == AlertDirection.ABOVE and yes >= a.threshold) or \
              (a.direction == AlertDirection.BELOW and yes <= a.threshold)
        if not hit:
            continue
        a.active = False
        a.triggered_at = now
        arrow = "subió a" if a.direction == AlertDirection.ABOVE else "bajó a"
        await notify(
            db, user_id=a.user_id, kind="PRICE_ALERT",
            title=f"Alerta de precio: {title}",
            body=f"La probabilidad {arrow} {_pct(yes)} (tu alerta era {_pct(a.threshold)}).",
            market_id=market_id,
        )
        fired += 1
    return fired
