"""Nurse vital signs for registered patients."""

from __future__ import annotations

import unittest

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.exceptions import ValidationAppError
from app.core.rbac import Role, has_permission
from app.core.security import hash_password
from app.db.session import Base
from app.models import Clinic, RegistrationStatus, User
from app.schemas import PatientCreate, VitalSignCreate
from app.services import domain as svc
from app.services import vitals as vitals_svc
from app.services.modules import modules_for_user


class _User:
    def __init__(self, role: str) -> None:
        self.role = role
        self.extra_permissions = None
        self.denied_permissions = None


class VitalSignsTests(unittest.IsolatedAsyncioTestCase):
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
            clinic = Clinic(name="Vitals Clinic", code="VIT", currency="TZS")
            db.add(clinic)
            await db.flush()
            nurse = User(
                email="nurse@vit.test",
                hashed_password=hash_password("Demsta!Nurse1"),
                full_name="Faith Nkrumah",
                role=Role.NURSE,
                clinic_id=clinic.id,
            )
            db.add(nurse)
            await db.commit()
            self.clinic_id = clinic.id
            self.nurse_id = nurse.id

    async def asyncTearDown(self) -> None:
        await self.engine.dispose()

    async def _registered(self, db: AsyncSession):
        patient = await svc.create_patient(
            db,
            self.clinic_id,
            self.nurse_id,
            PatientCreate(first_name="Ada", last_name="Lovelace"),
        )
        patient.registration_status = RegistrationStatus.FINALIZED
        await db.flush()
        return patient

    async def test_record_and_latest(self) -> None:
        async with self.Session() as db:
            patient = await self._registered(db)
            reading = await vitals_svc.record_vitals(
                db,
                self.clinic_id,
                self.nurse_id,
                patient.id,
                VitalSignCreate(bp_systolic=120, bp_diastolic=80, pulse=72, height_cm=160, weight_kg=64),
            )
            self.assertEqual(reading.bp_systolic, 120)
            self.assertEqual(reading.bmi, 25.0)
            latest = await vitals_svc.latest_vitals(db, self.clinic_id, patient.id)
            self.assertIsNotNone(latest)
            self.assertEqual(latest.id, reading.id)
            self.assertEqual(latest.recorded_by_name, "Faith Nkrumah")

    async def test_draft_patient_rejected(self) -> None:
        async with self.Session() as db:
            patient = await svc.create_patient(
                db,
                self.clinic_id,
                self.nurse_id,
                PatientCreate(first_name="Draft", last_name="File"),
            )
            with self.assertRaises(ValidationAppError):
                await vitals_svc.record_vitals(
                    db,
                    self.clinic_id,
                    self.nurse_id,
                    patient.id,
                    VitalSignCreate(pulse=70),
                )

    def test_nurse_permissions_and_module(self) -> None:
        self.assertTrue(has_permission(Role.NURSE, "clinical:vitals"))
        self.assertTrue(has_permission(Role.NURSE, "patients:read"))
        self.assertFalse(has_permission(Role.NURSE, "clinical:*"))
        keys = {row["key"] for row in modules_for_user(_User(Role.NURSE))}
        self.assertIn("vitals", keys)
        self.assertIn("patients", keys)
        self.assertNotIn("restorative", keys)
        self.assertNotIn("admin", keys)


if __name__ == "__main__":
    unittest.main()
