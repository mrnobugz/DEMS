"""Dentist↔patient primary assignment for resource scoping.

Revision ID: 008_dentist_patient_assignment
Revises: 007_phase2_clinical_depth
Create Date: 2026-08-09
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "008_dentist_patient_assignment"
down_revision: Union[str, None] = "007_phase2_clinical_depth"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("patients") as batch:
        batch.add_column(sa.Column("primary_dentist_id", sa.String(length=36), nullable=True))
        batch.create_index("ix_patients_primary_dentist_id", ["primary_dentist_id"])
        batch.create_foreign_key(
            "fk_patients_primary_dentist_id_users",
            "users",
            ["primary_dentist_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("patients") as batch:
        batch.drop_constraint("fk_patients_primary_dentist_id_users", type_="foreignkey")
        batch.drop_index("ix_patients_primary_dentist_id")
        batch.drop_column("primary_dentist_id")
