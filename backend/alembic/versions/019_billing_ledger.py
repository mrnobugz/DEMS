"""Immutable charges, claims, adjustments, and patient statements.

Revision ID: 019_billing_ledger
Revises: 018_patient_identity_photo
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

revision: str = "019_billing_ledger"
down_revision: Union[str, None] = "018_patient_identity_photo"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    add_columns_if_missing(
        "invoices",
        sa.Column("amount_adjusted", sa.Float(), nullable=False, server_default="0"),
    )
    add_columns_if_missing(
        "invoice_line_items",
        sa.Column("provider_id", sa.String(length=36), nullable=True),
        sa.Column("fee_charged", sa.Float(), nullable=False, server_default="0"),
        sa.Column("estimated_insurance", sa.Float(), nullable=False, server_default="0"),
        sa.Column("estimated_patient", sa.Float(), nullable=False, server_default="0"),
        sa.Column("actual_insurance", sa.Float(), nullable=False, server_default="0"),
        sa.Column("actual_patient", sa.Float(), nullable=False, server_default="0"),
        sa.Column("charge_status", sa.String(length=32), nullable=False, server_default="posted"),
    )
    add_columns_if_missing(
        "fee_schedule_items",
        sa.Column("effective_from", sa.Date(), nullable=True),
    )
    create_index_if_missing(
        "ix_invoice_line_items_charge_status", "invoice_line_items", ["charge_status"]
    )
    create_index_if_missing(
        "ix_invoice_line_items_provider_id", "invoice_line_items", ["provider_id"]
    )
    create_foreign_key_if_missing(
        "fk_invoice_line_items_provider_id_users",
        "invoice_line_items",
        "users",
        ["provider_id"],
        ["id"],
    )

    create_table_if_missing(
        "ledger_adjustments",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(36), nullable=False),
        sa.Column("invoice_id", sa.String(36), nullable=False),
        sa.Column("line_item_id", sa.String(36), nullable=True),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by_id", sa.String(36), nullable=True),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"]),
        sa.ForeignKeyConstraint(["line_item_id"], ["invoice_line_items.id"]),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    create_index_if_missing("ix_ledger_adjustments_clinic_id", "ledger_adjustments", ["clinic_id"])
    create_index_if_missing("ix_ledger_adjustments_invoice_id", "ledger_adjustments", ["invoice_id"])
    create_index_if_missing(
        "ix_ledger_adjustments_line_item_id", "ledger_adjustments", ["line_item_id"]
    )

    create_table_if_missing(
        "insurance_claims",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(36), nullable=False),
        sa.Column("patient_id", sa.String(36), nullable=False),
        sa.Column("invoice_id", sa.String(36), nullable=False),
        sa.Column("plan_id", sa.String(36), nullable=True),
        sa.Column("claim_number", sa.String(40), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("adjudicated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("scrub_notes", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"]),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"]),
        sa.ForeignKeyConstraint(["plan_id"], ["patient_insurance_plans.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    create_index_if_missing("ix_insurance_claims_clinic_id", "insurance_claims", ["clinic_id"])
    create_index_if_missing("ix_insurance_claims_patient_id", "insurance_claims", ["patient_id"])
    create_index_if_missing("ix_insurance_claims_invoice_id", "insurance_claims", ["invoice_id"])
    create_index_if_missing("ix_insurance_claims_plan_id", "insurance_claims", ["plan_id"])
    create_index_if_missing("ix_insurance_claims_claim_number", "insurance_claims", ["claim_number"])
    create_index_if_missing("ix_insurance_claims_status", "insurance_claims", ["status"])
    create_index_if_missing(
        "ix_insurance_claims_clinic_status", "insurance_claims", ["clinic_id", "status"]
    )

    create_table_if_missing(
        "claim_line_items",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("claim_id", sa.String(36), nullable=False),
        sa.Column("line_item_id", sa.String(36), nullable=False),
        sa.Column("billed_amount", sa.Float(), nullable=False),
        sa.Column("allowed_amount", sa.Float(), nullable=True),
        sa.Column("paid_amount", sa.Float(), nullable=False),
        sa.Column("patient_responsibility", sa.Float(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("denial_reason", sa.String(300), nullable=True),
        sa.ForeignKeyConstraint(["claim_id"], ["insurance_claims.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["line_item_id"], ["invoice_line_items.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("line_item_id", name="uq_claim_line_charge"),
    )
    create_index_if_missing("ix_claim_line_items_claim_id", "claim_line_items", ["claim_id"])
    create_index_if_missing("ix_claim_line_items_line_item_id", "claim_line_items", ["line_item_id"])
    create_index_if_missing("ix_claim_line_items_status", "claim_line_items", ["status"])

    create_table_if_missing(
        "patient_statements",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(36), nullable=False),
        sa.Column("patient_id", sa.String(36), nullable=False),
        sa.Column("statement_number", sa.String(40), nullable=False),
        sa.Column("balance_due", sa.Float(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("invoice_ids", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    create_index_if_missing("ix_patient_statements_clinic_id", "patient_statements", ["clinic_id"])
    create_index_if_missing("ix_patient_statements_patient_id", "patient_statements", ["patient_id"])
    create_index_if_missing(
        "ix_patient_statements_statement_number", "patient_statements", ["statement_number"]
    )


def downgrade() -> None:
    drop_index_if_present("ix_patient_statements_statement_number", "patient_statements")
    drop_index_if_present("ix_patient_statements_patient_id", "patient_statements")
    drop_index_if_present("ix_patient_statements_clinic_id", "patient_statements")
    drop_table_if_present("patient_statements")
    drop_index_if_present("ix_claim_line_items_status", "claim_line_items")
    drop_index_if_present("ix_claim_line_items_line_item_id", "claim_line_items")
    drop_index_if_present("ix_claim_line_items_claim_id", "claim_line_items")
    drop_table_if_present("claim_line_items")
    drop_index_if_present("ix_insurance_claims_clinic_status", "insurance_claims")
    drop_index_if_present("ix_insurance_claims_status", "insurance_claims")
    drop_index_if_present("ix_insurance_claims_claim_number", "insurance_claims")
    drop_index_if_present("ix_insurance_claims_plan_id", "insurance_claims")
    drop_index_if_present("ix_insurance_claims_invoice_id", "insurance_claims")
    drop_index_if_present("ix_insurance_claims_patient_id", "insurance_claims")
    drop_index_if_present("ix_insurance_claims_clinic_id", "insurance_claims")
    drop_table_if_present("insurance_claims")
    drop_index_if_present("ix_ledger_adjustments_line_item_id", "ledger_adjustments")
    drop_index_if_present("ix_ledger_adjustments_invoice_id", "ledger_adjustments")
    drop_index_if_present("ix_ledger_adjustments_clinic_id", "ledger_adjustments")
    drop_table_if_present("ledger_adjustments")
    drop_constraint_if_present("fk_invoice_line_items_provider_id_users", "invoice_line_items")
    drop_index_if_present("ix_invoice_line_items_provider_id", "invoice_line_items")
    drop_index_if_present("ix_invoice_line_items_charge_status", "invoice_line_items")
    drop_columns_if_present(
        "invoice_line_items",
        "provider_id",
        "fee_charged",
        "estimated_insurance",
        "estimated_patient",
        "actual_insurance",
        "actual_patient",
        "charge_status",
    )
    drop_columns_if_present("invoices", "amount_adjusted")
    drop_columns_if_present("fee_schedule_items", "effective_from")
