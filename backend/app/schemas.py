"""Pydantic schemas for the API."""
from __future__ import annotations
from datetime import datetime
from typing import Literal, Optional
import uuid

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from .models import (
    AmlAlertStatus, AmlSeverity, CommissionSource, OrderAction, OrderStatus, OrderType,
    ResolutionOutcome, ResolutionProposalStatus, Side, MarketStatus, ProposalStatus,
)


# ---------- Auth ----------
class RegisterIn(BaseModel):
    email: EmailStr
    handle: str = Field(min_length=2, max_length=40)
    password: str = Field(min_length=6, max_length=128)
    accepted_disclaimer: bool


class LoginIn(BaseModel):
    email: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    verification_link: str | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    email: str
    handle: str
    is_admin: bool
    is_superadmin: bool = False
    admin_perms: list[str] | None = None   # None = admin legado / superadmin (acceso total)
    cash: float
    email_verified: bool
    full_name: str | None = None
    country: str | None = None
    kyc_completed_at: datetime | None = None


class VerifyIn(BaseModel):
    token: str


class ChangePasswordIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=6, max_length=128)


class ChangeHandleIn(BaseModel):
    handle: str = Field(min_length=2, max_length=40)


class KycIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=160)
    country: str = Field(min_length=2, max_length=2)
    id_number: str = Field(min_length=3, max_length=40)
    date_of_birth: datetime


# ---------- Markets ----------
class MarketBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    title: str
    short_title: str
    description: str
    category: str
    yes_label: str = "Sí"
    no_label: str = "No"
    status: MarketStatus
    closes_at: datetime
    closed_at: datetime | None = None
    current_yes_price: float
    volume_24h: float
    liquidity: float
    resolution_source: str
    resolution_config: dict | None = None
    resolved_outcome: Side | None = None
    resolved_at: datetime | None = None


class MarketsOut(BaseModel):
    items: list[MarketBase]


class MarketCreateIn(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9-]{3,64}$")
    title: str = Field(max_length=500)
    short_title: str = Field(max_length=160)
    description: str
    category: str = Field(max_length=80)
    yes_label: str = Field(max_length=40, default="Sí")
    no_label: str = Field(max_length=40, default="No")
    closes_at: datetime
    initial_yes_price: float = Field(ge=0.02, le=0.98, default=0.5)
    resolution_source: str = "Official primary source"


class MarketResolveIn(BaseModel):
    outcome: Side


# ---------- Orders ----------
class OrderIn(BaseModel):
    market_id: str
    side: Side
    action: OrderAction = OrderAction.BUY
    type: OrderType = OrderType.MARKET
    quantity: float = Field(gt=0)
    limit_price: Optional[float] = Field(default=None, ge=0.01, le=0.99)


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    market_id: str
    side: Side
    action: OrderAction
    type: OrderType
    status: OrderStatus
    quantity: float
    filled_quantity: float
    avg_fill_price: Optional[float]
    limit_price: Optional[float]
    created_at: datetime


class TradeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    market_id: str
    side: Side
    price: float
    quantity: float
    created_at: datetime
    handle: str | None = None  # handle del trader (comprador), para linkear a su perfil


# ---------- Notifications (item #8) ----------
class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    kind: str
    title: str
    body: str
    market_id: str | None
    read_at: datetime | None
    created_at: datetime


# ---------- Public profiles (item #7) ----------
class PublicProfileOut(BaseModel):
    """Perfil público de un usuario: sin email ni datos KYC, solo handle + P&L."""
    handle: str
    created_at: datetime
    realized_pnl: float       # neto de comisiones, sobre todas las posiciones (incl. cerradas)
    unrealized_pnl: float     # posiciones abiertas valuadas a precio actual
    open_positions: int       # cantidad de posiciones abiertas
    markets_traded: int       # mercados distintos en los que operó
    trades_count: int         # cantidad de operaciones ejecutadas
    total_volume: float       # nocional operado (precio * cantidad)


class PublicTradeOut(BaseModel):
    """Una operación pública de un usuario, con título del mercado para mostrar."""
    id: uuid.UUID
    market_id: str
    market_short_title: str | None
    market_status: MarketStatus | None
    side: Side
    price: float
    quantity: float
    created_at: datetime


# ---------- Portfolio ----------
class PositionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    market_id: str
    side: Side
    shares: float
    avg_cost: float
    realized_pnl: float


class ActivityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    market_id: str | None
    kind: str
    side: Side | None
    quantity: float | None
    price: float | None
    total: float | None
    note: str | None
    created_at: datetime


class PortfolioOut(BaseModel):
    cash: float
    realized_pnl: float       # net of commission, across all positions (incl. closed)
    commissions_paid: float   # total house fees this user has paid
    positions: list[PositionOut]
    activity: list[ActivityOut]


# ---------- Equity history (item #9) ----------
class EquityPointOut(BaseModel):
    ts: datetime
    equity: float
    cash: float
    pnl: float                # equity - starting_credits


class EquityHistoryOut(BaseModel):
    range: str                # 24h | 1w | 1m | 1y | all
    starting_credits: float   # baseline (créditos iniciales) para calcular el P&L
    points: list[EquityPointOut]


# ---------- News (item #10) ----------
class HeadlineOut(BaseModel):
    title: str
    source: str
    url: str
    image: str | None = None
    published_at: str | None = None
    description: str | None = None
    category: str


class NewsCategoryOut(BaseModel):
    key: str        # "all" | "Economics" | ...
    label: str      # etiqueta para la UI


class NewsOut(BaseModel):
    enabled: bool
    category: str
    categories: list[NewsCategoryOut]
    headlines: list[HeadlineOut]


# ---------- Proposals ----------
class ProposalIn(BaseModel):
    slug: str = Field(pattern=r"^[a-z0-9-]{3,64}$")
    title: str = Field(max_length=500)
    short_title: str = Field(max_length=160)
    description: str
    category: str = Field(max_length=80)
    yes_label: str = Field(max_length=40, default="Sí")
    no_label: str = Field(max_length=40, default="No")
    closes_at: datetime
    initial_yes_price: float = Field(ge=0.02, le=0.98, default=0.5)
    resolution_source: str = "Official primary source"
    rationale: str | None = None


class ProposalReviewIn(BaseModel):
    decision: Literal["APPROVED", "REJECTED"]
    review_note: str | None = None


class ProposalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    submitter_id: uuid.UUID
    slug: str
    title: str
    short_title: str
    description: str
    category: str
    yes_label: str = "Sí"
    no_label: str = "No"
    closes_at: datetime
    initial_yes_price: float
    resolution_source: str
    rationale: str | None
    status: ProposalStatus
    review_note: str | None
    reviewed_at: datetime | None
    approved_market_id: str | None
    created_at: datetime


# ---------- Admin / cashflow ----------
class CashflowKpiOut(BaseModel):
    volume_24h: float
    trades_24h: int
    active_users_24h: int
    open_markets: int
    pending_proposals: int
    unresolved_pnl_house: float
    # Commission wallet (house fee ledger)
    commission_rate: float           # current fee rate (editable at runtime)
    commission_total: float          # all-time wallet balance
    commission_period: float         # within the selected days window
    commission_24h: float
    commission_count: int            # number of fees charged all-time
    commission_by_market: list[dict] # [{market_id, title, amount, count}]
    # Contabilidad de la casa (doble entrada; ver HouseLedger)
    house_total: float               # balance total de la casa (MM + comisiones)
    house_mm: float                  # solo creador de mercado (excluye comisiones)
    house_by_market: list[dict]      # [{market_id, title, amount}] — más negativo primero
    series: list[dict]
    by_category: list[dict]


class CommissionRateIn(BaseModel):
    rate: float = Field(ge=0.0, le=1.0)


class CommissionRow(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    handle: str
    market_id: str | None
    market_title: str | None
    source: CommissionSource
    gross_profit: float
    rate: float
    amount: float
    created_at: datetime


class MarketSummaryOut(BaseModel):
    market_id: str
    status: MarketStatus
    resolved_outcome: Side | None
    resolved_at: datetime | None
    closes_at: datetime
    participants: int       # distinct users who traded this market
    total_volume: float     # sum of trade notional (price * qty)
    total_contracts: float  # sum of traded quantity
    total_payout: float     # total credited to winners at resolution


class AdminUserRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    handle: str
    email: str
    cash: float
    email_verified: bool
    country: str | None
    aml_flag: bool
    disabled: bool
    is_admin: bool
    is_superadmin: bool = False
    admin_perms: list[str] | None = None   # None = admin legado (acceso total)
    created_at: datetime


class AdminPermsIn(BaseModel):
    # Lista de capacidades habilitadas para un admin (subconjunto de ADMIN_CAPABILITIES).
    perms: list[str]


# ---------- AML ----------
class AmlAlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    user_id: uuid.UUID
    rule_code: str
    severity: AmlSeverity
    message: str
    evidence: dict
    market_id: str | None
    status: AmlAlertStatus
    review_note: str | None
    reviewed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class AmlAlertReviewIn(BaseModel):
    action: Literal["ACK", "DISMISS", "ESCALATE"]
    note: str | None = None


class AmlSummary(BaseModel):
    open_count: int
    by_severity: dict[str, int]
    by_rule: dict[str, int]
    recent: list[AmlAlertOut]


# ---------- Resolution ----------
class ResolutionProposalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    market_id: str
    proposed_outcome: ResolutionOutcome | None
    resolver_code: str
    source_name: str
    source_url: str | None
    confidence: float
    evidence: dict
    proposed_at: datetime
    finalizes_at: datetime | None
    status: ResolutionProposalStatus
    dispute_count: int
    confirmed_outcome: ResolutionOutcome | None
    confirmed_at: datetime | None
    confirm_note: str | None


class ResolutionConfirmIn(BaseModel):
    outcome: ResolutionOutcome                      # YES / NO / VOID
    note: str | None = None                          # required if overriding


class DisputeIn(BaseModel):
    reason: str = Field(min_length=10, max_length=1000)
    evidence_url: str | None = None


# ---------- AML mutes ----------
class AmlMuteIn(BaseModel):
    user_id: uuid.UUID
    rule_code: str | None = None     # None = "mute all rules for this user"
    duration_hours: int | None = 24  # None = "until revoked"
    reason: str = Field(min_length=5, max_length=500)


class AmlMuteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    user_id: uuid.UUID
    rule_code: str | None
    reason: str
    expires_at: datetime | None
    muted_by: uuid.UUID
    created_at: datetime
    revoked_at: datetime | None
    revoked_by: uuid.UUID | None
