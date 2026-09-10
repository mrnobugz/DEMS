"""Clinical visit exam schemas."""

import unittest
from datetime import date

from app.schemas import ClinicalVisitCreate, ClinicalVisitOut
from app.schemas.exam import RadiologyInvestigationItem, VisitDiagnosis, VisitInvestigations, VisitVitals


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

    def test_investigations_accept_radiology_items(self) -> None:
        body = ClinicalVisitCreate(
            visit_date=date(2026, 9, 10),
            investigations=VisitInvestigations(
                radiology_items=[
                    RadiologyInvestigationItem(
                        fee_item_id="fee-opg",
                        type_label="Panoramic radiograph (OPG)",
                        type_code="opg",
                        unit_price=50000,
                        region="36",
                        quantity=1,
                        comment="Impacted 38",
                        overview="Panoramic radiograph (OPG) · 36 · ×1 · Impacted 38",
                        photo_url="/api/v1/imaging/studies/st-opg/content",
                        captured_at="2026-09-10T16:00:00+00:00",
                    )
                ],
                photography_url="/api/v1/imaging/studies/st-photo/content",
                photography_date="2026-09-10",
                photography_study_id="st-photo",
            ),
        )
        item = body.investigations.radiology_items[0]
        self.assertEqual(item.region, "36")
        self.assertEqual(item.quantity, 1)
        self.assertEqual(item.photo_url, "/api/v1/imaging/studies/st-opg/content")
        self.assertEqual(body.investigations.photography_date, "2026-09-10")
        dumped = body.investigations.model_dump()
        self.assertEqual(dumped["radiology_items"][0]["type_code"], "opg")
        self.assertEqual(dumped["photography_url"], "/api/v1/imaging/studies/st-photo/content")

    def test_legacy_investigations_without_photo_fields_still_parse(self) -> None:
        body = ClinicalVisitCreate(
            visit_date=date(2026, 9, 10),
            investigations=VisitInvestigations(radiograph_notes="PA 36"),
        )
        self.assertIsNone(body.investigations.photography_url)
        self.assertEqual(body.investigations.radiology_items, [])


if __name__ == "__main__":
    unittest.main()
