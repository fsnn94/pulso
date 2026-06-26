"""Admin-only routes: create/resolve markets, review proposals, cashflow, audit export."""
from __future__ import annotations
import csv
import io
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import require_admin
from ..matching import resolve_market
from ..models import (
    Market, MarketProposal, MarketStatus, ProposalStatus, Trade, User,
)
from ..schemas import (
    AdminUserRow, CashflowKpiOut, MarketBase, MarketCreateIn, MarketResolveIn,
    ProposalOut, ProposalReviewIn,
)
from ..ws import broadcast_market_event

router = APIRouter(prefix="/admin", tags=["admin"])


# ---------- markets ----------

@router.post("/markets", response_model=MarketBase, status_code=status.HTTP_201_CREATED)
async def create_market(
    payload: MarketCreateIn,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if (await db.execute(select(Market).where(Market.id == payload.id))).scalar_one_or_none():
        raise HTTPException(409, "El identificador ya está en uso")
    m = Market(
        id=payload.id, title=payload.title, short_title=payload.short_title,
        description=payload.description, category=payload.category,
        closes_at=payload.closes_at, current_yes_price=payload.initial_yes_price,
        resolution_source=payload.resolution_source, created_by=admin.id,
        status=MarketStatus.OPEN,
    )
    db.add(m); await db.commit(); await db.refresh(m)
    await broadcast_market_event(m.id, {"type": "created", "market_id": m.id})
    return m


@router.post("/markets/{market_id}/resolve", response_model=MarketBase)
async def resolve(
    market_id: str,
    payload: MarketResolveIn,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    m = (await db.execute(select(Market).where(Market.id == market_id))).scalar_one_or_none()
    if not m:
        raise HTTPException(404, "Mercado no encontrado")
    paid = await resolve_market(db, m, payload.outcome)
    await db.commit(); await db.refresh(m)
    await broadcast_market_event(m.id, {
        "type": "resolved", "market_id": m.id, "outcome": payload.outcome.value, "positions_settled": paid,
    })
    return m


# ---------- proposals ----------

@router.get("/proposals", response_model=list[ProposalOut])
async def list_proposals(
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: str | None = Query(None, alias="status", pattern="^(PENDING|APPROVED|REJECTED)$"),
    limit: int = 100,
):
    stmt = select(MarketProposal).order_by(desc(MarketProposal.created_at)).limit(limit)
    if status_filter:
        stmt = stmt.where(MarketProposal.status == ProposalStatus[status_filter])
    rs = await db.execute(stmt)
    return list(rs.scalars().all())


@router.post("/proposals/{proposal_id}/review", response_model=ProposalOut)
async def review_proposal(
    proposal_id: uuid.UUID,
    payload: ProposalReviewIn,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    p = await db.get(MarketProposal, proposal_id)
    if not p:
        raise HTTPException(404, "Propuesta no encontrada")
    if p.status != ProposalStatus.PENDING:
        raise HTTPException(400, f"La propuesta ya está en estado {p.status.value}")

    p.review_note = payload.review_note
    p.reviewed_by = admin.id
    p.reviewed_at = datetime.now(timezone.utc)

    if payload.decision == "REJECTED":
        p.status = ProposalStatus.REJECTED
        await db.commit(); await db.refresh(p)
        await broadcast_market_event(None, {"type": "proposal_reviewed", "id": str(p.id), "decision": "REJECTED"})
        return p

    if (await db.execute(select(Market).where(Market.id == p.slug))).scalar_one_or_none():
        raise HTTPException(409, "Ya existe un mercado con el identificador de la propuesta")

    market = Market(
        id=p.slug, title=p.title, short_title=p.short_title, description=p.description,
        category=p.category, closes_at=p.closes_at, current_yes_price=p.initial_yes_price,
        resolution_source=p.resolution_source, created_by=p.submitter_id,
        status=MarketStatus.OPEN,
    )
    db.add(market)
    p.status = ProposalStatus.APPROVED
    p.approved_market_id = market.id
    await db.commit(); await db.refresh(p)
    await broadcast_market_event(market.id, {"type": "created", "market_id": market.id})
    await broadcast_market_event(None, {"type": "proposal_reviewed", "id": str(p.id), "decision": "APPROVED", "market_id": market.id})
    return p


# ---------- cashflow ----------

@router.get("/cashflow", response_model=CashflowKpiOut)
async def cashflow(
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    days: int = Query(7, ge=1, le=90),
):
    now = datetime.now(timezone.utc)
    cutoff_24h = now - timedelta(hours=24)
    cutoff_period = now - timedelta(days=days)

    vol_24h = (await db.execute(
        select(func.coalesce(func.sum(Trade.price * Trade.quantity), 0.0))
        .where(Trade.created_at >= cutoff_24h)
    )).scalar_one()
    trades_24h = (await db.execute(
        select(func.count(Trade.id)).where(Trade.created_at >= cutoff_24h)
    )).scalar_one()
    active_users_24h = (await db.execute(
        select(func.count(func.distinct(Trade.buyer_id))).where(Trade.created_at >= cutoff_24h)
    )).scalar_one()
    open_markets = (await db.execute(
        select(func.count(Market.id)).where(Market.status == MarketStatus.OPEN)
    )).scalar_one()
    pending = (await db.execute(
        select(func.count(MarketProposal.id)).where(MarketProposal.status == ProposalStatus.PENDING)
    )).scalar_one()

    series_rs = await db.execute(
        select(
            func.date_trunc("day", Trade.created_at).label("day"),
            func.coalesce(func.sum(Trade.price * Trade.quantity), 0.0).label("volume"),
            func.count(Trade.id).label("trades"),
        ).where(Trade.created_at >= cutoff_period).group_by("day").order_by("day")
    )
    series = [{"day": row.day.date().isoformat(), "volume": float(row.volume), "trades": int(row.trades)} for row in series_rs]

    cat_rs = await db.execute(
        select(
            Market.category,
            func.coalesce(func.sum(Trade.price * Trade.quantity), 0.0).label("volume"),
            func.count(Trade.id).label("trades"),
        ).join(Market, Market.id == Trade.market_id)
        .where(Trade.created_at >= cutoff_24h)
        .group_by(Market.category).order_by(desc("volume"))
    )
    by_category = [{"category": row.category, "volume": float(row.volume), "trades": int(row.trades)} for row in cat_rs]

    return CashflowKpiOut(
        volume_24h=float(vol_24h or 0.0),
        trades_24h=int(trades_24h or 0),
        active_users_24h=int(active_users_24h or 0),
        open_markets=int(open_markets or 0),
        pending_proposals=int(pending or 0),
        unresolved_pnl_house=0.0,
        series=series, by_category=by_category,
    )


# ---------- user management ----------

@router.get("/users", response_model=list[AdminUserRow])
async def list_users(
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = 200,
    aml_only: bool = False,
):
    stmt = select(User).order_by(desc(User.created_at)).limit(limit)
    if aml_only:
        stmt = stmt.where(User.aml_flag.is_(True))
    rs = await db.execute(stmt)
    return list(rs.scalars().all())


@router.post("/users/{user_id}/aml")
async def set_aml(
    user_id: uuid.UUID,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    flag: bool = True,
    note: str | None = None,
):
    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(404, "Usuario no encontrado")
    u.aml_flag = flag
    u.aml_note = note
    await db.commit()
    return {"ok": True, "user_id": str(u.id), "aml_flag": flag}


# ---------- audit export ----------

@router.get("/audit/export.csv")
async def audit_export(
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = None,
):
    """Streaming regulator-ready CSV of all trades in [from, to)."""
    from_ = from_ or (datetime.now(timezone.utc) - timedelta(days=30))
    to    = to    or datetime.now(timezone.utc)

    rs = await db.execute(
        select(
            Trade.id, Trade.created_at, Trade.market_id, Trade.side, Trade.price,
            Trade.quantity, Trade.buyer_id,
            User.handle, User.email, User.country, User.full_name, User.id_number, User.aml_flag,
            Market.category, Market.title,
        )
        .join(User, User.id == Trade.buyer_id)
        .join(Market, Market.id == Trade.market_id)
        .where(Trade.created_at >= from_, Trade.created_at < to)
        .order_by(Trade.created_at.asc())
    )

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([
        "trade_id", "ts_utc", "market_id", "market_title", "category",
        "side", "price", "quantity", "notional",
        "user_handle", "user_email", "user_country", "user_full_name", "user_id_number", "aml_flag",
    ])
    for r in rs.all():
        w.writerow([
            str(r.id), r.created_at.isoformat(), r.market_id, r.title, r.category,
            r.side.value, f"{r.price:.4f}", f"{r.quantity:.4f}", f"{r.price * r.quantity:.4f}",
            r.handle, r.email, r.country or "", r.full_name or "", r.id_number or "",
            "Y" if r.aml_flag else "N",
        ])

    buf.seek(0)
    fn = f"audit-{from_.date()}-to-{to.date()}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{fn}"'},
    )
