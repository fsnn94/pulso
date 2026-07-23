"""Tests de dinero real: invariantes del ledger de doble entrada, idempotencia
del depósito, hold/rechazo de retiro y gating por KYC. Ver docs/arquitectura-pagos-kyc.md §5."""
from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from app import payments as pay
from app.models import (
    Deposit, DepositStatus, KycStatus, MoneyLedger, User, WithdrawalStatus,
)
from app.money import from_minor, to_minor
from app.security import hash_password


def make_user(handle: str, kyc: KycStatus = KycStatus.NONE) -> User:
    return User(
        email=f"{handle}@t.test", handle=handle,
        password_hash=hash_password("x"), accepted_research_disclaimer=True,
        kyc_status=kyc,
    )


# ---------- money.py ----------

def test_to_minor_pyg_has_no_decimals():
    assert to_minor(1500, "PYG") == 1500
    with pytest.raises(ValueError):
        to_minor("15.50", "PYG")   # PYG no admite centavos


def test_to_minor_usd_cents():
    assert to_minor("12.50", "USD") == 1250
    assert from_minor(1250, "USD") == pytest.approx(12.50)


# ---------- ledger invariants ----------

async def _ledger_sum(db) -> int:
    return int((await db.execute(
        select(func.coalesce(func.sum(MoneyLedger.amount_minor), 0))
    )).scalar_one())


@pytest.mark.asyncio
async def test_deposit_credits_once_and_ledger_balances(db):
    u = make_user("ana")
    db.add(u)
    await db.commit(); await db.refresh(u)

    dep = await pay.create_deposit(db, u, 100_000, "PYG")
    await db.commit(); await db.refresh(dep)

    await pay.confirm_deposit(db, dep)
    await db.commit()
    assert (await pay.user_balance_minor(db, u.id, "PYG")) == 100_000
    # Cada entry_group suma 0 → el ledger entero suma 0.
    assert (await _ledger_sum(db)) == 0

    # Idempotencia: confirmar de nuevo NO vuelve a acreditar.
    await pay.confirm_deposit(db, dep)
    await db.commit()
    assert (await pay.user_balance_minor(db, u.id, "PYG")) == 100_000


@pytest.mark.asyncio
async def test_withdrawal_requires_kyc(db):
    u = make_user("noKyc", kyc=KycStatus.SUBMITTED)
    db.add(u)
    await db.commit(); await db.refresh(u)
    # Aunque tuviera saldo, sin KYC APPROVED no puede retirar.
    dep = await pay.create_deposit(db, u, 50_000, "PYG")
    await db.commit(); await pay.confirm_deposit(db, dep); await db.commit()

    with pytest.raises(HTTPException) as exc:
        await pay.request_withdrawal(db, u, 10_000, "PYG", {})
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_withdrawal_hold_and_pay_conserves(db):
    u = make_user("bob", kyc=KycStatus.APPROVED)
    db.add(u)
    await db.commit(); await db.refresh(u)
    dep = await pay.create_deposit(db, u, 100_000, "PYG")
    await db.commit(); await pay.confirm_deposit(db, dep); await db.commit()

    wd = await pay.request_withdrawal(db, u, 30_000, "PYG", {"alias": "bob.mp"})
    await db.commit()
    # El hold ya salió del saldo disponible.
    assert (await pay.user_balance_minor(db, u.id, "PYG")) == 70_000

    await pay.mark_withdrawal_paid(db, wd, provider_ref="ref-1")
    await db.commit()
    assert wd.status == WithdrawalStatus.PAID
    assert (await pay.user_balance_minor(db, u.id, "PYG")) == 70_000
    assert (await _ledger_sum(db)) == 0

    recon = await pay.reconciliation(db)
    row = next(r for r in recon if r["currency"] == "PYG")
    assert row["balanced"] is True
    assert row["users_total"] == 70_000


@pytest.mark.asyncio
async def test_withdrawal_reject_releases_hold(db):
    u = make_user("carol", kyc=KycStatus.APPROVED)
    db.add(u)
    await db.commit(); await db.refresh(u)
    dep = await pay.create_deposit(db, u, 100_000, "PYG")
    await db.commit(); await pay.confirm_deposit(db, dep); await db.commit()

    wd = await pay.request_withdrawal(db, u, 40_000, "PYG", {})
    await db.commit()
    assert (await pay.user_balance_minor(db, u.id, "PYG")) == 60_000

    await pay.reject_withdrawal(db, wd, admin_id=u.id, reason="datos inválidos")
    await db.commit()
    assert wd.status == WithdrawalStatus.REJECTED
    # El hold se liberó: el saldo vuelve a estar completo.
    assert (await pay.user_balance_minor(db, u.id, "PYG")) == 100_000
    assert (await _ledger_sum(db)) == 0


@pytest.mark.asyncio
async def test_withdrawal_insufficient_balance(db):
    u = make_user("dora", kyc=KycStatus.APPROVED)
    db.add(u)
    await db.commit(); await db.refresh(u)
    with pytest.raises(HTTPException) as exc:
        await pay.request_withdrawal(db, u, 10_000, "PYG", {})
    assert exc.value.status_code == 400
