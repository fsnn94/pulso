"""add yes_label/no_label to markets and market_proposals (binarios etiquetados)

Revision ID: 0006_market_labels
Revises: 0005_admin_hierarchy
Create Date: 2026-07-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006_market_labels"
down_revision: Union[str, None] = "0005_admin_hierarchy"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _add_labels(table: str) -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c["name"] for c in insp.get_columns(table)}
    if "yes_label" not in cols:
        op.add_column(table, sa.Column("yes_label", sa.String(length=40), nullable=False, server_default="Sí"))
    if "no_label" not in cols:
        op.add_column(table, sa.Column("no_label", sa.String(length=40), nullable=False, server_default="No"))


def _drop_labels(table: str) -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c["name"] for c in insp.get_columns(table)}
    if "no_label" in cols:
        op.drop_column(table, "no_label")
    if "yes_label" in cols:
        op.drop_column(table, "yes_label")


def upgrade() -> None:
    _add_labels("markets")
    _add_labels("market_proposals")


def downgrade() -> None:
    _drop_labels("market_proposals")
    _drop_labels("markets")
