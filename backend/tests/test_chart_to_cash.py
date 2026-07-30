"""Fee schedule + Chart-to-Cash helpers."""

import unittest

from app.services.domain import DEFAULT_FEE_SCHEDULE


class FeeScheduleDefaultsTests(unittest.TestCase):
    def test_default_schedule_covers_odontogram_codes(self) -> None:
        codes = {row[0] for row in DEFAULT_FEE_SCHEDULE}
        for needed in ("filling", "crown", "rct", "consultation"):
            self.assertIn(needed, codes)

    def test_billable_prices_positive(self) -> None:
        billable = [row for row in DEFAULT_FEE_SCHEDULE if row[4]]
        self.assertTrue(all(row[3] > 0 for row in billable))


if __name__ == "__main__":
    unittest.main()
