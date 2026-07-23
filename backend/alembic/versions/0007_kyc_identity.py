"""KYC de identidad: columnas de users (kyc_status, document_type,
id_number_normalized único, kyc_rejection_reason)

Las tablas kyc_documents / kyc_extractions las crea create_all (convención del
repo, ver alembic/README.md), por eso no se crean acá.

Revision ID: 0007_kyc_identity
Revises: 0006_market_labels
Create Date: 2026-07-23
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007_kyc_identity"
down_revision: Union[str, None] = "0006_market_labels"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_IDX_NORMALIZED = "ix_users_id_number_normalized"


def upgrade() -> None:
    # Idempotente: en bases nuevas create_all ya creó columnas, tipos e índice.
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c["name"] for c in insp.get_columns("users")}

    # Crear los tipos ENUM si faltan (create_all los crea en bases nuevas).
    kycstatus = postgresql.ENUM(
        "NONE", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED",
        name="kycstatus",
    )
    kycstatus.create(bind, checkfirst=True)
    documenttype = postgresql.ENUM("CEDULA", "PASSPORT", name="documenttype")
    documenttype.create(bind, checkfirst=True)

    # Referencias sin re-crear el tipo (ya existe por el .create de arriba).
    kycstatus_ref = postgresql.ENUM(
        "NONE", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED",
        name="kycstatus", create_type=False,
    )
    documenttype_ref = postgresql.ENUM("CEDULA", "PASSPORT", name="documenttype", create_type=False)

    if "kyc_status" not in cols:
        op.add_column("users", sa.Column(
            "kyc_status", kycstatus_ref, nullable=False, server_default="NONE",
        ))
    if "kyc_rejection_reason" not in cols:
        op.add_column("users", sa.Column("kyc_rejection_reason", sa.String(500), nullable=True))
    if "document_type" not in cols:
        op.add_column("users", sa.Column("document_type", documenttype_ref, nullable=True))
    if "id_number_normalized" not in cols:
        op.add_column("users", sa.Column("id_number_normalized", sa.String(60), nullable=True))

    # Índice único (nulos múltiples permitidos en Postgres) — solo si falta.
    idx_names = {i["name"] for i in insp.get_indexes("users")}
    if _IDX_NORMALIZED not in idx_names:
        op.create_index(_IDX_NORMALIZED, "users", ["id_number_normalized"], unique=True)


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    idx_names = {i["name"] for i in insp.get_indexes("users")}
    if _IDX_NORMALIZED in idx_names:
        op.drop_index(_IDX_NORMALIZED, table_name="users")
    cols = {c["name"] for c in insp.get_columns("users")}
    for col in ("id_number_normalized", "document_type", "kyc_rejection_reason", "kyc_status"):
        if col in cols:
            op.drop_column("users", col)
