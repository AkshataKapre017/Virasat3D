"""verification workflow: asset verification state and append-only review events

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-02 00:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Existing rows predate the workflow and are already public, so they backfill as published.
    op.add_column(
        "assets",
        sa.Column("verification_state", sa.String(length=16), server_default="published", nullable=False),
    )
    op.add_column("assets", sa.Column("verification_reason", sa.Text(), nullable=True))
    op.create_index("ix_assets_verification_state", "assets", ["verification_state"])
    op.create_table(
        "review_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("asset_id", sa.Integer(), nullable=False),
        sa.Column("from_state", sa.String(length=16), nullable=True),
        sa.Column("to_state", sa.String(length=16), nullable=False),
        sa.Column("actor", sa.String(length=120), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["asset_id"], ["assets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_review_events_asset_id", "review_events", ["asset_id"])
    op.create_index("ix_review_events_created_at", "review_events", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_review_events_created_at", table_name="review_events")
    op.drop_index("ix_review_events_asset_id", table_name="review_events")
    op.drop_table("review_events")
    op.drop_index("ix_assets_verification_state", table_name="assets")
    op.drop_column("assets", "verification_reason")
    op.drop_column("assets", "verification_state")
