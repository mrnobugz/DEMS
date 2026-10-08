"""Clinical departments raise supply requisitions; the store approves and issues."""

from __future__ import annotations

import unittest
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.exceptions import ValidationAppError
from app.core.rbac import Role, has_permission
from app.core.security import hash_password
from app.db.session import Base
from app.models import Clinic, User
from app.schemas import InventoryItemCreate, RequisitionCreate, RequisitionLineIn
from app.services import departments as dept
from app.services import events as bus
from app.services import requisitions as req
from app.services import warehouse as stock
from app.services.config import ensure_clinic_config
from app.services.modules import modules_for_user


class _User:
    def __init__(self, role: str) -> None:
        self.role = role
        self.extra_permissions = None
        self.denied_permissions = None


class RequisitionTests(unittest.IsolatedAsyncioTestCase):
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
            clinic = Clinic(name="Req Clinic", code="REQ", currency="TZS")
            db.add(clinic)
            await db.flush()
            admin = User(
                email="admin@req.test",
                hashed_password=hash_password("Demsta!Adm1"),
                full_name="Store Manager",
                role=Role.CLINIC_ADMIN,
                clinic_id=clinic.id,
            )
            dentist = User(
                email="dentist@req.test",
                hashed_password=hash_password("Demsta!Dent1"),
                full_name="Dr Chair",
                role=Role.DENTIST,
                clinic_id=clinic.id,
            )
            db.add_all([admin, dentist])
            await db.flush()
            await ensure_clinic_config(db, clinic.id)
            await db.commit()
            self.clinic_id = clinic.id
            self.admin_id = admin.id
            self.dentist_id = dentist.id

    async def asyncTearDown(self) -> None:
        await self.engine.dispose()

    async def _gloves(self, db: AsyncSession, qty: float = 20):
        return await dept.create_inventory_item(
            db,
            self.clinic_id,
            self.admin_id,
            InventoryItemCreate(
                sku="GLOVE-S",
                name="Sterile gloves",
                category="clinical",
                item_kind="stock",
                quantity=qty,
                unit_cost=400,
                reorder_level=5,
                expiry_date=date(2027, 12, 1),
                requires_expiry=True,
            ),
        )

    async def test_chair_raises_store_fulfills(self) -> None:
        async with self.Session() as db:
            item = await self._gloves(db)
            created = await req.create_requisition(
                db,
                self.clinic_id,
                self.dentist_id,
                RequisitionCreate(
                    department="restorative",
                    notes="Chair 1 bay",
                    lines=[RequisitionLineIn(inventory_item_id=item.id, quantity=6)],
                ),
            )
            self.assertTrue(created.req_number.startswith("REQ-"))
            self.assertEqual(created.status, "submitted")
            self.assertEqual(created.requested_by_name, "Dr Chair")
            self.assertEqual(created.lines[0].store_on_hand, 20)
            self.assertEqual(created.lines[0].quantity_outstanding, 6)
            self.assertEqual(created.lines[0].shortfall, 0)

            approved = await req.approve_requisition(db, self.clinic_id, self.admin_id, created.id)
            self.assertEqual(approved.status, "approved")
            events = await bus.list_events(db, self.clinic_id, event_type=bus.REQUISITION_APPROVED)
            self.assertEqual(events[0].aggregate_id, created.id)

            done = await req.fulfill_requisition(db, self.clinic_id, self.admin_id, created.id)
            self.assertEqual(done.status, "fulfilled")
            self.assertEqual(done.lines[0].quantity_issued, 6)
            self.assertEqual(done.lines[0].store_on_hand, 14)
            await db.refresh(item)
            self.assertEqual(item.quantity, 20)
            main = await stock.location_by_code(db, self.clinic_id, "MAIN")
            rest = await stock.location_by_code(db, self.clinic_id, "REST")
            self.assertAlmostEqual(await stock.on_hand_at(db, self.clinic_id, item.id, main.id), 14)
            self.assertAlmostEqual(await stock.on_hand_at(db, self.clinic_id, item.id, rest.id), 6)

    async def test_partial_issue_keeps_the_request_open(self) -> None:
        async with self.Session() as db:
            item = await self._gloves(db, qty=4)
            created = await req.create_requisition(
                db,
                self.clinic_id,
                self.dentist_id,
                RequisitionCreate(
                    department="pharmacy",
                    lines=[RequisitionLineIn(inventory_item_id=item.id, quantity=10)],
                ),
            )
            self.assertEqual(created.lines[0].shortfall, 6)
            approved = await req.approve_requisition(db, self.clinic_id, self.admin_id, created.id)
            partial = await req.fulfill_requisition(
                db,
                self.clinic_id,
                self.admin_id,
                approved.id,
                issue_lines={approved.lines[0].id: 4},
            )
            self.assertEqual(partial.status, "approved")
            self.assertEqual(partial.lines[0].quantity_issued, 4)
            self.assertEqual(partial.lines[0].quantity_outstanding, 6)
            self.assertEqual(partial.lines[0].store_on_hand, 0)
            self.assertEqual(partial.lines[0].shortfall, 6)
            listed = await req.with_store_position(db, self.clinic_id, [item])
            self.assertEqual(listed[0].store_on_hand, 0)
            self.assertEqual(listed[0].quantity_requested_open, 6)
            self.assertEqual(listed[0].quantity_issued_open, 4)
            await db.refresh(item)
            self.assertEqual(item.quantity, 4)
            with self.assertRaises(ValidationAppError):
                await req.fulfill_requisition(
                    db,
                    self.clinic_id,
                    self.admin_id,
                    approved.id,
                    issue_lines={approved.lines[0].id: 1},
                )

    async def test_cannot_fulfill_before_approve(self) -> None:
        async with self.Session() as db:
            item = await self._gloves(db)
            created = await req.create_requisition(
                db,
                self.clinic_id,
                self.dentist_id,
                RequisitionCreate(
                    department="hygiene",
                    lines=[RequisitionLineIn(inventory_item_id=item.id, quantity=2)],
                ),
            )
            with self.assertRaises(ValidationAppError):
                await req.fulfill_requisition(db, self.clinic_id, self.admin_id, created.id)

    async def test_cancel_keeps_stock(self) -> None:
        async with self.Session() as db:
            item = await self._gloves(db, qty=8)
            created = await req.create_requisition(
                db,
                self.clinic_id,
                self.dentist_id,
                RequisitionCreate(
                    department="paediatric",
                    submit=False,
                    lines=[RequisitionLineIn(inventory_item_id=item.id, quantity=3)],
                ),
            )
            self.assertEqual(created.status, "draft")
            cancelled = await req.cancel_requisition(db, self.clinic_id, self.dentist_id, created.id)
            self.assertEqual(cancelled.status, "cancelled")
            await db.refresh(item)
            self.assertEqual(item.quantity, 8)

    async def test_reject_submitted(self) -> None:
        async with self.Session() as db:
            item = await self._gloves(db)
            created = await req.create_requisition(
                db,
                self.clinic_id,
                self.dentist_id,
                RequisitionCreate(
                    department="lab",
                    lines=[RequisitionLineIn(inventory_item_id=item.id, quantity=1)],
                ),
            )
            rejected = await req.reject_requisition(
                db, self.clinic_id, self.admin_id, created.id, reason="Use existing lot"
            )
            self.assertEqual(rejected.status, "rejected")
            self.assertEqual(rejected.reject_reason, "Use existing lot")

    def test_roles_and_module(self) -> None:
        self.assertTrue(has_permission(Role.DENTIST, "requisition:create"))
        self.assertTrue(has_permission(Role.NURSE, "requisition:create"))
        self.assertTrue(has_permission(Role.PHARMACY, "requisition:approve"))
        self.assertTrue(has_permission(Role.PHARMACY, "requisition:fulfill"))
        self.assertTrue(has_permission(Role.CLINIC_ADMIN, "requisition:*"))
        keys = {row["key"] for row in modules_for_user(_User(Role.DENTIST))}
        self.assertIn("requisitions", keys)
        self.assertIn("inventory", keys)
        self.assertIn("requisitions", {row["key"] for row in modules_for_user(_User(Role.NURSE))})


if __name__ == "__main__":
    unittest.main()
