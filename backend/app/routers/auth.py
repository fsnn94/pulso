"""Authentication + email verification + KYC routes."""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
import re

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..db import get_db
from ..deps import get_current_user
from ..ratelimit import rate_limit
from ..email import (
    issue_password_reset_token, issue_verification_token, password_reset_link,
    send_password_reset_email, send_verification_email, verification_link,
)
from ..models import EmailVerification, PasswordReset, User
from ..schemas import (
    ChangeHandleIn, ChangePasswordIn, ForgotPasswordIn, ForgotPasswordOut, KycIn,
    LoginIn, RegisterIn, ResetPasswordIn, TokenOut, UserOut, VerifyIn,
)
from ..security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


# ---------- register / login ----------

@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(rate_limit("register", 5, 3600))])
async def register(payload: RegisterIn, db: Annotated[AsyncSession, Depends(get_db)]):
    s = get_settings()
    if not payload.accepted_disclaimer:
        raise HTTPException(400, "Debes aceptar el descargo")
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none():
        raise HTTPException(409, "El email ya está registrado")
    handle_taken = await db.execute(select(User).where(User.handle == payload.handle))
    if handle_taken.scalar_one_or_none():
        raise HTTPException(409, "El usuario ya está en uso")
    user = User(
        email=payload.email,
        handle=payload.handle,
        password_hash=hash_password(payload.password),
        accepted_research_disclaimer=True,
        cash=s.starting_credits,
    )
    db.add(user)
    await db.flush()

    token = await issue_verification_token(db, user)
    await db.commit()
    await db.refresh(user)

    link = verification_link(s.frontend_base_url, token)
    await send_verification_email(user, link)

    return TokenOut(
        access_token=create_access_token(user.id, is_admin=user.is_admin, password_hash=user.password_hash),
        verification_link=link if (s.expose_verification_link_in_dev and s.environment != "production") else None,
    )


@router.post("/login", response_model=TokenOut,
             dependencies=[Depends(rate_limit("login", 10, 60))])
async def login(payload: LoginIn, db: Annotated[AsyncSession, Depends(get_db)]):
    ident = payload.email.strip()
    res = await db.execute(
        select(User).where(or_(User.email == ident, User.handle == ident))
    )
    user = res.scalar_one_or_none()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Usuario/email o contraseña inválidos")
    if user.disabled:
        raise HTTPException(403, "La cuenta ha quedado inhabilitada")
    return TokenOut(access_token=create_access_token(user.id, is_admin=user.is_admin, password_hash=user.password_hash))


@router.get("/me", response_model=UserOut)
async def me(user: Annotated[User, Depends(get_current_user)]):
    return user


# ---------- account security (item #8) ----------

HANDLE_RE = re.compile(r"^[A-Za-z0-9_]{2,40}$")


@router.post("/change-password", response_model=TokenOut,
             dependencies=[Depends(rate_limit("change-password", 10, 300))])
async def change_password(
    payload: ChangePasswordIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Change the password. Requires the current password; invalidates every
    previously issued token (via the `pv` claim) and returns a fresh one so the
    client that changed it keeps a valid session while other sessions are cut."""
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(403, "La contraseña actual es incorrecta")
    if payload.new_password == payload.current_password:
        raise HTTPException(400, "La nueva contraseña debe ser distinta de la actual")
    user.password_hash = hash_password(payload.new_password)
    await db.commit()
    return TokenOut(access_token=create_access_token(user.id, is_admin=user.is_admin, password_hash=user.password_hash))


@router.patch("/handle", response_model=UserOut)
async def change_handle(
    payload: ChangeHandleIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Change the public @handle. Validates format and case-insensitive uniqueness."""
    new_handle = payload.handle.strip()
    if not HANDLE_RE.match(new_handle):
        raise HTTPException(400, "El usuario solo puede tener letras, números y guion bajo (2-40)")
    if new_handle.lower() == user.handle.lower():
        # Allow pure case changes; otherwise no-op.
        user.handle = new_handle
        await db.commit()
        await db.refresh(user)
        return user
    taken = await db.execute(
        select(User).where(func.lower(User.handle) == new_handle.lower(), User.id != user.id)
    )
    if taken.scalar_one_or_none():
        raise HTTPException(409, "El usuario ya está en uso")
    user.handle = new_handle
    await db.commit()
    await db.refresh(user)
    return user


# ---------- password reset (F1) ----------

@router.post("/forgot-password", response_model=ForgotPasswordOut,
             dependencies=[Depends(rate_limit("forgot-password", 5, 3600))])
async def forgot_password(payload: ForgotPasswordIn, db: Annotated[AsyncSession, Depends(get_db)]):
    """Inicia el reset de contraseña. Responde 200 siempre (no revela si el email
    existe, para evitar enumeración de cuentas)."""
    s = get_settings()
    user = (await db.execute(
        select(User).where(func.lower(User.email) == payload.email.lower())
    )).scalar_one_or_none()
    link = None
    if user and not user.disabled:
        token = await issue_password_reset_token(db, user)
        await db.commit()
        link = password_reset_link(s.frontend_base_url, token)
        await send_password_reset_email(user, link)
    return ForgotPasswordOut(
        ok=True,
        reset_link=link if (s.expose_verification_link_in_dev and s.environment != "production") else None,
    )


@router.post("/reset-password", response_model=TokenOut,
             dependencies=[Depends(rate_limit("reset-password", 10, 3600))])
async def reset_password(payload: ResetPasswordIn, db: Annotated[AsyncSession, Depends(get_db)]):
    pr = (await db.execute(
        select(PasswordReset).where(PasswordReset.token == payload.token)
    )).scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if not pr or pr.used_at is not None or pr.expires_at < now:
        raise HTTPException(400, "El link de recuperación es inválido o expiró")
    user = await db.get(User, pr.user_id)
    if not user:
        raise HTTPException(404, "Usuario no encontrado")
    user.password_hash = hash_password(payload.new_password)
    pr.used_at = now
    await db.commit()
    # Nueva contraseña → invalida sesiones previas (claim pv). Devolvemos token
    # nuevo para que el usuario quede logueado tras el reset.
    return TokenOut(access_token=create_access_token(user.id, is_admin=user.is_admin, password_hash=user.password_hash))


# ---------- email verification ----------

@router.post("/verify", response_model=UserOut)
async def verify_email(
    payload: VerifyIn,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    rs = await db.execute(select(EmailVerification).where(EmailVerification.token == payload.token))
    ev = rs.scalar_one_or_none()
    if not ev:
        raise HTTPException(404, "Token inválido o expirado")
    if ev.used_at is not None:
        raise HTTPException(400, "Token inválido o expirado")
    if ev.expires_at < datetime.now(timezone.utc):
        raise HTTPException(400, "El link de verificación expiró — solicita un nuevo email")
    user = await db.get(User, ev.user_id)
    if not user:
        raise HTTPException(404, "Usuario no encontrado")
    user.email_verified = True
    user.email_verified_at = datetime.now(timezone.utc)
    ev.used_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/resend-verification", response_model=TokenOut,
             dependencies=[Depends(rate_limit("resend-verification", 4, 3600))])
async def resend_verification(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if user.email_verified:
        raise HTTPException(400, "El email ya fue verificado")
    s = get_settings()
    token = await issue_verification_token(db, user)
    await db.commit()
    link = verification_link(s.frontend_base_url, token)
    await send_verification_email(user, link)
    return TokenOut(
        access_token=create_access_token(user.id, is_admin=user.is_admin, password_hash=user.password_hash),
        verification_link=link if (s.expose_verification_link_in_dev and s.environment != "production") else None,
    )


# ---------- KYC (compliance profile) ----------

@router.post("/kyc", response_model=UserOut)
async def submit_kyc(
    payload: KycIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    user.full_name = payload.full_name.strip()
    user.country = payload.country.upper()
    user.id_number = payload.id_number.strip()
    user.date_of_birth = payload.date_of_birth
    user.kyc_completed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)
    return user
