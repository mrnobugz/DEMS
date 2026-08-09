"""Phase 3 Track C: insurance estimate math + encrypted local storage."""

import tempfile
import unittest
from pathlib import Path

from app.services.domain import estimate_patient_responsibility
from app.storage.local_encrypted import LocalEncryptedStorage


class InsuranceEstimateMathTests(unittest.TestCase):
    def test_full_coverage_after_deductible(self) -> None:
        ins, patient, _ = estimate_patient_responsibility(
            subtotal=150,
            coverage_pct=80,
            deductible_remaining=50,
            remaining_annual=2000,
        )
        # 50 deductible + 80% of 100 = 80 insurance → patient 70
        self.assertEqual(ins, 80.0)
        self.assertEqual(patient, 70.0)

    def test_annual_cap(self) -> None:
        ins, patient, _ = estimate_patient_responsibility(
            subtotal=500,
            coverage_pct=100,
            deductible_remaining=0,
            remaining_annual=100,
        )
        self.assertEqual(ins, 100.0)
        self.assertEqual(patient, 400.0)

    def test_no_charges(self) -> None:
        ins, patient, notes = estimate_patient_responsibility(
            subtotal=0,
            coverage_pct=80,
            deductible_remaining=0,
            remaining_annual=None,
        )
        self.assertEqual(ins, 0.0)
        self.assertEqual(patient, 0.0)
        self.assertIn("No charges", notes)


class LocalEncryptedStorageTests(unittest.TestCase):
    def test_roundtrip(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            store = LocalEncryptedStorage(Path(tmp), "test-secret-key")
            meta = store.put(
                clinic_id="clinic-1",
                prefix="imaging/p1",
                data=b"PA-radiograph-bytes",
                content_type="image/png",
            )
            self.assertTrue(meta["storage_key"].startswith("localenc://"))
            self.assertTrue(meta["is_encrypted"])
            self.assertEqual(meta["byte_size"], len(b"PA-radiograph-bytes"))
            raw = store.get(meta["storage_key"])
            self.assertEqual(raw, b"PA-radiograph-bytes")
            # ciphertext on disk differs from plaintext
            rel = meta["storage_key"].removeprefix("localenc://")
            on_disk = (Path(tmp) / rel).read_bytes()
            self.assertNotEqual(on_disk, b"PA-radiograph-bytes")


if __name__ == "__main__":
    unittest.main()
