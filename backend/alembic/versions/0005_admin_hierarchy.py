"""add admin hierarchy: users.is_superadmin + users.admin_perms

Revision ID: 0005_admin_hierarchy
Revises: 0004_equity_snapshots
Create Date: 2026-06-30
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0005_admin_hierarchy"
down_revision: Union[str, None] = "0004_equity_snapshots"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Idempotente: las columnas pueden existir ya por create_all() en bases nuevas.
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c["name"] for c in insp.get_columns("users")}
    if "is_superadmin" not in cols:
        op.add_column(
            "users",
            sa.Column("is_superadmin", sa.Boolean(), nullable=False, server_default=sa.false()),
        )
        op.alter_column("users", "is_superadmin", server_default=None)
    # admin_perms: NULL = admin legado con acceso total; lista = capacidades explícitas.
    if "admin_perms" not in cols:
        op.add_column("users", sa.Column("admin_perms", JSONB(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c["name"] for c in insp.get_columns("users")}
    if "admin_perms" in cols:
        op.drop_column("users", "admin_perms")
    if "is_superadmin" in cols:
        op.drop_column("users", "is_superadmin")
