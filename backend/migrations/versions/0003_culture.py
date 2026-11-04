"""culture section: living-tradition entries

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-04 00:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "culture_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("name_hi", sa.String(length=200), nullable=True),
        sa.Column("region", sa.String(length=120), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("highlights", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("image_alt", sa.Text(), nullable=True),
        sa.Column("credit", sa.Text(), nullable=True),
        sa.Column("licence", sa.String(length=80), nullable=True),
        sa.Column("source_url", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_culture_items_category"), "culture_items", ["category"], unique=False)
    op.create_index(op.f("ix_culture_items_region"), "culture_items", ["region"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_culture_items_region"), table_name="culture_items")
    op.drop_index(op.f("ix_culture_items_category"), table_name="culture_items")
    op.drop_table("culture_items")
