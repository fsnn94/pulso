"""
AML (Anti-Money-Laundering) rules engine.

This module is intentionally framework-agnostic: each rule is a small async
function that examines a slice of recent activity and yields zero or more
`AlertFinding` objects. A finding carries a stable `dedup_key` so that
re-firing the same rule for the same situation upserts (severity may be
upgraded) rather than producing duplicate alerts.

Rules implemented:

  * WASH_TRADE          — user holds both YES and NO of the same market.
  * VELOCITY            — many trades or large notional in a short window.
  * NEW_ACCOUNT_RUSH    — fresh account placing large trades.
  * CONCENTRATION       — single user accounts for too much of one market's
                          24h volume.
  * STRUCTURING         — many trades within a tight notional band (potential
                          smurfing pattern; relevant if value ever becomes
                          monetary).
  * RAPID_OPEN_CLOSE    — repeatedly opens and closes positions in minutes.
  * RECIPROCAL_PAIR     — two users repeatedly cross each other (possible
                          ring / collusive wash trading).

Adding a new rule:

    1. Write a coroutine `async def my_rule(db, settings) -> list[AlertFinding]`.
    2. Register it in `ALL_RULES`.
    3. (Optional) Hook it from `evaluate_after_trade()` for synchronous
       detection on each fill.

Severities:
    INFO < LOW < MEDIUM < HIGH < CRITICAL
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable
import uuid

from sqlalchemy import and_, desc, func, select, or_
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .models import (
    AmlAlert, AmlAlertStatus, AmlMute, AmlSeverity, Market, Position, Side, Trade, User,
)

logger = logging.getLogger(__name__)


# ============================================================ data types

@dataclass
class AlertFinding:
    """A single finding emitted by a rule. `dedup_key` makes upserts work."""
    user_id: uuid.UUID
    rule_code: str
    severity: AmlSeverity
    message: str
    evidence: dict[str, Any] = field(default_factory=dict)
    market_id: str | None = None
    dedup_key: str = ""

    def ensure_dedup(self) -> None:
        if not self.dedup_key:
            self.dedup_key = f"{self.rule_code}:{self.user_id}:{self.market_id or 'global'}"


# ============================================================ persistence

async def _active_mutes_for(db: AsyncSession, user_ids: set[uuid.UUID]) -> dict[uuid.UUID, set[str | None]]:
    """
    Return {user_id: {rule_code_or_None, ...}} of currently-active mutes.

    `None` in the set means "all rules muted for this user".
    A mute is active when revoked_at IS NULL and (expires_at IS NULL OR expires_at > now).
    """
    from sqlalchemy import or_
    if not user_ids:
        return {}
    now = datetime.now(timezone.utc)
    rs = await db.execute(
        select(AmlMute.user_id, AmlMute.rule_code).where(
            AmlMute.user_id.in_(list(user_ids)),
            AmlMute.revoked_at.is_(None),
            or_(AmlMute.expires_at.is_(None), AmlMute.expires_at > now),
        )
    )
    out: dict[uuid.UUID, set[str | None]] = {}
    for uid, code in rs:
        out.setdefault(uid, set()).add(code)
    return out


async def persist_findings(db: AsyncSession, findings: list[AlertFinding]) -> list[AmlAlert]:
    """
    Upsert findings into `aml_alerts` keyed by (user_id, rule_code, dedup_key).

    Findings for (user, rule) covered by an active AmlMute are dropped — we
    log at INFO so the audit trail still reflects that an alert was suppressed.
    """
    if not findings:
        return []
    mutes = await _active_mutes_for(db, {f.user_id for f in findings})
    out: list[AmlAlert] = []
    now = datetime.now(timezone.utc)
    for f in findings:
        f.ensure_dedup()

        muted_codes = mutes.get(f.user_id)
        if muted_codes is not None and (None in muted_codes or f.rule_code in muted_codes):
            logger.info("AML finding suppressed by mute: user=%s rule=%s", f.user_id, f.rule_code)
            continue

        existing_q = await db.execute(
            select(AmlAlert).where(
                AmlAlert.user_id == f.user_id,
                AmlAlert.rule_code == f.rule_code,
                AmlAlert.dedup_key == f.dedup_key,
            )
        )
        existing = existing_q.scalar_one_or_none()
        if existing is None:
            a = AmlAlert(
                user_id=f.user_id, rule_code=f.rule_code, severity=f.severity,
                message=f.message, evidence=f.evidence, market_id=f.market_id,
                dedup_key=f.dedup_key, status=AmlAlertStatus.OPEN,
            )
            db.add(a)
            out.append(a)
        else:
            # Re-fire: refresh evidence/timestamp; bump severity if higher.
            severities = [AmlSeverity.INFO, AmlSeverity.LOW, AmlSeverity.MEDIUM, AmlSeverity.HIGH, AmlSeverity.CRITICAL]
            cur_i = severities.index(existing.severity)
            new_i = severities.index(f.severity)
            if new_i > cur_i:
                existing.severity = f.severity
            existing.evidence = f.evidence
            existing.message = f.message
            existing.updated_at = now
            # If the operator had already reviewed it but the situation re-fires
            # later, reopen it.
            if existing.status in (AmlAlertStatus.ACKED, AmlAlertStatus.DISMISSED):
                existing.status = AmlAlertStatus.OPEN
            out.append(existing)
    return out


# ============================================================ rules

async def rule_wash_trade(db: AsyncSession, settings) -> list[AlertFinding]:
    """User holds both YES and NO shares in the same market simultaneously."""
    pos_rs = await db.execute(
        select(Position.user_id, Position.market_id, Position.side, Position.shares)
        .where(Position.shares > 0)
    )
    holdings: dict[tuple[uuid.UUID, str], dict[Side, float]] = {}
    for uid, mid, side, shares in pos_rs:
        d = holdings.setdefault((uid, mid), {})
        d[side] = d.get(side, 0.0) + float(shares)

    out: list[AlertFinding] = []
    for (uid, mid), sides in holdings.items():
        yes = sides.get(Side.YES, 0.0)
        no  = sides.get(Side.NO,  0.0)
        if yes > 0 and no > 0:
            paired = min(yes, no)
            out.append(AlertFinding(
                user_id=uid, rule_code="WASH_TRADE",
                severity=AmlSeverity.HIGH if paired >= 50 else AmlSeverity.MEDIUM,
                market_id=mid,
                message=(
                    f"Holds both YES ({yes:.2f} sh) and NO ({no:.2f} sh) in the same market — "
                    f"net economic position is roughly flat (paired={paired:.2f})."
                ),
                evidence={"yes_shares": yes, "no_shares": no, "paired_shares": paired},
                dedup_key=f"WASH:{uid}:{mid}",
            ))
    return out


async def rule_velocity(db: AsyncSession, settings) -> list[AlertFinding]:
    """Many trades or large notional in a short window."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=settings.aml_velocity_window_minutes)
    rs = await db.execute(
        select(
            Trade.buyer_id,
            func.count(Trade.id).label("n"),
            func.coalesce(func.sum(Trade.price * Trade.quantity), 0.0).label("notional"),
        )
        .where(Trade.created_at >= cutoff)
        .group_by(Trade.buyer_id)
    )
    out: list[AlertFinding] = []
    for row in rs:
        n = int(row.n or 0); notional = float(row.notional or 0.0)
        if n > settings.aml_velocity_trade_count_threshold or notional > settings.aml_velocity_notional_threshold:
            severity = (
                AmlSeverity.HIGH if (
                    n > settings.aml_velocity_trade_count_threshold * 2 or
                    notional > settings.aml_velocity_notional_threshold * 2
                ) else AmlSeverity.MEDIUM
            )
            out.append(AlertFinding(
                user_id=row.buyer_id, rule_code="VELOCITY", severity=severity,
                message=(
                    f"Elevated trading velocity: {n} trades and ${notional:,.0f} notional "
                    f"in the last {settings.aml_velocity_window_minutes} minutes."
                ),
                evidence={
                    "window_minutes": settings.aml_velocity_window_minutes,
                    "trade_count": n, "notional": notional,
                    "thresholds": {
                        "trade_count": settings.aml_velocity_trade_count_threshold,
                        "notional": settings.aml_velocity_notional_threshold,
                    },
                },
                # bucket so the same user re-firing within the window doesn't spam
                dedup_key=f"VELOCITY:{row.buyer_id}:{cutoff.strftime('%Y%m%d%H%M')[:11]}",
            ))
    return out


async def rule_new_account_rush(db: AsyncSession, settings) -> list[AlertFinding]:
    """Fresh accounts placing large trades."""
    fresh_cutoff = datetime.now(timezone.utc) - timedelta(hours=settings.aml_new_account_hours)
    rs = await db.execute(
        select(User.id, User.handle, User.created_at,
               func.coalesce(func.sum(Trade.price * Trade.quantity), 0.0).label("notional"),
               func.count(Trade.id).label("n"))
        .join(Trade, Trade.buyer_id == User.id)
        .where(User.created_at >= fresh_cutoff)
        .group_by(User.id, User.handle, User.created_at)
    )
    out: list[AlertFinding] = []
    for row in rs:
        if float(row.notional) > settings.aml_new_account_notional_threshold:
            out.append(AlertFinding(
                user_id=row.id, rule_code="NEW_ACCOUNT_RUSH",
                severity=AmlSeverity.HIGH,
                message=(
                    f"Account is less than {settings.aml_new_account_hours}h old "
                    f"and has already traded ${float(row.notional):,.0f} across {int(row.n)} trades."
                ),
                evidence={
                    "account_age_hours": settings.aml_new_account_hours,
                    "notional": float(row.notional),
                    "trade_count": int(row.n),
                    "handle": row.handle,
                },
                dedup_key=f"NEW_RUSH:{row.id}",
            ))
    return out


async def rule_concentration(db: AsyncSession, settings) -> list[AlertFinding]:
    """Single user accounts for too large a share of a market's 24h volume."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)

    total_per_market = dict(
        (mid, float(v)) for mid, v in (await db.execute(
            select(Trade.market_id, func.sum(Trade.price * Trade.quantity))
            .where(Trade.created_at >= cutoff)
            .group_by(Trade.market_id)
        ))
    )

    per_user_market = await db.execute(
        select(
            Trade.market_id, Trade.buyer_id,
            func.sum(Trade.price * Trade.quantity).label("notional"),
        )
        .where(Trade.created_at >= cutoff)
        .group_by(Trade.market_id, Trade.buyer_id)
    )
    out: list[AlertFinding] = []
    for row in per_user_market:
        total = total_per_market.get(row.market_id, 0.0)
        if total < settings.aml_concentration_min_market_volume:
            continue
        share = float(row.notional or 0.0) / total if total > 0 else 0.0
        if share >= settings.aml_concentration_pct:
            severity = AmlSeverity.CRITICAL if share >= 0.75 else AmlSeverity.HIGH
            out.append(AlertFinding(
                user_id=row.buyer_id, rule_code="CONCENTRATION", severity=severity,
                market_id=row.market_id,
                message=f"Account is {share*100:.0f}% of this market's 24h volume.",
                evidence={
                    "share": share, "user_notional": float(row.notional),
                    "market_notional_24h": total,
                    "threshold_pct": settings.aml_concentration_pct,
                },
                dedup_key=f"CONC:{row.buyer_id}:{row.market_id}",
            ))
    return out


async def rule_structuring(db: AsyncSession, settings) -> list[AlertFinding]:
    """Many trades clustered in a tight notional band (smurfing pattern)."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=settings.aml_structuring_window_hours)
    rs = await db.execute(
        select(Trade.buyer_id, Trade.price, Trade.quantity)
        .where(Trade.created_at >= cutoff)
    )
    per_user: dict[uuid.UUID, list[float]] = {}
    for uid, price, qty in rs:
        per_user.setdefault(uid, []).append(float(price) * float(qty))

    out: list[AlertFinding] = []
    for uid, sizes in per_user.items():
        if len(sizes) < settings.aml_structuring_trade_count:
            continue
        # are all sizes within a tight band?
        lo, hi = min(sizes), max(sizes)
        if (hi - lo) <= settings.aml_structuring_notional_band:
            out.append(AlertFinding(
                user_id=uid, rule_code="STRUCTURING", severity=AmlSeverity.MEDIUM,
                message=(
                    f"{len(sizes)} trades within a ${(hi-lo):.0f} band over the last "
                    f"{settings.aml_structuring_window_hours}h (avg ${sum(sizes)/len(sizes):.0f})."
                ),
                evidence={
                    "trade_count": len(sizes),
                    "min_notional": lo, "max_notional": hi,
                    "mean_notional": sum(sizes) / len(sizes),
                    "band_width": hi - lo,
                    "band_threshold": settings.aml_structuring_notional_band,
                },
                dedup_key=f"STRUCT:{uid}",
            ))
    return out


async def rule_rapid_open_close(db: AsyncSession, settings) -> list[AlertFinding]:
    """User has both opened (BUY) and closed (SELL) the same side in a short window."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=2)
    rs = await db.execute(
        select(Trade.buyer_id, Trade.seller_id, Trade.market_id, Trade.side)
        .where(Trade.created_at >= cutoff)
    )
    paired: dict[tuple[uuid.UUID, str, Side], dict[str, int]] = {}
    for buyer, seller, mid, side in rs:
        if buyer == seller and seller is not None:
            d = paired.setdefault((buyer, mid, side), {"buys": 0, "sells": 0})
            d["sells"] += 1
        elif seller == buyer:
            continue
        else:
            d = paired.setdefault((buyer, mid, side), {"buys": 0, "sells": 0})
            d["buys"] += 1

    # also tally sells separately by seller_id == buyer_id (close pos)
    sell_rs = await db.execute(
        select(Trade.seller_id, Trade.market_id, Trade.side, func.count(Trade.id))
        .where(Trade.created_at >= cutoff, Trade.seller_id.is_not(None), Trade.seller_id == Trade.buyer_id)
        .group_by(Trade.seller_id, Trade.market_id, Trade.side)
    )
    for sid, mid, side, n in sell_rs:
        paired.setdefault((sid, mid, side), {"buys": 0, "sells": 0})["sells"] = int(n)

    out: list[AlertFinding] = []
    for (uid, mid, side), d in paired.items():
        if d["buys"] >= 3 and d["sells"] >= 3:
            out.append(AlertFinding(
                user_id=uid, rule_code="RAPID_OPEN_CLOSE",
                severity=AmlSeverity.MEDIUM, market_id=mid,
                message=(
                    f"{d['buys']} opens and {d['sells']} closes of {side.value} in this market within 2h."
                ),
                evidence={"buys": d["buys"], "sells": d["sells"], "side": side.value},
                dedup_key=f"RAPIDOC:{uid}:{mid}:{side.value}",
            ))
    return out


async def rule_reciprocal_pair(db: AsyncSession, settings) -> list[AlertFinding]:
    """
    Two users appear on opposite sides of many trades in 24h — possible
    collusive wash trading ring. The cross-matched maker/taker relationship
    is what we look at.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    rs = await db.execute(
        select(Trade.buyer_id, Trade.seller_id, Trade.market_id)
        .where(Trade.created_at >= cutoff, Trade.seller_id.is_not(None),
               Trade.buyer_id != Trade.seller_id)
    )
    pairs: dict[tuple[uuid.UUID, uuid.UUID], int] = {}
    for b, s, _mid in rs:
        if b is None or s is None: continue
        key = tuple(sorted([b, s], key=str))
        pairs[key] = pairs.get(key, 0) + 1
    out: list[AlertFinding] = []
    for (a, b), n in pairs.items():
        if n >= settings.aml_reciprocal_pair_min_trades:
            for who in (a, b):
                other = b if who == a else a
                out.append(AlertFinding(
                    user_id=who, rule_code="RECIPROCAL_PAIR",
                    severity=AmlSeverity.HIGH,
                    message=f"User has crossed {n} trades against the same counterparty in 24h.",
                    evidence={"counterparty_id": str(other), "trade_count": n},
                    dedup_key=f"RECIP:{who}:{other}",
                ))
    return out


# ============================================================ orchestration

Rule = Callable[[AsyncSession, Any], Awaitable[list[AlertFinding]]]

ALL_RULES: list[tuple[str, Rule]] = [
    ("WASH_TRADE",       rule_wash_trade),
    ("VELOCITY",         rule_velocity),
    ("NEW_ACCOUNT_RUSH", rule_new_account_rush),
    ("CONCENTRATION",    rule_concentration),
    ("STRUCTURING",      rule_structuring),
    ("RAPID_OPEN_CLOSE", rule_rapid_open_close),
    ("RECIPROCAL_PAIR",  rule_reciprocal_pair),
]


async def run_all_rules(db: AsyncSession) -> list[AmlAlert]:
    """Run every rule once and persist findings. Returns newly-affected alerts."""
    settings = get_settings()
    all_findings: list[AlertFinding] = []
    for code, fn in ALL_RULES:
        try:
            findings = await fn(db, settings)
            if findings:
                logger.info("AML rule %s produced %d findings", code, len(findings))
            all_findings.extend(findings)
        except Exception:  # pragma: no cover
            logger.exception("AML rule %s failed", code)
    alerts = await persist_findings(db, all_findings)
    await db.commit()
    return alerts


async def evaluate_after_trade(db: AsyncSession, user_id: uuid.UUID, market_id: str) -> list[AmlAlert]:
    """
    Fast, targeted checks to run synchronously after a fill: wash-trade and
    velocity for the specific user. Cheap enough to live in the request path.
    """
    settings = get_settings()
    findings: list[AlertFinding] = []

    # Wash check (this user, this market)
    pos_rs = await db.execute(
        select(Position.side, Position.shares).where(
            Position.user_id == user_id, Position.market_id == market_id, Position.shares > 0,
        )
    )
    sides = {s: float(q) for s, q in pos_rs}
    yes, no = sides.get(Side.YES, 0.0), sides.get(Side.NO, 0.0)
    if yes > 0 and no > 0:
        paired = min(yes, no)
        findings.append(AlertFinding(
            user_id=user_id, rule_code="WASH_TRADE",
            severity=AmlSeverity.HIGH if paired >= 50 else AmlSeverity.MEDIUM,
            market_id=market_id,
            message=(
                f"Holds both YES ({yes:.2f}) and NO ({no:.2f}) in the same market "
                f"after a recent fill — paired={paired:.2f}."
            ),
            evidence={"yes_shares": yes, "no_shares": no, "paired_shares": paired},
            dedup_key=f"WASH:{user_id}:{market_id}",
        ))

    # Velocity (this user, last hour)
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=settings.aml_velocity_window_minutes)
    row = (await db.execute(
        select(
            func.count(Trade.id),
            func.coalesce(func.sum(Trade.price * Trade.quantity), 0.0),
        ).where(Trade.buyer_id == user_id, Trade.created_at >= cutoff)
    )).first()
    if row:
        n = int(row[0] or 0); notional = float(row[1] or 0.0)
        if n > settings.aml_velocity_trade_count_threshold or notional > settings.aml_velocity_notional_threshold:
            findings.append(AlertFinding(
                user_id=user_id, rule_code="VELOCITY",
                severity=AmlSeverity.MEDIUM,
                message=f"{n} trades / ${notional:,.0f} in the last {settings.aml_velocity_window_minutes}m.",
                evidence={"trade_count": n, "notional": notional,
                          "window_minutes": settings.aml_velocity_window_minutes},
                dedup_key=f"VELOCITY:{user_id}:{cutoff.strftime('%Y%m%d%H%M')[:11]}",
            ))

    alerts = await persist_findings(db, findings)
    return alerts
