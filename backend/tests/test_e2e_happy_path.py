"""Phase 1 E2E happy path at the service layer (register→book→examine→note→invoice→pay)."""

from __future__ import annotations

import unittest
from datetime import UTC, date, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.rbac import Role
from app.core.security import hash_password
from app.db.session import Base
from app.models import AppointmentType, Clinic, ProcedureCategory, User
from app.schemas import (
    AppointmentCreate,
    ChartEntryCreate,
    ChartToCashRequest,
    ClinicalNoteCreate,
    ClinicalVisitCreate,
    PatientCreate,
    PaymentCreate,
)
from app.schemas.exam import VisitDiagnosis, VisitVitals
from app.services import domain as svc
from app.services.domain import ensure_fee_schedule


class HappyPathE2ETests(unittest.IsolatedAsyncioTestCase):
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
            clinic = Clinic(name="E2E Clinic", code="E2E", currency="USD", timezone="UTC")
            db.add(clinic)
            await db.flush()
            dentist = User(
                email="e2e.dentist@demsta.test",
                hashed_password=hash_password("Demsta!Dentist1"),
                full_name="Dr E2E",
                role=Role.DENTIST,
                clinic_id=clinic.id,
            )
            front = User(
                email="e2e.front@demsta.test",
                hashed_password=hash_password("Demsta!Front1"),
                full_name="Front E2E",
                role=Role.RECEPTIONIST,
                clinic_id=clinic.id,
            )
            db.add_all([dentist, front])
            await db.flush()
            atype = AppointmentType(
                clinic_id=clinic.id,
                name="Consultation",
                category=ProcedureCategory.CONSULTATION,
                duration_minutes=30,
                color="#0B5FFF",
                default_fee=50,
            )
            db.add(atype)
            await ensure_fee_schedule(db, clinic.id)
            await db.commit()
            self.clinic_id = clinic.id
            self.dentist_id = dentist.id
            self.front_id = front.id
            self.type_id = atype.id

    async def asyncTearDown(self) -> None:
        await self.engine.dispose()

    async def test_register_book_examine_note_invoice_pay(self) -> None:
        async with self.Session() as db:
            patient = await svc.create_patient(
                db,
                self.clinic_id,
                self.front_id,
                PatientCreate(
                    first_name="E2E",
                    last_name="Patient",
                    phone="+1-555-0199",
                    chief_complaint="Toothache #36",
                    sex="female",
                ),
            )
            patient = await svc.assign_primary_dentist(
                db, self.clinic_id, self.front_id, patient.id, self.dentist_id
            )
            self.assertEqual(patient.primary_dentist_id, self.dentist_id)

            starts = datetime.now(UTC).replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
            appt = await svc.create_appointment(
                db,
                self.clinic_id,
                self.front_id,
                AppointmentCreate(
                    patient_id=patient.id,
                    dentist_id=self.dentist_id,
                    appointment_type_id=self.type_id,
                    chair_number=1,
                    starts_at=starts,
                    ends_at=starts + timedelta(minutes=30),
                    reason="E2E consult",
                ),
            )
            self.assertEqual(appt.status, "scheduled")

            visit = await svc.create_clinical_visit(
                db,
                self.clinic_id,
                self.dentist_id,
                patient.id,
                ClinicalVisitCreate(
                    visit_date=date.today(),
                    chief_complaint="Pain on cold",
                    vitals=VisitVitals(bp_systolic=120, bp_diastolic=80, pulse=72),
                    diagnosis=VisitDiagnosis(
                        working_diagnosis="Reversible pulpitis",
                        problem_list="36 occlusal caries",
                    ),
                ),
            )
            self.assertEqual(visit.status, "in_progress")

            note = await svc.create_clinical_note(
                db,
                self.clinic_id,
                self.dentist_id,
                patient.id,
                ClinicalNoteCreate(
                    note_type="soap",
                    subjective="Pain on cold drinks",
                    objective="Occlusal caries 36",
                    assessment="Reversible pulpitis",
                    plan="Composite restoration",
                ),
            )
            self.assertFalse(note.is_finalized)

            chart = await svc.add_chart_entry(
                db,
                self.clinic_id,
                self.dentist_id,
                patient.id,
                ChartEntryCreate(
                    tooth_number="36",
                    surfaces="O",
                    condition_code="filling",
                    condition_label="Composite filling",
                    entry_kind="existing",
                    status="completed",
                ),
            )
            self.assertIsNone(chart.billed_invoice_id)

            invoice = await svc.chart_to_cash(
                db,
                self.clinic_id,
                self.front_id,
                ChartToCashRequest(
                    patient_id=patient.id,
                    chart_entry_ids=[chart.id],
                    idempotency_key="e2e-c2c-1",
                ),
            )
            self.assertGreater(invoice.total, 0)
            self.assertEqual(invoice.status, "issued")

            paid = await svc.add_payment(
                db,
                self.clinic_id,
                self.front_id,
                invoice.id,
                PaymentCreate(
                    amount=invoice.total,
                    method="card",
                    idempotency_key="e2e-pay-1",
                ),
            )
            self.assertEqual(paid.status, "paid")
            self.assertAlmostEqual(paid.amount_paid, paid.total)

            # Dentist can see assigned patient; scoping rejects foreign caseload
            dentist = await db.get(User, self.dentist_id)
            assert dentist is not None
            visible = await svc.get_patient(
                db, self.clinic_id, patient.id, actor=dentist
            )
            self.assertEqual(visible.id, patient.id)

            other = await svc.create_patient(
                db,
                self.clinic_id,
                self.front_id,
                PatientCreate(first_name="Other", last_name="Caseload", phone="+1-555-0188"),
            )
            # Assign to a fake other dentist id by setting field directly
            other.primary_dentist_id = "not-this-dentist"
            await db.flush()
            from app.core.exceptions import ForbiddenError

            with self.assertRaises(ForbiddenError):
                await svc.get_patient(db, self.clinic_id, other.id, actor=dentist)

            await db.commit()


if __name__ == "__main__":
    unittest.main()
