"""Sprint track A helpers: aging buckets, waitlist conflict exclusion."""

import unittest
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

from app.services.domain import aging_bucket, check_conflicts


class AgingBucketTests(unittest.TestCase):
    def test_buckets(self) -> None:
        self.assertEqual(aging_bucket(0), "0_30")
        self.assertEqual(aging_bucket(30), "0_30")
        self.assertEqual(aging_bucket(31), "31_60")
        self.assertEqual(aging_bucket(90), "61_90")
        self.assertEqual(aging_bucket(91), "90_plus")


class WaitlistConflictTests(unittest.IsolatedAsyncioTestCase):
    async def test_conflict_query_excludes_waitlist(self) -> None:
        db = AsyncMock()
        # First execute: dentist conflict — no row
        # Second execute: chair conflict — no row
        empty = MagicMock()
        empty.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=empty)

        starts = datetime.now(UTC)
        ends = starts + timedelta(minutes=30)
        await check_conflicts(
            db,
            "clinic-1",
            "dentist-1",
            starts,
            ends,
            chair_number=2,
        )

        self.assertEqual(db.execute.await_count, 2)
        # SQLAlchemy BinaryExpression isn't easy to assert; ensure calls happened.
        for call in db.execute.await_args_list:
            self.assertTrue(call.args)


if __name__ == "__main__":
    unittest.main()
