"""Endpoints de dinero real (wallet-ready). Los de usuario están gateados por
`payments_enabled` (rieles apagados por defecto); los de admin siempre visibles
para la capacidad `payments`. Ver docs/arquitectura-pagos-kyc.md."""
from __future__ import annotations
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..db import get_db
from ..deps import get_current_user, require_payments
from ..models import Deposit, DepositStatus, User, Withdrawal, WithdrawalStatus
from ..money import format_minor, supported_currency, to_minor
from .. import payments as pay
from ..schemas import (
    BalanceOut, DepositCreateIn, DepositOut, ReconciliationRow,
    WithdrawalCreateIn, WithdrawalOut, WithdrawalReviewIn,
)

router = APIRouter(prefix="/payments", tags=["payments"])
admin_router = APIRouter(prefix="/admin/payments", tags=["payments-admin"])


def _amount_to_minor(amount, currency: str) -> int:
    cur = currency.upper()
    if not supported_currency(cur):
        raise HTTPException(400, f"Moneda no soportada: {currency}")
    try:
        return to_minor(amount, cur)
    except ValueError as e:
        raise HTTPException(400, str(e))


def _assert_enabled() -> None:
    if not get_settings().payments_enabled:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Los pagos todavía no están habilitados.")


# ----------------------------------------------------------------- usuario

@router.get("/config")
async def payments_config(user: Annotated[User, Depends(get_current_user)]):
    """Estado de los rieles de pago para que el front muestre la UI adecuada."""
    s = get_settings()
    return {"enabled": s.payments_enabled, "currency": s.default_currency}


@router.get("/balance", response_model=BalanceOut)
async def my_balance(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    currency: str | None = None,
):
    cur = (currency or get_settings().default_currency).upper()
    if not supported_currency(cur):
        raise HTTPException(400, f"Moneda no soportada: {currency}")
    bal = await pay.user_balance_minor(db, user.id, cur)
    return BalanceOut(currency=cur, balance_minor=bal, balance=format_minor(bal, cur))


@router.post("/deposits", response_model=DepositOut, status_code=status.HTTP_201_CREATED)
async def create_deposit(
    payload: DepositCreateIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    _assert_enabled()
    minor = _amount_to_minor(payload.amount, payload.currency)
    dep = await pay.create_deposit(db, user, minor, payload.currency)
    await db.commit()
    await db.refresh(dep)
    return dep


@router.get("/deposits", response_model=list[DepositOut])
async def my_deposits(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = 100,
):
    rs = await db.execute(
        select(Deposit).where(Deposit.user_id == user.id)
        .order_by(desc(Deposit.created_at)).limit(limit)
    )
    return list(rs.scalars().all())


@router.post("/withdrawals", response_model=WithdrawalOut, status_code=status.HTTP_201_CREATED)
async def create_withdrawal(
    payload: WithdrawalCreateIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    _assert_enabled()
    minor = _amount_to_minor(payload.amount, payload.currency)
    wd = await pay.request_withdrawal(db, user, minor, payload.currency, payload.destination)
    await db.commit()
    await db.refresh(wd)
    return wd


@router.get("/withdrawals", response_model=list[WithdrawalOut])
async def my_withdrawals(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = 100,
):
    rs = await db.execute(
        select(Withdrawal).where(Withdrawal.user_id == user.id)
        .order_by(desc(Withdrawal.requested_at)).limit(limit)
    )
    return list(rs.scalars().all())


# ----------------------------------------------------------------- admin

@admin_router.get("/deposits", response_model=list[DepositOut])
async def admin_list_deposits(
    admin: Annotated[User, Depends(require_payments)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: str | None = Query(None, alias="status"),
    limit: int = 200,
):
    stmt = select(Deposit).order_by(desc(Deposit.created_at)).limit(limit)
    if status_filter:
        try:
            stmt = stmt.where(Deposit.status == DepositStatus[status_filter])
        except KeyError:
            raise HTTPException(400, "Estado inválido")
    return list((await db.execute(stmt)).scalars().all())


@admin_router.post("/deposits/{deposit_id}/confirm", response_model=DepositOut)
async def admin_confirm_deposit(
    deposit_id: uuid.UUID,
    admin: Annotated[User, Depends(require_payments)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    dep = await db.get(Deposit, deposit_id)
    if not dep:
        raise HTTPException(404, "Depósito no encontrado")
    await pay.confirm_deposit(db, dep)
    await db.commit()
    await db.refresh(dep)
    return dep


@admin_router.post("/deposits/{deposit_id}/fail", response_model=DepositOut)
async def admin_fail_deposit(
    deposit_id: uuid.UUID,
    admin: Annotated[User, Depends(require_payments)],
    db: Annotated[AsyncSession, Depends(get_db)],
    reason: str | None = None,
):
    dep = await db.get(Deposit, deposit_id)
    if not dep:
        raise HTTPException(404, "Depósito no encontrado")
    await pay.fail_deposit(db, dep, reason)
    await db.commit()
    await db.refresh(dep)
    return dep


@admin_router.get("/withdrawals", response_model=list[WithdrawalOut])
async def admin_list_withdrawals(
    admin: Annotated[User, Depends(require_payments)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: str | None = Query(None, alias="status"),
    limit: int = 200,
):
    stmt = select(Withdrawal).order_by(desc(Withdrawal.requested_at)).limit(limit)
    if status_filter:
        try:
            stmt = stmt.where(Withdrawal.status == WithdrawalStatus[status_filter])
        except KeyError:
            raise HTTPException(400, "Estado inválido")
    return list((await db.execute(stmt)).scalars().all())


@admin_router.post("/withdrawals/{withdrawal_id}/approve", response_model=WithdrawalOut)
async def admin_approve_withdrawal(
    withdrawal_id: uuid.UUID,
    admin: Annotated[User, Depends(require_payments)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    wd = await db.get(Withdrawal, withdrawal_id)
    if not wd:
        raise HTTPException(404, "Retiro no encontrado")
    await pay.approve_withdrawal(db, wd, admin.id)
    await db.commit()
    await db.refresh(wd)
    return wd


@admin_router.post("/withdrawals/{withdrawal_id}/mark-paid", response_model=WithdrawalOut)
async def admin_mark_paid(
    withdrawal_id: uuid.UUID,
    payload: WithdrawalReviewIn,
    admin: Annotated[User, Depends(require_payments)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    wd = await db.get(Withdrawal, withdrawal_id)
    if not wd:
        raise HTTPException(404, "Retiro no encontrado")
    await pay.mark_withdrawal_paid(db, wd, payload.provider_ref)
    await db.commit()
    await db.refresh(wd)
    return wd


@admin_router.post("/withdrawals/{withdrawal_id}/reject", response_model=WithdrawalOut)
async def admin_reject_withdrawal(
    withdrawal_id: uuid.UUID,
    payload: WithdrawalReviewIn,
    admin: Annotated[User, Depends(require_payments)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    wd = await db.get(Withdrawal, withdrawal_id)
    if not wd:
        raise HTTPException(404, "Retiro no encontrado")
    await pay.reject_withdrawal(db, wd, admin.id, payload.note)
    await db.commit()
    await db.refresh(wd)
    return wd


@admin_router.get("/reconciliation", response_model=list[ReconciliationRow])
async def admin_reconciliation(
    admin: Annotated[User, Depends(require_payments)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await pay.reconciliation(db)
