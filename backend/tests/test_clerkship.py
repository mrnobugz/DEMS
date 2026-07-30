"""Clerkship intake serialization helpers."""

import unittest

from app.schemas import PatientCreate, PatientOut
from app.schemas.clerkship import MedicalHistoryFlags, PainAssessment, ReportedSymptoms, dumps_block


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


if __name__ == "__main__":
    unittest.main()
