"""SQLAlchemy models."""
from __future__ import annotations
from datetime import datetime, timezone
from enum import Enum as PyEnum
import uuid

from sqlalchemy import (
    Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text, Index,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Side(str, PyEnum):
    YES = "YES"
    NO  = "NO"


class OrderType(str, PyEnum):
    MARKET = "MARKET"
    LIMIT  = "LIMIT"


class OrderAction(str, PyEnum):
    BUY  = "BUY"
    SELL = "SELL"


class OrderStatus(str, PyEnum):
    OPEN      = "OPEN"
    FILLED    = "FILLED"
    PARTIAL   = "PARTIAL"
    CANCELLED = "CANCELLED"


class MarketStatus(str, PyEnum):
    OPEN     = "OPEN"      # actively trading
    CLOSED   = "CLOSED"    # past closes_at; trading halted; awaiting resolver
    PROPOSED = "PROPOSED"  # resolver has a tentative outcome; in challenge window
    DISPUTED = "DISPUTED"  # at least one valid user dispute filed
    RESOLVED = "RESOLVED"  # finalized YES/NO; positions paid out
    VOIDED   = "VOIDED"    # finalized as VOID; positions refunded at avg cost


class ResolutionOutcome(str, PyEnum):
    YES  = "YES"
    NO   = "NO"
    VOID = "VOID"          # refund-at-cost; event canceled / ambiguous


class ProposalStatus(str, PyEnum):
    PENDING  = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class ResolutionProposalStatus(str, PyEnum):
    PENDING    = "PENDING"     # within challenge window
    CONFIRMED  = "CONFIRMED"   # finalized (auto or by admin)
    OVERRIDDEN = "OVERRIDDEN"  # admin replaced the proposed outcome before finalizing
    DISPUTED   = "DISPUTED"    # at least one user dispute — needs admin attention


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    handle: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    cash: Mapped[float] = mapped_column(Float, default=10_000.0, nullable=False)
    accepted_research_disclaimer: Mapped[bool] = mapped_column(Boolean, default=False)
    disabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)  # admin can disable accounts

    # Email verification (required to trade)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # KYC / compliance fields (Paraguay: SEPRELAD AML, CNV records, Law 6534/2020 data privacy)
    full_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    country: Mapped[str | None] = mapped_column(String(2), nullable=True)        # ISO 3166-1 alpha-2 (e.g. PY)
    id_number: Mapped[str | None] = mapped_column(String(40), nullable=True)     # cédula / passport
    date_of_birth: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    kyc_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    aml_flag: Mapped[bool] = mapped_column(Boolean, default=False)               # set by ops on suspicious activity
    aml_note: Mapped[str | None] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class EmailVerification(Base):
    __tablename__ = "email_verifications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Market(Base):
    __tablename__ = "markets"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # slug-like ID
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    short_title: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    status: Mapped[MarketStatus] = mapped_column(Enum(MarketStatus), default=MarketStatus.OPEN, index=True)
    closes_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolution_source: Mapped[str] = mapped_column(String(255), default="Official primary source")
    # Declarative resolver config. Shape depends on resolution_config["type"]:
    #   {"type":"manual", "instructions":"..."}                              — admin queue only
    #   {"type":"json_api","url":"...","jsonpath":"$.x","comparator":">=",
    #    "threshold":150000, "window":{"from":"...","to":"..."},
    #    "auto_finalize_hours":24}
    resolution_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    resolved_outcome: Mapped[Side | None] = mapped_column(Enum(Side), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Cached current YES price (0..1) — kept fresh by matching engine + price engine
    current_yes_price: Mapped[float] = mapped_column(Float, default=0.5, nullable=False)
    volume_24h: Mapped[float] = mapped_column(Float, default=0.0)
    liquidity: Mapped[float] = mapped_column(Float, default=0.0)

    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    market_id: Mapped[str] = mapped_column(String(64), ForeignKey("markets.id"), nullable=False, index=True)

    side: Mapped[Side] = mapped_column(Enum(Side), nullable=False)
    action: Mapped[OrderAction] = mapped_column(Enum(OrderAction), nullable=False)
    type: Mapped[OrderType] = mapped_column(Enum(OrderType), nullable=False)
    status: Mapped[OrderStatus] = mapped_column(Enum(OrderStatus), default=OrderStatus.OPEN, index=True)

    limit_price: Mapped[float | None] = mapped_column(Float, nullable=True)  # for LIMIT
    quantity: Mapped[float] = mapped_column(Float, nullable=False)            # shares requested
    filled_quantity: Mapped[float] = mapped_column(Float, default=0.0)
    avg_fill_price: Mapped[float | None] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    __table_args__ = (
        Index("ix_open_orders_market_side", "market_id", "side", "status"),
    )


class Trade(Base):
    __tablename__ = "trades"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    market_id: Mapped[str] = mapped_column(String(64), ForeignKey("markets.id"), nullable=False, index=True)
    buyer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    seller_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    side: Mapped[Side] = mapped_column(Enum(Side), nullable=False)
    price: Mapped[float] = mapped_column(Float, nullable=False)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    buyer_order_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("orders.id"), nullable=True)
    seller_order_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("orders.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)


class Position(Base):
    __tablename__ = "positions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    market_id: Mapped[str] = mapped_column(String(64), ForeignKey("markets.id"), nullable=False, index=True)
    side: Mapped[Side] = mapped_column(Enum(Side), nullable=False)
    shares: Mapped[float] = mapped_column(Float, default=0.0)
    avg_cost: Mapped[float] = mapped_column(Float, default=0.0)  # 0..1
    realized_pnl: Mapped[float] = mapped_column(Float, default=0.0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    __table_args__ = (
        Index("ix_positions_user_market_side", "user_id", "market_id", "side", unique=True),
    )


class Activity(Base):
    __tablename__ = "activity"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    market_id: Mapped[str | None] = mapped_column(String(64), ForeignKey("markets.id"), nullable=True)
    kind: Mapped[str] = mapped_column(String(40), nullable=False)  # ORDER_PLACED, FILL, RESOLVED, ...
    side: Mapped[Side | None] = mapped_column(Enum(Side), nullable=True)
    quantity: Mapped[float | None] = mapped_column(Float, nullable=True)
    price: Mapped[float | None] = mapped_column(Float, nullable=True)
    total: Mapped[float | None] = mapped_column(Float, nullable=True)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)


class AppSetting(Base):
    """Mutable runtime settings editable from the admin UI (e.g. commission rate).
    Key/value for forward-compat; seeded lazily from config defaults."""
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(String(255), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)


class CommissionSource(str, PyEnum):
    CLOSE   = "CLOSE"    # realized by closing a position at a profit (MARKET SELL)
    RESOLVE = "RESOLVE"  # realized by a winning position when the market resolves


class Commission(Base):
    """House fee charged on each realized gain. The admin "wallet" total is the
    sum of `amount` across this ledger — a proper auditable fee ledger rather
    than a magic user balance."""
    __tablename__ = "commissions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    market_id: Mapped[str | None] = mapped_column(String(64), ForeignKey("markets.id"), nullable=True, index=True)
    source: Mapped[CommissionSource] = mapped_column(Enum(CommissionSource), nullable=False)
    gross_profit: Mapped[float] = mapped_column(Float, nullable=False)  # realized gain the fee was computed on
    rate: Mapped[float] = mapped_column(Float, nullable=False)          # e.g. 0.05
    amount: Mapped[float] = mapped_column(Float, nullable=False)        # gross_profit * rate, debited from the user
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)


class AmlSeverity(str, PyEnum):
    INFO    = "INFO"
    LOW     = "LOW"
    MEDIUM  = "MEDIUM"
    HIGH    = "HIGH"
    CRITICAL = "CRITICAL"


class AmlAlertStatus(str, PyEnum):
    OPEN       = "OPEN"
    ACKED      = "ACKED"
    DISMISSED  = "DISMISSED"
    ESCALATED  = "ESCALATED"


class AmlAlert(Base):
    """A single suspicious-activity finding raised by the rules engine."""
    __tablename__ = "aml_alerts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    rule_code: Mapped[str] = mapped_column(String(40), nullable=False, index=True)   # e.g. WASH_TRADE
    severity: Mapped[AmlSeverity] = mapped_column(Enum(AmlSeverity), nullable=False, index=True)
    message: Mapped[str] = mapped_column(String(500), nullable=False)
    evidence: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    market_id: Mapped[str | None] = mapped_column(String(64), ForeignKey("markets.id"), nullable=True)
    status: Mapped[AmlAlertStatus] = mapped_column(Enum(AmlAlertStatus), default=AmlAlertStatus.OPEN, index=True)

    # Dedup key — when a rule re-fires for the same (user, rule, key) within a
    # rolling window we update instead of inserting a duplicate.
    dedup_key: Mapped[str] = mapped_column(String(120), nullable=False, index=True)

    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    __table_args__ = (
        Index("ix_aml_user_rule_dedup", "user_id", "rule_code", "dedup_key", unique=True),
    )


class MarketProposal(Base):
    """A market submitted by any user, awaiting admin review."""
    __tablename__ = "market_proposals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    submitter_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)

    slug: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    short_title: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(80), nullable=False)
    closes_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    initial_yes_price: Mapped[float] = mapped_column(Float, default=0.5)
    resolution_source: Mapped[str] = mapped_column(String(255), default="Official primary source")
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[ProposalStatus] = mapped_column(Enum(ProposalStatus), default=ProposalStatus.PENDING, index=True)
    review_note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_market_id: Mapped[str | None] = mapped_column(String(64), ForeignKey("markets.id"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)


class ResolutionProposal(Base):
    """
    A tentative outcome proposed by the resolver for a CLOSED market.
    Either auto-finalizes after `finalizes_at` (soft window) or stays
    PENDING until an admin confirms/overrides.
    """
    __tablename__ = "resolution_proposals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    market_id: Mapped[str] = mapped_column(String(64), ForeignKey("markets.id"), nullable=False, index=True)

    # Outcome produced by the resolver. None means "the resolver couldn't decide
    # and routed to admin queue" (e.g. manual resolver).
    proposed_outcome: Mapped[ResolutionOutcome | None] = mapped_column(Enum(ResolutionOutcome), nullable=True)

    resolver_code: Mapped[str] = mapped_column(String(40), nullable=False)   # e.g. "manual" | "json_api"
    source_name: Mapped[str] = mapped_column(String(160), nullable=False)
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    evidence: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    proposed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    finalizes_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    status: Mapped[ResolutionProposalStatus] = mapped_column(
        Enum(ResolutionProposalStatus), default=ResolutionProposalStatus.PENDING, index=True,
    )
    dispute_count: Mapped[int] = mapped_column(Integer, default=0)

    confirmed_outcome: Mapped[ResolutionOutcome | None] = mapped_column(Enum(ResolutionOutcome), nullable=True)
    confirmed_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    confirm_note: Mapped[str | None] = mapped_column(String(500), nullable=True)


class MarketDispute(Base):
    """A user-filed dispute against a resolution proposal."""
    __tablename__ = "market_disputes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    proposal_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("resolution_proposals.id"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    reason: Mapped[str] = mapped_column(String(1000), nullable=False)
    evidence_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    __table_args__ = (
        Index("ix_dispute_proposal_user", "proposal_id", "user_id", unique=True),
    )


class AmlMute(Base):
    """
    Admin-issued exception that suppresses one (or all) AML rule(s) for a
    user. Used to silence known-good behavior (e.g. a registered market
    maker who routinely trips VELOCITY) without losing the audit trail.

      rule_code is NULL  → "all rules" for this user
      expires_at is NULL → active until revoked
    """
    __tablename__ = "aml_mutes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    rule_code: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    muted_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    __table_args__ = (
        Index("ix_aml_mute_user_rule", "user_id", "rule_code"),
    )
