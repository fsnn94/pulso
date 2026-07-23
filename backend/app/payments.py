"""Servicio de dinero real: ledger de doble entrada + flujos de depósito/retiro
+ reconciliación. Los rieles a un proveedor externo se enchufan vía la interfaz
`PaymentProvider` (hoy `ManualProvider`, que exige acción de admin y no toca red).

Invariantes que se garantizan acá (ver docs/arquitectura-pagos-kyc.md §5):
  - Cada `entry_group` del ledger suma 0.
  - Σ saldos USER == − Σ CUSTODY, por moneda.
  - La acreditación de un depósito ocurre exactamente una vez (idempotencia).
"""
from __future__ import annotations
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Protocol

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import (
    Deposit, DepositStatus, KycStatus, LedgerAccountType, MoneyLedger,
    MoneyLedgerKind, User, Withdrawal, WithdrawalStatus,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ----------------------------------------------------------------- ledger core

@dataclass
class Entry:
    account_type: LedgerAccountType
    account_ref: str | None
    amount_minor: int   # con signo


async def post_entries(
    db: AsyncSession, *, entries: list[Entry], currency: str,
    kind: MoneyLedgerKind, ref_id: str | None,
) -> uuid.UUID:
    """Inserta un grupo de asientos que DEBE sumar 0. Devuelve el entry_group."""
    total = sum(e.amount_minor for e in entries)
    if total != 0:
        raise ValueError(f"Los asientos no cuadran (suma={total}, esperado 0)")
    group = uuid.uuid4()
    for e in entries:
        db.add(MoneyLedger(
            account_type=e.account_type, account_ref=e.account_ref,
            entry_group=group, amount_minor=e.amount_minor, currency=currency.upper(),
            kind=kind, ref_id=ref_id,
        ))
    return group


async def _account_balance(
    db: AsyncSession, account_type: LedgerAccountType, account_ref: str | None, currency: str,
) -> int:
    stmt = select(func.coalesce(func.sum(MoneyLedger.amount_minor), 0)).where(
        MoneyLedger.account_type == account_type,
        MoneyLedger.currency == currency.upper(),
    )
    if account_ref is None:
        stmt = stmt.where(MoneyLedger.account_ref.is_(None))
    else:
        stmt = stmt.where(MoneyLedger.account_ref == account_ref)
    return int((await db.execute(stmt)).scalar_one())


async def user_balance_minor(db: AsyncSession, user_id: uuid.UUID, currency: str) -> int:
    """Saldo disponible del usuario (los holds de retiro ya salieron a PAYOUT_PAYABLE)."""
    return await _account_balance(db, LedgerAccountType.USER, str(user_id), currency)


# ----------------------------------------------------------------- provider

@dataclass
class WebhookVerification:
    valid: bool
    event_id: str | None = None
    kind: str | None = None          # p.ej. "deposit.confirmed"
    provider_ref: str | None = None


class PaymentProvider(Protocol):
    name: str
    async def create_deposit_intent(self, deposit: Deposit) -> dict: ...
    async def verify_webhook(self, headers: dict, body: bytes) -> WebhookVerification: ...
    async def execute_payout(self, withdrawal: Withdrawal) -> dict: ...


class ManualProvider:
    """Proveedor por defecto mientras los rieles están apagados: no hay red externa.
    Depósitos y retiros quedan en un estado que EXIGE acción de un admin."""
    name = "manual"

    async def create_deposit_intent(self, deposit: Deposit) -> dict:
        # No hay pasarela: se instruye al usuario y un admin confirma cuando llega el dinero.
        return {"provider": self.name, "instructions": "Un administrador confirmará el depósito al recibir los fondos."}

    async def verify_webhook(self, headers: dict, body: bytes) -> WebhookVerification:
        return WebhookVerification(valid=False)

    async def execute_payout(self, withdrawal: Withdrawal) -> dict:
        return {"provider": self.name, "status": "manual"}


def get_provider() -> PaymentProvider:
    # Punto único para enchufar Bancard/dLocal/Stripe/crypto más adelante.
    return ManualProvider()


# ----------------------------------------------------------------- deposits

async def create_deposit(
    db: AsyncSession, user: User, amount_minor: int, currency: str,
) -> Deposit:
    if amount_minor <= 0:
        raise HTTPException(400, "El monto debe ser mayor a cero.")
    dep = Deposit(
        user_id=user.id, amount_minor=amount_minor, currency=currency.upper(),
        status=DepositStatus.PENDING, provider=get_provider().name,
        idempotency_key=uuid.uuid4().hex,
    )
    db.add(dep)
    return dep


async def confirm_deposit(db: AsyncSession, deposit: Deposit) -> Deposit:
    """PENDING → CONFIRMED. Acredita al ledger EXACTAMENTE una vez (idempotente:
    si ya está CONFIRMED, no-op)."""
    if deposit.status == DepositStatus.CONFIRMED:
        return deposit
    if deposit.status not in (DepositStatus.PENDING, DepositStatus.INITIATED):
        raise HTTPException(409, f"No se puede confirmar un depósito en estado {deposit.status.value}.")
    await post_entries(
        db,
        entries=[
            Entry(LedgerAccountType.USER, str(deposit.user_id), +deposit.amount_minor),
            Entry(LedgerAccountType.CUSTODY, None, -deposit.amount_minor),
        ],
        currency=deposit.currency, kind=MoneyLedgerKind.DEPOSIT, ref_id=str(deposit.id),
    )
    deposit.status = DepositStatus.CONFIRMED
    return deposit


async def fail_deposit(db: AsyncSession, deposit: Deposit, reason: str | None = None) -> Deposit:
    if deposit.status == DepositStatus.CONFIRMED:
        raise HTTPException(409, "No se puede marcar como fallido un depósito ya confirmado.")
    deposit.status = DepositStatus.FAILED
    deposit.failure_reason = reason
    return deposit


# ----------------------------------------------------------------- withdrawals

async def request_withdrawal(
    db: AsyncSession, user: User, amount_minor: int, currency: str, destination: dict,
) -> Withdrawal:
    """REQUESTED + HOLD. Precondiciones: KYC APPROVED, sin flag AML, saldo suficiente."""
    if amount_minor <= 0:
        raise HTTPException(400, "El monto debe ser mayor a cero.")
    if user.kyc_status != KycStatus.APPROVED:
        raise HTTPException(403, "Debes completar la verificación de identidad (KYC) antes de retirar.")
    if user.aml_flag:
        raise HTTPException(403, "Tu cuenta está bajo revisión de cumplimiento. No podés retirar por ahora.")
    balance = await user_balance_minor(db, user.id, currency)
    if amount_minor > balance:
        raise HTTPException(400, "Saldo insuficiente para el retiro solicitado.")

    wd = Withdrawal(
        user_id=user.id, amount_minor=amount_minor, currency=currency.upper(),
        status=WithdrawalStatus.REQUESTED, destination=destination or {},
        provider=get_provider().name, idempotency_key=uuid.uuid4().hex,
    )
    db.add(wd)
    await db.flush()
    # HOLD: sale del claim del usuario y queda reservado en PAYOUT_PAYABLE.
    await post_entries(
        db,
        entries=[
            Entry(LedgerAccountType.USER, str(user.id), -amount_minor),
            Entry(LedgerAccountType.PAYOUT_PAYABLE, None, +amount_minor),
        ],
        currency=currency, kind=MoneyLedgerKind.WITHDRAWAL, ref_id=str(wd.id),
    )
    return wd


async def approve_withdrawal(db: AsyncSession, wd: Withdrawal, admin_id: uuid.UUID) -> Withdrawal:
    if wd.status != WithdrawalStatus.REQUESTED:
        raise HTTPException(409, f"Solo se aprueba un retiro en estado REQUESTED (está en {wd.status.value}).")
    wd.status = WithdrawalStatus.APPROVED
    wd.reviewed_by = admin_id
    wd.reviewed_at = _now()
    return wd


async def mark_withdrawal_paid(db: AsyncSession, wd: Withdrawal, provider_ref: str | None = None) -> Withdrawal:
    """APPROVED/PROCESSING → PAID. El dinero sale de la custodia (libera el hold)."""
    if wd.status not in (WithdrawalStatus.APPROVED, WithdrawalStatus.PROCESSING):
        raise HTTPException(409, f"No se puede pagar un retiro en estado {wd.status.value}.")
    await post_entries(
        db,
        entries=[
            Entry(LedgerAccountType.PAYOUT_PAYABLE, None, -wd.amount_minor),
            Entry(LedgerAccountType.CUSTODY, None, +wd.amount_minor),
        ],
        currency=wd.currency, kind=MoneyLedgerKind.WITHDRAWAL, ref_id=str(wd.id),
    )
    wd.status = WithdrawalStatus.PAID
    wd.provider_ref = provider_ref
    return wd


async def reject_withdrawal(db: AsyncSession, wd: Withdrawal, admin_id: uuid.UUID, reason: str | None = None) -> Withdrawal:
    """REQUESTED/APPROVED → REJECTED. Libera el hold: el dinero vuelve al usuario."""
    if wd.status not in (WithdrawalStatus.REQUESTED, WithdrawalStatus.APPROVED):
        raise HTTPException(409, f"No se puede rechazar un retiro en estado {wd.status.value}.")
    await post_entries(
        db,
        entries=[
            Entry(LedgerAccountType.PAYOUT_PAYABLE, None, -wd.amount_minor),
            Entry(LedgerAccountType.USER, str(wd.user_id), +wd.amount_minor),
        ],
        currency=wd.currency, kind=MoneyLedgerKind.REVERSAL, ref_id=str(wd.id),
    )
    wd.status = WithdrawalStatus.REJECTED
    wd.reviewed_by = admin_id
    wd.reviewed_at = _now()
    wd.failure_reason = reason
    return wd


# ----------------------------------------------------------------- reconciliation

async def reconciliation(db: AsyncSession) -> list[dict]:
    """Por moneda: total de claims de usuarios, holds, custodia, y si cuadra la
    invariante Σ USER + Σ PAYOUT_PAYABLE == − Σ CUSTODY."""
    rows = (await db.execute(
        select(
            MoneyLedger.currency, MoneyLedger.account_type,
            func.coalesce(func.sum(MoneyLedger.amount_minor), 0),
        ).group_by(MoneyLedger.currency, MoneyLedger.account_type)
    )).all()

    by_ccy: dict[str, dict[str, int]] = {}
    for ccy, acct, total in rows:
        by_ccy.setdefault(ccy, {})[acct.value if hasattr(acct, "value") else str(acct)] = int(total)

    out: list[dict] = []
    for ccy, totals in sorted(by_ccy.items()):
        users_total = totals.get("USER", 0)
        payable = totals.get("PAYOUT_PAYABLE", 0)
        custody = totals.get("CUSTODY", 0)
        fee = totals.get("FEE_REVENUE", 0)
        # Liabilities (lo que la plataforma debe) vs custodia (lo que tiene).
        liabilities = users_total + payable
        balanced = (liabilities + custody + fee) == 0
        out.append({
            "currency": ccy,
            "users_total": users_total,
            "payout_payable": payable,
            "custody": custody,
            "fee_revenue": fee,
            "balanced": balanced,
        })
    return out
