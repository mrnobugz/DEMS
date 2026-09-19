"""CR1 patient safety list, duplicate hints, and merge (deactivate loser)."""

from __future__ import annotations

import unittest

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.exceptions import ConflictError, ValidationAppError
from app.core.rbac import Role
from app.core.security import hash_password
from app.db.session import Base
from app.models import Clinic, DomainEvent, User
from app.schemas import PatientCreate
from app.services import domain as svc
from app.services import patient_records as records


class PatientRecordsTests(unittest.IsolatedAsyncioTestCase):
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
            clinic = Clinic(name="Records Clinic", code="REC", currency="TZS")
            db.add(clinic)
            await db.flush()
            admin = User(
                email="admin@rec.test",
                hashed_password=hash_password("Demsta!Admin1"),
                full_name="Admin",
                role=Role.CLINIC_ADMIN,
                clinic_id=clinic.id,
            )
            db.add(admin)
            await db.commit()
            self.clinic_id = clinic.id
            self.admin_id = admin.id

    async def asyncTearDown(self) -> None:
        await self.engine.dispose()

    async def test_duplicate_on_national_id(self) -> None:
        async with self.Session() as db:
            await svc.create_patient(
                db,
                self.clinic_id,
                self.admin_id,
                PatientCreate(first_name="Ada", last_name="Lovelace", national_id="NID-1"),
            )
            with self.assertRaises(ConflictError):
                await svc.create_patient(
                    db,
                    self.clinic_id,
                    self.admin_id,
                    PatientCreate(first_name="Ada", last_name="King", national_id="NID-1"),
                )

    async def test_safety_item_and_summary_banner_fields(self) -> None:
        async with self.Session() as db:
            patient = await svc.create_patient(
                db,
                self.clinic_id,
                self.admin_id,
                PatientCreate(
                    first_name="Ada",
                    last_name="Lovelace",
                    allergies="Penicillin",
                    pregnancy_trimester=2,
                ),
            )
            row = await records.add_safety_item(
                db,
                self.clinic_id,
                self.admin_id,
                patient.id,
                kind="allergy",
                code="latex",
                label="Latex",
            )
            await records.deactivate_safety_item(
                db, self.clinic_id, self.admin_id, patient.id, row.id
            )
            active = await records.list_safety(db, self.clinic_id, patient.id)
            self.assertEqual(active, [])
            hidden = await records.list_safety(
                db, self.clinic_id, patient.id, include_inactive=True
            )
            self.assertEqual(len(hidden), 1)
            summary = await records.safety_summary(db, self.clinic_id, patient.id)
            self.assertEqual(summary["pregnancy_trimester"], 2)
            self.assertEqual(summary["allergies_text"], "Penicillin")

    async def test_merge_copies_blank_fields_and_deactivates_loser(self) -> None:
        async with self.Session() as db:
            keep = await svc.create_patient(
                db,
                self.clinic_id,
                self.admin_id,
                PatientCreate(first_name="Ada", last_name="Lovelace", phone="0711000001"),
            )
            drop = await svc.create_patient(
                db,
                self.clinic_id,
                self.admin_id,
                PatientCreate(
                    first_name="Ada",
                    last_name="Lovelace",
                    email="ada@example.com",
                    allergies="Latex",
                ),
            )
            await records.add_safety_item(
                db,
                self.clinic_id,
                self.admin_id,
                drop.id,
                kind="alert",
                code="pregnancy",
                label="Pregnancy",
            )
            merged = await records.merge_patients(
                db, self.clinic_id, self.admin_id, keep_id=keep.id, drop_id=drop.id
            )
            self.assertEqual(merged.email, "ada@example.com")
            self.assertEqual(merged.allergies, "Latex")
            await db.refresh(drop)
            self.assertFalse(drop.is_active)
            self.assertEqual(drop.merged_into_id, keep.id)
            items = await records.list_safety(db, self.clinic_id, keep.id)
            self.assertEqual({i.code for i in items}, {"pregnancy"})
            with self.assertRaises(ValidationAppError):
                await records.merge_patients(
                    db, self.clinic_id, self.admin_id, keep_id=keep.id, drop_id=keep.id
                )
            events = list((await db.execute(select(DomainEvent))).scalars())
            self.assertTrue(any(e.event_type == "patient.merged" for e in events))
