"""Wave 0 + Configurations C1: org masters, settings inheritance, events, sequences."""

from __future__ import annotations

import json
import unittest
from datetime import UTC, date, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.exceptions import ConflictError, ValidationAppError
from app.core.rbac import Role, has_permission
from app.core.security import hash_password
from app.db.session import Base
from app.models import Appointment, Clinic, DomainEvent, Patient, User
from app.schemas import AppointmentCreate, AppointmentUpdate
from app.services import config as cfg
from app.services import domain as svc
from app.services import events as bus


class ConfigPermissionTests(unittest.TestCase):
    def test_admin_has_config_star(self) -> None:
        self.assertTrue(has_permission(Role.CLINIC_ADMIN, "config:*"))
        self.assertTrue(has_permission(Role.CLINIC_ADMIN, "requisition:*"))
        self.assertFalse(has_permission(Role.RECEPTIONIST, "config:clinic"))
        self.assertTrue(has_permission(Role.DENTIST, "requisition:create"))


class ConfigOrgTests(unittest.IsolatedAsyncioTestCase):
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
            clinic = Clinic(name="Config Clinic", code="CFG", currency="TZS")
            db.add(clinic)
            await db.flush()
            admin = User(
                email="admin@cfg.test",
                hashed_password=hash_password("Demsta!Admin1"),
                full_name="Admin",
                role=Role.CLINIC_ADMIN,
                clinic_id=clinic.id,
            )
            dentist = User(
                email="dentist@cfg.test",
                hashed_password=hash_password("Demsta!Dent1"),
                full_name="Dr Config",
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

    async def test_seed_defaults_and_deactivate_department(self) -> None:
        async with self.Session() as db:
            depts = await cfg.list_departments(db, self.clinic_id)
            codes = {d.code for d in depts}
            self.assertIn("restorative", codes)
            self.assertIn("warehouse", codes)
            ops = await cfg.list_operatories(db, self.clinic_id)
            self.assertGreaterEqual(len(ops), 4)
            hours = await cfg.list_hours(db, self.clinic_id)
            self.assertEqual(len(hours), 6)

            extra = await cfg.create_department(
                db, self.clinic_id, self.admin_id, code="endo", name="Endodontics"
            )
            await cfg.update_department(
                db, self.clinic_id, self.admin_id, extra.id, {"is_active": False}
            )
            active = await cfg.list_departments(db, self.clinic_id)
            self.assertNotIn("endo", {d.code for d in active})
            all_rows = await cfg.list_departments(db, self.clinic_id, include_inactive=True)
            self.assertIn("endo", {d.code for d in all_rows})
            await db.commit()

    async def test_cannot_hard_reuse_department_code(self) -> None:
        async with self.Session() as db:
            await cfg.create_department(db, self.clinic_id, self.admin_id, code="store", name="Store")
            with self.assertRaises(ConflictError):
                await cfg.create_department(db, self.clinic_id, self.admin_id, code="store", name="Store 2")

    async def test_setting_inheritance_clinic_overrides_platform(self) -> None:
        async with self.Session() as db:
            await cfg.upsert_setting(
                db,
                clinic_id=self.clinic_id,
                actor_id=self.admin_id,
                key="clinical.tooth_notation",
                value="universal",
                scope="platform",
            )
            await cfg.upsert_setting(
                db,
                clinic_id=self.clinic_id,
                actor_id=self.admin_id,
                key="clinical.tooth_notation",
                value="palmer",
                scope="clinic",
            )
            value = await cfg.get_setting(
                db, key="clinical.tooth_notation", clinic_id=self.clinic_id
            )
            self.assertEqual(value, "palmer")
            with self.assertRaises(ValidationAppError):
                await cfg.upsert_setting(
                    db,
                    clinic_id=self.clinic_id,
                    actor_id=self.admin_id,
                    key="clinical.tooth_notation",
                    value="iso",
                )

    async def test_sequences_allocate_and_year_prefix(self) -> None:
        async with self.Session() as db:
            first = await cfg.allocate_number(db, self.clinic_id, "patient")
            second = await cfg.allocate_number(db, self.clinic_id, "patient")
            year = datetime.now(UTC).year
            self.assertTrue(first.startswith(f"P{year}"))
            self.assertNotEqual(first, second)
            inv = await cfg.allocate_number(db, self.clinic_id, "invoice")
            self.assertTrue(inv.startswith(f"INV-{year}-"))

    async def test_holiday_deactivate_not_delete(self) -> None:
        async with self.Session() as db:
            row = await cfg.create_holiday(
                db, self.clinic_id, self.admin_id, holiday_date=date(2026, 12, 25), name="Christmas"
            )
            await cfg.deactivate_holiday(db, self.clinic_id, self.admin_id, row.id)
            visible = await cfg.list_holidays(db, self.clinic_id)
            self.assertEqual(visible, [])
            hidden = await cfg.list_holidays(db, self.clinic_id, include_inactive=True)
            self.assertEqual(len(hidden), 1)
            self.assertFalse(hidden[0].is_active)

    async def test_appointment_binds_operatory_and_emits_status_event(self) -> None:
        async with self.Session() as db:
            ops = await cfg.list_operatories(db, self.clinic_id)
            chair = next(o for o in ops if o.chair_number == 1)
            patient = Patient(
                clinic_id=self.clinic_id,
                patient_code="P202600099",
                first_name="Ada",
                last_name="Lovelace",
            )
            db.add(patient)
            await db.flush()
            starts = datetime.now(UTC).replace(minute=0, second=0, microsecond=0) + timedelta(days=1)
            appt = await svc.create_appointment(
                db,
                self.clinic_id,
                self.admin_id,
                AppointmentCreate(
                    patient_id=patient.id,
                    dentist_id=self.dentist_id,
                    chair_number=1,
                    starts_at=starts,
                    ends_at=starts + timedelta(minutes=30),
                ),
            )
            self.assertEqual(appt.operatory_id, chair.id)
            created = (
                await bus.list_events(db, self.clinic_id, event_type=bus.APPOINTMENT_CREATED)
            )
            self.assertEqual(len(created), 1)

            updated = await svc.update_appointment(
                db,
                self.clinic_id,
                self.admin_id,
                appt.id,
                AppointmentUpdate(status="completed"),
            )
            self.assertEqual(updated.status, "completed")
            changed = await bus.list_events(
                db, self.clinic_id, event_type=bus.APPOINTMENT_STATUS_CHANGED
            )
            self.assertEqual(len(changed), 1)
            payload = json.loads(changed[0].payload_json)
            self.assertEqual(payload["from"], "scheduled")
            self.assertEqual(payload["to"], "completed")
            self.assertIsInstance(changed[0], DomainEvent)


if __name__ == "__main__":
    unittest.main()
