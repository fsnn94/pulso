"""Lógica de KYC: normalización de documento, edad, y (a futuro) extracción por
visión/OCR. Ver docs/arquitectura-pagos-kyc.md."""
from __future__ import annotations
import re
from datetime import datetime, timezone

MIN_AGE = 18

_NON_ALNUM = re.compile(r"[^A-Za-z0-9]")


def normalize_id_number(id_number: str, country: str | None) -> str:
    """Clave canónica de unicidad de un documento: sin puntos/espacios/guiones,
    en mayúsculas, prefijada por país. Ej. ("1.234.567", "py") -> "PY:1234567".
    Dos personas nunca comparten documento, así que esto identifica a la persona."""
    cleaned = _NON_ALNUM.sub("", id_number or "").upper()
    return f"{(country or '').upper()}:{cleaned}"


def _as_utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def age_years(dob: datetime, at: datetime | None = None) -> int:
    """Edad cumplida en años entre `dob` y `at` (por defecto ahora, UTC)."""
    at = at or datetime.now(timezone.utc)
    dob, at = _as_utc(dob), _as_utc(at)
    years = at.year - dob.year
    if (at.month, at.day) < (dob.month, dob.day):
        years -= 1
    return years


def is_adult(dob: datetime, at: datetime | None = None) -> bool:
    return age_years(dob, at) >= MIN_AGE
