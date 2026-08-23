"""Registration payer types, outstanding flag, and appointment queue numbers.

Revision ID: 014_registration_payer_queue
Revises: 013_registration_warehouse
Create Date: 2026-08-23
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from app.db.migration_ops import add_columns_if_missing, drop_columns_if_present

revision: str = "014_registration_payer_queue"
down_revision: Union[str, None] = "013_registration_warehouse"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    add_columns_if_missing(
        "payments",
        sa.Column("payer_type", sa.String(length=24), nullable=False, server_default="self"),
        sa.Column("insurer", sa.String(length=80), nullable=True),
    )
    add_columns_if_missing(
        "patients",
        sa.Column("has_outstanding", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    add_columns_if_missing(
        "appointments",
        sa.Column("queue_number", sa.Integer(), nullable=True),
        sa.Column("service_name", sa.String(length=200), nullable=True),
        sa.Column("department", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    drop_columns_if_present("appointments", "queue_number", "service_name", "department")
    drop_columns_if_present("patients", "has_outstanding")
    drop_columns_if_present("payments", "payer_type", "insurer")
