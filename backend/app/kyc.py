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


# Códigos de discado por país (ISO alpha-2) — para normalizar teléfonos a un
# formato canónico y detectar duplicados (0981... y +595981... = mismo número).
_CALLING_CODES = {
    "PY": "595", "AR": "54", "BR": "55", "CL": "56", "UY": "598", "BO": "591",
    "US": "1", "ES": "34", "MX": "52",
}


def normalize_phone(phone: str, country: str | None) -> str:
    """Teléfono canónico: solo dígitos, con prefijo país (+595...). Heurístico:
    quita el 0 troncal local y antepone el código de discado del país."""
    digits = re.sub(r"\D", "", phone or "")
    cc = _CALLING_CODES.get((country or "").upper())
    if cc and not digits.startswith(cc):
        digits = cc + digits.lstrip("0")
    return f"+{digits}" if digits else ""


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
