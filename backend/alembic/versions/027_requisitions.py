"""Requisitions, mandatory medical-supply expiry, and low-stock events.

Revision ID: 027_requisitions
Revises: 026_registration_drafts
Create Date: 2026-09-19
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
    has_column,
    has_table,
)

revision: str = "027_requisitions"
down_revision: Union[str, None] = "026_registration_drafts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    add_columns_if_missing(
        "inventory_items",
        sa.Column("requires_expiry", sa.Boolean(), nullable=True),
    )
    if has_table("inventory_items") and has_column("inventory_items", "requires_expiry"):
        op.execute(
            sa.text(
                "UPDATE inventory_items SET requires_expiry = CASE "
                "WHEN item_kind = 'service' THEN 0 ELSE 1 END "
                "WHERE requires_expiry IS NULL"
            )
        )

    create_table_if_missing(
        "requisitions",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(36), nullable=False),
        sa.Column("req_number", sa.String(40), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("department", sa.String(40), nullable=False),
        sa.Column("destination_location_id", sa.String(36), nullable=True),
        sa.Column("requested_by_id", sa.String(36), nullable=True),
        sa.Column("approved_by_id", sa.String(36), nullable=True),
        sa.Column("fulfilled_by_id", sa.String(36), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("reject_reason", sa.String(300), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("fulfilled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["destination_location_id"], ["stock_locations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["requested_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["approved_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["fulfilled_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    create_index_if_missing("ix_requisitions_req_number", "requisitions", ["req_number"])
    create_index_if_missing("ix_requisitions_status", "requisitions", ["status"])
    create_index_if_missing("ix_requisitions_department", "requisitions", ["department"])
    create_index_if_missing("ix_requisitions_requested_by_id", "requisitions", ["requested_by_id"])
    create_index_if_missing("ix_requisitions_clinic_status", "requisitions", ["clinic_id", "status"])

    create_table_if_missing(
        "requisition_lines",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("requisition_id", sa.String(36), nullable=False),
        sa.Column("inventory_item_id", sa.String(36), nullable=False),
        sa.Column("quantity_requested", sa.Float(), nullable=False),
        sa.Column("quantity_issued", sa.Float(), nullable=True),
        sa.Column("notes", sa.String(200), nullable=True),
        sa.ForeignKeyConstraint(["requisition_id"], ["requisitions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["inventory_item_id"], ["inventory_items.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    create_index_if_missing("ix_requisition_lines_requisition_id", "requisition_lines", ["requisition_id"])
    create_index_if_missing("ix_requisition_lines_inventory_item_id", "requisition_lines", ["inventory_item_id"])

    add_columns_if_missing(
        "stock_movements",
        sa.Column("requisition_id", sa.String(36), nullable=True),
    )
    create_index_if_missing("ix_stock_movements_requisition_id", "stock_movements", ["requisition_id"])
    create_foreign_key_if_missing(
        "fk_stock_movements_requisition_id",
        "stock_movements",
        "requisitions",
        ["requisition_id"],
        ["id"],
    )


def downgrade() -> None:
    drop_columns_if_present("stock_movements", "requisition_id")
    drop_table_if_present("requisition_lines")
    drop_table_if_present("requisitions")
    drop_columns_if_present("inventory_items", "requires_expiry")
