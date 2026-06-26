"""ensure ResolutionOutcome enum includes VOID

Revision ID: 0002_resolution_void
Revises: 0001_baseline
Create Date: 2026-06-26
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0002_resolution_void"
down_revision: Union[str, None] = "0001_baseline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add VOID to the resolutionoutcome enum if it isn't already there.

    Idempotent: ALTER TYPE ... ADD VALUE IF NOT EXISTS is safe on databases
    that already include VOID (created via Base.metadata.create_all after
    the model was updated).

    PostgreSQL enum modifications must run outside a transaction block, so
    we end the implicit txn first.
    """
    # End the migration's implicit transaction so ALTER TYPE can run.
    op.execute("COMMIT")
    op.execute("ALTER TYPE resolutionoutcome ADD VALUE IF NOT EXISTS 'VOID'")


def downgrade() -> None:
    # Postgres does not support removing enum values without recreating the type.
    pass
