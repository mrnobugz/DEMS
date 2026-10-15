"""Reports service: financial, clinical, and operational summaries."""

from __future__ import annotations

import unittest
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.rbac import Role
from app.core.security import hash_password
from app.db.session import Base
from app.models import (
    Appointment,
    Clinic,
    Invoice,
    InvoiceStatus,
    Patient,
    Payment,
    PaymentMethod,
    User,
)
from app.services import reports as report_svc


class ReportsServiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.engine = create_async_engine(
            "sqlite+aiosqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        self.Session = async_sessionmaker(self.engine, class_=AsyncSession, expire_on_commit=False)
        async with self.Session() as db:
            clinic = Clinic(name="Reports Clinic", code="RPT", currency="TZS")
            db.add(clinic)
            await db.flush()
            actor = User(
                email="rpt@example.com",
                hashed_password=hash_password("Demsta!Rpt1"),
                full_name="Reporter",
                role=Role.CLINIC_ADMIN,
                clinic_id=clinic.id,
            )
            patient = Patient(
                clinic_id=clinic.id,
                patient_code="P202600099",
                first_name="Ada",
                last_name="Lovelace",
            )
            db.add_all([actor, patient])
            await db.flush()
            inv = Invoice(
                clinic_id=clinic.id,
                patient_id=patient.id,
                invoice_number="INV-RPT-1",
                status=InvoiceStatus.ISSUED,
                total=100_000,
                amount_paid=40_000,
                issued_at=datetime.now(UTC) - timedelta(days=10),
            )
            db.add(inv)
            await db.flush()
            db.add(
                Payment(
                    clinic_id=clinic.id,
                    invoice_id=inv.id,
                    amount=40_000,
                    method=PaymentMethod.CASH,
                    paid_at=datetime.now(UTC),
                )
            )
            now = datetime.now(UTC)
            db.add(
                Appointment(
                    clinic_id=clinic.id,
                    patient_id=patient.id,
                    dentist_id=actor.id,
                    starts_at=now - timedelta(days=1),
                    ends_at=now - timedelta(days=1) + timedelta(hours=1),
                    status="completed",
                )
            )
            db.add(
                Appointment(
                    clinic_id=clinic.id,
                    patient_id=patient.id,
                    dentist_id=actor.id,
                    starts_at=now - timedelta(hours=5),
                    ends_at=now - timedelta(hours=4),
                    status="no_show",
                )
            )
            await db.commit()
            self.clinic_id = clinic.id

    async def asyncTearDown(self) -> None:
        await self.engine.dispose()

    async def test_financial_includes_collections_and_aging(self) -> None:
        async with self.Session() as db:
            data = await report_svc.financial_report(db, self.clinic_id, days=30)
        self.assertGreaterEqual(data["revenue_today"], 40_000)
        self.assertGreaterEqual(data["outstanding"], 60_000)
        self.assertIn("0_30", data["aging"])
        self.assertTrue(any(row["method"] == PaymentMethod.CASH for row in data["by_method"]))

    async def test_operational_counts_appointments(self) -> None:
        async with self.Session() as db:
            data = await report_svc.operational_report(db, self.clinic_id, days=7)
        self.assertEqual(data["appointments"], 2)
        self.assertEqual(data["completed"], 1)
        self.assertEqual(data["no_shows"], 1)
        self.assertAlmostEqual(data["no_show_rate"], 0.5)

    async def test_clinical_returns_period_shape(self) -> None:
        async with self.Session() as db:
            data = await report_svc.clinical_report(db, self.clinic_id, days=30)
        self.assertEqual(data["scope"], "clinic")
        self.assertIn("top_procedures", data)
        self.assertIn("visits", data)
        self.assertIn("material_cost_used", data)


if __name__ == "__main__":
    unittest.main()
