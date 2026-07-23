"""Revisión KYC del equipo admin (capacidad `kyc`). La verificación es MANUAL:
el admin ve los datos + las 3 imágenes y aprueba o rechaza. Los documentos se
sirven a través de este backend (nunca públicos) y cada acceso queda logueado.
"""
from __future__ import annotations
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import require_kyc
from ..models import Activity, KycDocument, KycStatus, User
from ..schemas import KycDocumentOut, KycProfileOut, KycRejectIn
from ..storage import get_storage

admin_router = APIRouter(prefix="/admin/kyc", tags=["kyc-admin"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _profile(db: AsyncSession, user: User) -> KycProfileOut:
    docs = (await db.execute(
        select(KycDocument).where(KycDocument.user_id == user.id).order_by(KycDocument.side)
    )).scalars().all()
    return KycProfileOut(
        user_id=user.id, email=user.email, handle=user.handle,
        first_name=user.first_name, last_name=user.last_name, full_name=user.full_name,
        country=user.country, id_number=user.id_number, date_of_birth=user.date_of_birth,
        phone=user.phone, address=user.address,
        document_type=user.document_type.value if user.document_type else None,
        kyc_status=user.kyc_status.value, kyc_rejection_reason=user.kyc_rejection_reason,
        created_at=user.created_at,
        documents=[KycDocumentOut.model_validate(d) for d in docs],
    )


@admin_router.get("", response_model=list[KycProfileOut])
async def list_kyc(
    admin: Annotated[User, Depends(require_kyc)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: str | None = Query("UNDER_REVIEW", alias="status"),
    limit: int = 200,
):
    stmt = select(User).order_by(desc(User.created_at)).limit(limit)
    if status_filter and status_filter.upper() != "ALL":
        try:
            stmt = stmt.where(User.kyc_status == KycStatus[status_filter.upper()])
        except KeyError:
            raise HTTPException(400, "Estado inválido")
    users = (await db.execute(stmt)).scalars().all()
    return [await _profile(db, u) for u in users]


@admin_router.get("/{user_id}", response_model=KycProfileOut)
async def get_kyc(
    user_id: uuid.UUID,
    admin: Annotated[User, Depends(require_kyc)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(404, "Usuario no encontrado")
    return await _profile(db, u)


@admin_router.get("/{user_id}/documents/{doc_id}")
async def get_kyc_document(
    user_id: uuid.UUID,
    doc_id: uuid.UUID,
    admin: Annotated[User, Depends(require_kyc)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Devuelve la imagen del documento (gateado por capacidad `kyc`). Registra el
    acceso en el log de auditoría (Ley 6534/2020: quién vio qué documento y cuándo)."""
    doc = await db.get(KycDocument, doc_id)
    if not doc or doc.user_id != user_id:
        raise HTTPException(404, "Documento no encontrado")
    try:
        data = await get_storage().get(doc.storage_key)
    except Exception:
        raise HTTPException(404, "No se pudo recuperar el documento")

    db.add(Activity(
        user_id=user_id, kind="KYC_DOC_VIEWED",
        note=f"{doc.side.value} visto por {admin.handle}",
    ))
    await db.commit()
    return Response(content=data, media_type=doc.content_type or "application/octet-stream")


@admin_router.post("/{user_id}/approve", response_model=KycProfileOut)
async def approve_kyc(
    user_id: uuid.UUID,
    admin: Annotated[User, Depends(require_kyc)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(404, "Usuario no encontrado")
    # Unicidad al aprobar: ninguna OTRA cuenta aprobada con el mismo documento.
    if u.id_number_normalized:
        clash = (await db.execute(
            select(User.id).where(
                User.id_number_normalized == u.id_number_normalized,
                User.id != u.id, User.kyc_status == KycStatus.APPROVED,
            )
        )).first()
        if clash:
            raise HTTPException(409, "Otra cuenta aprobada ya usa este documento.")
    u.kyc_status = KycStatus.APPROVED
    u.kyc_rejection_reason = None
    u.kyc_completed_at = _now()
    db.add(Activity(user_id=user_id, kind="KYC_APPROVED", note=f"Aprobado por {admin.handle}"))
    await db.commit()
    await db.refresh(u)
    return await _profile(db, u)


@admin_router.post("/{user_id}/reject", response_model=KycProfileOut)
async def reject_kyc(
    user_id: uuid.UUID,
    payload: KycRejectIn,
    admin: Annotated[User, Depends(require_kyc)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(404, "Usuario no encontrado")
    u.kyc_status = KycStatus.REJECTED
    u.kyc_rejection_reason = payload.reason.strip()
    db.add(Activity(user_id=user_id, kind="KYC_REJECTED", note=f"Rechazado por {admin.handle}: {payload.reason}"))
    await db.commit()
    await db.refresh(u)
    return await _profile(db, u)
