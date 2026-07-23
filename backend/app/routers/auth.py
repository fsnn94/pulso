"""Authentication + email verification + KYC routes."""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
import hashlib
import re
import uuid

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
from ..kyc import age_years, normalize_id_number, normalize_phone
from ..models import (
    AmlAlert, AmlAlertStatus, AmlSeverity, DocumentType, EmailVerification,
    KycDocument, KycDocumentSide, KycStatus, PasswordReset, User,
)
from ..schemas import (
    ChangeHandleIn, ChangePasswordIn, ForgotPasswordIn, ForgotPasswordOut,
    KycDocumentOut, KycIn, KycSubmitOut, LoginIn, RegisterIn, ResetPasswordIn,
    TokenOut, UserOut, VerifyIn,
)
from ..storage import get_storage
from ..security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


# ---------- register / login ----------

@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(rate_limit("register", 5, 3600))])
async def register(payload: RegisterIn, db: Annotated[AsyncSession, Depends(get_db)]):
    """Crea la cuenta con los datos de identidad. Unicidad: email, cédula y teléfono
    quedan atados a un único usuario. La cuenta arranca en KYC NONE; el usuario luego
    sube los documentos (selfie + cédula) y envía a revisión (kyc/submit).
    +18 se valida en el schema y se revalida acá."""
    s = get_settings()
    if not payload.accepted_disclaimer:
        raise HTTPException(400, "Debes aceptar el descargo")
    if age_years(payload.date_of_birth) < 18:
        raise HTTPException(403, "Debes ser mayor de 18 años para registrarte")

    id_norm = normalize_id_number(payload.id_number, payload.country)
    phone_norm = normalize_phone(payload.phone, payload.country)

    # Unicidad: email, handle, cédula y teléfono, cada uno atado a un único usuario.
    if (await db.execute(select(User.id).where(func.lower(User.email) == payload.email.lower()))).first():
        raise HTTPException(409, "El email ya está registrado")
    if (await db.execute(select(User.id).where(func.lower(User.handle) == payload.handle.lower()))).first():
        raise HTTPException(409, "El usuario ya está en uso")
    if (await db.execute(select(User.id).where(User.id_number_normalized == id_norm))).first():
        raise HTTPException(409, "El número de documento ya está registrado en otra cuenta")
    if phone_norm and (await db.execute(select(User.id).where(User.phone_normalized == phone_norm))).first():
        raise HTTPException(409, "El teléfono ya está registrado en otra cuenta")

    first = payload.first_name.strip()
    last = payload.last_name.strip()
    user = User(
        email=payload.email,
        handle=payload.handle,
        password_hash=hash_password(payload.password),
        accepted_research_disclaimer=True,
        cash=s.starting_credits,
        first_name=first,
        last_name=last,
        full_name=f"{first} {last}".strip(),
        date_of_birth=payload.date_of_birth,
        id_number=payload.id_number.strip(),
        id_number_normalized=id_norm,
        document_type=DocumentType[payload.document_type],
        country=payload.country.upper(),
        phone=payload.phone.strip(),
        phone_normalized=phone_norm or None,
        address=payload.address.strip(),
        kyc_status=KycStatus.NONE,
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


# ---------- KYC: subida de documentos (registro) ----------

_ALLOWED_DOC_TYPES = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf",
}


@router.post("/kyc/documents", response_model=KycDocumentOut,
             dependencies=[Depends(rate_limit("kyc-upload", 20, 3600))])
async def upload_kyc_document(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    side: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
):
    """Sube una imagen del documento (side = FRONT | BACK | SELFIE). Reemplaza la
    anterior del mismo tipo si existía. La imagen va a storage privado; en la DB
    queda solo el puntero."""
    s = get_settings()
    try:
        side_enum = KycDocumentSide[side.upper()]
    except KeyError:
        raise HTTPException(400, "Tipo de documento inválido (FRONT | BACK | SELFIE)")

    ct = (file.content_type or "").lower()
    if ct not in _ALLOWED_DOC_TYPES:
        raise HTTPException(415, "Formato no permitido. Usá JPG, PNG, WEBP o PDF.")

    data = await file.read()
    if not data:
        raise HTTPException(400, "El archivo está vacío")
    if len(data) > s.kyc_max_file_bytes:
        raise HTTPException(413, "El archivo es demasiado grande (máx. 8 MB)")

    ext = _ALLOWED_DOC_TYPES[ct]
    key = f"kyc/{user.id}/{side_enum.value.lower()}-{uuid.uuid4().hex}.{ext}"
    await get_storage().put(key, data, ct)

    # Reemplaza el documento previo del mismo lado (best-effort borra su blob).
    prev = (await db.execute(
        select(KycDocument).where(KycDocument.user_id == user.id, KycDocument.side == side_enum)
    )).scalars().all()
    for p in prev:
        try:
            await get_storage().delete(p.storage_key)
        except Exception:
            pass
        await db.delete(p)

    doc = KycDocument(
        user_id=user.id, side=side_enum, storage_key=key,
        content_hash=hashlib.sha256(data).hexdigest(), content_type=ct,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


@router.post("/kyc/submit", response_model=KycSubmitOut)
async def submit_kyc_for_review(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Envía la cuenta a revisión del equipo admin. Exige los datos de identidad y
    los 3 documentos (frente, dorso, selfie con cédula)."""
    if user.kyc_status == KycStatus.APPROVED:
        raise HTTPException(400, "Tu identidad ya está verificada.")
    if not (user.id_number_normalized and user.date_of_birth and user.full_name):
        raise HTTPException(400, "Faltan datos de identidad. Completá el registro.")

    sides = {
        d.side for d in (await db.execute(
            select(KycDocument).where(KycDocument.user_id == user.id)
        )).scalars().all()
    }
    required = {KycDocumentSide.FRONT, KycDocumentSide.BACK, KycDocumentSide.SELFIE}
    missing = required - sides
    if missing:
        faltan = ", ".join(sorted(m.value for m in missing))
        raise HTTPException(400, f"Faltan documentos: {faltan}")

    user.kyc_status = KycStatus.UNDER_REVIEW
    user.kyc_rejection_reason = None
    await db.commit()
    return KycSubmitOut(kyc_status=KycStatus.UNDER_REVIEW.value, sla_hours=get_settings().kyc_review_sla_hours)


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
    """Registra el perfil de identidad. Reglas DURAS (backend = fuente de verdad,
    nunca el frontend):
      1. +18 a partir de la fecha de nacimiento.
      2. Unicidad de documento: una cédula/pasaporte = una sola cuenta.
    Nota: sin extracción de la foto todavía, el punto de registro es este submit;
    la foto + OCR + aprobación por admin son el próximo incremento (deja el estado
    en SUBMITTED). Ver docs/arquitectura-pagos-kyc.md."""
    # 1. Mayoría de edad (revalidado en backend, no solo en el schema).
    if age_years(payload.date_of_birth) < 18:
        raise HTTPException(403, "Debes ser mayor de 18 años para completar la verificación.")

    # 2. Unicidad del documento entre cuentas.
    normalized = normalize_id_number(payload.id_number, payload.country)
    clash = (await db.execute(
        select(User).where(User.id_number_normalized == normalized, User.id != user.id)
    )).scalar_one_or_none()
    if clash:
        # Documento ya usado por otra cuenta → posible multi-cuenta/fraude: alerta AML.
        db.add(AmlAlert(
            user_id=user.id, rule_code="DUPLICATE_ID", severity=AmlSeverity.HIGH,
            message="Intento de registrar un documento ya asociado a otra cuenta.",
            evidence={"conflicting_user_id": str(clash.id), "id_number_normalized": normalized},
            status=AmlAlertStatus.OPEN, dedup_key=normalized,
        ))
        await db.commit()
        raise HTTPException(409, "Este documento ya está registrado en otra cuenta.")

    user.full_name = payload.full_name.strip()
    user.country = payload.country.upper()
    user.id_number = payload.id_number.strip()
    user.id_number_normalized = normalized
    user.document_type = DocumentType[payload.document_type]
    user.date_of_birth = payload.date_of_birth
    user.kyc_status = KycStatus.SUBMITTED
    user.kyc_rejection_reason = None
    user.kyc_completed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)
    return user
