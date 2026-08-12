"""Fee schedule + Chart-to-Cash linkage columns.

Revision ID: 005_fee_schedule_chart_to_cash
Revises: 004_icd10_treatment_plan
Create Date: 2026-07-19
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

revision: str = "005_fee_schedule_chart_to_cash"
down_revision: Union[str, None] = "004_icd10_treatment_plan"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    create_table_if_missing(
        "fee_schedule_items",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(length=36), nullable=False),
        sa.Column("code", sa.String(length=40), nullable=False),
        sa.Column("label", sa.String(length=200), nullable=False),
        sa.Column("category", sa.String(length=40), nullable=False),
        sa.Column("unit_price", sa.Float(), nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("billable", sa.Boolean(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_fee_schedule_items"),
        sa.UniqueConstraint("clinic_id", "code", name="uq_fee_schedule_clinic_code"),
    )
    create_index_if_missing("ix_fee_schedule_items_clinic_id", "fee_schedule_items", ["clinic_id"])
    create_index_if_missing("ix_fee_schedule_items_code", "fee_schedule_items", ["code"])

    add_columns_if_missing(
        "dental_chart_entries",
        sa.Column("billed_invoice_id", sa.String(length=36), nullable=True),
    )
    create_index_if_missing(
        "ix_dental_chart_entries_billed_invoice_id",
        "dental_chart_entries",
        ["billed_invoice_id"],
    )
    create_foreign_key_if_missing(
        "fk_dental_chart_entries_billed_invoice_id_invoices",
        "dental_chart_entries",
        "invoices",
        ["billed_invoice_id"],
        ["id"],
    )

    add_columns_if_missing(
        "invoice_line_items",
        sa.Column("chart_entry_id", sa.String(length=36), nullable=True),
    )
    create_index_if_missing(
        "ix_invoice_line_items_chart_entry_id",
        "invoice_line_items",
        ["chart_entry_id"],
    )
    create_foreign_key_if_missing(
        "fk_invoice_line_items_chart_entry_id_dental_chart_entries",
        "invoice_line_items",
        "dental_chart_entries",
        ["chart_entry_id"],
        ["id"],
    )


def downgrade() -> None:
    drop_constraint_if_present(
        "fk_invoice_line_items_chart_entry_id_dental_chart_entries", "invoice_line_items"
    )
    drop_columns_if_present("invoice_line_items", "chart_entry_id")
    drop_index_if_present("ix_invoice_line_items_chart_entry_id", "invoice_line_items")

    drop_constraint_if_present(
        "fk_dental_chart_entries_billed_invoice_id_invoices", "dental_chart_entries"
    )
    drop_columns_if_present("dental_chart_entries", "billed_invoice_id")
    drop_index_if_present("ix_dental_chart_entries_billed_invoice_id", "dental_chart_entries")

    drop_index_if_present("ix_fee_schedule_items_code", "fee_schedule_items")
    drop_index_if_present("ix_fee_schedule_items_clinic_id", "fee_schedule_items")
    drop_table_if_present("fee_schedule_items")
