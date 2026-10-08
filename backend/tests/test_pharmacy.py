"""Pharmacy queue, shelf dispense, billing, returns, and store requests."""

from __future__ import annotations

import unittest
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import selectinload
from sqlalchemy.pool import StaticPool

from app.core.exceptions import ValidationAppError
from app.core.rbac import Role, has_permission
from app.core.security import hash_password
from app.db.session import Base
from app.models import Clinic, Invoice, InvoiceStatus, User
from app.schemas import (
    CounterSaleCreate,
    CounterSaleLineIn,
    DispenseLineIn,
    DispenseRequest,
    DrugTemplateCreate,
    InventoryItemCreate,
    PatientCreate,
    PrescriptionCourseUpdate,
    PrescriptionCreate,
    PrescriptionItemCourseUpdate,
    PrescriptionItemIn,
    ReturnDispense,
    ShelfRequest,
)
from app.services import departments as dept
from app.services import domain as svc
from app.services import pharmacy as pharm
from app.services import warehouse as stock


class PharmacyOpsTests(unittest.IsolatedAsyncioTestCase):
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
            clinic = Clinic(name="Pharm Clinic", code="PH", currency="TZS", timezone="Africa/Dar_es_Salaam")
            db.add(clinic)
            await db.flush()
            admin = User(
                email="admin@pharm.test",
                hashed_password=hash_password("Demsta!Admin1"),
                full_name="Admin",
                role=Role.CLINIC_ADMIN,
                clinic_id=clinic.id,
            )
            db.add(admin)
            await db.commit()
            self.clinic_id = clinic.id
            self.admin_id = admin.id

    async def asyncTearDown(self) -> None:
        await self.engine.dispose()

    async def _sku(self, db, sku="AMOX-500", qty=10, name="Amoxicillin capsules"):
        return await dept.create_inventory_item(
            db,
            self.clinic_id,
            self.admin_id,
            InventoryItemCreate(
                sku=sku,
                name=name,
                category="drug",
                item_kind="stock",
                quantity=qty,
                unit_cost=200,
                sale_price=800,
                reorder_level=2,
                expiry_date=date(2027, 12, 31),
                requires_expiry=True,
            ),
        )

    def _patient(self, allergies: str | None = None) -> PatientCreate:
        return PatientCreate(
            first_name="Asha",
            last_name="Mwamba",
            date_of_birth=date(1990, 3, 12),
            sex="female",
            phone="0711000001",
            town_city="Dar es Salaam",
            chief_complaint="Pain",
            next_of_kin="Parent",
            allergies=allergies,
        )

    async def _to_shelf(self, db, item_id: str, qty: float) -> None:
        await stock.ensure_locations(db, self.clinic_id)
        shelf = await stock.location_by_code(db, self.clinic_id, "PHARM")
        await stock.issue_department(
            db,
            self.clinic_id,
            self.admin_id,
            inventory_item_id=item_id,
            quantity=qty,
            to_location_id=shelf.id,
            reason="stock pharmacy",
        )

    async def test_partial_dispense_bills_and_finishes_from_the_shelf(self) -> None:
        async with self.Session() as db:
            item = await self._sku(db, qty=10)
            await self._to_shelf(db, item.id, 6)
            patient = await svc.create_patient(db, self.clinic_id, self.admin_id, self._patient())
            tmpl = await pharm.create_drug_template(
                db,
                self.clinic_id,
                DrugTemplateCreate(
                    name="Amoxicillin 500mg",
                    category="antibiotic",
                    default_dose="500mg TDS",
                    default_quantity="4",
                    inventory_item_id=item.id,
                    reorder_level=4,
                ),
            )
            rx = await pharm.create_prescription(
                db,
                self.clinic_id,
                self.admin_id,
                PrescriptionCreate(
                    patient_id=patient.id,
                    items=[
                        PrescriptionItemIn(
                            drug_name="Amoxicillin 500mg",
                            dose="500mg TDS",
                            quantity="4",
                            drug_template_id=tmpl.id,
                        )
                    ],
                ),
            )
            self.assertTrue((rx.rx_number or "").startswith("RX-"))
            self.assertEqual(rx.items[0].inventory_item_id, item.id)
            mid = await pharm.dispense_prescription(
                db,
                self.clinic_id,
                self.admin_id,
                rx.id,
                DispenseRequest(
                    lines=[DispenseLineIn(prescription_item_id=rx.items[0].id, quantity=2)],
                    bill=True,
                ),
            )
            self.assertEqual(mid.status, "partial")
            await db.refresh(item)
            shelf = await stock.location_by_code(db, self.clinic_id, "PHARM")
            self.assertEqual(await stock.on_hand_at(db, self.clinic_id, item.id, shelf.id), 4)
            self.assertEqual(item.quantity, 8)
            done = await pharm.dispense_prescription(
                db,
                self.clinic_id,
                self.admin_id,
                rx.id,
                DispenseRequest(
                    lines=[DispenseLineIn(prescription_item_id=rx.items[0].id, quantity=2)],
                    bill=True,
                ),
            )
            self.assertEqual(done.status, "dispensed")
            self.assertTrue(done.dispenses[0].label_text)
            invoices = (
                await db.execute(
                    select(Invoice)
                    .where(Invoice.patient_id == patient.id)
                    .options(selectinload(Invoice.line_items))
                )
            ).scalars().all()
            self.assertEqual(len(invoices), 2)
            self.assertEqual(invoices[0].line_items[0].line_kind, "drug")
            self.assertIsNone(invoices[0].line_items[0].inventory_item_id)

    async def test_dispense_refuses_to_take_from_the_main_store(self) -> None:
        async with self.Session() as db:
            item = await self._sku(db, qty=10)
            patient = await svc.create_patient(db, self.clinic_id, self.admin_id, self._patient())
            rx = await pharm.create_prescription(
                db,
                self.clinic_id,
                self.admin_id,
                PrescriptionCreate(
                    patient_id=patient.id,
                    items=[
                        PrescriptionItemIn(
                            drug_name="Amoxicillin",
                            dose="500mg",
                            quantity="2",
                            inventory_item_id=item.id,
                        )
                    ],
                ),
            )
            with self.assertRaises(ValidationAppError) as caught:
                await pharm.dispense_prescription(
                    db,
                    self.clinic_id,
                    self.admin_id,
                    rx.id,
                    DispenseRequest(lines=[DispenseLineIn(prescription_item_id=rx.items[0].id, quantity=2)]),
                )
            self.assertIn("Main store has", str(caught.exception))
            await db.refresh(item)
            self.assertEqual(item.quantity, 10)

    async def test_allergy_blocks_until_the_pharmacist_confirms(self) -> None:
        async with self.Session() as db:
            item = await self._sku(db, qty=4)
            await self._to_shelf(db, item.id, 4)
            patient = await svc.create_patient(
                db, self.clinic_id, self.admin_id, self._patient(allergies="penicillin")
            )
            rx = await pharm.create_prescription(
                db,
                self.clinic_id,
                self.admin_id,
                PrescriptionCreate(
                    patient_id=patient.id,
                    items=[
                        PrescriptionItemIn(
                            drug_name="Amoxicillin 500mg",
                            dose="500mg",
                            quantity="2",
                            inventory_item_id=item.id,
                        )
                    ],
                ),
            )
            body = DispenseRequest(lines=[DispenseLineIn(prescription_item_id=rx.items[0].id, quantity=2)])
            with self.assertRaises(ValidationAppError):
                await pharm.dispense_prescription(db, self.clinic_id, self.admin_id, rx.id, body)
            done = await pharm.dispense_prescription(
                db,
                self.clinic_id,
                self.admin_id,
                rx.id,
                body.model_copy(update={"acknowledge_warnings": True}),
            )
            self.assertEqual(done.status, "dispensed")

    async def test_return_puts_stock_back_on_the_shelf(self) -> None:
        async with self.Session() as db:
            item = await self._sku(db, qty=4)
            await self._to_shelf(db, item.id, 4)
            patient = await svc.create_patient(db, self.clinic_id, self.admin_id, self._patient())
            rx = await pharm.create_prescription(
                db,
                self.clinic_id,
                self.admin_id,
                PrescriptionCreate(
                    patient_id=patient.id,
                    items=[
                        PrescriptionItemIn(
                            drug_name="Amoxicillin",
                            dose="500mg",
                            quantity="2",
                            inventory_item_id=item.id,
                        )
                    ],
                ),
            )
            done = await pharm.dispense_prescription(
                db,
                self.clinic_id,
                self.admin_id,
                rx.id,
                DispenseRequest(
                    lines=[DispenseLineIn(prescription_item_id=rx.items[0].id, quantity=2)],
                    bill=False,
                ),
            )
            opened = await pharm.return_dispense(
                db,
                self.clinic_id,
                self.admin_id,
                done.dispenses[0].id,
                ReturnDispense(quantity=2, reason="Patient declined"),
            )
            self.assertEqual(opened.status, "active")
            self.assertEqual(opened.items[0].line_status, "pending")
            shelf = await stock.location_by_code(db, self.clinic_id, "PHARM")
            self.assertEqual(await stock.on_hand_at(db, self.clinic_id, item.id, shelf.id), 4)

    async def test_short_shelf_requests_the_main_store(self) -> None:
        async with self.Session() as db:
            item = await self._sku(db, qty=10)
            await pharm.create_drug_template(
                db,
                self.clinic_id,
                DrugTemplateCreate(
                    name="Amoxicillin 500mg",
                    default_dose="500mg TDS",
                    inventory_item_id=item.id,
                    reorder_level=4,
                ),
            )
            req = await pharm.request_shelf(db, self.clinic_id, self.admin_id, ShelfRequest())
            self.assertEqual(req.status, "submitted")
            self.assertEqual(req.department, "pharmacy")
            self.assertGreater(req.lines[0].quantity_requested, 0)

    async def test_pharmacy_can_raise_a_requisition(self) -> None:
        self.assertTrue(has_permission(Role.PHARMACY, "requisition:create"))

    async def test_counter_sale_takes_payment_from_the_shelf_only(self) -> None:
        async with self.Session() as db:
            item = await self._sku(db, qty=10)
            await self._to_shelf(db, item.id, 6)
            patient = await svc.create_patient(db, self.clinic_id, self.admin_id, self._patient())
            sale = await pharm.checkout_sale(
                db,
                self.clinic_id,
                self.admin_id,
                CounterSaleCreate(
                    patient_id=patient.id,
                    lines=[CounterSaleLineIn(inventory_item_id=item.id, quantity=2)],
                    payment_method="cash",
                    amount_tendered=2000,
                ),
            )
            self.assertTrue(sale["sale_number"].startswith("PS-"))
            self.assertEqual(sale["total"], 1600)
            self.assertEqual(sale["amount_paid"], 1600)
            self.assertEqual(sale["change_due"], 400)
            self.assertEqual(sale["lines"][0]["quantity"], 2)
            shelf = await stock.location_by_code(db, self.clinic_id, "PHARM")
            store = await stock.location_by_code(db, self.clinic_id, "MAIN")
            self.assertEqual(await stock.on_hand_at(db, self.clinic_id, item.id, shelf.id), 4)
            self.assertEqual(await stock.on_hand_at(db, self.clinic_id, item.id, store.id), 4)
            invoice = (
                await db.execute(select(Invoice).where(Invoice.id == sale["invoice_id"]))
            ).scalar_one()
            self.assertEqual(invoice.status, InvoiceStatus.PAID)

    async def test_counter_sale_refuses_the_main_store_and_short_cash(self) -> None:
        async with self.Session() as db:
            item = await self._sku(db, qty=5)
            patient = await svc.create_patient(db, self.clinic_id, self.admin_id, self._patient())
            with self.assertRaises(ValidationAppError) as caught:
                await pharm.checkout_sale(
                    db,
                    self.clinic_id,
                    self.admin_id,
                    CounterSaleCreate(
                        patient_id=patient.id,
                        lines=[CounterSaleLineIn(inventory_item_id=item.id, quantity=1)],
                    ),
                )
            self.assertIn("Main store has", str(caught.exception))
            await self._to_shelf(db, item.id, 4)
            with self.assertRaises(ValidationAppError) as short:
                await pharm.checkout_sale(
                    db,
                    self.clinic_id,
                    self.admin_id,
                    CounterSaleCreate(
                        patient_id=patient.id,
                        lines=[CounterSaleLineIn(inventory_item_id=item.id, quantity=1)],
                        payment_method="cash",
                        amount_tendered=100,
                    ),
                )
            self.assertIn("less than", str(short.exception))
            self.assertEqual(await stock.on_hand_at(
                db, self.clinic_id, item.id, (await stock.location_by_code(db, self.clinic_id, "PHARM")).id
            ), 4)

    async def test_counter_sale_blocks_allergy_and_controlled_without_a_note(self) -> None:
        async with self.Session() as db:
            item = await self._sku(db, sku="COD-30", qty=4, name="Codeine 30mg")
            await self._to_shelf(db, item.id, 4)
            await pharm.create_drug_template(
                db,
                self.clinic_id,
                DrugTemplateCreate(
                    name="Codeine 30mg",
                    default_dose="30mg",
                    inventory_item_id=item.id,
                    is_controlled=True,
                ),
            )
            patient = await svc.create_patient(
                db, self.clinic_id, self.admin_id, self._patient(allergies="penicillin")
            )
            body = CounterSaleCreate(
                patient_id=patient.id,
                lines=[CounterSaleLineIn(inventory_item_id=item.id, quantity=1)],
            )
            with self.assertRaises(ValidationAppError) as controlled:
                await pharm.checkout_sale(db, self.clinic_id, self.admin_id, body)
            self.assertIn("register note", str(controlled.exception))
            amox = await self._sku(db, sku="AMOX-500B", qty=4)
            await self._to_shelf(db, amox.id, 4)
            with self.assertRaises(ValidationAppError) as allergy:
                await pharm.checkout_sale(
                    db,
                    self.clinic_id,
                    self.admin_id,
                    CounterSaleCreate(
                        patient_id=patient.id,
                        lines=[CounterSaleLineIn(inventory_item_id=amox.id, quantity=1)],
                        notes="register",
                    ),
                )
            self.assertIn("Review before selling", str(allergy.exception))

    async def test_course_edits_before_dispense_update_the_invoice(self) -> None:
        async with self.Session() as db:
            item = await self._sku(db, sku="IBU-400", qty=20, name="Ibuprofen 400mg")
            await self._to_shelf(db, item.id, 12)
            patient = await svc.create_patient(db, self.clinic_id, self.admin_id, self._patient())
            tmpl = await pharm.create_drug_template(
                db,
                self.clinic_id,
                DrugTemplateCreate(
                    name="Ibuprofen 400mg",
                    category="analgesic",
                    default_dose="400mg",
                    default_quantity="1",
                    inventory_item_id=item.id,
                ),
            )
            rx = await pharm.create_prescription(
                db,
                self.clinic_id,
                self.admin_id,
                PrescriptionCreate(
                    patient_id=patient.id,
                    bill=True,
                    items=[
                        PrescriptionItemIn(
                            drug_name="Ibuprofen 400mg",
                            dose="400mg",
                            quantity="10",
                            frequency="Twice daily",
                            days=5,
                            start_date=date(2026, 10, 2),
                            end_date=date(2026, 10, 6),
                            drug_template_id=tmpl.id,
                        )
                    ],
                ),
            )
            updated = await pharm.update_prescription_course(
                db,
                self.clinic_id,
                rx.id,
                PrescriptionCourseUpdate(
                    notes="After meals",
                    items=[
                        PrescriptionItemCourseUpdate(
                            id=rx.items[0].id,
                            drug_template_id=tmpl.id,
                            frequency="Three times daily",
                            days=4,
                            quantity="12",
                            start_date=date(2026, 10, 2),
                            end_date=date(2026, 10, 5),
                            instructions="After meals",
                        )
                    ],
                ),
            )
            line = updated.items[0]
            self.assertEqual(line.frequency, "Three times daily")
            self.assertEqual(line.days, 4)
            self.assertEqual(line.quantity, "12")
            self.assertEqual(line.instructions, "After meals")
            invoice = (
                await db.execute(
                    select(Invoice)
                    .where(Invoice.id == updated.invoice_id)
                    .options(selectinload(Invoice.line_items))
                )
            ).scalar_one()
            self.assertEqual(invoice.line_items[0].quantity, 12)
            self.assertEqual(invoice.total, 9600)
            await pharm.dispense_prescription(
                db,
                self.clinic_id,
                self.admin_id,
                rx.id,
                DispenseRequest(
                    lines=[DispenseLineIn(prescription_item_id=line.id, quantity=2)],
                    bill=False,
                ),
            )
            with self.assertRaises(ValidationAppError) as locked:
                await pharm.update_prescription_course(
                    db,
                    self.clinic_id,
                    rx.id,
                    PrescriptionCourseUpdate(
                        items=[
                            PrescriptionItemCourseUpdate(
                                id=line.id,
                                frequency="Once daily",
                                days=2,
                                quantity="4",
                                start_date=date(2026, 10, 2),
                                end_date=date(2026, 10, 3),
                            )
                        ],
                    ),
                )
            self.assertIn("already been dispensed", str(locked.exception))
