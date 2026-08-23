"""Full dental clerkship registration particulars.

Adds middle name, national ID, next-of-kin details, guardian (minors),
history of presenting complaint, and social-history fields used on
standard dental clinic clerkship forms.

Revision ID: 015_clerkship_standard
Revises: 014_registration_payer_queue
Create Date: 2026-08-23
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from app.db.migration_ops import add_columns_if_missing, drop_columns_if_present

revision: str = "015_clerkship_standard"
down_revision: Union[str, None] = "014_registration_payer_queue"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    add_columns_if_missing(
        "patients",
        sa.Column("middle_name", sa.String(length=100), nullable=True),
        sa.Column("national_id", sa.String(length=64), nullable=True),
        sa.Column("next_of_kin_relationship", sa.String(length=80), nullable=True),
        sa.Column("next_of_kin_phone", sa.String(length=40), nullable=True),
        sa.Column("guardian_name", sa.String(length=200), nullable=True),
        sa.Column("guardian_relationship", sa.String(length=80), nullable=True),
        sa.Column("guardian_phone", sa.String(length=40), nullable=True),
        sa.Column("history_of_presenting_complaint", sa.Text(), nullable=True),
        sa.Column("last_dental_visit", sa.String(length=120), nullable=True),
        sa.Column("smoking_status", sa.String(length=40), nullable=True),
        sa.Column("alcohol_use", sa.String(length=40), nullable=True),
    )


def downgrade() -> None:
    drop_columns_if_present(
        "patients",
        "middle_name",
        "national_id",
        "next_of_kin_relationship",
        "next_of_kin_phone",
        "guardian_name",
        "guardian_relationship",
        "guardian_phone",
        "history_of_presenting_complaint",
        "last_dental_visit",
        "smoking_status",
        "alcohol_use",
    )
