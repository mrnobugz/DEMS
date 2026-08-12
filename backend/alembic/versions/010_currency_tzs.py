"""Default clinic currency to TZS (Tanzanian Shilling) and scale USD seed amounts.

Revision ID: 010_currency_tzs
Revises: 009_phase3_lab_imaging_insurance
Create Date: 2026-08-09
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.db.migration_ops import has_table

revision: str = "010_currency_tzs"
down_revision: Union[str, None] = "009_phase3_lab_imaging_insurance"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

FEE_TZS = {
    "consultation": 30000.0,
    "cleaning": 50000.0,
    "filling": 80000.0,
    "crown": 600000.0,
    "rct": 350000.0,
    "extraction": 60000.0,
    "caries": 0.0,
    "missing": 0.0,
    "sound": 0.0,
    "planned": 0.0,
}


# Scale remaining USD-looking amounts (~x2500) for demo continuity. Keyed by table so
# a database missing any of them (older deploys) is skipped instead of erroring.
SCALE_SQL: dict[str, tuple[str, ...]] = {
    "fee_schedule_items": (
        "UPDATE fee_schedule_items SET unit_price = unit_price * 2500 WHERE unit_price > 0 AND unit_price < 10000",
    ),
    "invoices": (
        "UPDATE invoices SET subtotal = subtotal * 2500 WHERE subtotal > 0 AND subtotal < 10000",
        "UPDATE invoices SET tax = tax * 2500 WHERE tax > 0 AND tax < 10000",
        "UPDATE invoices SET discount = discount * 2500 WHERE discount > 0 AND discount < 10000",
        "UPDATE invoices SET total = total * 2500 WHERE total > 0 AND total < 10000",
        "UPDATE invoices SET amount_paid = amount_paid * 2500 WHERE amount_paid > 0 AND amount_paid < 10000",
    ),
    "invoice_line_items": (
        "UPDATE invoice_line_items SET unit_price = unit_price * 2500 WHERE unit_price > 0 AND unit_price < 10000",
        "UPDATE invoice_line_items SET total = total * 2500 WHERE total > 0 AND total < 10000",
    ),
    "payments": ("UPDATE payments SET amount = amount * 2500 WHERE amount > 0 AND amount < 10000",),
    "appointment_types": (
        "UPDATE appointment_types SET default_fee = default_fee * 2500 WHERE default_fee > 0 AND default_fee < 10000",
    ),
    "treatment_plan_items": (
        "UPDATE treatment_plan_items SET estimated_fee = estimated_fee * 2500 WHERE estimated_fee > 0 AND estimated_fee < 10000",
    ),
    "inventory_items": (
        "UPDATE inventory_items SET unit_cost = unit_cost * 2500 WHERE unit_cost > 0 AND unit_cost < 10000",
    ),
    "lab_cases": (
        "UPDATE lab_cases SET lab_cost = lab_cost * 2500 WHERE lab_cost > 0 AND lab_cost < 10000",
    ),
    "patient_insurance_plans": (
        "UPDATE patient_insurance_plans SET "
        "annual_max = annual_max * 2500, "
        "amount_used_ytd = amount_used_ytd * 2500, "
        "deductible = deductible * 2500, "
        "deductible_met = deductible_met * 2500 "
        "WHERE annual_max > 0 AND annual_max < 100000",
    ),
}


def upgrade() -> None:
    conn = op.get_bind()

    if has_table("clinics"):
        conn.execute(
            sa.text(
                "UPDATE clinics SET currency = 'TZS', "
                "timezone = CASE WHEN timezone = 'UTC' THEN 'Africa/Dar_es_Salaam' ELSE timezone END"
            )
        )
    if has_table("invoices"):
        conn.execute(sa.text("UPDATE invoices SET currency = 'TZS'"))
    if has_table("fee_schedule_items"):
        conn.execute(sa.text("UPDATE fee_schedule_items SET currency = 'TZS'"))
        for code, price in FEE_TZS.items():
            conn.execute(
                sa.text("UPDATE fee_schedule_items SET unit_price = :price WHERE code = :code"),
                {"price": price, "code": code},
            )

    for table, statements in SCALE_SQL.items():
        if not has_table(table):
            continue
        for sql in statements:
            conn.execute(sa.text(sql))


def downgrade() -> None:
    # Irreversible data conversion — currency label only
    conn = op.get_bind()
    for table in ("clinics", "fee_schedule_items", "invoices"):
        if has_table(table):
            conn.execute(sa.text(f"UPDATE {table} SET currency = 'USD'"))
