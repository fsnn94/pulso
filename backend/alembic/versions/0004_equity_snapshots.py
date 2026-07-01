"""add equity_snapshots table (item #9: P&L histórico con timeframes)

Revision ID: 0004_equity_snapshots
Revises: 0003_user_disabled
Create Date: 2026-06-28
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0004_equity_snapshots"
down_revision: Union[str, None] = "0003_user_disabled"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Idempotente: la tabla puede existir ya por Base.metadata.create_all(),
    # que corre antes de las migraciones. Si existe, no hacemos nada (así la
    # cadena de migraciones avanza a la siguiente en vez de abortar).
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "equity_snapshots" in insp.get_table_names():
        return
    op.create_table(
        "equity_snapshots",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("cash", sa.Float(), nullable=False),
        sa.Column("positions_value", sa.Float(), nullable=False),
        sa.Column("equity", sa.Float(), nullable=False),
        sa.Column("realized_pnl", sa.Float(), nullable=False, server_default="0"),
    )
    op.create_index("ix_equity_snapshots_user_id", "equity_snapshots", ["user_id"])
    op.create_index("ix_equity_snapshots_user_ts", "equity_snapshots", ["user_id", "ts"])


def downgrade() -> None:
    op.drop_index("ix_equity_snapshots_user_ts", table_name="equity_snapshots")
    op.drop_index("ix_equity_snapshots_user_id", table_name="equity_snapshots")
    op.drop_table("equity_snapshots")
