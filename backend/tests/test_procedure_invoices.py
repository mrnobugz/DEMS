"""Admin procedure catalog drives specialist invoices."""

from __future__ import annotations

import unittest

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.exceptions import ValidationAppError
from app.core.rbac import Role, has_permission
from app.core.security import hash_password
from app.db.session import Base
from app.models import Clinic, User
from app.schemas import (
    FeeScheduleItemCreate,
    InvoiceFromProceduresRequest,
    PatientCreate,
    ProcedureInvoiceLine,
)
from app.services import domain as svc


class ProcedureInvoiceTests(unittest.IsolatedAsyncioTestCase):
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
            clinic = Clinic(name="Fee Clinic", code="FEE", currency="TZS")
            db.add(clinic)
            await db.flush()
            admin = User(
                email="admin@demsta.test",
                hashed_password=hash_password("Demsta!Admin1"),
                full_name="Admin",
                role=Role.CLINIC_ADMIN,
                clinic_id=clinic.id,
            )
            dentist = User(
                email="dentist@demsta.test",
                hashed_password=hash_password("Demsta!Dent1"),
                full_name="Dr Bill",
                role=Role.DENTIST,
                clinic_id=clinic.id,
            )
            db.add_all([admin, dentist])
            await db.commit()
            self.clinic_id = clinic.id
            self.admin_id = admin.id
            self.dentist_id = dentist.id

    async def asyncTearDown(self) -> None:
        await self.engine.dispose()

    def test_dentist_can_create_invoices(self) -> None:
        self.assertTrue(has_permission(Role.DENTIST, "billing:create"))

    async def test_admin_adds_procedure_and_specialist_invoices_it(self) -> None:
        async with self.Session() as db:
            patient = await svc.create_patient(
                db,
                self.clinic_id,
                self.admin_id,
                PatientCreate(first_name="Asha", last_name="Mwamba", phone="0711555001"),
            )
            item = await svc.upsert_fee_item(
                db,
                self.clinic_id,
                self.admin_id,
                FeeScheduleItemCreate(
                    code="rct-ant",
                    label="Anterior RCT",
                    category="endodontic",
                    unit_price=420000,
                ),
            )
            catalog = await svc.list_fee_schedule(db, self.clinic_id, billable=True, active=True)
            self.assertTrue(any(row.code == "rct-ant" for row in catalog))
            invoice = await svc.invoice_from_procedures(
                db,
                self.clinic_id,
                self.dentist_id,
                InvoiceFromProceduresRequest(
                    patient_id=patient.id,
                    items=[ProcedureInvoiceLine(fee_item_id=item.id, quantity=1, tooth_number="11")],
                ),
            )
            self.assertEqual(invoice.total, 420000)
            self.assertEqual(invoice.line_items[0].procedure_code, "rct-ant")
            self.assertEqual(invoice.line_items[0].tooth_number, "11")
            self.assertEqual(invoice.line_items[0].description, "Anterior RCT")

    async def test_non_billable_or_zero_price_rejected(self) -> None:
        async with self.Session() as db:
            patient = await svc.create_patient(
                db,
                self.clinic_id,
                self.admin_id,
                PatientCreate(first_name="Juma", last_name="Kato", phone="0711555002"),
            )
            item = await svc.upsert_fee_item(
                db,
                self.clinic_id,
                self.admin_id,
                FeeScheduleItemCreate(
                    code="chart-only",
                    label="Chart note",
                    category="diagnostic",
                    unit_price=0,
                    billable=False,
                ),
            )
            with self.assertRaises(ValidationAppError):
                await svc.invoice_from_procedures(
                    db,
                    self.clinic_id,
                    self.dentist_id,
                    InvoiceFromProceduresRequest(
                        patient_id=patient.id,
                        items=[ProcedureInvoiceLine(fee_item_id=item.id)],
                    ),
                )


if __name__ == "__main__":
    unittest.main()
