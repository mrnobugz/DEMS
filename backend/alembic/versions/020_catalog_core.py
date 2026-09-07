"""Catalog core, price history, and payer-versioned fee schedules.

Revision ID: 020_catalog_core
Revises: 019_billing_ledger
Create Date: 2026-08-31
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

revision: str = "020_catalog_core"
down_revision: Union[str, None] = "019_billing_ledger"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    create_table_if_missing(
        "catalog_categories",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(36), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("slug", sa.String(80), nullable=False),
        sa.Column("parent_id", sa.String(36), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_id"], ["catalog_categories.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("clinic_id", "slug", name="uq_catalog_category_clinic_slug"),
    )
    create_index_if_missing("ix_catalog_categories_clinic_id", "catalog_categories", ["clinic_id"])
    create_index_if_missing("ix_catalog_categories_slug", "catalog_categories", ["slug"])
    create_index_if_missing("ix_catalog_categories_parent_id", "catalog_categories", ["parent_id"])

    create_table_if_missing(
        "catalog_items",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(36), nullable=False),
        sa.Column("sku", sa.String(64), nullable=False),
        sa.Column("label", sa.String(200), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("list_price", sa.Float(), nullable=False),
        sa.Column("currency", sa.String(8), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("billable", sa.Boolean(), nullable=False),
        sa.Column("category_id", sa.String(36), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("cdt_code", sa.String(40), nullable=True),
        sa.Column("tooth_required", sa.Boolean(), nullable=False),
        sa.Column("ndc_code", sa.String(40), nullable=True),
        sa.Column("drug_schedule", sa.String(20), nullable=True),
        sa.Column("unit_of_measure", sa.String(40), nullable=True),
        sa.Column("vendor_fee_basis", sa.String(80), nullable=True),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["category_id"], ["catalog_categories.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("clinic_id", "sku", name="uq_catalog_item_clinic_sku"),
    )
    create_index_if_missing("ix_catalog_items_clinic_id", "catalog_items", ["clinic_id"])
    create_index_if_missing("ix_catalog_items_sku", "catalog_items", ["sku"])
    create_index_if_missing("ix_catalog_items_kind", "catalog_items", ["kind"])
    create_index_if_missing("ix_catalog_items_category_id", "catalog_items", ["category_id"])

    create_table_if_missing(
        "catalog_price_history",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(36), nullable=False),
        sa.Column("catalog_item_id", sa.String(36), nullable=False),
        sa.Column("old_price", sa.Float(), nullable=False),
        sa.Column("new_price", sa.Float(), nullable=False),
        sa.Column("changed_by_id", sa.String(36), nullable=True),
        sa.Column("notes", sa.String(200), nullable=True),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["catalog_item_id"], ["catalog_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["changed_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    create_index_if_missing(
        "ix_catalog_price_history_clinic_id", "catalog_price_history", ["clinic_id"]
    )
    create_index_if_missing(
        "ix_catalog_price_history_catalog_item_id", "catalog_price_history", ["catalog_item_id"]
    )

    create_table_if_missing(
        "catalog_fee_rates",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(36), nullable=False),
        sa.Column("catalog_item_id", sa.String(36), nullable=False),
        sa.Column("payer_name", sa.String(200), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["catalog_item_id"], ["catalog_items.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "clinic_id",
            "catalog_item_id",
            "payer_name",
            "effective_from",
            name="uq_catalog_fee_rate_payer_date",
        ),
        sa.Index("ix_catalog_fee_rates_item_payer", "catalog_item_id", "payer_name"),
    )
    create_index_if_missing("ix_catalog_fee_rates_clinic_id", "catalog_fee_rates", ["clinic_id"])
    create_index_if_missing(
        "ix_catalog_fee_rates_catalog_item_id", "catalog_fee_rates", ["catalog_item_id"]
    )
    create_index_if_missing("ix_catalog_fee_rates_payer_name", "catalog_fee_rates", ["payer_name"])

    add_columns_if_missing(
        "fee_schedule_items",
        sa.Column("catalog_item_id", sa.String(length=36), nullable=True),
    )
    create_index_if_missing(
        "ix_fee_schedule_items_catalog_item_id", "fee_schedule_items", ["catalog_item_id"]
    )
    create_foreign_key_if_missing(
        "fk_fee_schedule_items_catalog_item_id_catalog_items",
        "fee_schedule_items",
        "catalog_items",
        ["catalog_item_id"],
        ["id"],
    )


def downgrade() -> None:
    drop_constraint_if_present(
        "fk_fee_schedule_items_catalog_item_id_catalog_items", "fee_schedule_items"
    )
    drop_index_if_present("ix_fee_schedule_items_catalog_item_id", "fee_schedule_items")
    drop_columns_if_present("fee_schedule_items", "catalog_item_id")
    drop_index_if_present("ix_catalog_fee_rates_payer_name", "catalog_fee_rates")
    drop_index_if_present("ix_catalog_fee_rates_catalog_item_id", "catalog_fee_rates")
    drop_index_if_present("ix_catalog_fee_rates_clinic_id", "catalog_fee_rates")
    drop_table_if_present("catalog_fee_rates")
    drop_index_if_present("ix_catalog_price_history_catalog_item_id", "catalog_price_history")
    drop_index_if_present("ix_catalog_price_history_clinic_id", "catalog_price_history")
    drop_table_if_present("catalog_price_history")
    drop_index_if_present("ix_catalog_items_category_id", "catalog_items")
    drop_index_if_present("ix_catalog_items_kind", "catalog_items")
    drop_index_if_present("ix_catalog_items_sku", "catalog_items")
    drop_index_if_present("ix_catalog_items_clinic_id", "catalog_items")
    drop_table_if_present("catalog_items")
    drop_index_if_present("ix_catalog_categories_parent_id", "catalog_categories")
    drop_index_if_present("ix_catalog_categories_slug", "catalog_categories")
    drop_index_if_present("ix_catalog_categories_clinic_id", "catalog_categories")
    drop_table_if_present("catalog_categories")
