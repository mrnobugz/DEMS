"""Staff in-app notification inbox for cross-department push.

Revision ID: 031_staff_notifications
Revises: 030_rx_course_fields
Create Date: 2026-10-12
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from app.db.migration_ops import (
    create_index_if_missing,
    create_table_if_missing,
    drop_table_if_present,
)

revision: str = "031_staff_notifications"
down_revision: Union[str, None] = "030_rx_course_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    create_table_if_missing(
        "staff_notifications",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(36), nullable=False),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("category", sa.String(40), nullable=False),
        sa.Column("event_type", sa.String(80), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("link_path", sa.String(300), nullable=True),
        sa.Column("payload_json", sa.Text(), nullable=True),
        sa.Column("actor_id", sa.String(36), nullable=True),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    create_index_if_missing("ix_staff_notifications_user_id", "staff_notifications", ["user_id"])
    create_index_if_missing("ix_staff_notifications_category", "staff_notifications", ["category"])
    create_index_if_missing("ix_staff_notifications_event_type", "staff_notifications", ["event_type"])
    create_index_if_missing("ix_staff_notifications_read_at", "staff_notifications", ["read_at"])
    create_index_if_missing(
        "ix_staff_notifications_user_created", "staff_notifications", ["user_id", "created_at"]
    )
    create_index_if_missing(
        "ix_staff_notifications_clinic_cat_created",
        "staff_notifications",
        ["clinic_id", "category", "created_at"],
    )


def downgrade() -> None:
    drop_table_if_present("staff_notifications")
