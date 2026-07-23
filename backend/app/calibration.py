"""Calibración y Brier score de un usuario.

Cada ADQUISICIÓN de contratos es un pronóstico: al comprar `side` a `price`, el
usuario le asigna probabilidad `price` a que ese lado gane (en este motor,
Trade.price = P(lado comprado)). Al resolverse el mercado, el resultado es 1 si
ese lado ganó, 0 si no. El Brier score es el error cuadrático medio entre el
pronóstico y el resultado (0 = perfecto, 0.25 = predecir 50% siempre, 1 = pésimo).

Solo se cuentan las adquisiciones (Trade.seller_id IS NULL); las ventas/cierres
(seller_id = buyer_id) no son pronósticos. Se ponderan por cantidad de contratos.
"""
from __future__ import annotations
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Market, MarketStatus, Trade

N_BINS = 10


async def compute_calibration(db: AsyncSession, user_id: uuid.UUID) -> dict:
    rows = (await db.execute(
        select(Trade.market_id, Trade.side, Trade.price, Trade.quantity, Market.resolved_outcome)
        .join(Market, Market.id == Trade.market_id)
        .where(
            Trade.buyer_id == user_id,
            Trade.seller_id.is_(None),                       # solo adquisiciones (pronósticos)
            Market.status == MarketStatus.RESOLVED,
            Market.resolved_outcome.isnot(None),
        )
    )).all()

    if not rows:
        return {"brier": None, "baseline": 0.25, "forecasts": 0, "markets": 0,
                "total_contracts": 0.0, "bins": []}

    total_w = 0.0
    sq_err = 0.0
    markets: set[str] = set()
    # acumuladores por bin: [Σw, Σ w*f, Σ w*o, n]
    bins = [[0.0, 0.0, 0.0, 0] for _ in range(N_BINS)]

    for market_id, side, price, qty, outcome in rows:
        f = float(price)                       # probabilidad asignada al lado comprado
        o = 1.0 if side == outcome else 0.0    # ganó ese lado?
        w = float(qty)
        total_w += w
        sq_err += w * (f - o) ** 2
        markets.add(market_id)
        idx = min(N_BINS - 1, max(0, int(f * N_BINS)))
        b = bins[idx]
        b[0] += w; b[1] += w * f; b[2] += w * o; b[3] += 1

    out_bins = []
    for i, (bw, bf, bo, bn) in enumerate(bins):
        if bw <= 0:
            continue
        out_bins.append({
            "lo": round(i / N_BINS, 2),
            "hi": round((i + 1) / N_BINS, 2),
            "predicted": bf / bw,
            "actual": bo / bw,
            "weight": bw,
            "n": bn,
        })

    return {
        "brier": sq_err / total_w,
        "baseline": 0.25,
        "forecasts": len(rows),
        "markets": len(markets),
        "total_contracts": total_w,
        "bins": out_bins,
    }
