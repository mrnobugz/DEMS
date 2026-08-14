"""Specialty clinic departments: maxillofacial, orthodontic, paediatric + overview."""

from __future__ import annotations

import unittest
from datetime import UTC, date, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.exceptions import NotFoundError, ValidationAppError
from app.core.rbac import Role
from app.core.security import hash_password
from app.db.session import Base
from app.models import Clinic, User
from app.schemas import PatientCreate
from app.services import specialty
from app.services import domain as svc


class SpecialtyDepartmentTests(unittest.IsolatedAsyncioTestCase):
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
            clinic = Clinic(name="Specialty Clinic", code="SPC", currency="TZS")
            db.add(clinic)
            await db.flush()
            dentist = User(
                email="spc.dentist@demsta.test",
                hashed_password=hash_password("Demsta!Dentist1"),
                full_name="Dr Specialty",
                role=Role.DENTIST,
                clinic_id=clinic.id,
            )
            db.add(dentist)
            await db.flush()
            patient = await svc.create_patient(
                db,
                clinic.id,
                dentist.id,
                PatientCreate(
                    first_name="Spec",
                    last_name="Patient",
                    phone="+255-700-000-001",
                    date_of_birth=date(2018, 5, 1),
                ),
            )
            await db.commit()
            self.clinic_id = clinic.id
            self.dentist_id = dentist.id
            self.patient_id = patient.id

    async def asyncTearDown(self) -> None:
        await self.engine.dispose()

    async def test_maxillofacial_case_lifecycle(self) -> None:
        async with self.Session() as db:
            case = await specialty.create_surgical_case(
                db,
                self.clinic_id,
                self.dentist_id,
                {
                    "patient_id": self.patient_id,
                    "procedure_type": "impacted_third_molar",
                    "site": "48",
                    "anaesthesia": "local",
                    "status": "planned",
                },
            )
            self.assertEqual(case.status, "planned")
            self.assertEqual(case.patient_name, "Spec Patient")

            case = await specialty.update_surgical_case(
                db, self.clinic_id, self.dentist_id, case.id, {"status": "completed"}
            )
            self.assertEqual(case.status, "completed")
            self.assertIsNotNone(case.performed_at)

            case = await specialty.add_surgical_follow_up(
                db,
                self.clinic_id,
                case.id,
                {"pain_score": 3, "swelling": "mild", "healing": "normal"},
            )
            # Completed case with a follow-up moves to follow_up
            self.assertEqual(case.status, "follow_up")
            self.assertEqual(len(case.follow_ups), 1)

            with self.assertRaises(ValidationAppError):
                await specialty.update_surgical_case(
                    db, self.clinic_id, self.dentist_id, case.id, {"status": "bogus"}
                )
            await db.commit()

    async def test_ortho_case_and_adjustment_cadence(self) -> None:
        async with self.Session() as db:
            case = await specialty.create_ortho_case(
                db,
                self.clinic_id,
                self.dentist_id,
                {
                    "patient_id": self.patient_id,
                    "angle_class": "II_div1",
                    "appliance_type": "fixed_metal",
                    "arch": "both",
                    "status": "assessment",
                    "planned_months": 18,
                },
            )
            self.assertEqual(case.status, "assessment")

            case = await specialty.add_ortho_adjustment(
                db,
                self.clinic_id,
                case.id,
                {"archwire": "0.016 NiTi", "next_visit_weeks": 6},
            )
            # First adjustment activates the case and sets the recall date
            self.assertEqual(case.status, "active")
            self.assertIsNotNone(case.started_on)
            expected_due = case.adjustments[0].visit_date + timedelta(weeks=6)
            self.assertEqual(case.next_review_due, expected_due)

            case = await specialty.update_ortho_case(
                db, self.clinic_id, self.dentist_id, case.id, {"status": "retention"}
            )
            self.assertEqual(case.status, "retention")
            self.assertIsNotNone(case.debonded_on)
            await db.commit()

    async def test_paediatric_profile_and_fluoride_recall(self) -> None:
        async with self.Session() as db:
            # Treatment before profile is rejected
            with self.assertRaises(NotFoundError):
                await specialty.add_paediatric_treatment(
                    db, self.clinic_id, self.dentist_id, self.patient_id, {}
                )

            profile = await specialty.upsert_paediatric_profile(
                db,
                self.clinic_id,
                self.dentist_id,
                self.patient_id,
                {"caries_risk": "high", "dentition_stage": "primary", "behaviour_rating": 3},
            )
            self.assertEqual(profile.caries_risk, "high")
            self.assertEqual(profile.patient_age, self._age(date(2018, 5, 1)))

            profile = await specialty.add_paediatric_treatment(
                db,
                self.clinic_id,
                self.dentist_id,
                self.patient_id,
                {"treatment_type": "fluoride_varnish"},
            )
            # High caries risk → 3-month fluoride recall
            self.assertIsNotNone(profile.fluoride_last)
            self.assertEqual(
                profile.fluoride_next, profile.fluoride_last + timedelta(days=90)
            )
            self.assertEqual(len(profile.treatments), 1)

            # Upsert updates in place, no duplicate profile
            again = await specialty.upsert_paediatric_profile(
                db, self.clinic_id, self.dentist_id, self.patient_id, {"caries_risk": "low"}
            )
            self.assertEqual(again.id, profile.id)
            self.assertEqual(again.caries_risk, "low")

            rows = await specialty.list_paediatric_profiles(db, self.clinic_id)
            self.assertEqual(len(rows), 1)
            await db.commit()

    async def test_overview_counts(self) -> None:
        async with self.Session() as db:
            await specialty.create_surgical_case(
                db,
                self.clinic_id,
                self.dentist_id,
                {
                    "patient_id": self.patient_id,
                    "procedure_type": "biopsy",
                    "status": "scheduled",
                    "scheduled_at": datetime.now(UTC) + timedelta(days=2),
                },
            )
            await specialty.create_ortho_case(
                db,
                self.clinic_id,
                self.dentist_id,
                {"patient_id": self.patient_id, "status": "active", "planned_months": 12},
            )
            overview = await specialty.clinic_departments_overview(db, self.clinic_id)
            self.assertEqual(overview["surgical_open"], 1)
            self.assertEqual(overview["surgical_scheduled_week"], 1)
            self.assertEqual(overview["ortho_active"], 1)
            self.assertEqual(overview["paediatric_profiles"], 0)
            await db.commit()

    @staticmethod
    def _age(dob: date) -> int:
        today = datetime.now(UTC).date()
        return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


if __name__ == "__main__":
    unittest.main()
