"""Clerkship intake serialization helpers."""

import unittest

from datetime import date

from app.schemas import PatientCreate, PatientOut
from app.schemas.clerkship import (
    MedicalHistoryFlags,
    PainAssessment,
    ReportedSymptoms,
    clerkship_registration_gaps,
    dumps_block,
)


class ClerkshipSchemaTests(unittest.TestCase):
    def test_create_accepts_structured_blocks(self) -> None:
        body = PatientCreate(
            first_name="Asha",
            last_name="Njoroge",
            hospital_reg_number="HRN-9",
            sex="female",
            town_city="Mombasa",
            chief_complaint="Toothache",
            medical_history=MedicalHistoryFlags(diabetes=True, allergies_flag=True),
            pain_assessment=PainAssessment(severity="moderate", quality="sharp"),
            reported_symptoms=ReportedSymptoms(cavities=True, swelling=True),
            pregnancy_trimester=2,
        )
        self.assertTrue(body.medical_history.diabetes)
        self.assertEqual(body.pain_assessment.quality, "sharp")
        self.assertEqual(dumps_block(body.medical_history) is not None, True)

    def test_patient_out_computes_blocks_from_json(self) -> None:
        from datetime import UTC, datetime

        out = PatientOut(
            id="1",
            patient_code="P1",
            first_name="A",
            last_name="B",
            is_active=True,
            clinic_id="c1",
            created_at=datetime.now(UTC),
            medical_history_json='{"diabetes":true,"hypertension":false,"asthma":false,'
            '"heart_disease":false,"major_surgery":false,"hiv_aids":false,"allergies_flag":true}',
            pain_assessment_json='{"onset":"spontaneous","severity":"severe"}',
            reported_symptoms_json='{"cavities":true,"swelling":false,"pus_discharge_fistula":false,'
            '"halitosis":false,"bleeding_gums":false,"loose_dentures":false,"ulceration":false}',
        )
        self.assertTrue(out.medical_history.diabetes)
        self.assertTrue(out.medical_history.allergies_flag)
        self.assertEqual(out.pain_assessment.severity, "severe")
        self.assertTrue(out.reported_symptoms.cavities)
        payload = out.model_dump(mode="json")
        self.assertIn("medical_history", payload)
        self.assertNotIn("medical_history_json", payload)

    def test_clerkship_gaps_require_standard_particulars(self) -> None:
        incomplete = PatientCreate(first_name="Asha", last_name="Mwamba")
        gaps = clerkship_registration_gaps(incomplete)
        self.assertIn("Date of birth", gaps)
        self.assertIn("Sex", gaps)
        self.assertIn("Telephone", gaps)
        self.assertNotIn("Chief complaint", gaps)

        complete = PatientCreate(
            first_name="Asha",
            last_name="Mwamba",
            date_of_birth=date(1992, 1, 1),
            sex="female",
            phone="0711",
            town_city="Arusha",
            chief_complaint="Broken tooth",
            next_of_kin="Mama Asha",
        )
        self.assertEqual(clerkship_registration_gaps(complete), [])
        without_cc = complete.model_copy(update={"chief_complaint": None})
        self.assertEqual(clerkship_registration_gaps(without_cc), [])

    def test_minor_requires_guardian(self) -> None:
        child = PatientCreate(
            first_name="Neema",
            last_name="Kid",
            date_of_birth=date(2018, 5, 1),
            sex="female",
            phone="0711",
            town_city="Dodoma",
            chief_complaint="Pain",
            next_of_kin="Mama",
        )
        gaps = clerkship_registration_gaps(child)
        self.assertTrue(any("Guardian" in g for g in gaps))
        child_ok = child.model_copy(
            update={
                "guardian_name": "Mama Kid",
                "guardian_relationship": "Mother",
                "guardian_phone": "0755000000",
            }
        )
        self.assertEqual(clerkship_registration_gaps(child_ok), [])


if __name__ == "__main__":
    unittest.main()
