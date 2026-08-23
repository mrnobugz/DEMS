"""Roles, permission overrides, and clinic-admin user management."""

from __future__ import annotations

import unittest

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.exceptions import ForbiddenError, ValidationAppError
from app.core.rbac import (
    Role,
    effective_permissions,
    has_permission,
    normalize_overrides,
    permission_allowed,
    user_has_permission,
)
from app.core.security import hash_password, verify_password
from app.db.session import Base
from app.models import Clinic, User
from app.schemas import StaffCreate, StaffUpdate
from app.services import departments as dept


class _Actor:
    def __init__(self, role: str, extra=None, denied=None):
        self.role = role
        self.extra_permissions = extra
        self.denied_permissions = denied


class RbacUnitTests(unittest.TestCase):
    def test_role_defaults(self) -> None:
        self.assertTrue(has_permission(Role.RECEPTIONIST, "patients:assign"))
        self.assertTrue(has_permission(Role.DENTIST, "billing:create"))
        self.assertFalse(has_permission(Role.HYGIENIST, "billing:create"))
        self.assertTrue(has_permission(Role.CLINIC_ADMIN, "staff:*"))
        self.assertFalse(has_permission(Role.DENTIST, "staff:*"))

    def test_extra_grant(self) -> None:
        self.assertTrue(
            permission_allowed(Role.HYGIENIST, ["billing:create"], [], "billing:create")
        )
        self.assertTrue(permission_allowed(Role.HYGIENIST, ["billing:*"], [], "billing:read"))
        self.assertFalse(permission_allowed(Role.HYGIENIST, ["billing:create"], [], "staff:*"))

    def test_deny_overrides_role(self) -> None:
        self.assertFalse(permission_allowed(Role.CLINIC_ADMIN, [], ["billing:*"], "billing:create"))
        self.assertTrue(permission_allowed(Role.CLINIC_ADMIN, [], ["billing:*"], "staff:*"))

    def test_super_admin_ignores_denies(self) -> None:
        self.assertTrue(permission_allowed(Role.SUPER_ADMIN, [], ["staff:*"], "staff:*"))

    def test_user_has_permission_reads_json(self) -> None:
        actor = _Actor(Role.HYGIENIST, extra='["billing:create"]')
        self.assertTrue(user_has_permission(actor, "billing:create"))
        self.assertFalse(user_has_permission(actor, "billing:read"))

    def test_effective_list(self) -> None:
        granted = effective_permissions(Role.HYGIENIST, ["billing:create"], [])
        self.assertIn("billing:create", granted)
        self.assertIn("patients:read", granted)
        self.assertNotIn("staff:*", granted)

    def test_unknown_override_rejected(self) -> None:
        with self.assertRaises(ValidationAppError):
            normalize_overrides(["not:a-perm"], "extra_permissions")
        with self.assertRaises(ValidationAppError):
            normalize_overrides(["*"], "extra_permissions")


class StaffManagementTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.engine = create_async_engine(
            "sqlite+aiosqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        self.Session = async_sessionmaker(self.engine, class_=AsyncSession, expire_on_commit=False)
        async with self.Session() as db:
            clinic = Clinic(name="Admin Clinic", code="ADM", currency="TZS")
            db.add(clinic)
            await db.flush()
            admin = User(
                email="admin@demsta.test",
                hashed_password=hash_password("Demsta!Admin1"),
                full_name="Clinic Admin",
                role=Role.CLINIC_ADMIN,
                clinic_id=clinic.id,
            )
            dentist = User(
                email="dentist@demsta.test",
                hashed_password=hash_password("Demsta!Dent1"),
                full_name="Dr Test",
                role=Role.DENTIST,
                clinic_id=clinic.id,
            )
            db.add_all([admin, dentist])
            await db.commit()
            self.clinic_id = clinic.id
            self.admin_id = admin.id
            self.dentist_id = dentist.id

    async def asyncTearDown(self) -> None:
        await self.engine.dispose()

    async def _admin(self, db: AsyncSession) -> User:
        return await dept.get_clinic_staff(db, self.clinic_id, self.admin_id)

    async def test_invite_and_update_role_and_overrides(self) -> None:
        async with self.Session() as db:
            actor = await self._admin(db)
            created = await dept.create_staff(
                db,
                self.clinic_id,
                actor,
                StaffCreate(
                    email="hygiene@example.com",
                    password="Demsta!Temp1",
                    full_name="Hana Hygiene",
                    role="hygienist",
                    department="hygiene",
                    extra_permissions=["billing:create"],
                ),
            )
            self.assertEqual(created.role, Role.HYGIENIST)
            self.assertTrue(user_has_permission(created, "billing:create"))

            updated = await dept.update_staff(
                db,
                self.clinic_id,
                actor,
                created.id,
                StaffUpdate(role="receptionist", extra_permissions=[], department="front-desk"),
            )
            self.assertEqual(updated.role, Role.RECEPTIONIST)
            self.assertFalse(user_has_permission(updated, "clinical:limited"))
            self.assertTrue(user_has_permission(updated, "appointments:*"))
            out = dept.to_staff_out(updated)
            self.assertEqual(out.profile.department, "front-desk")

    async def test_cannot_create_super_admin(self) -> None:
        async with self.Session() as db:
            actor = await self._admin(db)
            with self.assertRaises(ForbiddenError):
                await dept.create_staff(
                    db,
                    self.clinic_id,
                    actor,
                    StaffCreate(
                        email="owner@example.com",
                        password="Demsta!Temp1",
                        full_name="Nope",
                        role="super_admin",
                    ),
                )

    async def test_cannot_deactivate_self_or_last_admin(self) -> None:
        async with self.Session() as db:
            actor = await self._admin(db)
            with self.assertRaises(ForbiddenError):
                await dept.update_staff(
                    db,
                    self.clinic_id,
                    actor,
                    self.admin_id,
                    StaffUpdate(is_active=False),
                )
            with self.assertRaises(ForbiddenError):
                await dept.update_staff(
                    db,
                    self.clinic_id,
                    actor,
                    self.admin_id,
                    StaffUpdate(role="dentist"),
                )
            dentist = await dept.get_clinic_staff(db, self.clinic_id, self.dentist_id)
            with self.assertRaises(ValidationAppError):
                await dept.update_staff(
                    db,
                    self.clinic_id,
                    dentist,
                    self.admin_id,
                    StaffUpdate(role="dentist"),
                )

    async def test_cannot_strip_own_staff_permission(self) -> None:
        async with self.Session() as db:
            actor = await self._admin(db)
            with self.assertRaises(ForbiddenError):
                await dept.update_staff(
                    db,
                    self.clinic_id,
                    actor,
                    self.admin_id,
                    StaffUpdate(denied_permissions=["staff:*"]),
                )

    async def test_deactivate_other_and_reset_password(self) -> None:
        async with self.Session() as db:
            actor = await self._admin(db)
            updated = await dept.update_staff(
                db,
                self.clinic_id,
                actor,
                self.dentist_id,
                StaffUpdate(is_active=False, denied_permissions=["ai:suggest"]),
            )
            self.assertFalse(updated.is_active)
            self.assertFalse(user_has_permission(updated, "ai:suggest"))

            reset = await dept.reset_staff_password(
                db, self.clinic_id, actor, self.dentist_id, "Demsta!New99"
            )
            self.assertTrue(verify_password("Demsta!New99", reset.hashed_password))


if __name__ == "__main__":
    unittest.main()
