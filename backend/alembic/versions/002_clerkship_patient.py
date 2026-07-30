"""Digital Clerkship patient demographics, anamnesis, pain & symptoms.

Revision ID: 002_clerkship_patient
Revises: 001_initial_schema
Create Date: 2026-07-19
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002_clerkship_patient"
down_revision: Union[str, None] = "001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("patients") as batch:
        batch.add_column(sa.Column("hospital_reg_number", sa.String(length=64), nullable=True))
        batch.add_column(sa.Column("marital_status", sa.String(length=32), nullable=True))
        batch.add_column(sa.Column("occupation", sa.String(length=120), nullable=True))
        batch.add_column(sa.Column("tribe_nation", sa.String(length=120), nullable=True))
        batch.add_column(sa.Column("po_box", sa.String(length=80), nullable=True))
        batch.add_column(sa.Column("street", sa.String(length=200), nullable=True))
        batch.add_column(sa.Column("house_number", sa.String(length=40), nullable=True))
        batch.add_column(sa.Column("area_ward", sa.String(length=120), nullable=True))
        batch.add_column(sa.Column("town_city", sa.String(length=120), nullable=True))
        batch.add_column(sa.Column("chief_complaint", sa.Text(), nullable=True))
        batch.add_column(sa.Column("family_social_history", sa.Text(), nullable=True))
        batch.add_column(sa.Column("developmental_history", sa.Text(), nullable=True))
        batch.add_column(sa.Column("pregnancy_trimester", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("medical_history_json", sa.Text(), nullable=True))
        batch.add_column(sa.Column("pain_assessment_json", sa.Text(), nullable=True))
        batch.add_column(sa.Column("reported_symptoms_json", sa.Text(), nullable=True))

    op.create_index("ix_patients_hospital_reg_number", "patients", ["hospital_reg_number"])


def downgrade() -> None:
    op.drop_index("ix_patients_hospital_reg_number", table_name="patients")
    with op.batch_alter_table("patients") as batch:
        batch.drop_column("reported_symptoms_json")
        batch.drop_column("pain_assessment_json")
        batch.drop_column("medical_history_json")
        batch.drop_column("pregnancy_trimester")
        batch.drop_column("developmental_history")
        batch.drop_column("family_social_history")
        batch.drop_column("chief_complaint")
        batch.drop_column("town_city")
        batch.drop_column("area_ward")
        batch.drop_column("house_number")
        batch.drop_column("street")
        batch.drop_column("po_box")
        batch.drop_column("tribe_nation")
        batch.drop_column("occupation")
        batch.drop_column("marital_status")
        batch.drop_column("hospital_reg_number")
