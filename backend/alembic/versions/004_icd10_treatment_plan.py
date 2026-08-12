"""Add ICD-10 fields to treatment plan items.

Revision ID: 004_icd10_treatment_plan
Revises: 003_clinical_visits
Create Date: 2026-07-19
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from app.db.migration_ops import (
    add_columns_if_missing,
    create_index_if_missing,
    drop_columns_if_present,
    drop_index_if_present,
)

revision: str = "004_icd10_treatment_plan"
down_revision: Union[str, None] = "003_clinical_visits"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    add_columns_if_missing(
        "treatment_plan_items",
        sa.Column("icd10_code", sa.String(length=16), nullable=True),
        sa.Column("icd10_description", sa.String(length=400), nullable=True),
    )
    create_index_if_missing(
        "ix_treatment_plan_items_icd10_code", "treatment_plan_items", ["icd10_code"]
    )


def downgrade() -> None:
    drop_index_if_present("ix_treatment_plan_items_icd10_code", "treatment_plan_items")
    drop_columns_if_present("treatment_plan_items", "icd10_description", "icd10_code")
