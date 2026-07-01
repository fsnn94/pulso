"""Admin-only routes: create/resolve markets, review proposals, cashflow, audit export."""
from __future__ import annotations
import csv
import io
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..config import get_settings
from ..deps import (
    ADMIN_CAPABILITIES, require_cashflow, require_markets, require_proposals,
    require_superadmin, require_users,
)
from ..matching import resolve_market, get_commission_rate, COMMISSION_RATE_KEY
from ..notifications import notify
from ..models import (
    Activity, AmlAlert, AmlMute, AppSetting, Commission, EmailVerification,
    HouseLedger, HouseLedgerKind, Market, MarketDispute, MarketProposal,
    MarketStatus, Order, Position, ProposalStatus, ResolutionProposal, Trade, User,
)
from ..schemas import (
    AdminPermsIn, AdminUserRow, CashflowKpiOut, CommissionRateIn, CommissionRow,
    MarketBase, MarketCreateIn, MarketResolveIn, ProposalOut, ProposalReviewIn,
)
from ..ws import broadcast_market_event

router = APIRouter(prefix="/admin", tags=["admin"])


# ---------- markets ----------

def _normalize_slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")[:64]


async def _gen_market_code(db: AsyncSession, category: str) -> str:
    """Código trackeable <prefijo>-<NNN> (ej. dep-001) a partir de la categoría."""
    prefix = re.sub(r"[^a-z0-9]", "", (category or "").lower())[:3] or "mkt"
    existing = set((await db.execute(
        select(Market.id).where(Market.id.like(f"{prefix}-%"))
    )).scalars().all())
    n = 1
    while f"{prefix}-{n:03d}" in existing:
        n += 1
    return f"{prefix}-{n:03d}"


@router.post("/markets", response_model=MarketBase, status_code=status.HTTP_201_CREATED)
async def create_market(
    payload: MarketCreateIn,
    admin: Annotated[User, Depends(require_markets)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    # ID: si el admin escribió uno, se normaliza; si no, se asigna un código automático.
    override = _normalize_slug(payload.id or "")
    if payload.id and len(override) < 3:
        raise HTTPException(422, "El identificador debe tener al menos 3 caracteres (a-z, 0-9, guiones)")
    market_id = override or await _gen_market_code(db, payload.category)
    if (await db.execute(select(Market).where(Market.id == market_id))).scalar_one_or_none():
        raise HTTPException(409, f"El identificador '{market_id}' ya está en uso")

    cfg = payload.resolution_config or None
    if cfg:
        rtype = cfg.get("type")
        if rtype not in ("manual", "llm_search", "json_api"):
            raise HTTPException(422, "Tipo de resolver inválido")
        if rtype == "manual":
            cfg = None  # manual = sin config
        elif rtype == "json_api" and not cfg.get("url"):
            raise HTTPException(422, "El resolver por API de datos requiere una URL")

    m = Market(
        id=market_id, title=payload.title, short_title=payload.short_title,
        description=payload.description, category=payload.category,
        yes_label=payload.yes_label, no_label=payload.no_label,
        closes_at=payload.closes_at, current_yes_price=payload.initial_yes_price,
        resolution_source=payload.resolution_source, resolution_config=cfg,
        created_by=admin.id, status=MarketStatus.OPEN,
    )
    db.add(m); await db.commit(); await db.refresh(m)
    await broadcast_market_event(m.id, {"type": "created", "market_id": m.id})
    return m


@router.post("/markets/{market_id}/resolve", response_model=MarketBase)
async def resolve(
    market_id: str,
    payload: MarketResolveIn,
    admin: Annotated[User, Depends(require_markets)],
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
    admin: Annotated[User, Depends(require_proposals)],
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
    admin: Annotated[User, Depends(require_proposals)],
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
        category=p.category, yes_label=p.yes_label, no_label=p.no_label,
        closes_at=p.closes_at, current_yes_price=p.initial_yes_price,
        resolution_source=p.resolution_source, created_by=p.submitter_id,
        status=MarketStatus.OPEN,
    )
    db.add(market)
    p.status = ProposalStatus.APPROVED
    p.approved_market_id = market.id
    await notify(
        db, user_id=p.submitter_id, kind="PROPOSAL_APPROVED", market_id=market.id,
        title=f"Tu mercado fue habilitado · {market.short_title}",
        body="Tu propuesta fue aprobada y el mercado ya está abierto para operar.",
    )
    await db.commit(); await db.refresh(p)
    await broadcast_market_event(market.id, {"type": "created", "market_id": market.id})
    await broadcast_market_event(None, {"type": "proposal_reviewed", "id": str(p.id), "decision": "APPROVED", "market_id": market.id})
    return p


# ---------- cashflow ----------

@router.get("/cashflow", response_model=CashflowKpiOut)
async def cashflow(
    admin: Annotated[User, Depends(require_cashflow)],
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

    # ----- Commission wallet (house fee ledger) -----
    commission_total = (await db.execute(
        select(func.coalesce(func.sum(Commission.amount), 0.0))
    )).scalar_one()
    commission_count = (await db.execute(
        select(func.count(Commission.id))
    )).scalar_one()
    commission_period = (await db.execute(
        select(func.coalesce(func.sum(Commission.amount), 0.0)).where(Commission.created_at >= cutoff_period)
    )).scalar_one()
    commission_24h = (await db.execute(
        select(func.coalesce(func.sum(Commission.amount), 0.0)).where(Commission.created_at >= cutoff_24h)
    )).scalar_one()
    comm_mkt_rs = await db.execute(
        select(
            Commission.market_id,
            Market.title,
            func.coalesce(func.sum(Commission.amount), 0.0).label("amount"),
            func.count(Commission.id).label("count"),
        ).outerjoin(Market, Market.id == Commission.market_id)
        .group_by(Commission.market_id, Market.title).order_by(desc("amount")).limit(20)
    )
    commission_by_market = [
        {"market_id": row.market_id, "title": row.title, "amount": float(row.amount), "count": int(row.count)}
        for row in comm_mkt_rs
    ]

    # ----- House ledger (contabilidad de doble entrada de la casa) -----
    house_total = (await db.execute(
        select(func.coalesce(func.sum(HouseLedger.amount), 0.0))
    )).scalar_one()
    house_mm = (await db.execute(
        select(func.coalesce(func.sum(HouseLedger.amount), 0.0))
        .where(HouseLedger.kind != HouseLedgerKind.COMMISSION)
    )).scalar_one()
    house_mkt_rs = await db.execute(
        select(
            HouseLedger.market_id,
            Market.title,
            func.coalesce(func.sum(HouseLedger.amount), 0.0).label("amount"),
        ).outerjoin(Market, Market.id == HouseLedger.market_id)
        .where(HouseLedger.kind != HouseLedgerKind.COMMISSION)
        .group_by(HouseLedger.market_id, Market.title).order_by("amount").limit(20)
    )
    house_by_market = [
        {"market_id": row.market_id, "title": row.title, "amount": float(row.amount)}
        for row in house_mkt_rs
    ]

    return CashflowKpiOut(
        volume_24h=float(vol_24h or 0.0),
        trades_24h=int(trades_24h or 0),
        active_users_24h=int(active_users_24h or 0),
        open_markets=int(open_markets or 0),
        pending_proposals=int(pending or 0),
        unresolved_pnl_house=0.0,
        commission_rate=await get_commission_rate(db),
        commission_total=float(commission_total or 0.0),
        commission_period=float(commission_period or 0.0),
        commission_24h=float(commission_24h or 0.0),
        commission_count=int(commission_count or 0),
        commission_by_market=commission_by_market,
        house_total=float(house_total or 0.0),
        house_mm=float(house_mm or 0.0),
        house_by_market=house_by_market,
        series=series, by_category=by_category,
    )


@router.put("/commission-rate")
async def set_commission_rate(
    payload: CommissionRateIn,
    admin: Annotated[User, Depends(require_cashflow)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    row = await db.get(AppSetting, COMMISSION_RATE_KEY)
    if row is None:
        db.add(AppSetting(key=COMMISSION_RATE_KEY, value=str(payload.rate), updated_by=admin.id))
    else:
        row.value = str(payload.rate)
        row.updated_by = admin.id
    await db.commit()
    return {"ok": True, "commission_rate": payload.rate}


@router.get("/commissions", response_model=list[CommissionRow])
async def list_commissions(
    admin: Annotated[User, Depends(require_cashflow)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(100, ge=1, le=500),
):
    rs = await db.execute(
        select(Commission, User.handle, Market.title)
        .join(User, User.id == Commission.user_id)
        .outerjoin(Market, Market.id == Commission.market_id)
        .order_by(desc(Commission.created_at)).limit(limit)
    )
    return [
        CommissionRow(
            id=c.id, user_id=c.user_id, handle=handle,
            market_id=c.market_id, market_title=title, source=c.source,
            gross_profit=c.gross_profit, rate=c.rate, amount=c.amount, created_at=c.created_at,
        )
        for c, handle, title in rs
    ]


# ---------- user management ----------

@router.get("/users", response_model=list[AdminUserRow])
async def list_users(
    admin: Annotated[User, Depends(require_users)],
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
    admin: Annotated[User, Depends(require_users)],
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
    admin: Annotated[User, Depends(require_cashflow)],
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


@router.post("/users/{user_id}/disable")
async def disable_user(
    user_id: uuid.UUID,
    user: Annotated[User, Depends(require_users)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Disable a user account. The user can no longer log in. Reversible via /enable."""
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(404, "Usuario no encontrado")
    if target.is_admin:
        admin_count = (await db.execute(
            select(func.count()).select_from(User).where(User.is_admin == True)
        )).scalar_one()
        if admin_count <= 1:
            raise HTTPException(409, "No se puede deshabilitar al unico administrador")
    target.disabled = True
    await db.commit()
    return {"ok": True, "disabled": True}


@router.post("/users/{user_id}/enable")
async def enable_user(
    user_id: uuid.UUID,
    user: Annotated[User, Depends(require_users)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Re-enable a previously disabled user account."""
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(404, "Usuario no encontrado")
    target.disabled = False
    await db.commit()
    return {"ok": True, "disabled": False}


@router.post("/users/{user_id}/verify-email")
async def force_verify_email(
    user_id: uuid.UUID,
    user: Annotated[User, Depends(require_users)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Force-mark a user's email as verified (e.g. for testing without real email)."""
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(404, "Usuario no encontrado")
    target.email_verified = True
    target.email_verified_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True, "email_verified": True}


@router.post("/users/{user_id}/reset-cash")
async def reset_user_cash(
    user_id: uuid.UUID,
    user: Annotated[User, Depends(require_users)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Reset a user's cash to the starting credits amount."""
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(404, "Usuario no encontrado")
    s = get_settings()
    target.cash = s.starting_credits
    await db.commit()
    return {"ok": True, "cash": target.cash}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: uuid.UUID,
    user: Annotated[User, Depends(require_users)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Hard-delete a user. Refuses if the user has trade history (data integrity).

    Cleans up all FK references in the right order:
      - Subject references (Activity, Position, Order, AmlAlert, MarketProposal, etc.):
        delete the dependent record.
      - Actor references (Market.created_by, AmlAlert.reviewed_by, MarketProposal.reviewed_by,
        ResolutionProposal.confirmed_by, AmlMute.revoked_by, Trade.seller_id):
        SET NULL (preserve historical record).
      - NOT NULL actor references (AmlMute.muted_by, MarketDispute.user_id):
        delete the dependent record.
    """
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(404, "Usuario no encontrado")
    if target.is_admin:
        admin_count = (await db.execute(
            select(func.count()).select_from(User).where(User.is_admin == True)
        )).scalar_one()
        if admin_count <= 1:
            raise HTTPException(409, "No se puede eliminar al unico administrador")

    # Refuse delete if user has trade history (data integrity — buyer_id is NOT NULL on Trade)
    trade_count = (await db.execute(
        select(func.count()).select_from(Trade)
        .where((Trade.buyer_id == user_id) | (Trade.seller_id == user_id))
    )).scalar_one()
    if trade_count > 0:
        raise HTTPException(409, "El usuario tiene historial de operaciones — usá Deshabilitar en su lugar")

    try:
        # 1. Null out nullable actor references (preserve historical records)
        await db.execute(update(Market).where(Market.created_by == user_id).values(created_by=None))
        await db.execute(update(Trade).where(Trade.seller_id == user_id).values(seller_id=None))
        await db.execute(update(AmlAlert).where(AmlAlert.reviewed_by == user_id).values(reviewed_by=None))
        await db.execute(update(MarketProposal).where(MarketProposal.reviewed_by == user_id).values(reviewed_by=None))
        await db.execute(update(ResolutionProposal).where(ResolutionProposal.confirmed_by == user_id).values(confirmed_by=None))
        await db.execute(update(AmlMute).where(AmlMute.revoked_by == user_id).values(revoked_by=None))

        # 2. Delete subject + NOT NULL actor records
        await db.execute(delete(MarketDispute).where(MarketDispute.user_id == user_id))
        await db.execute(delete(AmlMute).where((AmlMute.user_id == user_id) | (AmlMute.muted_by == user_id)))
        await db.execute(delete(AmlAlert).where(AmlAlert.user_id == user_id))
        await db.execute(delete(MarketProposal).where(MarketProposal.submitter_id == user_id))
        await db.execute(delete(Activity).where(Activity.user_id == user_id))
        await db.execute(delete(Position).where(Position.user_id == user_id))
        await db.execute(delete(Order).where(Order.user_id == user_id))
        await db.execute(delete(EmailVerification).where(EmailVerification.user_id == user_id))

        # 3. Delete the user itself
        await db.delete(target)
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(500, f"Error al eliminar usuario: {type(e).__name__}: {e}")

    return {"ok": True, "deleted": True}


@router.post("/users/{user_id}/promote-admin")
async def promote_admin(
    user_id: uuid.UUID,
    user: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Make a regular user an administrator. Solo el admin principal.
    El nuevo admin arranca SIN capacidades: el superadmin se las habilita luego."""
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(404, "Usuario no encontrado")
    if target.is_admin:
        return {"ok": True, "is_admin": True}
    target.is_admin = True
    target.admin_perms = []   # explícito: sin permisos hasta que el superadmin los otorgue
    await db.commit()
    return {"ok": True, "is_admin": True}


@router.post("/users/{user_id}/revoke-admin")
async def revoke_admin(
    user_id: uuid.UUID,
    user: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Revoke admin status. Solo el admin principal. Refuses if it would leave 0 admins."""
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(404, "Usuario no encontrado")
    if target.is_superadmin:
        raise HTTPException(409, "El admin principal se gestiona por SUPERADMIN_EMAIL, no desde acá")
    if not target.is_admin:
        return {"ok": True, "is_admin": False}
    admin_count = (await db.execute(
        select(func.count()).select_from(User).where(User.is_admin == True)
    )).scalar_one()
    if admin_count <= 1:
        raise HTTPException(409, "No se puede revocar al unico administrador")
    target.is_admin = False
    target.admin_perms = None
    await db.commit()
    return {"ok": True, "is_admin": False}


@router.put("/users/{user_id}/perms", response_model=AdminUserRow)
async def set_admin_perms(
    user_id: uuid.UUID,
    payload: AdminPermsIn,
    user: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Habilita/deshabilita capacidades de un admin. Solo el admin principal."""
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(404, "Usuario no encontrado")
    if not target.is_admin:
        raise HTTPException(400, "El usuario no es administrador")
    if target.is_superadmin:
        raise HTTPException(409, "El admin principal tiene acceso total; no se editan sus permisos")
    invalid = [c for c in payload.perms if c not in ADMIN_CAPABILITIES]
    if invalid:
        raise HTTPException(422, f"Capacidades inválidas: {', '.join(invalid)}")
    # Normaliza: sin duplicados y en el orden canónico.
    target.admin_perms = [c for c in ADMIN_CAPABILITIES if c in payload.perms]
    await db.commit(); await db.refresh(target)
    return target
