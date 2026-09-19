"""Full configuration setup: roles, catalogs, fee schedules, templates.

Revision ID: 023_config_setup
Revises: 022_config_org
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
    create_unique_constraint_if_missing,
    drop_columns_if_present,
    drop_constraint_if_present,
    drop_index_if_present,
    drop_table_if_present,
)

revision: str = "023_config_setup"
down_revision: Union[str, None] = "022_config_org"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _stamp_table(
    table: str,
    *extra: sa.schema.SchemaItem,
    unique: sa.UniqueConstraint | None = None,
) -> None:
    cols: list[sa.schema.SchemaItem] = [
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(36), nullable=False),
        *extra,
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    ]
    if unique is not None:
        cols.append(unique)
    create_table_if_missing(table, *cols)
    create_index_if_missing(f"ix_{table}_clinic_id", table, ["clinic_id"])


def upgrade() -> None:
    _stamp_table(
        "role_permissions",
        sa.Column("role", sa.String(40), nullable=False),
        sa.Column("permission_id", sa.String(80), nullable=False),
        sa.Column("allowed", sa.Boolean(), nullable=False),
        unique=sa.UniqueConstraint(
            "clinic_id", "role", "permission_id", name="uq_role_permissions_clinic_role_perm"
        ),
    )
    create_index_if_missing("ix_role_permissions_role", "role_permissions", ["role"])

    _stamp_table(
        "fee_schedules",
        sa.Column("code", sa.String(40), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("payer_kind", sa.String(32), nullable=False),
        sa.Column("currency", sa.String(8), nullable=False),
        sa.Column("effective_from", sa.Date(), nullable=True),
        sa.Column("effective_to", sa.Date(), nullable=True),
        sa.Column("is_default", sa.Boolean(), nullable=False),
        sa.Column("notes", sa.String(400), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("deactivated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deactivated_by_id", sa.String(36), nullable=True),
        unique=sa.UniqueConstraint("clinic_id", "code", name="uq_fee_schedules_clinic_code"),
    )

    _stamp_table(
        "tax_rates",
        sa.Column("code", sa.String(40), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("rate_bps", sa.Integer(), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("deactivated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deactivated_by_id", sa.String(36), nullable=True),
        unique=sa.UniqueConstraint("clinic_id", "code", name="uq_tax_rates_clinic_code"),
    )

    _stamp_table(
        "discount_rules",
        sa.Column("code", sa.String(40), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("percent", sa.Float(), nullable=False),
        sa.Column("max_amount", sa.Float(), nullable=True),
        sa.Column("requires_role", sa.String(40), nullable=True),
        sa.Column("notes", sa.String(400), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("deactivated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deactivated_by_id", sa.String(36), nullable=True),
        unique=sa.UniqueConstraint("clinic_id", "code", name="uq_discount_rules_clinic_code"),
    )

    _stamp_table(
        "payment_method_configs",
        sa.Column("code", sa.String(40), nullable=False),
        sa.Column("label", sa.String(120), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("deactivated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deactivated_by_id", sa.String(36), nullable=True),
        unique=sa.UniqueConstraint(
            "clinic_id", "code", name="uq_payment_method_configs_clinic_code"
        ),
    )

    _stamp_table(
        "config_catalog_entries",
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column("code", sa.String(80), nullable=False),
        sa.Column("label", sa.String(200), nullable=False),
        sa.Column("extra_json", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("deactivated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deactivated_by_id", sa.String(36), nullable=True),
        unique=sa.UniqueConstraint(
            "clinic_id", "kind", "code", name="uq_config_catalog_clinic_kind_code"
        ),
    )
    create_index_if_missing("ix_config_catalog_entries_kind", "config_catalog_entries", ["kind"])
    create_index_if_missing(
        "ix_config_catalog_entries_clinic_kind",
        "config_catalog_entries",
        ["clinic_id", "kind"],
    )

    _stamp_table(
        "config_templates",
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column("key", sa.String(80), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("subject", sa.String(300), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("deactivated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deactivated_by_id", sa.String(36), nullable=True),
        unique=sa.UniqueConstraint(
            "clinic_id", "kind", "key", name="uq_config_templates_clinic_kind_key"
        ),
    )
    create_index_if_missing("ix_config_templates_kind", "config_templates", ["kind"])

    create_table_if_missing(
        "approval_chains",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(36), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("department_id", sa.String(36), nullable=True),
        sa.Column("category", sa.String(80), nullable=True),
        sa.Column("min_amount", sa.Float(), nullable=False),
        sa.Column("steps_json", sa.Text(), nullable=False),
        sa.Column("notes", sa.String(400), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("deactivated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deactivated_by_id", sa.String(36), nullable=True),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["department_id"], ["org_departments.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    create_index_if_missing("ix_approval_chains_clinic_id", "approval_chains", ["clinic_id"])

    add_columns_if_missing(
        "fee_schedule_items",
        sa.Column("fee_schedule_id", sa.String(36), nullable=True),
        sa.Column("effective_to", sa.Date(), nullable=True),
    )
    create_foreign_key_if_missing(
        "fk_fee_schedule_items_fee_schedule_id_fee_schedules",
        "fee_schedule_items",
        "fee_schedules",
        ["fee_schedule_id"],
        ["id"],
        ondelete="SET NULL",
    )
    create_index_if_missing(
        "ix_fee_schedule_items_fee_schedule_id", "fee_schedule_items", ["fee_schedule_id"]
    )
    drop_constraint_if_present("uq_fee_schedule_clinic_code", "fee_schedule_items", type_="unique")
    drop_index_if_present("uq_fee_schedule_clinic_code", "fee_schedule_items")
    create_unique_constraint_if_missing(
        "uq_fee_schedule_items_clinic_sched_code",
        "fee_schedule_items",
        ["clinic_id", "fee_schedule_id", "code"],
    )

    add_columns_if_missing(
        "staff_profiles",
        sa.Column("license_no", sa.String(80), nullable=True),
        sa.Column("is_scheduling_provider", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("default_operatory_id", sa.String(36), nullable=True),
        sa.Column("production_goal", sa.Float(), nullable=True),
        sa.Column("commission_rate_bps", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("schedule_json", sa.Text(), nullable=True),
    )
    create_foreign_key_if_missing(
        "fk_staff_profiles_default_operatory_id_operatories",
        "staff_profiles",
        "operatories",
        ["default_operatory_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    drop_constraint_if_present(
        "fk_staff_profiles_default_operatory_id_operatories", "staff_profiles"
    )
    drop_columns_if_present(
        "staff_profiles",
        "license_no",
        "is_scheduling_provider",
        "default_operatory_id",
        "production_goal",
        "commission_rate_bps",
        "schedule_json",
    )
    drop_constraint_if_present(
        "uq_fee_schedule_items_clinic_sched_code", "fee_schedule_items", type_="unique"
    )
    drop_index_if_present("ix_fee_schedule_items_fee_schedule_id", "fee_schedule_items")
    drop_constraint_if_present(
        "fk_fee_schedule_items_fee_schedule_id_fee_schedules", "fee_schedule_items"
    )
    drop_columns_if_present("fee_schedule_items", "fee_schedule_id", "effective_to")
    drop_table_if_present("approval_chains")
    drop_table_if_present("config_templates")
    drop_table_if_present("config_catalog_entries")
    drop_table_if_present("payment_method_configs")
    drop_table_if_present("discount_rules")
    drop_table_if_present("tax_rates")
    drop_table_if_present("fee_schedules")
    drop_table_if_present("role_permissions")
