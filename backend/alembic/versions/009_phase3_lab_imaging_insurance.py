"""Phase 3: lab restoration link, imaging blob metadata, patient insurance plans.

Revision ID: 009_phase3_lab_imaging_insurance
Revises: 008_dentist_patient_assignment
Create Date: 2026-08-09
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "009_phase3_lab_imaging_insurance"
down_revision: Union[str, None] = "008_dentist_patient_assignment"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("lab_cases") as batch:
        batch.add_column(sa.Column("restoration_id", sa.String(length=36), nullable=True))
        batch.add_column(sa.Column("restoration_case_id", sa.String(length=36), nullable=True))
        batch.create_index("ix_lab_cases_restoration_id", ["restoration_id"])
        batch.create_index("ix_lab_cases_restoration_case_id", ["restoration_case_id"])
        batch.create_foreign_key(
            "fk_lab_cases_restoration_id_restorations",
            "restorations",
            ["restoration_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch.create_foreign_key(
            "fk_lab_cases_restoration_case_id_restoration_cases",
            "restoration_cases",
            ["restoration_case_id"],
            ["id"],
            ondelete="SET NULL",
        )

    with op.batch_alter_table("imaging_studies") as batch:
        batch.add_column(sa.Column("content_type", sa.String(length=120), nullable=True))
        batch.add_column(sa.Column("byte_size", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("checksum_sha256", sa.String(length=64), nullable=True))
        batch.add_column(sa.Column("is_encrypted", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.add_column(sa.Column("original_filename", sa.String(length=255), nullable=True))

    op.create_table(
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
    op.create_index("ix_patient_insurance_plans_clinic_id", "patient_insurance_plans", ["clinic_id"])
    op.create_index("ix_patient_insurance_plans_patient_id", "patient_insurance_plans", ["patient_id"])


def downgrade() -> None:
    op.drop_index("ix_patient_insurance_plans_patient_id", table_name="patient_insurance_plans")
    op.drop_index("ix_patient_insurance_plans_clinic_id", table_name="patient_insurance_plans")
    op.drop_table("patient_insurance_plans")

    with op.batch_alter_table("imaging_studies") as batch:
        batch.drop_column("original_filename")
        batch.drop_column("is_encrypted")
        batch.drop_column("checksum_sha256")
        batch.drop_column("byte_size")
        batch.drop_column("content_type")

    with op.batch_alter_table("lab_cases") as batch:
        batch.drop_constraint("fk_lab_cases_restoration_case_id_restoration_cases", type_="foreignkey")
        batch.drop_constraint("fk_lab_cases_restoration_id_restorations", type_="foreignkey")
        batch.drop_index("ix_lab_cases_restoration_case_id")
        batch.drop_index("ix_lab_cases_restoration_id")
        batch.drop_column("restoration_case_id")
        batch.drop_column("restoration_id")
