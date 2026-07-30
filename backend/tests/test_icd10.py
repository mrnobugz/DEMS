"""Dental ICD-10 K00–K14 catalog tests."""

import unittest

from app.clinical.icd10 import categories, get_code, load_catalog, search_codes
from app.schemas.exam import Icd10CodeRef, VisitDiagnosis


class Icd10CatalogTests(unittest.TestCase):
    def test_catalog_loaded_from_github_extract(self) -> None:
        catalog = load_catalog()
        self.assertEqual(catalog["block"], "K00-K14")
        self.assertGreater(catalog["count"], 100)
        self.assertIn("github.com/smog1210", catalog["source"])

    def test_search_caries(self) -> None:
        hits = search_codes("caries", limit=10)
        self.assertTrue(hits)
        self.assertTrue(any(h["code"].startswith("K02") for h in hits))

    def test_get_code_dotted(self) -> None:
        row = get_code("K04.01")
        self.assertIsNotNone(row)
        assert row is not None
        self.assertEqual(row["code"], "K04.01")
        self.assertIn("pulpitis", row["description"].lower())

    def test_categories_cover_block(self) -> None:
        cats = {c["code"] for c in categories()}
        self.assertIn("K00", cats)
        self.assertIn("K14", cats)

    def test_visit_diagnosis_accepts_icd10_refs(self) -> None:
        dx = VisitDiagnosis(
            working_diagnosis="Irreversible pulpitis",
            icd10_codes=[Icd10CodeRef(code="K04.01", description="Reversible pulpitis")],
        )
        self.assertEqual(dx.icd10_codes[0].code, "K04.01")


if __name__ == "__main__":
    unittest.main()
