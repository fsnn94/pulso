"""Tests del registro con KYC: unicidad (email/cédula/teléfono/handle), +18,
envío a revisión, aprobación/rechazo admin y el gate de operar."""
from __future__ import annotations
import os
import tempfile
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select

from app.deps import require_kyc_approved
from app.kyc import normalize_phone
from app.models import KycDocument, KycDocumentSide, KycStatus, User
from app.routers.auth import register, submit_kyc_for_review
from app.routers.kyc import approve_kyc, reject_kyc
from app.schemas import KycRejectIn, RegisterIn
from app.security import hash_password
from app.storage import FilesystemStorage, StorageError


def _dob(years_ago: int) -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(year=now.year - years_ago)


def _reg(**over) -> RegisterIn:
    base = dict(
        email="nuevo@t.test", handle="nuevo", password="secret1",
        accepted_disclaimer=True, first_name="Ana", last_name="Gómez",
        date_of_birth=_dob(30), id_number="1.234.567", country="PY",
        phone="0981123456", address="Calle 1", document_type="CEDULA",
    )
    base.update(over)
    return RegisterIn(**base)


# ---------- helpers ----------

def test_normalize_phone_py():
    assert normalize_phone("0981 123 456", "PY") == "+595981123456"
    assert normalize_phone("+595981123456", "PY") == "+595981123456"


def test_register_schema_rejects_minor():
    with pytest.raises(ValidationError):
        _reg(date_of_birth=_dob(17))


# ---------- registro ----------

@pytest.mark.asyncio
async def test_register_creates_pending_account(db):
    out = await register(_reg(), db)
    assert out.access_token
    u = (await db.execute(select(User).where(User.handle == "nuevo"))).scalar_one()
    assert u.kyc_status == KycStatus.NONE
    assert u.id_number_normalized == "PY:1234567"
    assert u.phone_normalized == "+595981123456"
    assert u.full_name == "Ana Gómez"


@pytest.mark.asyncio
async def test_register_duplicate_email(db):
    await register(_reg(), db)
    with pytest.raises(HTTPException) as e:
        await register(_reg(handle="otro", id_number="9999999", phone="0982000000"), db)
    assert e.value.status_code == 409


@pytest.mark.asyncio
async def test_register_duplicate_id_number(db):
    await register(_reg(), db)
    with pytest.raises(HTTPException) as e:
        await register(_reg(email="b@t.test", handle="b", phone="0982000000"), db)
    assert e.value.status_code == 409


@pytest.mark.asyncio
async def test_register_duplicate_phone(db):
    await register(_reg(), db)
    with pytest.raises(HTTPException) as e:
        await register(_reg(email="c@t.test", handle="c", id_number="7777777"), db)
    assert e.value.status_code == 409


# ---------- submit + revisión ----------

async def _make_pending_with_docs(db) -> User:
    await register(_reg(), db)
    u = (await db.execute(select(User).where(User.handle == "nuevo"))).scalar_one()
    for side in (KycDocumentSide.FRONT, KycDocumentSide.BACK, KycDocumentSide.SELFIE):
        db.add(KycDocument(user_id=u.id, side=side, storage_key=f"k/{side.value}", content_hash="h", content_type="image/jpeg"))
    await db.commit()
    return u


@pytest.mark.asyncio
async def test_submit_requires_all_docs(db):
    await register(_reg(), db)
    u = (await db.execute(select(User).where(User.handle == "nuevo"))).scalar_one()
    # sin documentos → 400
    with pytest.raises(HTTPException) as e:
        await submit_kyc_for_review(u, db)
    assert e.value.status_code == 400


@pytest.mark.asyncio
async def test_submit_then_approve(db):
    u = await _make_pending_with_docs(db)
    out = await submit_kyc_for_review(u, db)
    assert out.kyc_status == "UNDER_REVIEW"
    assert u.kyc_status == KycStatus.UNDER_REVIEW

    admin = User(email="adm@t.test", handle="adm", password_hash=hash_password("x"),
                 is_admin=True, kyc_status=KycStatus.APPROVED, accepted_research_disclaimer=True)
    db.add(admin); await db.commit()
    prof = await approve_kyc(u.id, admin, db)
    assert prof.kyc_status == "APPROVED"
    await db.refresh(u)
    assert u.kyc_status == KycStatus.APPROVED


@pytest.mark.asyncio
async def test_reject_sets_reason(db):
    u = await _make_pending_with_docs(db)
    await submit_kyc_for_review(u, db)
    admin = User(email="adm2@t.test", handle="adm2", password_hash=hash_password("x"),
                 is_admin=True, kyc_status=KycStatus.APPROVED, accepted_research_disclaimer=True)
    db.add(admin); await db.commit()
    prof = await reject_kyc(u.id, KycRejectIn(reason="Foto borrosa"), admin, db)
    assert prof.kyc_status == "REJECTED"
    await db.refresh(u)
    assert u.kyc_rejection_reason == "Foto borrosa"


# ---------- gate de operar ----------

@pytest.mark.asyncio
async def test_gate_blocks_unverified():
    u = User(email="g@t.test", handle="g", password_hash=hash_password("x"),
             kyc_status=KycStatus.UNDER_REVIEW, accepted_research_disclaimer=True)
    with pytest.raises(HTTPException) as e:
        await require_kyc_approved(u)
    assert e.value.status_code == 403


@pytest.mark.asyncio
async def test_gate_allows_approved():
    u = User(email="g2@t.test", handle="g2", password_hash=hash_password("x"),
             kyc_status=KycStatus.APPROVED, accepted_research_disclaimer=True)
    assert await require_kyc_approved(u) is u


# ---------- storage ----------

@pytest.mark.asyncio
async def test_filesystem_storage_roundtrip_and_traversal():
    with tempfile.TemporaryDirectory() as d:
        st = FilesystemStorage(d)
        await st.put("kyc/u1/front.jpg", b"hello", "image/jpeg")
        assert await st.get("kyc/u1/front.jpg") == b"hello"
        await st.delete("kyc/u1/front.jpg")
        # traversal fuera del base → error
        with pytest.raises(StorageError):
            await st.put("../escape.jpg", b"x", "image/jpeg")
