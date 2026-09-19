"""Resumable front-desk registration drafts.

Revision ID: 026_registration_drafts
Revises: 025_patient_vitals
Create Date: 2026-09-19
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from app.db.migration_ops import create_index_if_missing, create_table_if_missing, drop_table_if_present

revision: str = "026_registration_drafts"
down_revision: Union[str, None] = "025_patient_vitals"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    create_table_if_missing(
        "registration_drafts",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(36), nullable=False),
        sa.Column("patient_id", sa.String(36), nullable=True),
        sa.Column("created_by_id", sa.String(36), nullable=True),
        sa.Column("updated_by_id", sa.String(36), nullable=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("display_name", sa.String(200), nullable=False),
        sa.Column("summary", sa.String(300), nullable=True),
        sa.Column("step", sa.Integer(), nullable=True),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.Column("cancel_reason", sa.String(300), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["updated_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    create_index_if_missing("ix_registration_drafts_patient_id", "registration_drafts", ["patient_id"])
    create_index_if_missing("ix_registration_drafts_created_by_id", "registration_drafts", ["created_by_id"])
    create_index_if_missing("ix_registration_drafts_status", "registration_drafts", ["status"])
    create_index_if_missing(
        "ix_registration_drafts_clinic_status",
        "registration_drafts",
        ["clinic_id", "status"],
    )


def downgrade() -> None:
    drop_table_if_present("registration_drafts")
