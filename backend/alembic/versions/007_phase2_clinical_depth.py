"""Phase 2 clinical depth: restorative, endo, perio recall, inventory ops, HR.

Revision ID: 007_phase2_clinical_depth
Revises: 006_departments_shell
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

revision: str = "007_phase2_clinical_depth"
down_revision: Union[str, None] = "006_departments_shell"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    add_columns_if_missing(
        "patients",
        sa.Column("hygiene_recall_due", sa.Date(), nullable=True),
        sa.Column("perio_risk_band", sa.String(length=32), nullable=True),
    )

    add_columns_if_missing(
        "staff_profiles",
        sa.Column("cert_expires_at", sa.Date(), nullable=True),
    )

    create_table_if_missing(
        "suppliers",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(36), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("contact_email", sa.String(200), nullable=True),
        sa.Column("contact_phone", sa.String(40), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    create_index_if_missing("ix_suppliers_clinic_id", "suppliers", ["clinic_id"])

    add_columns_if_missing(
        "inventory_items",
        sa.Column("expiry_date", sa.Date(), nullable=True),
        sa.Column("supplier_id", sa.String(36), nullable=True),
    )
    create_foreign_key_if_missing(
        "fk_inventory_items_supplier_id_suppliers",
        "inventory_items",
        "suppliers",
        ["supplier_id"],
        ["id"],
    )
    create_index_if_missing("ix_inventory_items_supplier_id", "inventory_items", ["supplier_id"])

    create_table_if_missing(
        "purchase_orders",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(36), nullable=False),
        sa.Column("supplier_id", sa.String(36), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("ordered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expected_at", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("lines_json", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["supplier_id"], ["suppliers.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    create_index_if_missing("ix_purchase_orders_clinic_id", "purchase_orders", ["clinic_id"])
    create_index_if_missing("ix_purchase_orders_supplier_id", "purchase_orders", ["supplier_id"])
    create_index_if_missing("ix_purchase_orders_status", "purchase_orders", ["status"])

    create_table_if_missing(
        "restoration_cases",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(36), nullable=False),
        sa.Column("patient_id", sa.String(36), nullable=False),
        sa.Column("primary_tooth", sa.String(8), nullable=False),
        sa.Column("case_type", sa.String(80), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("warranty_months", sa.Integer(), nullable=False),
        sa.Column("recall_due_at", sa.Date(), nullable=True),
        sa.Column("lab_case_id", sa.String(36), nullable=True),
        sa.Column("fee_code", sa.String(40), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by_id", sa.String(36), nullable=True),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"]),
        sa.ForeignKeyConstraint(["lab_case_id"], ["lab_cases.id"]),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    create_index_if_missing("ix_restoration_cases_clinic_id", "restoration_cases", ["clinic_id"])
    create_index_if_missing("ix_restoration_cases_patient_id", "restoration_cases", ["patient_id"])
    create_index_if_missing("ix_restoration_cases_status", "restoration_cases", ["status"])
    create_index_if_missing("ix_restoration_cases_lab_case_id", "restoration_cases", ["lab_case_id"])

    create_table_if_missing(
        "restorations",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(36), nullable=False),
        sa.Column("case_id", sa.String(36), nullable=True),
        sa.Column("patient_id", sa.String(36), nullable=False),
        sa.Column("tooth_number", sa.String(8), nullable=False),
        sa.Column("surfaces", sa.String(16), nullable=False),
        sa.Column("restoration_type", sa.String(80), nullable=False),
        sa.Column("cavity_size", sa.String(8), nullable=True),
        sa.Column("blacks_class", sa.String(8), nullable=True),
        sa.Column("material", sa.String(80), nullable=True),
        sa.Column("shade", sa.String(40), nullable=True),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("chart_entry_id", sa.String(36), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("recorded_by_id", sa.String(36), nullable=True),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["case_id"], ["restoration_cases.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"]),
        sa.ForeignKeyConstraint(["chart_entry_id"], ["dental_chart_entries.id"]),
        sa.ForeignKeyConstraint(["recorded_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    create_index_if_missing("ix_restorations_clinic_id", "restorations", ["clinic_id"])
    create_index_if_missing("ix_restorations_case_id", "restorations", ["case_id"])
    create_index_if_missing("ix_restorations_patient_id", "restorations", ["patient_id"])
    create_index_if_missing("ix_restorations_tooth_number", "restorations", ["tooth_number"])
    create_index_if_missing("ix_restorations_status", "restorations", ["status"])
    create_index_if_missing("ix_restorations_chart_entry_id", "restorations", ["chart_entry_id"])

    create_table_if_missing(
        "restoration_qualities",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("restoration_id", sa.String(36), nullable=False),
        sa.Column("marginal_adaptation", sa.Integer(), nullable=True),
        sa.Column("contacts", sa.Integer(), nullable=True),
        sa.Column("wear", sa.Integer(), nullable=True),
        sa.Column("postop_sensitivity", sa.Integer(), nullable=True),
        sa.Column("pulp_status", sa.String(40), nullable=True),
        sa.Column("color_match", sa.Integer(), nullable=True),
        sa.Column("finishing", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["restoration_id"], ["restorations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("restoration_id", name="uq_restoration_qualities_restoration_id"),
    )
    create_index_if_missing("ix_restoration_qualities_restoration_id", "restoration_qualities", ["restoration_id"])

    create_table_if_missing(
        "inventory_usages",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(36), nullable=False),
        sa.Column("inventory_item_id", sa.String(36), nullable=False),
        sa.Column("quantity", sa.Float(), nullable=False),
        sa.Column("restoration_id", sa.String(36), nullable=True),
        sa.Column("chart_entry_id", sa.String(36), nullable=True),
        sa.Column("recorded_by_id", sa.String(36), nullable=True),
        sa.Column("reason", sa.String(200), nullable=True),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["inventory_item_id"], ["inventory_items.id"]),
        sa.ForeignKeyConstraint(["restoration_id"], ["restorations.id"]),
        sa.ForeignKeyConstraint(["chart_entry_id"], ["dental_chart_entries.id"]),
        sa.ForeignKeyConstraint(["recorded_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    create_index_if_missing("ix_inventory_usages_clinic_id", "inventory_usages", ["clinic_id"])
    create_index_if_missing("ix_inventory_usages_inventory_item_id", "inventory_usages", ["inventory_item_id"])
    create_index_if_missing("ix_inventory_usages_restoration_id", "inventory_usages", ["restoration_id"])

    create_table_if_missing(
        "endo_cases",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(36), nullable=False),
        sa.Column("patient_id", sa.String(36), nullable=False),
        sa.Column("tooth_number", sa.String(8), nullable=False),
        sa.Column("procedure_type", sa.String(40), nullable=False),
        sa.Column("tooth_length_mm", sa.Float(), nullable=True),
        sa.Column("canal_count", sa.Integer(), nullable=True),
        sa.Column("working_length_mm", sa.Float(), nullable=True),
        sa.Column("prep_method", sa.String(40), nullable=True),
        sa.Column("irrigants_json", sa.Text(), nullable=True),
        sa.Column("dressings_json", sa.Text(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("final_restoration_id", sa.String(36), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("recorded_by_id", sa.String(36), nullable=True),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"]),
        sa.ForeignKeyConstraint(["final_restoration_id"], ["restorations.id"]),
        sa.ForeignKeyConstraint(["recorded_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    create_index_if_missing("ix_endo_cases_clinic_id", "endo_cases", ["clinic_id"])
    create_index_if_missing("ix_endo_cases_patient_id", "endo_cases", ["patient_id"])
    create_index_if_missing("ix_endo_cases_tooth_number", "endo_cases", ["tooth_number"])
    create_index_if_missing("ix_endo_cases_status", "endo_cases", ["status"])

    create_table_if_missing(
        "endo_obturations",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("endo_case_id", sa.String(36), nullable=False),
        sa.Column("visit_date", sa.Date(), nullable=False),
        sa.Column("canals_filled", sa.String(120), nullable=True),
        sa.Column("material", sa.String(120), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["endo_case_id"], ["endo_cases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    create_index_if_missing("ix_endo_obturations_endo_case_id", "endo_obturations", ["endo_case_id"])

    create_table_if_missing(
        "staff_shifts",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(36), nullable=False),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("role_label", sa.String(80), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    create_index_if_missing("ix_staff_shifts_clinic_id", "staff_shifts", ["clinic_id"])
    create_index_if_missing("ix_staff_shifts_user_id", "staff_shifts", ["user_id"])

    create_table_if_missing(
        "staff_leaves",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_id", sa.String(36), nullable=False),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("starts_on", sa.Date(), nullable=False),
        sa.Column("ends_on", sa.Date(), nullable=False),
        sa.Column("leave_type", sa.String(40), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    create_index_if_missing("ix_staff_leaves_clinic_id", "staff_leaves", ["clinic_id"])
    create_index_if_missing("ix_staff_leaves_user_id", "staff_leaves", ["user_id"])


def downgrade() -> None:
    for table in (
        "staff_leaves",
        "staff_shifts",
        "endo_obturations",
        "endo_cases",
        "inventory_usages",
        "restoration_qualities",
        "restorations",
        "restoration_cases",
        "purchase_orders",
    ):
        drop_table_if_present(table)
    drop_constraint_if_present("fk_inventory_items_supplier_id_suppliers", "inventory_items")
    drop_index_if_present("ix_inventory_items_supplier_id", "inventory_items")
    drop_columns_if_present("inventory_items", "supplier_id", "expiry_date")
    drop_table_if_present("suppliers")
    drop_columns_if_present("staff_profiles", "cert_expires_at")
    drop_columns_if_present("patients", "perio_risk_band", "hygiene_recall_due")
