"""Mark registration visits as booked appointment vs walk-in.

Revision ID: 016_registration_is_appointment
Revises: 015_clerkship_standard
Create Date: 2026-08-23
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from app.db.migration_ops import add_columns_if_missing, drop_columns_if_present

revision: str = "016_registration_is_appointment"
down_revision: Union[str, None] = "015_clerkship_standard"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    add_columns_if_missing(
        "appointments",
        sa.Column("is_appointment", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    drop_columns_if_present("appointments", "is_appointment")
