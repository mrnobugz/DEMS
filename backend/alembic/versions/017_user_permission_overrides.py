"""Per-user permission grants and denials for admin user management.

Revision ID: 017_user_permission_overrides
Revises: 016_registration_is_appointment
Create Date: 2026-08-23
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from app.db.migration_ops import add_columns_if_missing, drop_columns_if_present

revision: str = "017_user_permission_overrides"
down_revision: Union[str, None] = "016_registration_is_appointment"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    add_columns_if_missing(
        "users",
        sa.Column("extra_permissions", sa.Text(), nullable=True),
        sa.Column("denied_permissions", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    drop_columns_if_present("users", "extra_permissions", "denied_permissions")
