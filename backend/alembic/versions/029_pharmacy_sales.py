"""Pharmacy counter sales.

Revision ID: 029_pharmacy_sales
Revises: 028_pharmacy_ops
Create Date: 2026-09-30
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.db.migration_ops import (
    create_index_if_missing,
    create_table_if_missing,
    drop_table_if_present,
)

revision: str = "029_pharmacy_sales"
down_revision: Union[str, None] = "028_pharmacy_ops"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    create_table_if_missing(
        "pharmacy_sales",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(36), nullable=False),
        sa.Column("sale_number", sa.String(40), nullable=False),
        sa.Column("patient_id", sa.String(36), nullable=False),
        sa.Column("invoice_id", sa.String(36), nullable=True),
        sa.Column("sold_by_id", sa.String(36), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="completed"),
        sa.Column("subtotal", sa.Float(), nullable=False, server_default="0"),
        sa.Column("total", sa.Float(), nullable=False, server_default="0"),
        sa.Column("amount_paid", sa.Float(), nullable=False, server_default="0"),
        sa.Column("amount_tendered", sa.Float(), nullable=False, server_default="0"),
        sa.Column("change_due", sa.Float(), nullable=False, server_default="0"),
        sa.Column("payment_method", sa.String(40), nullable=False, server_default="cash"),
        sa.Column("payment_reference", sa.String(80), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"]),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["sold_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    create_index_if_missing("ix_pharmacy_sales_clinic_id", "pharmacy_sales", ["clinic_id"])
    create_index_if_missing("ix_pharmacy_sales_sale_number", "pharmacy_sales", ["sale_number"])
    create_index_if_missing("ix_pharmacy_sales_patient_id", "pharmacy_sales", ["patient_id"])
    create_index_if_missing("ix_pharmacy_sales_invoice_id", "pharmacy_sales", ["invoice_id"])
    create_index_if_missing("ix_pharmacy_sales_status", "pharmacy_sales", ["status"])

    create_table_if_missing(
        "pharmacy_sale_lines",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sale_id", sa.String(36), nullable=False),
        sa.Column("inventory_item_id", sa.String(36), nullable=True),
        sa.Column("description", sa.String(200), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Float(), nullable=False, server_default="0"),
        sa.Column("line_total", sa.Float(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["sale_id"], ["pharmacy_sales.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["inventory_item_id"], ["inventory_items.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    create_index_if_missing("ix_pharmacy_sale_lines_sale_id", "pharmacy_sale_lines", ["sale_id"])
    create_index_if_missing(
        "ix_pharmacy_sale_lines_inventory_item_id", "pharmacy_sale_lines", ["inventory_item_id"]
    )


def downgrade() -> None:
    drop_table_if_present("pharmacy_sale_lines")
    drop_table_if_present("pharmacy_sales")
