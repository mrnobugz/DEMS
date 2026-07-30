"""Add ICD-10 fields to treatment plan items.

Revision ID: 004_icd10_treatment_plan
Revises: 003_clinical_visits
Create Date: 2026-07-19
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004_icd10_treatment_plan"
down_revision: Union[str, None] = "003_clinical_visits"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("treatment_plan_items") as batch:
        batch.add_column(sa.Column("icd10_code", sa.String(length=16), nullable=True))
        batch.add_column(sa.Column("icd10_description", sa.String(length=400), nullable=True))
    op.create_index("ix_treatment_plan_items_icd10_code", "treatment_plan_items", ["icd10_code"])


def downgrade() -> None:
    op.drop_index("ix_treatment_plan_items_icd10_code", table_name="treatment_plan_items")
    with op.batch_alter_table("treatment_plan_items") as batch:
        batch.drop_column("icd10_description")
        batch.drop_column("icd10_code")
