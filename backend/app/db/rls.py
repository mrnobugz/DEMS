"""Apply / verify PostgreSQL Row-Level Security for clinic isolation."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine

# Tenant-scoped tables that carry clinic_id
TENANT_TABLES = (
    "users",
    "patients",
    "appointment_types",
    "appointments",
    "dental_chart_entries",
    "clinical_notes",
    "consent_records",
    "perio_exams",
    "treatment_plans",
    "invoices",
    "payments",
    "ai_suggestions",
    "clinical_visits",
    "fee_schedule_items",
    "inventory_items",
    "lab_cases",
    "imaging_studies",
    "drug_templates",
    "prescriptions",
    "staff_profiles",
    "restoration_cases",
    "restorations",
    "inventory_usages",
    "endo_cases",
    "suppliers",
    "purchase_orders",
    "staff_shifts",
    "staff_leaves",
    "patient_insurance_plans",
)


async def apply_rls_policies(engine: AsyncEngine) -> None:
    """Enable RLS + clinic_id policies (defense in depth under app.clinic_id GUC)."""
    async with engine.begin() as conn:
        if conn.dialect.name != "postgresql":
            return
        for table in TENANT_TABLES:
            await _enable_table_rls(conn, table)


async def _enable_table_rls(conn: AsyncConnection, table: str) -> None:
    exists = (
        await conn.execute(
            text("SELECT to_regclass(:name)"),
            {"name": f"public.{table}"},
        )
    ).scalar()
    if not exists:
        return

    await conn.execute(text(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY'))
    await conn.execute(text(f'ALTER TABLE "{table}" FORCE ROW LEVEL SECURITY'))

    policy = f"{table}_tenant_isolation"
    await conn.execute(text(f'DROP POLICY IF EXISTS "{policy}" ON "{table}"'))
    # Bypass only when explicitly set (bootstrap/migrations). Authenticated
    # requests must set app.clinic_id — empty setting matches zero rows.
    await conn.execute(
        text(
            f"""
            CREATE POLICY "{policy}" ON "{table}"
            FOR ALL
            USING (
                current_setting('app.bypass_rls', true) = 'on'
                OR clinic_id = NULLIF(current_setting('app.clinic_id', true), '')
            )
            WITH CHECK (
                current_setting('app.bypass_rls', true) = 'on'
                OR clinic_id = NULLIF(current_setting('app.clinic_id', true), '')
            )
            """
        )
    )
