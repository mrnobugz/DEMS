"""Alembic history stays replayable and in step with the model metadata."""

import pathlib
import subprocess
import sys
import unittest

BACKEND = pathlib.Path(__file__).resolve().parents[1]
CHECKER = BACKEND / "scripts" / "check_migrations.py"


class MigrationConsistencyTests(unittest.TestCase):
    def test_every_route_to_head_agrees(self) -> None:
        # Subprocess: the checker rebinds DATABASE_URL and reimports app modules.
        result = subprocess.run(
            [sys.executable, str(CHECKER)],
            cwd=str(BACKEND),
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
