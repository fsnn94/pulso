"""Authentication + email verification + KYC routes."""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..db import get_db
from ..deps import get_current_user
from ..email import issue_verification_token, send_verification_email, verification_link
from ..models import EmailVerification, User
from ..schemas import KycIn, LoginIn, RegisterIn, TokenOut, UserOut, VerifyIn
from ..security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


# ---------- register / login ----------

@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
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
        access_token=create_access_token(user.id, is_admin=user.is_admin),
        verification_link=link if s.expose_verification_link_in_dev else None,
    )


@router.post("/login", response_model=TokenOut)
async def login(payload: LoginIn, db: Annotated[AsyncSession, Depends(get_db)]):
    res = await db.execute(select(User).where(User.email == payload.email))
    user = res.scalar_one_or_none()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Email o contraseña inválidos")
    return TokenOut(access_token=create_access_token(user.id, is_admin=user.is_admin))


@router.get("/me", response_model=UserOut)
async def me(user: Annotated[User, Depends(get_current_user)]):
    return user


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


@router.post("/resend-verification", response_model=TokenOut)
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
        access_token=create_access_token(user.id, is_admin=user.is_admin),
        verification_link=link if s.expose_verification_link_in_dev else None,
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
