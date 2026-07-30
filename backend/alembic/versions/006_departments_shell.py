"""Department shell tables + nullable platform owner clinic_id.

Revision ID: 006_departments_shell
Revises: 005_fee_schedule_chart_to_cash
Create Date: 2026-07-19
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006_departments_shell"
down_revision: Union[str, None] = "005_fee_schedule_chart_to_cash"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Platform owner may have null clinic_id
    with op.batch_alter_table("users") as batch:
        batch.alter_column("clinic_id", existing_type=sa.String(length=36), nullable=True)

    op.create_table(
        "inventory_items",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(length=36), nullable=False),
        sa.Column("sku", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("category", sa.String(length=80), nullable=False),
        sa.Column("quantity", sa.Float(), nullable=False),
        sa.Column("reorder_level", sa.Float(), nullable=False),
        sa.Column("unit", sa.String(length=40), nullable=False),
        sa.Column("unit_cost", sa.Float(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_inventory_items"),
        sa.UniqueConstraint("clinic_id", "sku", name="uq_inventory_clinic_sku"),
    )
    op.create_index("ix_inventory_items_clinic_id", "inventory_items", ["clinic_id"])
    op.create_index("ix_inventory_items_sku", "inventory_items", ["sku"])

    op.create_table(
        "lab_cases",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(length=36), nullable=False),
        sa.Column("patient_id", sa.String(length=36), nullable=False),
        sa.Column("dentist_id", sa.String(length=36), nullable=True),
        sa.Column("tooth", sa.String(length=16), nullable=True),
        sa.Column("shade", sa.String(length=40), nullable=True),
        sa.Column("case_type", sa.String(length=80), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("lab_name", sa.String(length=200), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("fitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("lab_cost", sa.Float(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"]),
        sa.ForeignKeyConstraint(["dentist_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id", name="pk_lab_cases"),
    )
    op.create_index("ix_lab_cases_clinic_id", "lab_cases", ["clinic_id"])
    op.create_index("ix_lab_cases_patient_id", "lab_cases", ["patient_id"])
    op.create_index("ix_lab_cases_dentist_id", "lab_cases", ["dentist_id"])
    op.create_index("ix_lab_cases_status", "lab_cases", ["status"])

    op.create_table(
        "imaging_studies",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(length=36), nullable=False),
        sa.Column("patient_id", sa.String(length=36), nullable=False),
        sa.Column("captured_by_id", sa.String(length=36), nullable=True),
        sa.Column("visit_id", sa.String(length=36), nullable=True),
        sa.Column("study_type", sa.String(length=80), nullable=False),
        sa.Column("tooth", sa.String(length=16), nullable=True),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("storage_key", sa.String(length=500), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"]),
        sa.ForeignKeyConstraint(["captured_by_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["visit_id"], ["clinical_visits.id"]),
        sa.PrimaryKeyConstraint("id", name="pk_imaging_studies"),
    )
    op.create_index("ix_imaging_studies_clinic_id", "imaging_studies", ["clinic_id"])
    op.create_index("ix_imaging_studies_patient_id", "imaging_studies", ["patient_id"])
    op.create_index("ix_imaging_studies_captured_by_id", "imaging_studies", ["captured_by_id"])
    op.create_index("ix_imaging_studies_visit_id", "imaging_studies", ["visit_id"])

    op.create_table(
        "drug_templates",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("category", sa.String(length=80), nullable=False),
        sa.Column("default_dose", sa.String(length=120), nullable=False),
        sa.Column("default_quantity", sa.String(length=80), nullable=False),
        sa.Column("instructions", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_drug_templates"),
    )
    op.create_index("ix_drug_templates_clinic_id", "drug_templates", ["clinic_id"])

    op.create_table(
        "prescriptions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(length=36), nullable=False),
        sa.Column("patient_id", sa.String(length=36), nullable=False),
        sa.Column("prescribed_by_id", sa.String(length=36), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("prescribed_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"]),
        sa.ForeignKeyConstraint(["prescribed_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id", name="pk_prescriptions"),
    )
    op.create_index("ix_prescriptions_clinic_id", "prescriptions", ["clinic_id"])
    op.create_index("ix_prescriptions_patient_id", "prescriptions", ["patient_id"])
    op.create_index("ix_prescriptions_prescribed_by_id", "prescriptions", ["prescribed_by_id"])
    op.create_index("ix_prescriptions_status", "prescriptions", ["status"])

    op.create_table(
        "prescription_items",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("prescription_id", sa.String(length=36), nullable=False),
        sa.Column("drug_name", sa.String(length=200), nullable=False),
        sa.Column("dose", sa.String(length=120), nullable=False),
        sa.Column("quantity", sa.String(length=80), nullable=False),
        sa.Column("instructions", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["prescription_id"], ["prescriptions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_prescription_items"),
    )
    op.create_index("ix_prescription_items_prescription_id", "prescription_items", ["prescription_id"])

    op.create_table(
        "staff_profiles",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=True),
        sa.Column("specialty", sa.String(length=120), nullable=True),
        sa.Column("certifications_json", sa.Text(), nullable=True),
        sa.Column("department", sa.String(length=80), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_staff_profiles"),
        sa.UniqueConstraint("user_id", name="uq_staff_profiles_user"),
    )
    op.create_index("ix_staff_profiles_clinic_id", "staff_profiles", ["clinic_id"])
    op.create_index("ix_staff_profiles_user_id", "staff_profiles", ["user_id"])


def downgrade() -> None:
    op.drop_table("staff_profiles")
    op.drop_table("prescription_items")
    op.drop_table("prescriptions")
    op.drop_table("drug_templates")
    op.drop_table("imaging_studies")
    op.drop_table("lab_cases")
    op.drop_table("inventory_items")
    with op.batch_alter_table("users") as batch:
        batch.alter_column("clinic_id", existing_type=sa.String(length=36), nullable=False)
