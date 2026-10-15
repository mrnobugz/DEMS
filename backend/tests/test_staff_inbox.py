"""Staff inbox fan-out when invoices are created from other departments."""

from __future__ import annotations

import unittest

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.rbac import Role
from app.core.security import hash_password
from app.db.session import Base
from app.models import Clinic, StaffNotification, User
from app.schemas import InvoiceCreate, InvoiceLineCreate, PatientCreate
from app.services import domain as svc


class StaffInboxTests(unittest.IsolatedAsyncioTestCase):
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
            clinic = Clinic(name="Inbox Clinic", code="INBX", currency="TZS")
            db.add(clinic)
            await db.flush()
            dentist = User(
                email="dentist@example.com",
                hashed_password=hash_password("Demsta!Test1"),
                full_name="Dentist",
                role=Role.DENTIST,
                clinic_id=clinic.id,
            )
            accountant = User(
                email="acct@example.com",
                hashed_password=hash_password("Demsta!Test1"),
                full_name="Accountant",
                role=Role.ACCOUNTANT,
                clinic_id=clinic.id,
            )
            receptionist = User(
                email="front@example.com",
                hashed_password=hash_password("Demsta!Test1"),
                full_name="Front",
                role=Role.RECEPTIONIST,
                clinic_id=clinic.id,
            )
            db.add_all([dentist, accountant, receptionist])
            await db.commit()
            self.clinic_id = clinic.id
            self.dentist_id = dentist.id
            self.accountant_id = accountant.id
            self.receptionist_id = receptionist.id

    async def asyncTearDown(self) -> None:
        await self.engine.dispose()

    async def test_invoice_notifies_billing_roles_not_actor(self) -> None:
        async with self.Session() as db:
            patient = await svc.create_patient(
                db,
                self.clinic_id,
                self.dentist_id,
                PatientCreate(first_name="Asha", last_name="Juma", phone="+255700000001"),
            )
            invoice = await svc.create_invoice(
                db,
                self.clinic_id,
                self.dentist_id,
                InvoiceCreate(
                    patient_id=patient.id,
                    notes="Radiology investigation",
                    line_items=[
                        InvoiceLineCreate(
                            description="OPG",
                            quantity=1,
                            unit_price=45000,
                            line_kind="imaging",
                            procedure_code="img-opg",
                        )
                    ],
                ),
            )
            await db.commit()
            rows = list(
                (
                    await db.execute(
                        select(StaffNotification).where(StaffNotification.clinic_id == self.clinic_id)
                    )
                )
                .scalars()
                .all()
            )
            recipients = {row.user_id for row in rows}
            self.assertTrue(rows)
            self.assertIn(self.accountant_id, recipients)
            self.assertIn(self.receptionist_id, recipients)
            self.assertNotIn(self.dentist_id, recipients)
            self.assertTrue(all(row.event_type == "invoice.created" for row in rows))
            self.assertTrue(all(row.category == "billing" for row in rows))
            self.assertIn(invoice.id, rows[0].link_path or "")
            self.assertIn("Imaging", rows[0].title)

    async def test_lab_case_received_notifies_clinical_and_dentist(self) -> None:
        from app.schemas import LabCaseCreate, LabCaseUpdate
        from app.services import departments as dept

        async with self.Session() as db:
            patient = await svc.create_patient(
                db,
                self.clinic_id,
                self.dentist_id,
                PatientCreate(first_name="Zuberi", last_name="Mwinyi", phone="+255700000002"),
            )
            dentist_user = await db.get(User, self.dentist_id)
            assert dentist_user is not None
            case = await dept.create_lab_case(
                db,
                self.clinic_id,
                dentist_user,
                LabCaseCreate(
                    patient_id=patient.id,
                    case_type="crown",
                    tooth="16",
                    lab_name="SmileLab",
                    status="sent",
                ),
            )
            await db.commit()

            # Now mark received
            await dept.update_lab_case(
                db,
                self.clinic_id,
                case.id,
                LabCaseUpdate(status="received"),
                actor_id=self.receptionist_id,
            )
            await db.commit()

            notifs = list(
                (
                    await db.execute(
                        select(StaffNotification).where(
                            StaffNotification.clinic_id == self.clinic_id,
                            StaffNotification.event_type == "lab.case_received",
                        )
                    )
                )
                .scalars()
                .all()
            )
            self.assertTrue(notifs)
            recipients = {n.user_id for n in notifs}
            self.assertIn(self.dentist_id, recipients)
            self.assertIn("Crown", notifs[0].title)
            self.assertIn("Zuberi Mwinyi", notifs[0].body)
            self.assertIn("Tooth 16", notifs[0].body)


if __name__ == "__main__":
    unittest.main()
