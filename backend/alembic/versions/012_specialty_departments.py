"""Specialty clinic departments: maxillofacial surgery, orthodontics, paediatrics.

Restorative already has first-class tables (007); this adds the remaining three
department modules surfaced under the Clinic navigation dropdown.

Revision ID: 012_specialty_departments
Revises: 011_portal_notifications
Create Date: 2026-08-14
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from app.db.migration_ops import (
    create_index_if_missing,
    create_table_if_missing,
    drop_table_if_present,
)

revision: str = "012_specialty_departments"
down_revision: Union[str, None] = "011_portal_notifications"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    create_table_if_missing(
        "surgical_cases",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(length=36), nullable=False),
        sa.Column("patient_id", sa.String(length=36), nullable=False),
        sa.Column("surgeon_id", sa.String(length=36), nullable=True),
        sa.Column("procedure_type", sa.String(length=80), nullable=False),
        sa.Column("site", sa.String(length=80), nullable=True),
        sa.Column("diagnosis", sa.Text(), nullable=True),
        sa.Column("anaesthesia", sa.String(length=32), nullable=False),
        sa.Column("asa_class", sa.String(length=8), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("performed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("operative_notes", sa.Text(), nullable=True),
        sa.Column("complications", sa.Text(), nullable=True),
        sa.Column("histopathology", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"]),
        sa.ForeignKeyConstraint(["surgeon_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id", name="pk_surgical_cases"),
    )
    create_index_if_missing("ix_surgical_cases_clinic_id", "surgical_cases", ["clinic_id"])
    create_index_if_missing("ix_surgical_cases_patient_id", "surgical_cases", ["patient_id"])
    create_index_if_missing("ix_surgical_cases_surgeon_id", "surgical_cases", ["surgeon_id"])
    create_index_if_missing("ix_surgical_cases_status", "surgical_cases", ["status"])

    create_table_if_missing(
        "surgical_follow_ups",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("surgical_case_id", sa.String(length=36), nullable=False),
        sa.Column("visit_date", sa.Date(), nullable=False),
        sa.Column("pain_score", sa.Integer(), nullable=True),
        sa.Column("swelling", sa.String(length=32), nullable=True),
        sa.Column("healing", sa.String(length=32), nullable=False),
        sa.Column("sutures_removed", sa.Boolean(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["surgical_case_id"], ["surgical_cases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_surgical_follow_ups"),
    )
    create_index_if_missing(
        "ix_surgical_follow_ups_surgical_case_id", "surgical_follow_ups", ["surgical_case_id"]
    )

    create_table_if_missing(
        "ortho_cases",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(length=36), nullable=False),
        sa.Column("patient_id", sa.String(length=36), nullable=False),
        sa.Column("clinician_id", sa.String(length=36), nullable=True),
        sa.Column("angle_class", sa.String(length=16), nullable=True),
        sa.Column("malocclusion_summary", sa.Text(), nullable=True),
        sa.Column("appliance_type", sa.String(length=40), nullable=False),
        sa.Column("arch", sa.String(length=16), nullable=False),
        sa.Column("bracket_system", sa.String(length=80), nullable=True),
        sa.Column("oral_hygiene", sa.String(length=16), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("started_on", sa.Date(), nullable=True),
        sa.Column("debonded_on", sa.Date(), nullable=True),
        sa.Column("planned_months", sa.Integer(), nullable=False),
        sa.Column("next_review_due", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"]),
        sa.ForeignKeyConstraint(["clinician_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id", name="pk_ortho_cases"),
    )
    create_index_if_missing("ix_ortho_cases_clinic_id", "ortho_cases", ["clinic_id"])
    create_index_if_missing("ix_ortho_cases_patient_id", "ortho_cases", ["patient_id"])
    create_index_if_missing("ix_ortho_cases_clinician_id", "ortho_cases", ["clinician_id"])
    create_index_if_missing("ix_ortho_cases_status", "ortho_cases", ["status"])
    create_index_if_missing("ix_ortho_cases_next_review_due", "ortho_cases", ["next_review_due"])

    create_table_if_missing(
        "ortho_adjustments",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ortho_case_id", sa.String(length=36), nullable=False),
        sa.Column("visit_date", sa.Date(), nullable=False),
        sa.Column("archwire", sa.String(length=80), nullable=True),
        sa.Column("procedures", sa.Text(), nullable=True),
        sa.Column("elastics", sa.String(length=80), nullable=True),
        sa.Column("next_visit_weeks", sa.Integer(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["ortho_case_id"], ["ortho_cases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_ortho_adjustments"),
    )
    create_index_if_missing(
        "ix_ortho_adjustments_ortho_case_id", "ortho_adjustments", ["ortho_case_id"]
    )

    create_table_if_missing(
        "paediatric_profiles",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(length=36), nullable=False),
        sa.Column("patient_id", sa.String(length=36), nullable=False),
        sa.Column("guardian_name", sa.String(length=200), nullable=True),
        sa.Column("guardian_phone", sa.String(length=40), nullable=True),
        sa.Column("guardian_relation", sa.String(length=40), nullable=True),
        sa.Column("behaviour_rating", sa.Integer(), nullable=True),
        sa.Column("dentition_stage", sa.String(length=16), nullable=False),
        sa.Column("caries_risk", sa.String(length=16), nullable=False),
        sa.Column("oral_habits", sa.Text(), nullable=True),
        sa.Column("medical_alerts", sa.Text(), nullable=True),
        sa.Column("fluoride_last", sa.Date(), nullable=True),
        sa.Column("fluoride_next", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_paediatric_profiles"),
        sa.UniqueConstraint("patient_id", name="uq_paediatric_profiles_patient"),
    )
    create_index_if_missing("ix_paediatric_profiles_clinic_id", "paediatric_profiles", ["clinic_id"])
    create_index_if_missing("ix_paediatric_profiles_patient_id", "paediatric_profiles", ["patient_id"])
    create_index_if_missing("ix_paediatric_profiles_caries_risk", "paediatric_profiles", ["caries_risk"])
    create_index_if_missing("ix_paediatric_profiles_fluoride_next", "paediatric_profiles", ["fluoride_next"])

    create_table_if_missing(
        "paediatric_treatments",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("profile_id", sa.String(length=36), nullable=False),
        sa.Column("treatment_type", sa.String(length=40), nullable=False),
        sa.Column("tooth", sa.String(length=8), nullable=True),
        sa.Column("performed_on", sa.Date(), nullable=False),
        sa.Column("performed_by_id", sa.String(length=36), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["profile_id"], ["paediatric_profiles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["performed_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id", name="pk_paediatric_treatments"),
    )
    create_index_if_missing(
        "ix_paediatric_treatments_profile_id", "paediatric_treatments", ["profile_id"]
    )


def downgrade() -> None:
    for table in (
        "paediatric_treatments",
        "paediatric_profiles",
        "ortho_adjustments",
        "ortho_cases",
        "surgical_follow_ups",
        "surgical_cases",
    ):
        drop_table_if_present(table)
