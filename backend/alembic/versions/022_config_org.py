"""Organization config, settings, sequences, domain events, and operatory FK.

Revision ID: 022_config_org
Revises: 021_warehouse_ops
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

revision: str = "022_config_org"
down_revision: Union[str, None] = "021_warehouse_ops"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    create_table_if_missing(
        "domain_events",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(36), nullable=False),
        sa.Column("event_type", sa.String(80), nullable=False),
        sa.Column("aggregate_type", sa.String(80), nullable=False),
        sa.Column("aggregate_id", sa.String(36), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actor_id", sa.String(36), nullable=True),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    create_index_if_missing("ix_domain_events_clinic_id", "domain_events", ["clinic_id"])
    create_index_if_missing("ix_domain_events_event_type", "domain_events", ["event_type"])
    create_index_if_missing("ix_domain_events_aggregate_id", "domain_events", ["aggregate_id"])
    create_index_if_missing("ix_domain_events_occurred_at", "domain_events", ["occurred_at"])
    create_index_if_missing("ix_domain_events_actor_id", "domain_events", ["actor_id"])
    create_index_if_missing(
        "ix_domain_events_clinic_type_occurred",
        "domain_events",
        ["clinic_id", "event_type", "occurred_at"],
    )

    create_table_if_missing(
        "system_settings",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(36), nullable=True),
        sa.Column("user_id", sa.String(36), nullable=True),
        sa.Column("scope", sa.String(16), nullable=False),
        sa.Column("key", sa.String(120), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "scope", "clinic_id", "user_id", "key", name="uq_system_settings_scope_owner_key"
        ),
    )
    create_index_if_missing("ix_system_settings_clinic_id", "system_settings", ["clinic_id"])
    create_index_if_missing("ix_system_settings_user_id", "system_settings", ["user_id"])
    create_index_if_missing("ix_system_settings_clinic_key", "system_settings", ["clinic_id", "key"])

    create_table_if_missing(
        "number_sequences",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(36), nullable=False),
        sa.Column("document_type", sa.String(40), nullable=False),
        sa.Column("prefix", sa.String(16), nullable=False),
        sa.Column("padding", sa.Integer(), nullable=False),
        sa.Column("next_value", sa.Integer(), nullable=False),
        sa.Column("year_reset", sa.Boolean(), nullable=False),
        sa.Column("current_year", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("clinic_id", "document_type", name="uq_number_sequences_clinic_type"),
    )
    create_index_if_missing("ix_number_sequences_clinic_id", "number_sequences", ["clinic_id"])

    create_table_if_missing(
        "org_departments",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(36), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("deactivated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deactivated_by_id", sa.String(36), nullable=True),
        sa.Column("code", sa.String(40), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("head_user_id", sa.String(36), nullable=True),
        sa.Column("stock_location_id", sa.String(36), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("notes", sa.String(400), nullable=True),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["head_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["stock_location_id"], ["stock_locations.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("clinic_id", "code", name="uq_org_departments_clinic_code"),
    )
    create_index_if_missing("ix_org_departments_clinic_id", "org_departments", ["clinic_id"])

    create_table_if_missing(
        "operatories",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(36), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("deactivated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deactivated_by_id", sa.String(36), nullable=True),
        sa.Column("department_id", sa.String(36), nullable=True),
        sa.Column("code", sa.String(40), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("chair_number", sa.Integer(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("notes", sa.String(400), nullable=True),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["department_id"], ["org_departments.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("clinic_id", "code", name="uq_operatories_clinic_code"),
    )
    create_index_if_missing("ix_operatories_clinic_id", "operatories", ["clinic_id"])
    create_index_if_missing("ix_operatories_department_id", "operatories", ["department_id"])

    create_table_if_missing(
        "working_hours",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(36), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("deactivated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deactivated_by_id", sa.String(36), nullable=True),
        sa.Column("owner_type", sa.String(20), nullable=False),
        sa.Column("owner_id", sa.String(36), nullable=True),
        sa.Column("day_of_week", sa.Integer(), nullable=False),
        sa.Column("starts_on", sa.String(5), nullable=False),
        sa.Column("ends_on", sa.String(5), nullable=False),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    create_index_if_missing("ix_working_hours_clinic_id", "working_hours", ["clinic_id"])
    create_index_if_missing("ix_working_hours_owner_id", "working_hours", ["owner_id"])

    create_table_if_missing(
        "holidays",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(36), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("deactivated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deactivated_by_id", sa.String(36), nullable=True),
        sa.Column("holiday_date", sa.Date(), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("notes", sa.String(400), nullable=True),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("clinic_id", "holiday_date", name="uq_holidays_clinic_date"),
    )
    create_index_if_missing("ix_holidays_clinic_id", "holidays", ["clinic_id"])

    add_columns_if_missing(
        "appointments",
        sa.Column("operatory_id", sa.String(36), nullable=True),
    )
    create_foreign_key_if_missing(
        "fk_appointments_operatory_id_operatories",
        "appointments",
        "operatories",
        ["operatory_id"],
        ["id"],
        ondelete="SET NULL",
    )
    create_index_if_missing("ix_appointments_operatory_id", "appointments", ["operatory_id"])


def downgrade() -> None:
    drop_index_if_present("ix_appointments_operatory_id", "appointments")
    drop_constraint_if_present("fk_appointments_operatory_id_operatories", "appointments")
    drop_columns_if_present("appointments", "operatory_id")
    drop_table_if_present("holidays")
    drop_table_if_present("working_hours")
    drop_table_if_present("operatories")
    drop_table_if_present("org_departments")
    drop_table_if_present("number_sequences")
    drop_table_if_present("system_settings")
    drop_table_if_present("domain_events")
