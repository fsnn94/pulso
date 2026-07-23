"""KYC en el registro: columnas de usuario (nombres/apellidos, teléfono único,
dirección) + grandfather de usuarios existentes a APPROVED.

Revision ID: 0008_kyc_registration
Revises: 0007_kyc_identity
Create Date: 2026-07-23
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008_kyc_registration"
down_revision: Union[str, None] = "0007_kyc_identity"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_IDX_PHONE = "ix_users_phone_normalized"


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c["name"] for c in insp.get_columns("users")}

    if "first_name" not in cols:
        op.add_column("users", sa.Column("first_name", sa.String(80), nullable=True))
    if "last_name" not in cols:
        op.add_column("users", sa.Column("last_name", sa.String(80), nullable=True))
    if "phone" not in cols:
        op.add_column("users", sa.Column("phone", sa.String(40), nullable=True))
    if "phone_normalized" not in cols:
        op.add_column("users", sa.Column("phone_normalized", sa.String(40), nullable=True))
    if "address" not in cols:
        op.add_column("users", sa.Column("address", sa.String(300), nullable=True))

    idx_names = {i["name"] for i in insp.get_indexes("users")}
    if _IDX_PHONE not in idx_names:
        op.create_index(_IDX_PHONE, "users", ["phone_normalized"], unique=True)

    # Grandfather: los usuarios que YA existen al momento de este deploy quedan
    # aprobados, así el nuevo gate de KYC no les corta el acceso. Solo las cuentas
    # creadas DESPUÉS pasan por el flujo de verificación (arrancan en NONE).
    op.execute("UPDATE users SET kyc_status = 'APPROVED' WHERE kyc_status = 'NONE'")


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    idx_names = {i["name"] for i in insp.get_indexes("users")}
    if _IDX_PHONE in idx_names:
        op.drop_index(_IDX_PHONE, table_name="users")
    cols = {c["name"] for c in insp.get_columns("users")}
    for col in ("address", "phone_normalized", "phone", "last_name", "first_name"):
        if col in cols:
            op.drop_column("users", col)
