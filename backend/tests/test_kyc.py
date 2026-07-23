"""Tests de KYC: helpers de edad/normalización y las reglas DURAS del endpoint
(+18 y unicidad de documento). Ver docs/arquitectura-pagos-kyc.md."""
from __future__ import annotations
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select

from app.kyc import age_years, is_adult, normalize_id_number
from app.models import AmlAlert, KycStatus, User
from app.routers.auth import submit_kyc
from app.schemas import KycIn
from app.security import hash_password


def _dob(years_ago: int) -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(year=now.year - years_ago)


def make_user(handle: str) -> User:
    return User(
        email=f"{handle}@t.test", handle=handle,
        password_hash=hash_password("x"), accepted_research_disclaimer=True,
    )


# ---------- helpers puros ----------

def test_normalize_id_number_strips_and_prefixes():
    assert normalize_id_number("1.234.567", "py") == "PY:1234567"
    assert normalize_id_number(" 12-34 56 ", "PY") == "PY:123456"
    # misma persona, distinto formato → misma clave
    assert normalize_id_number("1234567", "PY") == normalize_id_number("1.234.567", "py")


def test_age_years_and_is_adult():
    assert age_years(_dob(20)) == 20
    assert is_adult(_dob(18)) is True
    assert is_adult(_dob(17)) is False


# ---------- schema: +18 primera barrera ----------

def test_kycin_rejects_minor():
    with pytest.raises(ValidationError):
        KycIn(full_name="Juan Perez", country="PY", id_number="1234567",
              date_of_birth=_dob(17))


def test_kycin_accepts_adult():
    k = KycIn(full_name="Juan Perez", country="PY", id_number="1234567",
              date_of_birth=_dob(30))
    assert k.document_type == "CEDULA"


# ---------- endpoint: reglas duras ----------

@pytest.mark.asyncio
async def test_submit_kyc_happy_path(db):
    u = make_user("ana")
    db.add(u)
    await db.commit()
    await db.refresh(u)

    payload = KycIn(full_name="Ana Gómez", country="PY", id_number="1.234.567",
                    date_of_birth=_dob(25))
    out = await submit_kyc(payload, u, db)

    assert out is u
    assert u.kyc_status == KycStatus.SUBMITTED
    assert u.document_type.value == "CEDULA"
    assert u.id_number_normalized == "PY:1234567"
    assert u.kyc_completed_at is not None


@pytest.mark.asyncio
async def test_submit_kyc_duplicate_document_rejected(db):
    # Usuario A ya tiene el documento normalizado.
    a = make_user("a")
    a.id_number_normalized = "PY:1234567"
    b = make_user("b")
    db.add_all([a, b])
    await db.commit()
    await db.refresh(b)

    payload = KycIn(full_name="Bruno B", country="PY", id_number="1234567",
                    date_of_birth=_dob(40))
    with pytest.raises(HTTPException) as exc:
        await submit_kyc(payload, b, db)
    assert exc.value.status_code == 409

    # Se levantó una alerta AML de documento duplicado.
    alerts = (await db.execute(
        select(AmlAlert).where(AmlAlert.rule_code == "DUPLICATE_ID")
    )).scalars().all()
    assert len(alerts) == 1
    assert alerts[0].user_id == b.id
