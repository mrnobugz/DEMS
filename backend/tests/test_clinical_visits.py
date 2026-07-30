"""Clinical visit exam schemas."""

import unittest
from datetime import date

from app.schemas import ClinicalVisitCreate, ClinicalVisitOut
from app.schemas.exam import VisitDiagnosis, VisitVitals


class ClinicalVisitSchemaTests(unittest.TestCase):
    def test_create_with_vitals_and_diagnosis(self) -> None:
        body = ClinicalVisitCreate(
            visit_date=date(2026, 7, 19),
            chief_complaint="Pain LLQ",
            vitals=VisitVitals(bp_systolic=120, bp_diastolic=80, pulse=72, appearance="healthy_looking"),
            diagnosis=VisitDiagnosis(
                working_diagnosis="Irreversible pulpitis 36",
                referrals="Endodontics",
            ),
        )
        self.assertEqual(body.vitals.pulse, 72)
        self.assertIn("pulpitis", body.diagnosis.working_diagnosis.lower())

    def test_out_parses_json_blocks(self) -> None:
        from datetime import UTC, datetime

        out = ClinicalVisitOut(
            id="v1",
            patient_id="p1",
            visit_date=date(2026, 7, 19),
            status="completed",
            clinic_id="c1",
            created_at=datetime.now(UTC),
            vitals_json='{"bp_systolic":118,"pulse":70}',
            diagnosis_json='{"working_diagnosis":"Caries 26"}',
        )
        self.assertEqual(out.vitals.bp_systolic, 118)
        self.assertEqual(out.diagnosis.working_diagnosis, "Caries 26")
        dumped = out.model_dump(mode="json")
        self.assertIn("vitals", dumped)
        self.assertNotIn("vitals_json", dumped)


if __name__ == "__main__":
    unittest.main()
