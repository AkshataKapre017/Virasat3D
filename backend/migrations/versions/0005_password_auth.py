"""replace one-time email codes with password authentication

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-04 00:00:02
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("password_hash", sa.String(length=255), nullable=False, server_default=""),
    )
    op.alter_column("users", "password_hash", server_default=None)

    op.drop_index(op.f("ix_login_codes_created_at"), table_name="login_codes")
    op.drop_index(op.f("ix_login_codes_ip"), table_name="login_codes")
    op.drop_index(op.f("ix_login_codes_email"), table_name="login_codes")
    op.drop_table("login_codes")


def downgrade() -> None:
    op.create_table(
        "login_codes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("purpose", sa.String(length=16), nullable=False),
        sa.Column("role", sa.String(length=24), nullable=True),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_login_codes")),
    )
    op.create_index(op.f("ix_login_codes_email"), "login_codes", ["email"], unique=False)
    op.create_index(op.f("ix_login_codes_ip"), "login_codes", ["ip"], unique=False)
    op.create_index(op.f("ix_login_codes_created_at"), "login_codes", ["created_at"], unique=False)

    op.drop_column("users", "password_hash")
