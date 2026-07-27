"""Tests de los fixes de la auditoría de seguridad (superficie KYC/pagos/export)."""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.config import Settings
from app.models import KycStatus, User
from app.routers.admin import _csv_safe as admin_csv_safe
from app.routers.auth import _sniff_matches, upload_kyc_document
from app.routers.portfolio import _csv_safe
from app.security import hash_password

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
JPG = b"\xff\xd8\xff\xe0" + b"\x00" * 32
PDF = b"%PDF-1.7\n" + b"\x00" * 32
HTML = b"<html><script>alert(1)</script></html>"


def test_sniff_accepts_real_files():
    assert _sniff_matches(PNG, "image/png")
    assert _sniff_matches(JPG, "image/jpeg")
    assert _sniff_matches(PDF, "application/pdf")
    assert _sniff_matches(b"RIFF" + b"\x00" * 4 + b"WEBP", "image/webp")


def test_sniff_rejects_disguised_html():
    # HTML declarado como PNG/JPG → rechazado (evita XSS almacenado en el panel).
    assert not _sniff_matches(HTML, "image/png")
    assert not _sniff_matches(HTML, "image/jpeg")
    # PNG real declarado como PDF → tampoco pasa.
    assert not _sniff_matches(PNG, "application/pdf")


@pytest.mark.parametrize("raw", ["=1+1", "+cmd", "-x", "@SUM(A1)", "\tx"])
def test_csv_safe_neutralizes_formulas(raw):
    assert _csv_safe(raw).startswith("'")
    assert admin_csv_safe(raw).startswith("'")


def test_csv_safe_leaves_normal_text():
    assert _csv_safe("Olimpia campeón") == "Olimpia campeón"
    assert _csv_safe("") == ""


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [KycStatus.APPROVED, KycStatus.UNDER_REVIEW])
async def test_upload_blocked_after_submit(status):
    """No se puede reemplazar documentos de una cuenta aprobada o en revisión
    (destruiría la evidencia revisada)."""
    u = User(email="x@t.test", handle="x", password_hash=hash_password("p"),
             kyc_status=status, accepted_research_disclaimer=True)
    with pytest.raises(HTTPException) as e:
        await upload_kyc_document(u, None, "FRONT", None)
    assert e.value.status_code == 409


def test_environment_defaults_to_production():
    """Fail-safe: sin ENVIRONMENT seteado no se exponen links de reseteo."""
    s = Settings(_env_file=None)
    assert s.environment == "production"
    assert s.debug is False
