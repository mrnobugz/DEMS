"""Patient safety items, merge pointer, and guarantor.

Revision ID: 024_patient_records
Revises: 023_config_setup
Create Date: 2026-09-19
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

revision: str = "024_patient_records"
down_revision: Union[str, None] = "023_config_setup"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    add_columns_if_missing(
        "patients",
        sa.Column("merged_into_id", sa.String(36), nullable=True),
        sa.Column("guarantor_patient_id", sa.String(36), nullable=True),
        sa.Column("medical_history_reviewed_at", sa.DateTime(timezone=True), nullable=True),
    )
    create_foreign_key_if_missing(
        "fk_patients_merged_into_id_patients",
        "patients",
        "patients",
        ["merged_into_id"],
        ["id"],
        ondelete="SET NULL",
    )
    create_foreign_key_if_missing(
        "fk_patients_guarantor_patient_id_patients",
        "patients",
        "patients",
        ["guarantor_patient_id"],
        ["id"],
        ondelete="SET NULL",
    )
    create_index_if_missing("ix_patients_merged_into_id", "patients", ["merged_into_id"])
    create_index_if_missing("ix_patients_guarantor_patient_id", "patients", ["guarantor_patient_id"])

    create_table_if_missing(
        "patient_safety_items",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(36), nullable=False),
        sa.Column("patient_id", sa.String(36), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("code", sa.String(80), nullable=False),
        sa.Column("label", sa.String(200), nullable=False),
        sa.Column("notes", sa.String(400), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("deactivated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deactivated_by_id", sa.String(36), nullable=True),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "clinic_id",
            "patient_id",
            "kind",
            "code",
            name="uq_patient_safety_clinic_patient_kind_code",
        ),
    )
    create_index_if_missing("ix_patient_safety_items_clinic_id", "patient_safety_items", ["clinic_id"])
    create_index_if_missing("ix_patient_safety_items_patient_id", "patient_safety_items", ["patient_id"])


def downgrade() -> None:
    drop_table_if_present("patient_safety_items")
    drop_index_if_present("ix_patients_guarantor_patient_id", "patients")
    drop_index_if_present("ix_patients_merged_into_id", "patients")
    drop_constraint_if_present("fk_patients_guarantor_patient_id_patients", "patients")
    drop_constraint_if_present("fk_patients_merged_into_id_patients", "patients")
    drop_columns_if_present(
        "patients", "merged_into_id", "guarantor_patient_id", "medical_history_reviewed_at"
    )
