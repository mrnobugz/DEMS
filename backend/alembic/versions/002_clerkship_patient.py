"""Digital Clerkship patient demographics, anamnesis, pain & symptoms.

Revision ID: 002_clerkship_patient
Revises: 001_initial_schema
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

revision: str = "002_clerkship_patient"
down_revision: Union[str, None] = "001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    add_columns_if_missing(
        "patients",
        sa.Column("hospital_reg_number", sa.String(length=64), nullable=True),
        sa.Column("marital_status", sa.String(length=32), nullable=True),
        sa.Column("occupation", sa.String(length=120), nullable=True),
        sa.Column("tribe_nation", sa.String(length=120), nullable=True),
        sa.Column("po_box", sa.String(length=80), nullable=True),
        sa.Column("street", sa.String(length=200), nullable=True),
        sa.Column("house_number", sa.String(length=40), nullable=True),
        sa.Column("area_ward", sa.String(length=120), nullable=True),
        sa.Column("town_city", sa.String(length=120), nullable=True),
        sa.Column("chief_complaint", sa.Text(), nullable=True),
        sa.Column("family_social_history", sa.Text(), nullable=True),
        sa.Column("developmental_history", sa.Text(), nullable=True),
        sa.Column("pregnancy_trimester", sa.Integer(), nullable=True),
        sa.Column("medical_history_json", sa.Text(), nullable=True),
        sa.Column("pain_assessment_json", sa.Text(), nullable=True),
        sa.Column("reported_symptoms_json", sa.Text(), nullable=True),
    )

    create_index_if_missing("ix_patients_hospital_reg_number", "patients", ["hospital_reg_number"])


def downgrade() -> None:
    drop_index_if_present("ix_patients_hospital_reg_number", "patients")
    drop_columns_if_present(
        "patients",
        "reported_symptoms_json",
        "pain_assessment_json",
        "medical_history_json",
        "pregnancy_trimester",
        "developmental_history",
        "family_social_history",
        "chief_complaint",
        "town_city",
        "area_ward",
        "house_number",
        "street",
        "po_box",
        "tribe_nation",
        "occupation",
        "marital_status",
        "hospital_reg_number",
    )
