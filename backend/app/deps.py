"""FastAPI dependencies."""
from __future__ import annotations
import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from .db import get_db
from .models import User
from .security import decode_token, password_token_version

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Falta el token de autenticación")
    payload = decode_token(creds.credentials)
    if not payload or "sub" not in payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token inválido o expirado")
    try:
        user_id = uuid.UUID(payload["sub"])
    except ValueError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token inválido o expirado")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario no encontrado")
    # Deshabilitar una cuenta corta su sesión activa de inmediato (no solo en el
    # próximo login): el token vigente deja de servir apenas se marca disabled.
    if user.disabled:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "La cuenta ha quedado inhabilitada")
    # Tie the token to the current password: changing it invalidates old tokens.
    if payload.get("pv") != password_token_version(user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "La sesión expiró — inicia sesión nuevamente")
    return user


async def require_admin(user: Annotated[User, Depends(get_current_user)]) -> User:
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Se requiere acceso de admin")
    return user


# ----- Jerarquía de admins: capacidades toggleables por el superadmin -----
# Cada capacidad mapea a una sección del panel de admin.
ADMIN_CAPABILITIES: tuple[str, ...] = (
    "markets", "proposals", "cashflow", "aml", "resolutions", "users", "payments", "kyc",
)


def has_capability(user: User, cap: str) -> bool:
    """True si el usuario admin puede acceder a la capacidad `cap`.
    - superadmin: siempre.
    - admin legado (admin_perms == None): acceso total (compat hacia atrás).
    - admin normal: solo si `cap` está en su lista de capacidades.
    """
    if not user.is_admin:
        return False
    if user.is_superadmin:
        return True
    if user.admin_perms is None:
        return True
    return cap in user.admin_perms


def require_capability(cap: str):
    """Factory de dependencia que exige la capacidad `cap` (o superadmin)."""
    async def _dep(user: Annotated[User, Depends(get_current_user)]) -> User:
        if not user.is_admin:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Se requiere acceso de admin")
        if not has_capability(user, cap):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "No tenés permiso para esta sección del panel.",
            )
        return user
    return _dep


require_markets     = require_capability("markets")
require_proposals   = require_capability("proposals")
require_cashflow    = require_capability("cashflow")
require_aml_cap     = require_capability("aml")
require_resolutions = require_capability("resolutions")
require_users       = require_capability("users")
require_payments    = require_capability("payments")
require_kyc         = require_capability("kyc")


async def require_superadmin(user: Annotated[User, Depends(get_current_user)]) -> User:
    """Solo el admin principal: gestionar otros admins y sus permisos."""
    if not user.is_admin or not user.is_superadmin:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Se requiere acceso de administrador principal.",
        )
    return user


async def require_verified(user: Annotated[User, Depends(get_current_user)]) -> User:
    """Block trading until the user has verified their email (configurable)."""
    from .config import get_settings
    if get_settings().require_email_verification_to_trade and not user.email_verified:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Verifica tu email para operar. Revisa tu bandeja de entrada o solicita un nuevo link.",
        )
    return user


async def require_kyc_approved(user: Annotated[User, Depends(get_current_user)]) -> User:
    """Bloquea operar hasta que el equipo admin verifique la identidad (KYC APPROVED).
    Los usuarios previos al deploy quedan grandfathered (APPROVED) por la migración."""
    from .config import get_settings
    from .models import KycStatus
    if not get_settings().kyc_required_to_trade:
        return user
    if user.kyc_status != KycStatus.APPROVED:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Tu cuenta está en revisión. Podrás operar cuando se verifique tu identidad.",
        )
    return user
