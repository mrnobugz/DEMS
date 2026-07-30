"""Fee schedule + Chart-to-Cash linkage columns.

Revision ID: 005_fee_schedule_chart_to_cash
Revises: 004_icd10_treatment_plan
Create Date: 2026-07-19
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005_fee_schedule_chart_to_cash"
down_revision: Union[str, None] = "004_icd10_treatment_plan"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
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
    op.create_index("ix_fee_schedule_items_clinic_id", "fee_schedule_items", ["clinic_id"])
    op.create_index("ix_fee_schedule_items_code", "fee_schedule_items", ["code"])

    with op.batch_alter_table("dental_chart_entries") as batch:
        batch.add_column(sa.Column("billed_invoice_id", sa.String(length=36), nullable=True))
    op.create_index(
        "ix_dental_chart_entries_billed_invoice_id",
        "dental_chart_entries",
        ["billed_invoice_id"],
    )
    # FK added after invoices table exists (already does)
    with op.batch_alter_table("dental_chart_entries") as batch:
        batch.create_foreign_key(
            "fk_dental_chart_entries_billed_invoice_id_invoices",
            "invoices",
            ["billed_invoice_id"],
            ["id"],
        )

    with op.batch_alter_table("invoice_line_items") as batch:
        batch.add_column(sa.Column("chart_entry_id", sa.String(length=36), nullable=True))
    op.create_index(
        "ix_invoice_line_items_chart_entry_id",
        "invoice_line_items",
        ["chart_entry_id"],
    )
    with op.batch_alter_table("invoice_line_items") as batch:
        batch.create_foreign_key(
            "fk_invoice_line_items_chart_entry_id_dental_chart_entries",
            "dental_chart_entries",
            ["chart_entry_id"],
            ["id"],
        )


def downgrade() -> None:
    with op.batch_alter_table("invoice_line_items") as batch:
        batch.drop_constraint(
            "fk_invoice_line_items_chart_entry_id_dental_chart_entries", type_="foreignkey"
        )
        batch.drop_column("chart_entry_id")
    op.drop_index("ix_invoice_line_items_chart_entry_id", table_name="invoice_line_items")

    with op.batch_alter_table("dental_chart_entries") as batch:
        batch.drop_constraint(
            "fk_dental_chart_entries_billed_invoice_id_invoices", type_="foreignkey"
        )
        batch.drop_column("billed_invoice_id")
    op.drop_index("ix_dental_chart_entries_billed_invoice_id", table_name="dental_chart_entries")

    op.drop_index("ix_fee_schedule_items_code", table_name="fee_schedule_items")
    op.drop_index("ix_fee_schedule_items_clinic_id", table_name="fee_schedule_items")
    op.drop_table("fee_schedule_items")
