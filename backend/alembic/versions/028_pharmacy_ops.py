"""Pharmacy formulary link, prescription queue, and dispense events.

Revision ID: 028_pharmacy_ops
Revises: 027_requisitions
Create Date: 2026-09-28
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.db.migration_ops import (
    add_columns_if_missing,
    create_foreign_key_if_missing,
    create_index_if_missing,
    create_table_if_missing,
    drop_columns_if_present,
    drop_table_if_present,
)

revision: str = "028_pharmacy_ops"
down_revision: Union[str, None] = "027_requisitions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    add_columns_if_missing(
        "drug_templates",
        sa.Column("form", sa.String(40), nullable=False, server_default="tablet"),
        sa.Column("strength", sa.String(80), nullable=True),
        sa.Column("route", sa.String(40), nullable=False, server_default="oral"),
        sa.Column("inventory_item_id", sa.String(36), nullable=True),
        sa.Column("reorder_level", sa.Float(), nullable=False, server_default="0"),
        sa.Column("is_controlled", sa.Boolean(), nullable=False, server_default=sa.text("0")),
    )
    create_index_if_missing("ix_drug_templates_inventory_item_id", "drug_templates", ["inventory_item_id"])
    create_foreign_key_if_missing(
        "fk_drug_templates_inventory_item_id_inventory_items",
        "drug_templates",
        "inventory_items",
        ["inventory_item_id"],
        ["id"],
        ondelete="SET NULL",
    )

    add_columns_if_missing(
        "prescriptions",
        sa.Column("rx_number", sa.String(40), nullable=True),
        sa.Column("verified_by_id", sa.String(36), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("dispensed_by_id", sa.String(36), nullable=True),
        sa.Column("dispensed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("invoice_id", sa.String(36), nullable=True),
        sa.Column("cancel_reason", sa.String(300), nullable=True),
    )
    create_index_if_missing("ix_prescriptions_rx_number", "prescriptions", ["rx_number"])
    create_index_if_missing("ix_prescriptions_invoice_id", "prescriptions", ["invoice_id"])
    create_foreign_key_if_missing(
        "fk_prescriptions_verified_by_id_users",
        "prescriptions",
        "users",
        ["verified_by_id"],
        ["id"],
        ondelete="SET NULL",
    )
    create_foreign_key_if_missing(
        "fk_prescriptions_dispensed_by_id_users",
        "prescriptions",
        "users",
        ["dispensed_by_id"],
        ["id"],
        ondelete="SET NULL",
    )
    create_foreign_key_if_missing(
        "fk_prescriptions_invoice_id_invoices",
        "prescriptions",
        "invoices",
        ["invoice_id"],
        ["id"],
        ondelete="SET NULL",
    )

    add_columns_if_missing(
        "prescription_items",
        sa.Column("drug_template_id", sa.String(36), nullable=True),
        sa.Column("quantity_dispensed", sa.Float(), nullable=False, server_default="0"),
        sa.Column("line_status", sa.String(24), nullable=False, server_default="pending"),
    )
    create_index_if_missing(
        "ix_prescription_items_drug_template_id", "prescription_items", ["drug_template_id"]
    )
    create_foreign_key_if_missing(
        "fk_prescription_items_drug_template_id_drug_templates",
        "prescription_items",
        "drug_templates",
        ["drug_template_id"],
        ["id"],
        ondelete="SET NULL",
    )

    create_table_if_missing(
        "dispense_events",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(36), nullable=False),
        sa.Column("prescription_id", sa.String(36), nullable=False),
        sa.Column("prescription_item_id", sa.String(36), nullable=False),
        sa.Column("inventory_item_id", sa.String(36), nullable=True),
        sa.Column("quantity", sa.Float(), nullable=False),
        sa.Column("quantity_returned", sa.Float(), nullable=False, server_default="0"),
        sa.Column("lot_code", sa.String(64), nullable=True),
        sa.Column("expiry_date", sa.Date(), nullable=True),
        sa.Column("unit_price", sa.Float(), nullable=False, server_default="0"),
        sa.Column("label_text", sa.Text(), nullable=True),
        sa.Column("invoice_id", sa.String(36), nullable=True),
        sa.Column("dispensed_by_id", sa.String(36), nullable=True),
        sa.Column("notes", sa.String(300), nullable=True),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["prescription_id"], ["prescriptions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["prescription_item_id"], ["prescription_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["inventory_item_id"], ["inventory_items.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["dispensed_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    create_index_if_missing("ix_dispense_events_clinic_id", "dispense_events", ["clinic_id"])
    create_index_if_missing("ix_dispense_events_prescription_id", "dispense_events", ["prescription_id"])
    create_index_if_missing(
        "ix_dispense_events_prescription_item_id", "dispense_events", ["prescription_item_id"]
    )
    create_index_if_missing(
        "ix_dispense_events_inventory_item_id", "dispense_events", ["inventory_item_id"]
    )
    create_index_if_missing("ix_dispense_events_invoice_id", "dispense_events", ["invoice_id"])


def downgrade() -> None:
    drop_table_if_present("dispense_events")
    drop_columns_if_present("prescription_items", "drug_template_id", "quantity_dispensed", "line_status")
    drop_columns_if_present(
        "prescriptions",
        "rx_number",
        "verified_by_id",
        "verified_at",
        "dispensed_by_id",
        "dispensed_at",
        "invoice_id",
        "cancel_reason",
    )
    drop_columns_if_present(
        "drug_templates",
        "form",
        "strength",
        "route",
        "inventory_item_id",
        "reorder_level",
        "is_controlled",
    )
