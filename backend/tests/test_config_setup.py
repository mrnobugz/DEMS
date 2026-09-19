"""Configurations C2–C5: roles, catalogs, fees, templates, import."""

from __future__ import annotations

import unittest

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.exceptions import ValidationAppError
from app.core.rbac import Role, user_has_permission
from app.core.security import hash_password
from app.db.session import Base
from app.models import Clinic, DomainEvent, RolePermission, User
from app.services import config as cfg
from app.services import config_setup as setup


class ConfigSetupTests(unittest.IsolatedAsyncioTestCase):
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
            clinic = Clinic(name="Setup Clinic", code="SET", currency="TZS")
            db.add(clinic)
            await db.flush()
            admin = User(
                email="admin@set.test",
                hashed_password=hash_password("Demsta!Admin1"),
                full_name="Admin",
                role=Role.CLINIC_ADMIN,
                clinic_id=clinic.id,
            )
            dentist = User(
                email="dentist@set.test",
                hashed_password=hash_password("Demsta!Dent1"),
                full_name="Dr Setup",
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

    async def test_full_setup_seeds_roles_catalogs_and_fees(self) -> None:
        async with self.Session() as db:
            await cfg.ensure_clinic_config(db, self.clinic_id)
            await db.commit()

        async with self.Session() as db:
            matrix = await setup.matrix_payload(db, self.clinic_id, Role.CLINIC_ADMIN)
            dentist = next(row for row in matrix if row["id"] == "dentist")
            self.assertIn("clinical:*", dentist["permissions"])
            allergies = await setup.list_catalog(db, self.clinic_id, "allergy")
            self.assertGreaterEqual(len(allergies), 5)
            diagnoses = await setup.list_catalog(db, self.clinic_id, "diagnosis")
            self.assertTrue(any(row.code == "k02.1" for row in diagnoses))
            schedules = await setup.list_fee_schedules(db, self.clinic_id)
            self.assertEqual({s.code for s in schedules}, {"cash", "corporate", "insurance"})
            self.assertTrue(any(s.is_default for s in schedules))
            taxes = await setup.list_tax_rates(db, self.clinic_id)
            self.assertTrue(any(t.code == "vat18" for t in taxes))
            templates = await setup.list_templates(db, self.clinic_id)
            self.assertTrue(any(t.kind == "soap" for t in templates))
            chains = await setup.list_approval_chains(db, self.clinic_id)
            self.assertGreaterEqual(len(chains), 2)

    async def test_role_matrix_write_audit_and_enforcement(self) -> None:
        async with self.Session() as db:
            await setup.set_role_permission(
                db, self.clinic_id, self.admin_id, "dentist", "billing:create", False
            )
            await db.commit()

        async with self.Session() as db:
            grants = await setup.role_grants_for(db, self.clinic_id, "dentist")
            self.assertIsNotNone(grants)
            self.assertNotIn("billing:create", grants or set())
            dentist = User(
                id=self.dentist_id,
                email="dentist@set.test",
                hashed_password="x",
                full_name="Dr Setup",
                role=Role.DENTIST,
                clinic_id=self.clinic_id,
            )
            object.__setattr__(dentist, "_role_grants", grants)
            self.assertFalse(user_has_permission(dentist, "billing:create"))
            with self.assertRaises(ValidationAppError):
                await setup.set_role_permission(
                    db, self.clinic_id, self.admin_id, "clinic_admin", "staff:*", False
                )
            row = (
                await db.execute(
                    select(RolePermission).where(
                        RolePermission.clinic_id == self.clinic_id,
                        RolePermission.role == "dentist",
                        RolePermission.permission_id == "billing:create",
                    )
                )
            ).scalar_one()
            self.assertFalse(row.allowed)
            events = list(
                (
                    await db.execute(select(DomainEvent).where(DomainEvent.clinic_id == self.clinic_id))
                ).scalars()
            )
            self.assertTrue(any(e.event_type == "config.changed" for e in events))

    async def test_catalog_deactivate_not_delete(self) -> None:
        async with self.Session() as db:
            row = await setup.create_catalog_entry(
                db, self.clinic_id, self.admin_id, kind="allergy", code="nickel", label="Nickel"
            )
            await setup.update_catalog_entry(
                db, self.clinic_id, self.admin_id, row.id, {"is_active": False}
            )
            active = await setup.list_catalog(db, self.clinic_id, "allergy")
            self.assertNotIn("nickel", {r.code for r in active})
            all_rows = await setup.list_catalog(db, self.clinic_id, "allergy", include_inactive=True)
            self.assertIn("nickel", {r.code for r in all_rows})

    async def test_csv_import_dry_run_then_commit(self) -> None:
        async with self.Session() as db:
            dry = await setup.import_csv(
                db,
                self.clinic_id,
                self.admin_id,
                kind="procedures",
                csv_text="code,label,unit_price\nexam-cfg,Config exam,12345",
                dry_run=True,
            )
            self.assertEqual(dry["created"], 1)
            live = await setup.import_csv(
                db,
                self.clinic_id,
                self.admin_id,
                kind="allergy",
                csv_text="code,label\nnickel,Nickel",
            )
            self.assertEqual(live["created"], 1)
            rows = await setup.list_catalog(db, self.clinic_id, "allergy")
            self.assertIn("nickel", {r.code for r in rows})
            await db.commit()
