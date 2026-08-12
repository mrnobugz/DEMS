"""Patient portal credentials + notification outbox for Recall & Reach.

Revision ID: 011_portal_notifications
Revises: 010_currency_tzs
Create Date: 2026-08-09
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from app.db.migration_ops import (
    add_columns_if_missing,
    create_table_if_missing,
    drop_columns_if_present,
    drop_table_if_present,
)

revision: str = "011_portal_notifications"
down_revision: Union[str, None] = "010_currency_tzs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    add_columns_if_missing(
        "patients",
        sa.Column("portal_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("portal_pin_hash", sa.String(length=255), nullable=True),
    )

    create_table_if_missing(
        "notification_outbox",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("clinic_id", sa.String(length=36), sa.ForeignKey("clinics.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("patient_id", sa.String(length=36), sa.ForeignKey("patients.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("channel", sa.String(length=32), nullable=False, index=True),
        sa.Column("template_key", sa.String(length=80), nullable=False, index=True),
        sa.Column("subject", sa.String(length=300), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, index=True),
        sa.Column("to_address", sa.String(length=200), nullable=True),
        sa.Column("scheduled_for", sa.DateTime(timezone=True), nullable=True, index=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("meta_json", sa.Text(), nullable=True),
        sa.Column("created_by_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    drop_table_if_present("notification_outbox")
    drop_columns_if_present("patients", "portal_pin_hash", "portal_enabled")
