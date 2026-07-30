"""Scalability primitives: tenant repo scoping + rate limit fallback."""

import unittest

from app.core.redis_client import rate_limit_allow
from app.core.tenant import clear_tenant, get_clinic_id, require_clinic_id, set_tenant
from app.repositories.base import TenantRepository


class TenantContextTests(unittest.TestCase):
    def tearDown(self) -> None:
        clear_tenant()

    def test_set_and_require_clinic(self) -> None:
        set_tenant("clinic-1", user_id="u1", role="dentist")
        self.assertEqual(get_clinic_id(), "clinic-1")
        self.assertEqual(require_clinic_id(), "clinic-1")

    def test_require_without_context_raises(self) -> None:
        clear_tenant()
        with self.assertRaises(RuntimeError):
            require_clinic_id()


class RateLimitFallbackTests(unittest.IsolatedAsyncioTestCase):
    async def test_in_memory_rate_limit(self) -> None:
        key = "test:rl:unit"
        allowed, remaining = await rate_limit_allow(key, limit=3, window_seconds=60)
        self.assertTrue(allowed)
        self.assertEqual(remaining, 2)
        await rate_limit_allow(key, limit=3, window_seconds=60)
        allowed, remaining = await rate_limit_allow(key, limit=3, window_seconds=60)
        self.assertTrue(allowed)
        self.assertEqual(remaining, 0)
        allowed, _ = await rate_limit_allow(key, limit=3, window_seconds=60)
        self.assertFalse(allowed)


class TenantRepositoryGuardTests(unittest.TestCase):
    def test_new_rejects_cross_clinic_kwargs(self) -> None:
        from app.models import Patient

        class DummySession:
            def add(self, _obj):  # noqa: ANN001
                return None

        repo = TenantRepository(DummySession(), Patient, "clinic-a")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            repo.new(clinic_id="clinic-b", first_name="A", last_name="B", patient_code="P1")


if __name__ == "__main__":
    unittest.main()
