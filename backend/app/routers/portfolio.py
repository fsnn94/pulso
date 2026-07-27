"""User portfolio + activity."""
from __future__ import annotations
import csv
import io
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from ..calibration import compute_calibration
from ..config import get_settings
from ..db import get_db
from ..deps import get_current_user
from ..equity import compute_user_equity
from ..models import Activity, Commission, EquitySnapshot, Market, Position, User
from ..schemas import (
    ActivityOut, CalibrationOut, EquityHistoryOut, EquityPointOut, PortfolioOut, PositionOut,
)

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


@router.get("/calibration", response_model=CalibrationOut)
async def get_calibration(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Calibración + Brier score del usuario sobre sus mercados ya resueltos."""
    return await compute_calibration(db, user.id)


def _csv_safe(value: str) -> str:
    """Neutraliza la inyección de fórmulas en planillas: una celda que empieza con
    = + - @ (o tab/CR) puede ejecutarse al abrir el CSV en Excel/Sheets."""
    if value and value[0] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + value
    return value


@router.get("/export.csv")
async def export_operations(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Exporta el historial de operaciones del usuario (scopeado a su propia
    cuenta) como CSV descargable."""
    rows = (await db.execute(
        select(Activity, Market.short_title)
        .outerjoin(Market, Market.id == Activity.market_id)
        .where(Activity.user_id == user.id)
        .order_by(Activity.created_at.asc())
    )).all()

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["fecha_utc", "tipo", "mercado", "lado", "cantidad", "precio", "total", "nota"])
    for a, market_title in rows:
        w.writerow([
            a.created_at.isoformat(),
            a.kind,
            _csv_safe(market_title or (a.market_id or "")),
            a.side.value if a.side else "",
            f"{a.quantity:.4f}" if a.quantity is not None else "",
            f"{a.price:.4f}" if a.price is not None else "",
            f"{a.total:.4f}" if a.total is not None else "",
            _csv_safe(a.note or ""),
        ])
    buf.seek(0)
    fn = f"pulso-operaciones-{user.handle}-{datetime.now(timezone.utc).date()}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{fn}"'},
    )


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
    realized = (await db.execute(
        select(func.coalesce(func.sum(Position.realized_pnl), 0.0)).where(Position.user_id == user.id)
    )).scalar_one()
    commissions_paid = (await db.execute(
        select(func.coalesce(func.sum(Commission.amount), 0.0)).where(Commission.user_id == user.id)
    )).scalar_one()
    return PortfolioOut(
        cash=user.cash,
        realized_pnl=float(realized or 0.0),
        commissions_paid=float(commissions_paid or 0.0),
        positions=[PositionOut.model_validate(p) for p in pos_res.scalars().all()],
        activity=[ActivityOut.model_validate(a) for a in act_res.scalars().all()],
    )


# Rangos soportados → ventana (None = all-time)
_RANGES: dict[str, timedelta | None] = {
    "24h": timedelta(hours=24),
    "1w":  timedelta(weeks=1),
    "1m":  timedelta(days=30),
    "1y":  timedelta(days=365),
    "all": None,
}
_MAX_POINTS = 150


def _downsample(rows: list[EquitySnapshot], max_points: int) -> list[EquitySnapshot]:
    """Reduce la serie a <= max_points conservando el primero y el último."""
    n = len(rows)
    if n <= max_points:
        return rows
    step = (n - 1) / (max_points - 1)
    idx = sorted({round(i * step) for i in range(max_points)} | {0, n - 1})
    return [rows[i] for i in idx]


@router.get("/history", response_model=EquityHistoryOut)
async def get_equity_history(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    range: str = Query("all", pattern="^(24h|1w|1m|1y|all)$"),
):
    settings = get_settings()
    starting = float(settings.starting_credits)
    now = datetime.now(timezone.utc)
    delta = _RANGES[range]
    start = None if delta is None else now - delta

    q = select(EquitySnapshot).where(EquitySnapshot.user_id == user.id)
    if start is not None:
        q = q.where(EquitySnapshot.ts >= start)
    q = q.order_by(EquitySnapshot.ts)
    rows = list((await db.execute(q)).scalars().all())
    rows = _downsample(rows, _MAX_POINTS)

    points = [
        EquityPointOut(ts=r.ts, equity=r.equity, cash=r.cash, pnl=r.equity - starting)
        for r in rows
    ]

    # Punto inicial sintético: al crear la cuenta el patrimonio = créditos iniciales.
    # Lo anteponemos cuando la ventana lo cubre y no hay un snapshot anterior.
    created = user.created_at
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    cover_origin = start is None or created >= start
    if cover_origin and (not points or points[0].ts > created):
        points.insert(0, EquityPointOut(ts=created, equity=starting, cash=starting, pnl=0.0))

    # Punta fresca: equity en vivo "ahora" (refleja el drift de precios desde el último snapshot).
    live = await compute_user_equity(db, user)
    points.append(EquityPointOut(ts=now, equity=live.equity, cash=live.cash, pnl=live.equity - starting))

    return EquityHistoryOut(range=range, starting_credits=starting, points=points)
