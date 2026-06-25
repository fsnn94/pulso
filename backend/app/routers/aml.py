"""Admin AML endpoints (split out from admin router to keep files small)."""
from __future__ import annotations
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..aml import run_all_rules
from ..db import get_db
from ..deps import require_admin
from ..models import AmlAlert, AmlAlertStatus, AmlSeverity, User
from ..schemas import AmlAlertOut, AmlAlertReviewIn, AmlSummary
from ..ws import broadcast_market_event

router = APIRouter(prefix="/admin/aml", tags=["aml"])


@router.get("/summary", response_model=AmlSummary)
async def aml_summary(
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    open_count = int((await db.execute(
        select(func.count(AmlAlert.id)).where(AmlAlert.status == AmlAlertStatus.OPEN)
    )).scalar_one() or 0)

    by_sev = {s.value: int(n) for s, n in (await db.execute(
        select(AmlAlert.severity, func.count(AmlAlert.id))
        .where(AmlAlert.status == AmlAlertStatus.OPEN).group_by(AmlAlert.severity)
    ))}
    by_rule = {c: int(n) for c, n in (await db.execute(
        select(AmlAlert.rule_code, func.count(AmlAlert.id))
        .where(AmlAlert.status == AmlAlertStatus.OPEN).group_by(AmlAlert.rule_code)
    ))}
    recent = [AmlAlertOut.model_validate(a) for a in (await db.execute(
        select(AmlAlert).order_by(desc(AmlAlert.updated_at)).limit(20)
    )).scalars().all()]
    return AmlSummary(open_count=open_count, by_severity=by_sev, by_rule=by_rule, recent=recent)


@router.get("/alerts", response_model=list[AmlAlertOut])
async def list_alerts(
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: str | None = Query(None, alias="status",
                                       pattern="^(OPEN|ACKED|DISMISSED|ESCALATED)$"),
    severity: str | None = Query(None, pattern="^(INFO|LOW|MEDIUM|HIGH|CRITICAL)$"),
    rule: str | None = None,
    user_id: uuid.UUID | None = None,
    limit: int = 200,
):
    stmt = select(AmlAlert).order_by(desc(AmlAlert.updated_at)).limit(limit)
    if status_filter: stmt = stmt.where(AmlAlert.status   == AmlAlertStatus[status_filter])
    if severity:      stmt = stmt.where(AmlAlert.severity == AmlSeverity[severity])
    if rule:          stmt = stmt.where(AmlAlert.rule_code == rule)
    if user_id:       stmt = stmt.where(AmlAlert.user_id  == user_id)
    rs = await db.execute(stmt)
    return list(rs.scalars().all())


@router.post("/alerts/{alert_id}/review", response_model=AmlAlertOut)
async def review_alert(
    alert_id: uuid.UUID,
    payload: AmlAlertReviewIn,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    a = await db.get(AmlAlert, alert_id)
    if not a:
        raise HTTPException(404, "Alert not found")
    a.status = {
        "ACK":      AmlAlertStatus.ACKED,
        "DISMISS":  AmlAlertStatus.DISMISSED,
        "ESCALATE": AmlAlertStatus.ESCALATED,
    }[payload.action]
    a.review_note = payload.note
    a.reviewed_by = admin.id
    a.reviewed_at = datetime.now(timezone.utc)
    if a.status == AmlAlertStatus.ESCALATED:
        u = await db.get(User, a.user_id)
        if u:
            u.aml_flag = True
            u.aml_note = (u.aml_note or "") + (
                f"\n[{datetime.now(timezone.utc).isoformat()}] Escalated: {a.rule_code}"
            )
    await db.commit()
    await db.refresh(a)
    return a


@router.post("/scan")
async def trigger_scan(
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Run all AML rules on demand."""
    alerts = await run_all_rules(db)
    open_alerts = [a for a in alerts if a.status == AmlAlertStatus.OPEN]
    by_rule: dict[str, int] = {}
    for a in open_alerts:
        by_rule[a.rule_code] = by_rule.get(a.rule_code, 0) + 1
    await broadcast_market_event(None, {
        "type": "aml_scan_complete", "open_alert_count": len(open_alerts), "by_rule": by_rule,
    })
    return {"ok": True, "affected": len(alerts), "open": len(open_alerts)}


# =========================================================== mutes

from datetime import datetime, timedelta, timezone
from sqlalchemy import or_
from ..models import Activity, AmlMute
from ..schemas import AmlMuteIn, AmlMuteOut


@router.get("/mutes", response_model=list[AmlMuteOut])
async def list_mutes(
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    active_only: bool = True,
    limit: int = 200,
):
    stmt = select(AmlMute).order_by(desc(AmlMute.created_at)).limit(limit)
    if active_only:
        now = datetime.now(timezone.utc)
        stmt = stmt.where(
            AmlMute.revoked_at.is_(None),
            or_(AmlMute.expires_at.is_(None), AmlMute.expires_at > now),
        )
    rs = await db.execute(stmt)
    return list(rs.scalars().all())


@router.post("/mutes", response_model=AmlMuteOut)
async def create_mute(
    payload: AmlMuteIn,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    # Block stacking: revoke any matching active mute first.
    now = datetime.now(timezone.utc)
    existing = await db.execute(
        select(AmlMute).where(
            AmlMute.user_id == payload.user_id,
            AmlMute.rule_code == payload.rule_code,
            AmlMute.revoked_at.is_(None),
            or_(AmlMute.expires_at.is_(None), AmlMute.expires_at > now),
        )
    )
    for prior in existing.scalars().all():
        prior.revoked_at = now
        prior.revoked_by = admin.id

    expires_at = None
    if payload.duration_hours is not None:
        expires_at = now + timedelta(hours=payload.duration_hours)

    mute = AmlMute(
        user_id=payload.user_id,
        rule_code=payload.rule_code,
        reason=payload.reason.strip(),
        expires_at=expires_at,
        muted_by=admin.id,
    )
    db.add(mute)

    # Audit trail (visible in /admin/audit/export.csv via Activity table).
    db.add(Activity(
        user_id=payload.user_id, kind="AML_MUTED",
        note=(f"Rule {payload.rule_code or 'ALL'} muted until "
              f"{expires_at.isoformat() if expires_at else 'revoked'} by {admin.handle}: {payload.reason}"),
    ))
    await db.commit()
    await db.refresh(mute)

    await broadcast_market_event(None, {
        "type": "aml_mute_created", "user_id": str(payload.user_id),
        "rule_code": payload.rule_code, "expires_at": expires_at.isoformat() if expires_at else None,
    })
    return mute


@router.delete("/mutes/{mute_id}", response_model=AmlMuteOut)
async def revoke_mute(
    mute_id: uuid.UUID,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    m = await db.get(AmlMute, mute_id)
    if not m:
        raise HTTPException(404, "Mute not found")
    if m.revoked_at is not None:
        raise HTTPException(400, "Already revoked")
    m.revoked_at = datetime.now(timezone.utc)
    m.revoked_by = admin.id

    db.add(Activity(
        user_id=m.user_id, kind="AML_MUTE_REVOKED",
        note=f"Rule {m.rule_code or 'ALL'} mute revoked by {admin.handle}",
    ))
    await db.commit()
    await db.refresh(m)
    await broadcast_market_event(None, {
        "type": "aml_mute_revoked", "user_id": str(m.user_id), "rule_code": m.rule_code,
    })
    return m
