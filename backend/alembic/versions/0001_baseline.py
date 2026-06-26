"""baseline (captures pre-Alembic schema state)

Revision ID: 0001_baseline
Revises:
Create Date: 2026-06-26
"""
from typing import Sequence, Union

revision: str = "0001_baseline"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Baseline: schema was created via Base.metadata.create_all before Alembic was wired in.

    This empty migration records the current state so future migrations can stack on top.
    """
    pass


def downgrade() -> None:
    pass
