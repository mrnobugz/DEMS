"""Prescription course fields (frequency, days, dates) and bill-on-sign.

Revision ID: 030_rx_course_fields
Revises: 029_pharmacy_sales
Create Date: 2026-10-02
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from app.db.migration_ops import add_columns_if_missing, drop_columns_if_present

revision: str = "030_rx_course_fields"
down_revision: Union[str, None] = "029_pharmacy_sales"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    add_columns_if_missing(
        "prescription_items",
        sa.Column("frequency", sa.String(80), nullable=True),
        sa.Column("days", sa.Integer(), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
    )


def downgrade() -> None:
    drop_columns_if_present(
        "prescription_items",
        "frequency",
        "days",
        "start_date",
        "end_date",
    )
