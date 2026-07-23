"""Representación de dinero REAL. Regla de oro: el dinero nunca es un float.

Se guarda en **unidades menores enteras** (int) + código ISO-4217. Toda la
aritmética de dinero real pasa por acá. Ver docs/arquitectura-pagos-kyc.md §1.1.
"""
from __future__ import annotations
from decimal import Decimal, ROUND_HALF_UP

# Exponente de la unidad menor por moneda (cuántos decimales tiene).
#   PYG (guaraní) no tiene centavos → 0.   USD/EUR/BRL/ARS → 2.
MINOR_EXPONENT: dict[str, int] = {
    "PYG": 0, "USD": 2, "EUR": 2, "BRL": 2, "ARS": 2, "UYU": 2, "CLP": 0,
}


def supported_currency(currency: str) -> bool:
    return currency.upper() in MINOR_EXPONENT


def _exp(currency: str) -> int:
    cur = currency.upper()
    if cur not in MINOR_EXPONENT:
        raise ValueError(f"Moneda no soportada: {currency}")
    return MINOR_EXPONENT[cur]


def to_minor(amount: Decimal | int | str, currency: str) -> int:
    """Convierte un monto en unidad mayor (ej. 12.50 USD) a unidades menores
    enteras (1250). Rechaza más decimales de los que la moneda admite."""
    amt = Decimal(str(amount))
    factor = Decimal(10) ** _exp(currency)
    minor = amt * factor
    if minor != minor.to_integral_value(rounding=ROUND_HALF_UP) or minor != minor.quantize(Decimal(1)):
        raise ValueError(f"{amount} tiene más decimales de los que admite {currency}")
    return int(minor)


def from_minor(minor: int, currency: str) -> Decimal:
    """Unidades menores → monto en unidad mayor (Decimal, para mostrar/serializar)."""
    factor = Decimal(10) ** _exp(currency)
    return (Decimal(minor) / factor)


def format_minor(minor: int, currency: str) -> str:
    exp = _exp(currency)
    value = from_minor(minor, currency).quantize(Decimal(1).scaleb(-exp)) if exp else from_minor(minor, currency)
    return f"{value} {currency.upper()}"
