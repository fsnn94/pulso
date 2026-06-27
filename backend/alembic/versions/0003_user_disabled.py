"""add users.disabled column

Revision ID: 0003_user_disabled
Revises: 0002_resolution_void
Create Date: 2026-06-27
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_user_disabled"
down_revision: Union[str, None] = "0002_resolution_void"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("disabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    # Drop server_default so future inserts use the Python-side default
    op.alter_column("users", "disabled", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "disabled")
