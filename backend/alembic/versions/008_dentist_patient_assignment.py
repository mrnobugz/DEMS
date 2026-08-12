"""Dentist↔patient primary assignment for resource scoping.

Revision ID: 008_dentist_patient_assignment
Revises: 007_phase2_clinical_depth
Create Date: 2026-08-09
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from app.db.migration_ops import (
    add_columns_if_missing,
    create_foreign_key_if_missing,
    create_index_if_missing,
    drop_columns_if_present,
    drop_constraint_if_present,
    drop_index_if_present,
)

revision: str = "008_dentist_patient_assignment"
down_revision: Union[str, None] = "007_phase2_clinical_depth"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    add_columns_if_missing(
        "patients",
        sa.Column("primary_dentist_id", sa.String(length=36), nullable=True),
    )
    create_index_if_missing("ix_patients_primary_dentist_id", "patients", ["primary_dentist_id"])
    create_foreign_key_if_missing(
        "fk_patients_primary_dentist_id_users",
        "patients",
        "users",
        ["primary_dentist_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    drop_constraint_if_present("fk_patients_primary_dentist_id_users", "patients")
    drop_index_if_present("ix_patients_primary_dentist_id", "patients")
    drop_columns_if_present("patients", "primary_dentist_id")
