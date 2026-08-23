"""Registration checkout: warehouse fees, payer types, slots, and queue numbers."""

from __future__ import annotations

import os
import tempfile
import unittest
from datetime import UTC, date, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.exceptions import ValidationAppError
from app.core.rbac import Role
from app.core.security import hash_password
from app.db.session import Base
from app.models import Clinic, InventoryItem, InventoryItemKind, User
from app.schemas import (
    InventoryItemCreate,
    PatientCreate,
    PatientRegisterRequest,
    RegistrationAppointment,
    RegistrationConsent,
    RegistrationLineItem,
    RegistrationPayment,
)
from app.services import departments as dept
from app.services import domain as svc


class RegistrationCheckoutTests(unittest.IsolatedAsyncioTestCase):
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
            clinic = Clinic(
                name="Reg Clinic",
                code="REG",
                currency="TZS",
                timezone="Africa/Dar_es_Salaam",
            )
            db.add(clinic)
            await db.flush()
            admin = User(
                email="admin@demsta.test",
                hashed_password=hash_password("Demsta!Admin1"),
                full_name="Admin",
                role=Role.CLINIC_ADMIN,
                clinic_id=clinic.id,
            )
            front = User(
                email="front@demsta.test",
                hashed_password=hash_password("Demsta!Front1"),
                full_name="Front",
                role=Role.RECEPTIONIST,
                clinic_id=clinic.id,
            )
            dentist = User(
                email="dentist@demsta.test",
                hashed_password=hash_password("Demsta!Dent1"),
                full_name="Dr Slot",
                role=Role.DENTIST,
                clinic_id=clinic.id,
            )
            db.add_all([admin, front, dentist])
            await db.commit()
            self.clinic_id = clinic.id
            self.admin_id = admin.id
            self.front_id = front.id
            self.dentist_id = dentist.id

    async def asyncTearDown(self) -> None:
        await self.engine.dispose()

    def _slot(self) -> datetime:
        now = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
        return now + timedelta(hours=2)

    def _booking(self, service: str = "Consultation fee") -> RegistrationAppointment:
        return RegistrationAppointment(
            service_name=service,
            starts_at=self._slot(),
            duration_minutes=30,
            dentist_id=self.dentist_id,
        )

    def _consent(self, name: str = "Asha Mwamba", *, guardian: bool = False) -> RegistrationConsent:
        return RegistrationConsent(
            signature_data="data:image/png;base64,aaa",
            signed_by_name=name,
            guardian=guardian,
        )

    def _patient(self, first: str, last: str, **extra) -> PatientCreate:
        body = dict(
            first_name=first,
            last_name=last,
            date_of_birth=date(1990, 3, 12),
            sex="female",
            phone="0711000001",
            town_city="Dar es Salaam",
            chief_complaint="Pain on chewing",
            next_of_kin="Parent Mwamba",
        )
        body.update(extra)
        return PatientCreate(**body)

    async def test_admin_manages_registration_fees_in_warehouse(self) -> None:
        async with self.Session() as db:
            seeded = await dept.ensure_registration_catalog(db, self.clinic_id)
            self.assertGreaterEqual(len(seeded), 1)
            consult = next(item for item in seeded if item.sku == "FEE-CONSULT")
            self.assertTrue(consult.billable_at_registration)
            self.assertEqual(consult.item_kind, InventoryItemKind.SERVICE)
            self.assertGreater(consult.sale_price, 0)

            created = await dept.create_inventory_item(
                db,
                self.clinic_id,
                self.admin_id,
                InventoryItemCreate(
                    sku="FEE-XRAY",
                    name="OPG at registration",
                    category="registration",
                    item_kind="service",
                    sale_price=20000,
                    billable_at_registration=True,
                    target_department="restorative",
                    unit="visit",
                ),
            )
            catalog = await dept.list_inventory(
                db, self.clinic_id, billable_at_registration=True
            )
            skus = {item.sku for item in catalog}
            self.assertIn("FEE-CONSULT", skus)
            self.assertIn("FEE-XRAY", skus)
            self.assertEqual(created.sale_price, 20000)

    async def test_finalize_registration_requires_payment_and_routes(self) -> None:
        async with self.Session() as db:
            await dept.ensure_registration_catalog(db, self.clinic_id)
            consult = await dept.list_inventory(db, self.clinic_id, billable_at_registration=True)
            item = next(row for row in consult if row.sku == "FEE-CONSULT")
            result = await svc.register_patient(
                db,
                self.clinic_id,
                self.front_id,
                PatientRegisterRequest(
                    patient=self._patient("Asha", "Mwamba"),
                    items=[RegistrationLineItem(inventory_item_id=item.id, quantity=1)],
                    payment=RegistrationPayment(amount=item.sale_price, payer_type="self", method="cash"),
                    appointment=self._booking(item.name),
                    consent=self._consent(),
                    destination_department="restorative",
                ),
            )
            self.assertEqual(result.patient.registration_status, "finalized")
            self.assertEqual(result.destination_department, "restorative")
            self.assertEqual(result.clinical_path, "/clinical/restorative")
            self.assertEqual(result.invoice.status, "paid")
            self.assertFalse(result.outstanding)
            self.assertEqual(result.queue_number, 1)
            self.assertEqual(result.service_name, item.name)
            self.assertTrue(result.appointment_id)
            self.assertTrue(result.is_appointment)
            self.assertEqual(result.patient.primary_dentist_id, self.dentist_id)
            self.assertEqual(result.medical_staff_id, self.dentist_id)
            chair = await dept.list_today_appointments(
                db, self.clinic_id, department="restorative"
            )
            self.assertEqual(len(chair), 1)
            self.assertEqual(chair[0].patient_id, result.patient.id)
            self.assertEqual(chair[0].dentist_id, self.dentist_id)
            self.assertEqual(chair[0].queue_number, 1)
            other = await dept.list_today_appointments(
                db, self.clinic_id, department="paediatric"
            )
            self.assertEqual(other, [])
            mine = await dept.list_today_appointments(
                db, self.clinic_id, department="restorative", dentist_id=self.dentist_id
            )
            self.assertEqual(len(mine), 1)

    async def test_insurance_and_outstanding_allowed(self) -> None:
        async with self.Session() as db:
            await dept.ensure_registration_catalog(db, self.clinic_id)
            item = next(
                row
                for row in await dept.list_inventory(db, self.clinic_id, billable_at_registration=True)
                if row.sku == "FEE-CONSULT"
            )
            result = await svc.register_patient(
                db,
                self.clinic_id,
                self.front_id,
                PatientRegisterRequest(
                    patient=self._patient("Juma", "NHIF", sex="male"),
                    items=[RegistrationLineItem(inventory_item_id=item.id)],
                    payment=RegistrationPayment(
                        amount=5000,
                        payer_type="insurance",
                        insurer="nhif",
                        outstanding=True,
                    ),
                    appointment=self._booking(item.name),
                    consent=self._consent("Juma NHIF"),
                    destination_department="paediatric",
                ),
            )
            self.assertTrue(result.outstanding)
            self.assertTrue(result.patient.has_outstanding)
            self.assertEqual(result.invoice.status, "partially_paid")
            self.assertEqual(result.invoice.payments[0].payer_type, "insurance")
            self.assertEqual(result.invoice.payments[0].insurer, "nhif")

    async def test_underpay_without_outstanding_flag_blocked(self) -> None:
        async with self.Session() as db:
            await dept.ensure_registration_catalog(db, self.clinic_id)
            item = next(
                row
                for row in await dept.list_inventory(db, self.clinic_id, billable_at_registration=True)
                if row.sku == "FEE-CONSULT"
            )
            with self.assertRaises(ValidationAppError):
                await svc.register_patient(
                    db,
                    self.clinic_id,
                    self.front_id,
                    PatientRegisterRequest(
                        patient=self._patient("No", "Pay"),
                        items=[RegistrationLineItem(inventory_item_id=item.id)],
                        payment=RegistrationPayment(amount=1, method="cash", outstanding=False),
                        appointment=self._booking(),
                        consent=self._consent("No Pay"),
                        destination_department="paediatric",
                    ),
                )

    async def test_queue_numbers_increment_and_slots_list(self) -> None:
        async with self.Session() as db:
            await dept.ensure_registration_catalog(db, self.clinic_id)
            item = next(
                row
                for row in await dept.list_inventory(db, self.clinic_id, billable_at_registration=True)
                if row.sku == "FEE-CONSULT"
            )
            first = await svc.register_patient(
                db,
                self.clinic_id,
                self.front_id,
                PatientRegisterRequest(
                    patient=self._patient("One", "Queue", phone="0711000011"),
                    items=[RegistrationLineItem(inventory_item_id=item.id)],
                    payment=RegistrationPayment(amount=item.sale_price),
                    appointment=self._booking(),
                    consent=self._consent("One Queue"),
                    destination_department="restorative",
                ),
            )
            second_start = self._slot() + timedelta(minutes=30)
            second = await svc.register_patient(
                db,
                self.clinic_id,
                self.front_id,
                PatientRegisterRequest(
                    patient=self._patient("Two", "Queue", phone="0711000012"),
                    items=[RegistrationLineItem(inventory_item_id=item.id)],
                    payment=RegistrationPayment(amount=item.sale_price),
                    appointment=RegistrationAppointment(
                        service_name=item.name,
                        starts_at=second_start,
                        dentist_id=self.dentist_id,
                    ),
                    consent=self._consent("Two Queue"),
                    destination_department="restorative",
                ),
            )
            self.assertEqual(first.queue_number, 1)
            self.assertEqual(second.queue_number, 2)
            slots = await svc.list_registration_slots(
                db, self.clinic_id, first.slot_starts_at.date()
            )
            self.assertGreaterEqual(slots.next_queue_number, 3)
            self.assertTrue(slots.slots)

    async def test_walk_in_gets_queue_without_booking_a_slot(self) -> None:
        async with self.Session() as db:
            await dept.ensure_registration_catalog(db, self.clinic_id)
            item = next(
                row
                for row in await dept.list_inventory(db, self.clinic_id, billable_at_registration=True)
                if row.sku == "FEE-CONSULT"
            )
            result = await svc.register_patient(
                db,
                self.clinic_id,
                self.front_id,
                PatientRegisterRequest(
                    patient=self._patient("Walk", "In", phone="0711000099"),
                    items=[RegistrationLineItem(inventory_item_id=item.id)],
                    payment=RegistrationPayment(amount=item.sale_price),
                    appointment=RegistrationAppointment(
                        service_name=item.name,
                        dentist_id=self.dentist_id,
                        is_appointment=False,
                    ),
                    consent=self._consent("Walk In"),
                    destination_department="restorative",
                ),
            )
            self.assertFalse(result.is_appointment)
            self.assertEqual(result.queue_number, 1)
            self.assertTrue(result.appointment_id)
            slots = await svc.list_registration_slots(
                db, self.clinic_id, datetime.now(UTC).date()
            )
            self.assertTrue(all(slot.available for slot in slots.slots))
            self.assertGreaterEqual(slots.next_queue_number, 2)

    async def test_returning_patient_reuses_file_and_updates_particulars(self) -> None:
        async with self.Session() as db:
            await dept.ensure_registration_catalog(db, self.clinic_id)
            item = next(
                row
                for row in await dept.list_inventory(db, self.clinic_id, billable_at_registration=True)
                if row.sku == "FEE-CONSULT"
            )
            first = await svc.register_patient(
                db,
                self.clinic_id,
                self.front_id,
                PatientRegisterRequest(
                    patient=self._patient("Asha", "Mwamba", phone="0711888001"),
                    items=[RegistrationLineItem(inventory_item_id=item.id)],
                    payment=RegistrationPayment(amount=item.sale_price),
                    appointment=self._booking(),
                    consent=self._consent("Asha Mwamba"),
                    destination_department="restorative",
                ),
            )
            returning = await svc.register_patient(
                db,
                self.clinic_id,
                self.front_id,
                PatientRegisterRequest(
                    patient_id=first.patient.id,
                    patient=self._patient(
                        "Asha",
                        "Mwamba",
                        phone="0711888999",
                        town_city="Arusha",
                        next_of_kin="Sister Asha",
                    ),
                    items=[RegistrationLineItem(inventory_item_id=item.id)],
                    payment=RegistrationPayment(amount=item.sale_price),
                    appointment=RegistrationAppointment(
                        service_name=item.name,
                        dentist_id=self.dentist_id,
                        is_appointment=False,
                    ),
                    consent=self._consent("Asha Mwamba"),
                    destination_department="paediatric",
                ),
            )
            self.assertEqual(returning.patient.id, first.patient.id)
            self.assertEqual(returning.patient.patient_code, first.patient.patient_code)
            self.assertEqual(returning.patient.phone, "0711888999")
            self.assertEqual(returning.patient.town_city, "Arusha")
            self.assertEqual(returning.patient.next_of_kin, "Sister Asha")
            self.assertEqual(returning.destination_department, "paediatric")
            self.assertEqual(returning.queue_number, 2)
            rows = await svc.list_patients(db, self.clinic_id, q="Asha")
            self.assertEqual(rows[1], 1)

    async def test_non_registration_item_rejected(self) -> None:
        async with self.Session() as db:
            stock = InventoryItem(
                clinic_id=self.clinic_id,
                sku="GLOVE-S",
                name="Gloves",
                item_kind=InventoryItemKind.STOCK,
                billable_at_registration=False,
                quantity=10,
                unit_cost=1000,
            )
            db.add(stock)
            await db.flush()
            with self.assertRaises(ValidationAppError):
                await svc.register_patient(
                    db,
                    self.clinic_id,
                    self.front_id,
                    PatientRegisterRequest(
                        patient=self._patient("X", "Y"),
                        items=[RegistrationLineItem(inventory_item_id=stock.id)],
                        payment=RegistrationPayment(amount=1000, method="cash"),
                        appointment=self._booking(),
                        consent=self._consent("X Y"),
                        destination_department="orthodontic",
                    ),
                )

    async def test_identity_photo_roundtrip(self) -> None:
        from app.core.config import get_settings
        from app.core.exceptions import NotFoundError
        from app.storage import local_encrypted as stor

        tmp = tempfile.mkdtemp()
        os.environ["OBJECT_STORAGE_PATH"] = tmp
        get_settings.cache_clear()
        stor._storage = None
        try:
            async with self.Session() as db:
                patient = await svc.create_patient(
                    db, self.clinic_id, self.front_id, self._patient("Ida", "Photo")
                )
                with self.assertRaises(NotFoundError):
                    await svc.read_patient_photo(db, self.clinic_id, patient.id)
                saved = await svc.save_patient_photo(
                    db,
                    self.clinic_id,
                    self.front_id,
                    patient.id,
                    filename="face.jpg",
                    content_type="image/jpeg",
                    data=b"\xff\xd8\xff" + b"\x00" * 80,
                )
                self.assertTrue(saved.photo_storage_key)
                self.assertEqual(saved.photo_content_type, "image/jpeg")
                _, blob = await svc.read_patient_photo(db, self.clinic_id, patient.id)
                self.assertTrue(blob.startswith(b"\xff\xd8\xff"))
        finally:
            stor._storage = None
            get_settings.cache_clear()
            os.environ.pop("OBJECT_STORAGE_PATH", None)


if __name__ == "__main__":
    unittest.main()

