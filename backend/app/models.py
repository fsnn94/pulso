"""SQLAlchemy models."""
from __future__ import annotations
from datetime import datetime, timezone
from enum import Enum as PyEnum
import uuid

from sqlalchemy import (
    BigInteger, Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text, Index,
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


class KycStatus(str, PyEnum):
    NONE         = "NONE"          # sin iniciar
    SUBMITTED    = "SUBMITTED"     # datos/documento enviados, sin validar
    UNDER_REVIEW = "UNDER_REVIEW"  # requiere revisión manual del admin
    APPROVED     = "APPROVED"      # identidad verificada (persona única, +18)
    REJECTED     = "REJECTED"      # rechazado (ver kyc_rejection_reason)


class DocumentType(str, PyEnum):
    CEDULA   = "CEDULA"
    PASSPORT = "PASSPORT"


class KycDocumentSide(str, PyEnum):
    FRONT  = "FRONT"
    BACK   = "BACK"
    SELFIE = "SELFIE"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    handle: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    # Jerarquía de admins: el superadmin (admin principal) tiene todo y gestiona
    # a los demás. `admin_perms` es la lista de capacidades habilitadas de un admin
    # normal; None = admin legado con acceso total (hasta que el superadmin lo acote).
    is_superadmin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    admin_perms: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    cash: Mapped[float] = mapped_column(Float, default=10_000.0, nullable=False)
    accepted_research_disclaimer: Mapped[bool] = mapped_column(Boolean, default=False)
    disabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)  # admin can disable accounts

    # Email verification (required to trade)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # KYC / compliance fields (Paraguay: SEPRELAD AML, CNV records, Law 6534/2020 data privacy)
    full_name: Mapped[str | None] = mapped_column(String(160), nullable=True)     # nombres + apellidos (derivado)
    first_name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    # Teléfono normalizado (solo dígitos, con prefijo país) — UNIQUE: un tel = una cuenta.
    phone_normalized: Mapped[str | None] = mapped_column(String(40), nullable=True, unique=True, index=True)
    address: Mapped[str | None] = mapped_column(String(300), nullable=True)
    country: Mapped[str | None] = mapped_column(String(2), nullable=True)        # ISO 3166-1 alpha-2 (e.g. PY)
    id_number: Mapped[str | None] = mapped_column(String(40), nullable=True)     # cédula / passport
    # Clave de unicidad: id_number sin puntos/espacios/guiones, upper, prefijado
    # por país (ej. "PY:1234567"). UNIQUE → una persona (documento) = una cuenta.
    id_number_normalized: Mapped[str | None] = mapped_column(
        String(60), nullable=True, unique=True, index=True,
    )
    document_type: Mapped[DocumentType | None] = mapped_column(Enum(DocumentType), nullable=True)
    date_of_birth: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    kyc_status: Mapped[KycStatus] = mapped_column(
        Enum(KycStatus), default=KycStatus.NONE, nullable=False, server_default="NONE",
    )
    kyc_rejection_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
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


class PasswordReset(Base):
    """Token de un solo uso para restablecer la contraseña (item F1). Se crea con
    create_all, como EmailVerification."""
    __tablename__ = "password_resets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class KycDocument(Base):
    """Imagen de un documento de identidad (cédula/pasaporte/selfie). El binario
    NO se guarda acá: `storage_key` es un puntero a un object storage PRIVADO.
    Se crea con create_all."""
    __tablename__ = "kyc_documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    side: Mapped[KycDocumentSide] = mapped_column(Enum(KycDocumentSide), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(255), nullable=False)   # puntero a storage privado
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)   # SHA-256 hex (integridad/dedup)
    content_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)


class KycExtraction(Base):
    """Datos leídos de un documento por OCR/visión, para cotejar con lo declarado.
    Se crea con create_all."""
    __tablename__ = "kyc_extractions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    raw: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    extracted_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    extracted_id_number: Mapped[str | None] = mapped_column(String(40), nullable=True)
    extracted_dob: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    extracted_expiry: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    confidence: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    name_match: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)


class Market(Base):
    __tablename__ = "markets"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # slug-like ID
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    short_title: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    # Etiquetas de los dos lados. Por defecto un mercado Sí/No; si son custom
    # (ej. "Boca"/"River") el frontend usa colores neutros en vez de verde/rojo.
    # El lado "YES" es el que paga $1 si el mercado resuelve a su favor.
    yes_label: Mapped[str] = mapped_column(String(40), default="Sí", nullable=False, server_default="Sí")
    no_label: Mapped[str] = mapped_column(String(40), default="No", nullable=False, server_default="No")
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


class Notification(Base):
    """Lean per-user inbox item (item #8). Kept short on purpose and pruned to
    the latest N per user (see notifications.notify) so the table stays small."""
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(40), nullable=False)   # BUY_FILLED, SELL_FILLED, MARKET_CLOSED, MARKET_RESOLVED, PROPOSAL_APPROVED
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    body: Mapped[str] = mapped_column(String(280), nullable=False)
    market_id: Mapped[str | None] = mapped_column(String(64), ForeignKey("markets.id"), nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    __table_args__ = (
        Index("ix_notifications_user_created", "user_id", "created_at"),
    )


class EquitySnapshot(Base):
    """Punto histórico del patrimonio (equity) de un usuario para graficar el
    P&L con timeframes (item #9). Se escribe periódicamente por `snapshot_loop`.

    equity = cash + positions_value, donde cada posición abierta se valúa al
    precio actual del mercado (YES = current_yes_price, NO = 1 - current_yes_price).
    No reconstruimos historia pasada (no guardamos precios históricos por
    mercado): la curva acumula hacia adelante desde que se activa la feature."""
    __tablename__ = "equity_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    cash: Mapped[float] = mapped_column(Float, nullable=False)
    positions_value: Mapped[float] = mapped_column(Float, nullable=False)
    equity: Mapped[float] = mapped_column(Float, nullable=False)            # cash + positions_value
    realized_pnl: Mapped[float] = mapped_column(Float, default=0.0)         # acumulado, neto de comisión

    __table_args__ = (
        Index("ix_equity_snapshots_user_ts", "user_id", "ts"),
    )


class MarketComment(Base):
    """Comentario de un usuario en un mercado (capa social). Se crea con
    create_all. La moderación es un soft-hide (hidden=True) para conservar el
    registro."""
    __tablename__ = "market_comments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    market_id: Mapped[str] = mapped_column(String(64), ForeignKey("markets.id"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    body: Mapped[str] = mapped_column(String(1000), nullable=False)
    hidden: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)


class Watchlist(Base):
    """Mercados que un usuario sigue (favoritos). Se crea con create_all."""
    __tablename__ = "watchlist"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    market_id: Mapped[str] = mapped_column(String(64), ForeignKey("markets.id"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    __table_args__ = (
        Index("ix_watchlist_user_market", "user_id", "market_id", unique=True),
    )


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


class HouseLedgerKind(str, PyEnum):
    PREMIUM    = "PREMIUM"     # compra a mercado: el usuario paga, la casa recibe (+)
    RESERVE    = "RESERVE"     # colocación de orden LIMIT: efectivo reservado hacia la casa (+)
    BUYBACK    = "BUYBACK"     # venta a mercado: la casa le paga al usuario (−)
    REFUND     = "REFUND"      # cancelación / nulo / reembolso de orden: la casa devuelve (−)
    SETTLE     = "SETTLE"      # pago a ganadores al resolver: la casa paga (−)
    COMMISSION = "COMMISSION"  # comisión: la casa recibe (+)


class HouseLedger(Base):
    """Contabilidad de doble entrada de la casa. Cada cambio de `cash` de un
    usuario por trading se refleja acá con signo opuesto (+ = entra a la casa,
    − = sale de la casa), de modo que `Σ users.cash + Σ house = créditos
    otorgados`. Así ninguna moneda queda sin contabilizar y el balance de la
    casa (que puede ser negativo) es su P&L de creador de mercado + comisiones.
    Se crea con create_all (como la tabla Commission)."""
    __tablename__ = "house_ledger"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    market_id: Mapped[str | None] = mapped_column(String(64), ForeignKey("markets.id"), nullable=True, index=True)
    kind: Mapped[HouseLedgerKind] = mapped_column(Enum(HouseLedgerKind), nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)  # con signo
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
    yes_label: Mapped[str] = mapped_column(String(40), default="Sí", nullable=False, server_default="Sí")
    no_label: Mapped[str] = mapped_column(String(40), default="No", nullable=False, server_default="No")
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


# ============================================================ Dinero real (pagos)
# Estructura "wallet-ready": el esquema de dinero real vive acá con contabilidad de
# doble entrada; los rieles a un proveedor externo se enchufan luego. Los montos son
# unidades menores enteras (BigInteger) — nunca float. Ver docs/arquitectura-pagos-kyc.md.

class LedgerAccountType(str, PyEnum):
    USER             = "USER"              # claim de un usuario (account_ref = user_id)
    CUSTODY          = "CUSTODY"           # contracuenta de la custodia (banco/proveedor)
    FEE_REVENUE      = "FEE_REVENUE"       # ingresos por comisiones de pago
    PAYMENT_PROVIDER = "PAYMENT_PROVIDER"  # tránsito con el proveedor
    PAYOUT_PAYABLE   = "PAYOUT_PAYABLE"    # retiros aprobados aún no pagados (hold)


class MoneyLedgerKind(str, PyEnum):
    DEPOSIT      = "DEPOSIT"
    WITHDRAWAL   = "WITHDRAWAL"
    TRADE_SETTLE = "TRADE_SETTLE"
    FEE          = "FEE"
    ADJUSTMENT   = "ADJUSTMENT"
    REVERSAL     = "REVERSAL"


class DepositStatus(str, PyEnum):
    INITIATED = "INITIATED"
    PENDING   = "PENDING"
    CONFIRMED = "CONFIRMED"
    FAILED    = "FAILED"
    REVERSED  = "REVERSED"


class WithdrawalStatus(str, PyEnum):
    REQUESTED  = "REQUESTED"
    APPROVED   = "APPROVED"
    PROCESSING = "PROCESSING"
    PAID       = "PAID"
    REJECTED   = "REJECTED"
    FAILED     = "FAILED"


class MoneyLedger(Base):
    """Contabilidad de doble entrada del dinero REAL. Cada operación inserta ≥2
    filas con el mismo `entry_group` que suman 0. El saldo de un usuario es la
    suma derivada de sus filas (account_type=USER, account_ref=user_id).
    Se crea con create_all."""
    __tablename__ = "money_ledger"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    account_type: Mapped[LedgerAccountType] = mapped_column(Enum(LedgerAccountType), nullable=False)
    account_ref: Mapped[str | None] = mapped_column(String(64), nullable=True)   # user_id si USER; None en cuentas de sistema
    entry_group: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)         # con signo; unidades menores
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    kind: Mapped[MoneyLedgerKind] = mapped_column(Enum(MoneyLedgerKind), nullable=False)
    ref_id: Mapped[str | None] = mapped_column(String(64), nullable=True)         # id del Deposit/Withdrawal/... origen
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    __table_args__ = (
        Index("ix_money_ledger_account", "account_type", "account_ref", "currency"),
    )


class Deposit(Base):
    """Intento de ingreso de dinero real. La acreditación al ledger ocurre EXACTAMENTE
    una vez, en la transición a CONFIRMED (idempotente). Se crea con create_all."""
    __tablename__ = "deposits"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    status: Mapped[DepositStatus] = mapped_column(Enum(DepositStatus), default=DepositStatus.PENDING, nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(40), default="manual", nullable=False)
    provider_ref: Mapped[str | None] = mapped_column(String(120), nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    failure_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class Withdrawal(Base):
    """Solicitud de retiro. En REQUESTED se hace un HOLD (debita del claim del usuario
    hacia PAYOUT_PAYABLE). Requiere KYC APPROVED + sin flag AML + saldo suficiente, y
    aprobación de un admin con capacidad `payments`. Se crea con create_all."""
    __tablename__ = "withdrawals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    status: Mapped[WithdrawalStatus] = mapped_column(Enum(WithdrawalStatus), default=WithdrawalStatus.REQUESTED, nullable=False, index=True)
    destination: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)   # datos de destino (tokenizar/cifrar en prod)
    provider: Mapped[str] = mapped_column(String(40), default="manual", nullable=False)
    provider_ref: Mapped[str | None] = mapped_column(String(120), nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    failure_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class PaymentEvent(Base):
    """Log append-only de eventos de proveedor (webhooks) para idempotencia y
    auditoría. Unicidad (provider, event_id) → un evento se procesa una sola vez.
    Se crea con create_all."""
    __tablename__ = "payment_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    provider: Mapped[str] = mapped_column(String(40), nullable=False)
    event_id: Mapped[str] = mapped_column(String(120), nullable=False)
    signature_valid: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    __table_args__ = (
        Index("ix_payment_events_provider_event", "provider", "event_id", unique=True),
    )
