"""Nurse vital signs for registered patients.

Revision ID: 025_patient_vitals
Revises: 024_patient_records
Create Date: 2026-09-19
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from app.db.migration_ops import create_index_if_missing, create_table_if_missing, drop_table_if_present

revision: str = "025_patient_vitals"
down_revision: Union[str, None] = "024_patient_records"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    create_table_if_missing(
        "patient_vital_signs",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(36), nullable=False),
        sa.Column("patient_id", sa.String(36), nullable=False),
        sa.Column("recorded_by_id", sa.String(36), nullable=True),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("bp_systolic", sa.Integer(), nullable=True),
        sa.Column("bp_diastolic", sa.Integer(), nullable=True),
        sa.Column("pulse", sa.Integer(), nullable=True),
        sa.Column("temperature_c", sa.Float(), nullable=True),
        sa.Column("spo2", sa.Integer(), nullable=True),
        sa.Column("respiratory_rate", sa.Integer(), nullable=True),
        sa.Column("height_cm", sa.Float(), nullable=True),
        sa.Column("weight_kg", sa.Float(), nullable=True),
        sa.Column("posture", sa.String(80), nullable=True),
        sa.Column("gait", sa.String(80), nullable=True),
        sa.Column("appearance", sa.String(80), nullable=True),
        sa.Column("notes", sa.String(400), nullable=True),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["recorded_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    create_index_if_missing("ix_patient_vital_signs_patient_id", "patient_vital_signs", ["patient_id"])
    create_index_if_missing("ix_patient_vital_signs_recorded_by_id", "patient_vital_signs", ["recorded_by_id"])
    create_index_if_missing("ix_patient_vital_signs_recorded_at", "patient_vital_signs", ["recorded_at"])
    create_index_if_missing(
        "ix_patient_vitals_clinic_patient_at",
        "patient_vital_signs",
        ["clinic_id", "patient_id", "recorded_at"],
    )


def downgrade() -> None:
    drop_table_if_present("patient_vital_signs")
