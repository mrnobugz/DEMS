"""Phase 3: lab restoration link, imaging blob metadata, patient insurance plans.

Revision ID: 009_phase3_lab_imaging_insurance
Revises: 008_dentist_patient_assignment
Create Date: 2026-08-09
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from app.db.migration_ops import (
    add_columns_if_missing,
    create_foreign_key_if_missing,
    create_index_if_missing,
    create_table_if_missing,
    drop_columns_if_present,
    drop_constraint_if_present,
    drop_index_if_present,
    drop_table_if_present,
)

revision: str = "009_phase3_lab_imaging_insurance"
down_revision: Union[str, None] = "008_dentist_patient_assignment"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    add_columns_if_missing(
        "lab_cases",
        sa.Column("restoration_id", sa.String(length=36), nullable=True),
        sa.Column("restoration_case_id", sa.String(length=36), nullable=True),
    )
    create_index_if_missing("ix_lab_cases_restoration_id", "lab_cases", ["restoration_id"])
    create_index_if_missing(
        "ix_lab_cases_restoration_case_id", "lab_cases", ["restoration_case_id"]
    )
    create_foreign_key_if_missing(
        "fk_lab_cases_restoration_id_restorations",
        "lab_cases",
        "restorations",
        ["restoration_id"],
        ["id"],
        ondelete="SET NULL",
    )
    create_foreign_key_if_missing(
        "fk_lab_cases_restoration_case_id_restoration_cases",
        "lab_cases",
        "restoration_cases",
        ["restoration_case_id"],
        ["id"],
        ondelete="SET NULL",
    )

    add_columns_if_missing(
        "imaging_studies",
        sa.Column("content_type", sa.String(length=120), nullable=True),
        sa.Column("byte_size", sa.Integer(), nullable=True),
        sa.Column("checksum_sha256", sa.String(length=64), nullable=True),
        sa.Column("is_encrypted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("original_filename", sa.String(length=255), nullable=True),
    )

    create_table_if_missing(
        "patient_insurance_plans",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(36), nullable=False),
        sa.Column("patient_id", sa.String(36), nullable=False),
        sa.Column("payer_name", sa.String(200), nullable=False),
        sa.Column("plan_name", sa.String(200), nullable=True),
        sa.Column("member_id", sa.String(80), nullable=True),
        sa.Column("group_number", sa.String(80), nullable=True),
        sa.Column("coverage_pct", sa.Float(), nullable=False),
        sa.Column("annual_max", sa.Float(), nullable=True),
        sa.Column("lifetime_max", sa.Float(), nullable=True),
        sa.Column("amount_used_ytd", sa.Float(), nullable=False),
        sa.Column("deductible", sa.Float(), nullable=False),
        sa.Column("deductible_met", sa.Float(), nullable=False),
        sa.Column("effective_from", sa.Date(), nullable=True),
        sa.Column("effective_to", sa.Date(), nullable=True),
        sa.Column("is_primary", sa.Boolean(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    create_index_if_missing(
        "ix_patient_insurance_plans_clinic_id", "patient_insurance_plans", ["clinic_id"]
    )
    create_index_if_missing(
        "ix_patient_insurance_plans_patient_id", "patient_insurance_plans", ["patient_id"]
    )


def downgrade() -> None:
    drop_index_if_present("ix_patient_insurance_plans_patient_id", "patient_insurance_plans")
    drop_index_if_present("ix_patient_insurance_plans_clinic_id", "patient_insurance_plans")
    drop_table_if_present("patient_insurance_plans")

    drop_columns_if_present(
        "imaging_studies",
        "original_filename",
        "is_encrypted",
        "checksum_sha256",
        "byte_size",
        "content_type",
    )

    drop_constraint_if_present("fk_lab_cases_restoration_case_id_restoration_cases", "lab_cases")
    drop_constraint_if_present("fk_lab_cases_restoration_id_restorations", "lab_cases")
    drop_index_if_present("ix_lab_cases_restoration_case_id", "lab_cases")
    drop_index_if_present("ix_lab_cases_restoration_id", "lab_cases")
    drop_columns_if_present("lab_cases", "restoration_case_id", "restoration_id")
