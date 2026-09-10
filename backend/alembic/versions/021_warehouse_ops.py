"""Warehouse locations, lots, movements, PO lines, and billed-stock FKs.

Revision ID: 021_warehouse_ops
Revises: 020_catalog_core
Create Date: 2026-09-10
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

revision: str = "021_warehouse_ops"
down_revision: Union[str, None] = "020_catalog_core"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    add_columns_if_missing(
        "inventory_items",
        sa.Column("track_lots", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    add_columns_if_missing(
        "catalog_items",
        sa.Column("inventory_item_id", sa.String(36), nullable=True),
    )
    create_foreign_key_if_missing(
        "fk_catalog_items_inventory_item_id_inventory_items",
        "catalog_items",
        "inventory_items",
        ["inventory_item_id"],
        ["id"],
    )
    create_index_if_missing("ix_catalog_items_inventory_item_id", "catalog_items", ["inventory_item_id"])

    add_columns_if_missing(
        "invoice_line_items",
        sa.Column("inventory_item_id", sa.String(36), nullable=True),
        sa.Column("line_kind", sa.String(20), nullable=False, server_default="procedure"),
    )
    create_foreign_key_if_missing(
        "fk_invoice_line_items_inventory_item_id_inventory_items",
        "invoice_line_items",
        "inventory_items",
        ["inventory_item_id"],
        ["id"],
    )
    create_index_if_missing(
        "ix_invoice_line_items_inventory_item_id", "invoice_line_items", ["inventory_item_id"]
    )

    add_columns_if_missing(
        "prescription_items",
        sa.Column("inventory_item_id", sa.String(36), nullable=True),
    )
    create_foreign_key_if_missing(
        "fk_prescription_items_inventory_item_id_inventory_items",
        "prescription_items",
        "inventory_items",
        ["inventory_item_id"],
        ["id"],
    )
    create_index_if_missing(
        "ix_prescription_items_inventory_item_id", "prescription_items", ["inventory_item_id"]
    )

    create_table_if_missing(
        "stock_locations",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(36), nullable=False),
        sa.Column("code", sa.String(32), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("clinic_id", "code", name="uq_stock_location_clinic_code"),
    )
    create_index_if_missing("ix_stock_locations_clinic_id", "stock_locations", ["clinic_id"])
    create_index_if_missing("ix_stock_locations_code", "stock_locations", ["code"])
    create_index_if_missing("ix_stock_locations_kind", "stock_locations", ["kind"])

    create_table_if_missing(
        "stock_lots",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(36), nullable=False),
        sa.Column("inventory_item_id", sa.String(36), nullable=False),
        sa.Column("location_id", sa.String(36), nullable=False),
        sa.Column("lot_code", sa.String(64), nullable=False),
        sa.Column("expiry_date", sa.Date(), nullable=True),
        sa.Column("quantity", sa.Float(), nullable=False),
        sa.Column("unit_cost", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["inventory_item_id"], ["inventory_items.id"]),
        sa.ForeignKeyConstraint(["location_id"], ["stock_locations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "clinic_id",
            "inventory_item_id",
            "location_id",
            "lot_code",
            name="uq_stock_lot_item_loc_code",
        ),
    )
    create_index_if_missing("ix_stock_lots_clinic_id", "stock_lots", ["clinic_id"])
    create_index_if_missing("ix_stock_lots_inventory_item_id", "stock_lots", ["inventory_item_id"])
    create_index_if_missing("ix_stock_lots_location_id", "stock_lots", ["location_id"])

    create_table_if_missing(
        "purchase_order_lines",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("purchase_order_id", sa.String(36), nullable=False),
        sa.Column("inventory_item_id", sa.String(36), nullable=False),
        sa.Column("quantity_ordered", sa.Float(), nullable=False),
        sa.Column("quantity_received", sa.Float(), nullable=False),
        sa.Column("unit_cost", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(["purchase_order_id"], ["purchase_orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["inventory_item_id"], ["inventory_items.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    create_index_if_missing(
        "ix_purchase_order_lines_purchase_order_id", "purchase_order_lines", ["purchase_order_id"]
    )
    create_index_if_missing(
        "ix_purchase_order_lines_inventory_item_id", "purchase_order_lines", ["inventory_item_id"]
    )

    create_table_if_missing(
        "stock_movements",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(36), nullable=False),
        sa.Column("inventory_item_id", sa.String(36), nullable=False),
        sa.Column("lot_id", sa.String(36), nullable=True),
        sa.Column("from_location_id", sa.String(36), nullable=True),
        sa.Column("to_location_id", sa.String(36), nullable=True),
        sa.Column("movement_type", sa.String(32), nullable=False),
        sa.Column("quantity", sa.Float(), nullable=False),
        sa.Column("unit_cost_snapshot", sa.Float(), nullable=False),
        sa.Column("reason", sa.String(200), nullable=True),
        sa.Column("supplier_id", sa.String(36), nullable=True),
        sa.Column("purchase_order_id", sa.String(36), nullable=True),
        sa.Column("invoice_id", sa.String(36), nullable=True),
        sa.Column("invoice_line_id", sa.String(36), nullable=True),
        sa.Column("prescription_id", sa.String(36), nullable=True),
        sa.Column("recorded_by_id", sa.String(36), nullable=True),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["inventory_item_id"], ["inventory_items.id"]),
        sa.ForeignKeyConstraint(["lot_id"], ["stock_lots.id"]),
        sa.ForeignKeyConstraint(["from_location_id"], ["stock_locations.id"]),
        sa.ForeignKeyConstraint(["to_location_id"], ["stock_locations.id"]),
        sa.ForeignKeyConstraint(["supplier_id"], ["suppliers.id"]),
        sa.ForeignKeyConstraint(["purchase_order_id"], ["purchase_orders.id"]),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"]),
        sa.ForeignKeyConstraint(["invoice_line_id"], ["invoice_line_items.id"]),
        sa.ForeignKeyConstraint(["prescription_id"], ["prescriptions.id"]),
        sa.ForeignKeyConstraint(["recorded_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    create_index_if_missing("ix_stock_movements_clinic_id", "stock_movements", ["clinic_id"])
    create_index_if_missing(
        "ix_stock_movements_inventory_item_id", "stock_movements", ["inventory_item_id"]
    )
    create_index_if_missing("ix_stock_movements_lot_id", "stock_movements", ["lot_id"])
    create_index_if_missing("ix_stock_movements_movement_type", "stock_movements", ["movement_type"])
    create_index_if_missing(
        "ix_stock_movements_purchase_order_id", "stock_movements", ["purchase_order_id"]
    )
    create_index_if_missing("ix_stock_movements_invoice_id", "stock_movements", ["invoice_id"])
    create_index_if_missing(
        "ix_stock_movements_prescription_id", "stock_movements", ["prescription_id"]
    )


def downgrade() -> None:
    drop_table_if_present("stock_movements")
    drop_table_if_present("purchase_order_lines")
    drop_table_if_present("stock_lots")
    drop_table_if_present("stock_locations")
    drop_index_if_present("ix_prescription_items_inventory_item_id", "prescription_items")
    drop_constraint_if_present(
        "fk_prescription_items_inventory_item_id_inventory_items", "prescription_items"
    )
    drop_columns_if_present("prescription_items", "inventory_item_id")
    drop_index_if_present("ix_invoice_line_items_inventory_item_id", "invoice_line_items")
    drop_constraint_if_present(
        "fk_invoice_line_items_inventory_item_id_inventory_items", "invoice_line_items"
    )
    drop_columns_if_present("invoice_line_items", "inventory_item_id", "line_kind")
    drop_index_if_present("ix_catalog_items_inventory_item_id", "catalog_items")
    drop_constraint_if_present(
        "fk_catalog_items_inventory_item_id_inventory_items", "catalog_items"
    )
    drop_columns_if_present("catalog_items", "inventory_item_id")
    drop_columns_if_present("inventory_items", "track_lots")
