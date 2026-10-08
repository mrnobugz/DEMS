"""Clinic-wide register of every patient file."""

from __future__ import annotations

import unittest
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.rbac import Role
from app.core.security import hash_password
from app.db.session import Base
from app.models import Clinic, User
from app.schemas import ClinicalVisitCreate, PatientCreate
from app.services import clinical_records as records
from app.services import domain as svc


class ClinicalRecordsTests(unittest.IsolatedAsyncioTestCase):
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
            dentist = User(
                email="dentist@rec.test",
                hashed_password=hash_password("Demsta!Dent1"),
                full_name="Dr Juma Kile",
                role=Role.DENTIST,
                clinic_id=clinic.id,
            )
            other = User(
                email="dentist2@rec.test",
                hashed_password=hash_password("Demsta!Dent2"),
                full_name="Dr Neema Sote",
                role=Role.DENTIST,
                clinic_id=clinic.id,
            )
            admin = User(
                email="admin@rec.test",
                hashed_password=hash_password("Demsta!Adm1"),
                full_name="Clinic Admin",
                role=Role.CLINIC_ADMIN,
                clinic_id=clinic.id,
            )
            db.add_all([dentist, other, admin])
            await db.commit()
            self.clinic_id = clinic.id
            self.dentist = dentist
            self.other = other
            self.admin = admin

    async def asyncTearDown(self) -> None:
        await self.engine.dispose()

    async def _patient(self, db: AsyncSession, first: str, last: str, **extra):
        return await svc.create_patient(
            db,
            self.clinic_id,
            self.admin.id,
            PatientCreate(first_name=first, last_name=last, **extra),
        )

    async def _visit(
        self, db: AsyncSession, patient_id: str, day: date, examiner: User | None = None, **extra
    ):
        return await svc.create_clinical_visit(
            db,
            self.clinic_id,
            (examiner or self.dentist).id,
            patient_id,
            ClinicalVisitCreate(visit_date=day, **extra),
        )

    async def test_lists_patients_with_and_without_visits(self) -> None:
        async with self.Session() as db:
            seen = await self._patient(db, "Asha", "Mwamba", phone="0711000001")
            waiting = await self._patient(db, "Never", "Seen", phone="0711000002")
            await self._visit(db, seen.id, date(2026, 5, 4), chief_complaint="Toothache LLQ")

            rows, total = await records.list_records(db, self.clinic_id, actor=self.admin)
            by_id = {row.patient_id: row for row in rows}
            self.assertEqual(total, 2)
            self.assertEqual(by_id[seen.id].full_name, "Asha Mwamba")
            self.assertEqual(by_id[seen.id].visit_count, 1)
            self.assertEqual(by_id[seen.id].last_visit_date, date(2026, 5, 4))
            self.assertEqual(by_id[seen.id].last_chief_complaint, "Toothache LLQ")
            self.assertEqual(by_id[seen.id].last_examiner_name, "Dr Juma Kile")
            self.assertEqual(by_id[waiting.id].visit_count, 0)
            self.assertIsNone(by_id[waiting.id].last_visit_date)

    async def test_counts_dates_and_sorting(self) -> None:
        async with self.Session() as db:
            first = await self._patient(db, "Bakari", "Juma")
            second = await self._patient(db, "Cecilia", "Ndosi")
            await self._visit(db, first.id, date(2026, 1, 10))
            await self._visit(db, first.id, date(2026, 3, 2))
            await self._visit(db, second.id, date(2026, 6, 15))

            rows, total = await records.list_records(db, self.clinic_id, actor=self.admin)
            self.assertEqual(total, 2)
            self.assertEqual(rows[0].patient_id, second.id)  # newest visit first
            older = next(row for row in rows if row.patient_id == first.id)
            self.assertEqual(older.visit_count, 2)
            self.assertEqual(older.first_visit_date, date(2026, 1, 10))
            self.assertEqual(older.last_visit_date, date(2026, 3, 2))

            by_visits, _ = await records.list_records(
                db, self.clinic_id, sort="visits", descending=True, actor=self.admin
            )
            self.assertEqual(by_visits[0].patient_id, first.id)

    async def test_search_matches_patient_and_complaint(self) -> None:
        async with self.Session() as db:
            patient = await self._patient(db, "Dotto", "Kimaro", phone="0755123456")
            await self._visit(db, patient.id, date(2026, 4, 1), chief_complaint="Swollen gum")
            other = await self._patient(db, "Erick", "Mallya")
            await self._visit(db, other.id, date(2026, 4, 2), chief_complaint="Broken crown")

            by_name, _ = await records.list_records(db, self.clinic_id, q="kimaro", actor=self.admin)
            self.assertEqual([row.patient_id for row in by_name], [patient.id])

            by_phone, _ = await records.list_records(db, self.clinic_id, q="0755", actor=self.admin)
            self.assertEqual([row.patient_id for row in by_phone], [patient.id])

            by_complaint, _ = await records.list_records(db, self.clinic_id, q="crown", actor=self.admin)
            self.assertEqual([row.patient_id for row in by_complaint], [other.id])

    async def test_date_and_examiner_filters(self) -> None:
        async with self.Session() as db:
            patient = await self._patient(db, "Fatma", "Salum")
            await self._visit(db, patient.id, date(2026, 2, 1))
            await self._visit(db, patient.id, date(2026, 8, 20), examiner=self.other)

            windowed, total = await records.list_records(
                db,
                self.clinic_id,
                date_from=date(2026, 8, 1),
                date_to=date(2026, 8, 31),
                actor=self.admin,
            )
            self.assertEqual(total, 1)
            self.assertEqual(windowed[0].visit_count, 1)
            self.assertEqual(windowed[0].last_examiner_name, "Dr Neema Sote")

            empty, total_empty = await records.list_records(
                db, self.clinic_id, date_from=date(2027, 1, 1), actor=self.admin
            )
            self.assertEqual((empty, total_empty), ([], 0))

            mine, _ = await records.list_records(
                db, self.clinic_id, examiner_id=self.other.id, actor=self.admin
            )
            self.assertEqual(mine[0].visit_count, 1)

    async def test_pagination_is_stable(self) -> None:
        async with self.Session() as db:
            for index in range(5):
                patient = await self._patient(db, f"Pat{index}", "Test")
                await self._visit(db, patient.id, date(2026, 3, index + 1))

            first_page, total = await records.list_records(
                db, self.clinic_id, limit=2, offset=0, actor=self.admin
            )
            second_page, _ = await records.list_records(
                db, self.clinic_id, limit=2, offset=2, actor=self.admin
            )
            self.assertEqual(total, 5)
            self.assertEqual(len(first_page), 2)
            self.assertEqual(len(second_page), 2)
            overlap = {row.patient_id for row in first_page} & {row.patient_id for row in second_page}
            self.assertEqual(overlap, set())

    async def test_assignment_scoped_dentist_sees_own_and_unassigned(self) -> None:
        async with self.Session() as db:
            mine = await self._patient(db, "Mine", "Patient")
            mine.primary_dentist_id = self.dentist.id
            theirs = await self._patient(db, "Their", "Patient")
            theirs.primary_dentist_id = self.other.id
            unassigned = await self._patient(db, "Open", "Pool")
            await db.flush()
            for row in (mine, theirs, unassigned):
                await self._visit(db, row.id, date(2026, 7, 1))

            rows, total = await records.list_records(db, self.clinic_id, actor=self.dentist)
            ids = {row.patient_id for row in rows}
            self.assertEqual(total, 2)
            self.assertIn(mine.id, ids)
            self.assertIn(unassigned.id, ids)
            self.assertNotIn(theirs.id, ids)

            all_rows, all_total = await records.list_records(db, self.clinic_id, actor=self.admin)
            self.assertEqual(all_total, 3)
            self.assertEqual(len(all_rows), 3)

    async def test_detail_returns_visits_vitals_and_counts(self) -> None:
        async with self.Session() as db:
            patient = await self._patient(db, "Grace", "Mero")
            await self._visit(db, patient.id, date(2026, 1, 5), chief_complaint="Check-up")
            await self._visit(db, patient.id, date(2026, 6, 9), chief_complaint="Filling")

            detail = await records.record_detail(db, self.clinic_id, patient.id, actor=self.admin)
            self.assertEqual(detail.patient.id, patient.id)
            self.assertEqual(detail.summary.visit_count, 2)
            self.assertEqual(detail.summary.first_visit_date, date(2026, 1, 5))
            self.assertEqual(detail.summary.last_visit_date, date(2026, 6, 9))
            self.assertEqual(detail.visits[0].visit_date, date(2026, 6, 9))  # newest first
            self.assertEqual(detail.examiner_names[self.dentist.id], "Dr Juma Kile")
            self.assertIsNone(detail.latest_vitals)

    def test_module_sits_in_the_catalog_for_clinical_roles(self) -> None:
        from app.services.modules import modules_for_user

        class _User:
            def __init__(self, role: str) -> None:
                self.role = role
                self.extra_permissions = None
                self.denied_permissions = None

        keys = {row["key"] for row in modules_for_user(_User(Role.DENTIST))}
        self.assertIn("clinical_records", keys)
        self.assertNotIn("clinical_records", {row["key"] for row in modules_for_user(_User(Role.NURSE))})


if __name__ == "__main__":
    unittest.main()
