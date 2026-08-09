"""Dentist↔patient assignment scoping helpers."""

import unittest

from app.core.exceptions import ForbiddenError
from app.core.rbac import Role, has_permission, is_assignment_scoped_role
from app.services.domain import enforce_patient_assignment


class _Actor:
    def __init__(self, role: str, user_id: str = "dentist-1"):
        self.role = role
        self.id = user_id


class _Patient:
    def __init__(self, primary_dentist_id: str | None):
        self.primary_dentist_id = primary_dentist_id


class AssignmentScopeTests(unittest.TestCase):
    def test_scoped_roles(self) -> None:
        self.assertTrue(is_assignment_scoped_role(Role.DENTIST))
        self.assertTrue(is_assignment_scoped_role(Role.HYGIENIST))
        self.assertFalse(is_assignment_scoped_role(Role.RECEPTIONIST))
        self.assertFalse(is_assignment_scoped_role(Role.CLINIC_ADMIN))

    def test_assign_permission(self) -> None:
        self.assertTrue(has_permission(Role.RECEPTIONIST, "patients:assign"))
        self.assertTrue(has_permission(Role.CLINIC_ADMIN, "patients:assign"))
        self.assertFalse(has_permission(Role.DENTIST, "patients:assign"))

    def test_dentist_sees_own_and_unassigned(self) -> None:
        actor = _Actor(Role.DENTIST, "dentist-1")
        enforce_patient_assignment(actor, _Patient("dentist-1"))  # type: ignore[arg-type]
        enforce_patient_assignment(actor, _Patient(None))  # type: ignore[arg-type]

    def test_dentist_blocked_from_other_caseload(self) -> None:
        actor = _Actor(Role.DENTIST, "dentist-1")
        with self.assertRaises(ForbiddenError):
            enforce_patient_assignment(actor, _Patient("dentist-2"))  # type: ignore[arg-type]

    def test_reception_unscoped(self) -> None:
        actor = _Actor(Role.RECEPTIONIST, "front-1")
        enforce_patient_assignment(actor, _Patient("dentist-2"))  # type: ignore[arg-type]


if __name__ == "__main__":
    unittest.main()
