"""Clinical visits table for structured clerkship examinations.

Revision ID: 003_clinical_visits
Revises: 002_clerkship_patient
Create Date: 2026-07-19
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from app.db.migration_ops import (
    create_index_if_missing,
    create_table_if_missing,
    drop_index_if_present,
    drop_table_if_present,
)

revision: str = "003_clinical_visits"
down_revision: Union[str, None] = "002_clerkship_patient"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    create_table_if_missing(
        "clinical_visits",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(length=36), nullable=False),
        sa.Column("patient_id", sa.String(length=36), nullable=False),
        sa.Column("appointment_id", sa.String(length=36), nullable=True),
        sa.Column("examiner_id", sa.String(length=36), nullable=True),
        sa.Column("visit_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("chief_complaint", sa.Text(), nullable=True),
        sa.Column("vitals_json", sa.Text(), nullable=True),
        sa.Column("extra_oral_json", sa.Text(), nullable=True),
        sa.Column("intra_oral_json", sa.Text(), nullable=True),
        sa.Column("investigations_json", sa.Text(), nullable=True),
        sa.Column("diagnosis_json", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["appointment_id"], ["appointments.id"]),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["examiner_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"]),
        sa.PrimaryKeyConstraint("id", name="pk_clinical_visits"),
    )
    create_index_if_missing("ix_clinical_visits_clinic_id", "clinical_visits", ["clinic_id"])
    create_index_if_missing("ix_clinical_visits_patient_id", "clinical_visits", ["patient_id"])
    create_index_if_missing("ix_clinical_visits_appointment_id", "clinical_visits", ["appointment_id"])
    create_index_if_missing("ix_clinical_visits_examiner_id", "clinical_visits", ["examiner_id"])
    create_index_if_missing("ix_clinical_visits_visit_date", "clinical_visits", ["visit_date"])
    create_index_if_missing("ix_clinical_visits_status", "clinical_visits", ["status"])
    create_index_if_missing(
        "ix_clinical_visits_clinic_date",
        "clinical_visits",
        ["clinic_id", "visit_date"],
    )


def downgrade() -> None:
    for index in (
        "ix_clinical_visits_clinic_date",
        "ix_clinical_visits_status",
        "ix_clinical_visits_visit_date",
        "ix_clinical_visits_examiner_id",
        "ix_clinical_visits_appointment_id",
        "ix_clinical_visits_patient_id",
        "ix_clinical_visits_clinic_id",
    ):
        drop_index_if_present(index, "clinical_visits")
    drop_table_if_present("clinical_visits")
