"""GET /me/modules filters with existing RBAC — no second permission model."""

import unittest

from app.core.rbac import Role
from app.services.modules import modules_for_user


class _User:
    def __init__(self, role: str, extra=None, denied=None) -> None:
        self.role = role
        self.extra_permissions = extra
        self.denied_permissions = denied


class MeModulesTests(unittest.TestCase):
    def test_receptionist_gets_front_desk_not_clinical(self) -> None:
        keys = {row["key"] for row in modules_for_user(_User(Role.RECEPTIONIST))}
        self.assertIn("front_desk", keys)
        self.assertIn("patients", keys)
        self.assertIn("schedule", keys)
        self.assertIn("billing", keys)
        self.assertNotIn("owner", keys)
        self.assertNotIn("restorative", keys)
        self.assertNotIn("admin", keys)

    def test_dentist_gets_clinical_not_owner_admin(self) -> None:
        keys = {row["key"] for row in modules_for_user(_User(Role.DENTIST))}
        self.assertIn("restorative", keys)
        self.assertIn("paediatric", keys)
        self.assertIn("billing", keys)
        self.assertIn("patients", keys)
        self.assertNotIn("owner", keys)
        self.assertNotIn("admin", keys)

    def test_payload_has_gui_fields(self) -> None:
        rows = modules_for_user(_User(Role.ACCOUNTANT))
        self.assertTrue(rows)
        sample = rows[0]
        for field in ("key", "name", "description", "icon", "route_path"):
            self.assertIn(field, sample)
            self.assertTrue(sample[field])
        keys = {row["key"] for row in rows}
        self.assertIn("billing", keys)
        self.assertIn("reports", keys)
        self.assertNotIn("restorative", keys)


if __name__ == "__main__":
    unittest.main()
