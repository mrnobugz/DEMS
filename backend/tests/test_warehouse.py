"""Warehouse ledger: receive, issue, PO, billed stock, pharmacy, stocktake."""

from __future__ import annotations

import unittest
from datetime import UTC, date, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.exceptions import ValidationAppError
from app.core.rbac import Role
from app.core.security import hash_password
from app.db.session import Base
from app.models import Clinic, InventoryItemKind, PrescriptionStatus, User
from app.schemas import (
    CatalogItemCreate,
    CatalogItemUpdate,
    ChartEntryCreate,
    ChartToCashRequest,
    FeeScheduleItemCreate,
    InventoryItemCreate,
    InvoiceCreate,
    InvoiceFromProceduresRequest,
    InvoiceLineCreate,
    PatientCreate,
    PatientRegisterRequest,
    PrescriptionCreate,
    PrescriptionItemIn,
    ProcedureInvoiceLine,
    PurchaseOrderCreate,
    RegistrationAppointment,
    RegistrationConsent,
    RegistrationLineItem,
    RegistrationPayment,
    SupplierCreate,
)
from app.services import catalog as catalog_svc
from app.services import departments as dept
from app.services import domain as svc
from app.services import warehouse as stock
from app.services.billing_ledger import void_invoice


class WarehouseOpsTests(unittest.IsolatedAsyncioTestCase):
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
            clinic = Clinic(
                name="Stock Clinic",
                code="STK",
                currency="TZS",
                timezone="Africa/Dar_es_Salaam",
            )
            db.add(clinic)
            await db.flush()
            admin = User(
                email="admin@stock.test",
                hashed_password=hash_password("Demsta!Admin1"),
                full_name="Admin",
                role=Role.CLINIC_ADMIN,
                clinic_id=clinic.id,
            )
            dentist = User(
                email="dentist@stock.test",
                hashed_password=hash_password("Demsta!Dent1"),
                full_name="Dr Stock",
                role=Role.DENTIST,
                clinic_id=clinic.id,
            )
            front = User(
                email="front@stock.test",
                hashed_password=hash_password("Demsta!Front1"),
                full_name="Front",
                role=Role.RECEPTIONIST,
                clinic_id=clinic.id,
            )
            db.add_all([admin, dentist, front])
            await db.commit()
            self.clinic_id = clinic.id
            self.admin_id = admin.id
            self.dentist_id = dentist.id
            self.front_id = front.id

    async def asyncTearDown(self) -> None:
        await self.engine.dispose()

    async def _sku(self, db, sku="GLOVE-M", qty=0, cost=10, sale=20, **extra):
        return await dept.create_inventory_item(
            db,
            self.clinic_id,
            self.admin_id,
            InventoryItemCreate(
                sku=sku,
                name=sku,
                category="clinical",
                item_kind="stock",
                quantity=qty,
                unit_cost=cost,
                sale_price=sale,
                reorder_level=2,
                **extra,
            ),
        )

    def _patient(self) -> PatientCreate:
        return PatientCreate(
            first_name="Asha",
            last_name="Mwamba",
            date_of_birth=date(1990, 3, 12),
            sex="female",
            phone="0711000001",
            town_city="Dar es Salaam",
            chief_complaint="Pain on chewing",
            next_of_kin="Parent Mwamba",
        )

    async def test_receive_updates_qty_and_weighted_cost(self) -> None:
        async with self.Session() as db:
            item = await self._sku(db, qty=0, cost=0)
            await stock.receive(
                db, self.clinic_id, self.admin_id, inventory_item_id=item.id, quantity=10, unit_cost=5
            )
            await stock.receive(
                db, self.clinic_id, self.admin_id, inventory_item_id=item.id, quantity=10, unit_cost=15
            )
            await db.refresh(item)
            self.assertEqual(item.quantity, 20)
            self.assertEqual(item.unit_cost, 10)

    async def test_issue_refuses_insufficient_qty(self) -> None:
        async with self.Session() as db:
            item = await self._sku(db, qty=2)
            with self.assertRaises(ValidationAppError):
                await stock.issue_patient(
                    db, self.clinic_id, self.admin_id, inventory_item_id=item.id, quantity=5
                )

    async def test_service_cannot_receive(self) -> None:
        async with self.Session() as db:
            fee = await dept.create_inventory_item(
                db,
                self.clinic_id,
                self.admin_id,
                InventoryItemCreate(
                    sku="FEE-CONSULT",
                    name="Consult",
                    item_kind="service",
                    sale_price=10000,
                    billable_at_registration=True,
                ),
            )
            with self.assertRaises(ValidationAppError):
                await stock.receive(
                    db, self.clinic_id, self.admin_id, inventory_item_id=fee.id, quantity=1
                )

    async def test_po_partial_then_received(self) -> None:
        async with self.Session() as db:
            item = await self._sku(db)
            supplier = await stock.create_supplier(
                db, self.clinic_id, SupplierCreate(name="Dental Supply Co")
            )
            po = await stock.create_purchase_order(
                db,
                self.clinic_id,
                PurchaseOrderCreate(
                    supplier_id=supplier.id,
                    lines=[{"inventory_item_id": item.id, "qty": 10, "unit_cost": 8}],
                ),
            )
            po = await stock.receive_purchase_order(
                db,
                self.clinic_id,
                self.admin_id,
                po.id,
                lines=[{"line_id": po.lines[0].id, "quantity": 4}],
            )
            self.assertEqual(po.status, "partial")
            po = await stock.receive_purchase_order(db, self.clinic_id, self.admin_id, po.id)
            self.assertEqual(po.status, "received")
            await db.refresh(item)
            self.assertEqual(item.quantity, 10)
            self.assertEqual(item.unit_cost, 8)

    async def test_registration_stock_sale_writes_movement(self) -> None:
        async with self.Session() as db:
            item = await self._sku(db, sku="KIT-REG", qty=5, sale=15000, cost=4000, billable_at_registration=True)
            slot = datetime.now(UTC).replace(minute=0, second=0, microsecond=0) + timedelta(hours=3)
            result = await svc.register_patient(
                db,
                self.clinic_id,
                self.front_id,
                PatientRegisterRequest(
                    patient=self._patient(),
                    items=[RegistrationLineItem(inventory_item_id=item.id, quantity=1)],
                    payment=RegistrationPayment(amount=15000, payer_type="self", method="cash"),
                    appointment=RegistrationAppointment(
                        service_name=item.name,
                        starts_at=slot,
                        duration_minutes=30,
                        dentist_id=self.dentist_id,
                    ),
                    consent=RegistrationConsent(
                        signature_data="data:image/png;base64,aaa",
                        signed_by_name="Asha Mwamba",
                    ),
                    destination_department="restorative",
                ),
            )
            await db.refresh(item)
            self.assertEqual(item.quantity, 4)
            line = result.invoice.line_items[0]
            self.assertEqual(line.inventory_item_id, item.id)
            self.assertEqual(line.line_kind, "supply")
            moves = await stock.list_movements(db, self.clinic_id, inventory_item_id=item.id)
            types = {m.movement_type for m in moves}
            self.assertIn("issue_patient", types)

    async def test_invoice_supply_deducts_and_void_returns(self) -> None:
        async with self.Session() as db:
            item = await self._sku(db, sku="COMP-A2", qty=6, cost=12, sale=40)
            patient = await svc.create_patient(db, self.clinic_id, self.admin_id, self._patient())
            invoice = await svc.create_invoice(
                db,
                self.clinic_id,
                self.admin_id,
                InvoiceCreate(
                    patient_id=patient.id,
                    line_items=[
                        InvoiceLineCreate(
                            description=item.name,
                            quantity=2,
                            unit_price=40,
                            procedure_code=item.sku,
                            inventory_item_id=item.id,
                            line_kind="supply",
                        )
                    ],
                ),
            )
            await db.refresh(item)
            self.assertEqual(item.quantity, 4)
            await void_invoice(db, self.clinic_id, self.admin_id, invoice.id)
            await db.refresh(item)
            self.assertEqual(item.quantity, 6)

    async def test_pharmacy_dispense_deducts_linked_sku(self) -> None:
        async with self.Session() as db:
            item = await self._sku(db, sku="ANES-LIDO", qty=8, sale=5000)
            patient = await svc.create_patient(db, self.clinic_id, self.admin_id, self._patient())
            rx = await dept.create_prescription(
                db,
                self.clinic_id,
                self.dentist_id,
                PrescriptionCreate(
                    patient_id=patient.id,
                    items=[
                        PrescriptionItemIn(
                            drug_name="Lidocaine",
                            dose="2%",
                            quantity="2",
                            inventory_item_id=item.id,
                        )
                    ],
                ),
            )
            await dept.update_prescription_status(
                db, self.clinic_id, self.admin_id, rx.id, PrescriptionStatus.DISPENSED
            )
            await db.refresh(item)
            self.assertEqual(item.quantity, 6)

    async def test_writeoff_and_stocktake_variance(self) -> None:
        async with self.Session() as db:
            item = await self._sku(db, sku="MASK-S", qty=10)
            await stock.writeoff(
                db, self.clinic_id, self.admin_id, inventory_item_id=item.id, quantity=3, reason="damaged"
            )
            await db.refresh(item)
            self.assertEqual(item.quantity, 7)
            await stock.stocktake(
                db, self.clinic_id, self.admin_id, inventory_item_id=item.id, counted=5, reason="cycle count"
            )
            await db.refresh(item)
            self.assertEqual(item.quantity, 5)

    async def test_catalog_supply_on_fee_schedule_deducts(self) -> None:
        async with self.Session() as db:
            item = await self._sku(db, sku="GLOVE-BILL", qty=5, sale=2000, cost=400)
            cat = await catalog_svc.create_catalog_item(
                db,
                self.clinic_id,
                self.admin_id,
                CatalogItemCreate(
                    sku="glove-bill",
                    label="Sterile gloves",
                    kind="supply",
                    list_price=2000,
                    inventory_item_id=item.id,
                ),
            )
            fees = await svc.list_fee_schedule(db, self.clinic_id, billable=True, active=True)
            fee = next(row for row in fees if row.catalog_item_id == cat.id)
            self.assertEqual(getattr(fee, "catalog_kind", None), "supply")
            self.assertEqual(getattr(fee, "inventory_item_id", None), item.id)
            patient = await svc.create_patient(db, self.clinic_id, self.admin_id, self._patient())
            invoice = await svc.invoice_from_procedures(
                db,
                self.clinic_id,
                self.admin_id,
                InvoiceFromProceduresRequest(
                    patient_id=patient.id,
                    items=[ProcedureInvoiceLine(fee_item_id=fee.id, quantity=2)],
                ),
            )
            await db.refresh(item)
            self.assertEqual(item.quantity, 3)
            self.assertEqual(invoice.line_items[0].inventory_item_id, item.id)
            self.assertEqual(invoice.line_items[0].line_kind, "supply")

    async def test_procedure_fee_does_not_deduct_linked_material(self) -> None:
        async with self.Session() as db:
            material = await self._sku(db, sku="COMP-CHAIR", qty=8, cost=12, sale=0)
            fee = await svc.upsert_fee_item(
                db,
                self.clinic_id,
                self.admin_id,
                FeeScheduleItemCreate(code="mat-fill", label="Composite filling", unit_price=80000),
            )
            await catalog_svc.update_catalog_item(
                db,
                self.clinic_id,
                self.admin_id,
                fee.catalog_item_id,
                CatalogItemUpdate(inventory_item_id=material.id),
            )
            patient = await svc.create_patient(db, self.clinic_id, self.admin_id, self._patient())
            invoice = await svc.invoice_from_procedures(
                db,
                self.clinic_id,
                self.admin_id,
                InvoiceFromProceduresRequest(
                    patient_id=patient.id,
                    items=[ProcedureInvoiceLine(fee_item_id=fee.id, quantity=1, tooth_number="16")],
                ),
            )
            await db.refresh(material)
            self.assertEqual(material.quantity, 8)
            self.assertIsNone(invoice.line_items[0].inventory_item_id)
            self.assertEqual(invoice.line_items[0].line_kind, "procedure")

    async def test_chart_to_cash_supply_deducts(self) -> None:
        async with self.Session() as db:
            item = await self._sku(db, sku="KIT-HOME", qty=4, sale=25000, cost=8000)
            cat = await catalog_svc.create_catalog_item(
                db,
                self.clinic_id,
                self.admin_id,
                CatalogItemCreate(
                    sku="kit-home",
                    label="Home care kit",
                    kind="supply",
                    list_price=25000,
                    inventory_item_id=item.id,
                ),
            )
            patient = await svc.create_patient(db, self.clinic_id, self.admin_id, self._patient())
            await svc.add_chart_entry(
                db,
                self.clinic_id,
                self.admin_id,
                patient.id,
                ChartEntryCreate(
                    tooth_number="11",
                    condition_code=cat.sku,
                    condition_label=cat.label,
                ),
            )
            invoice = await svc.chart_to_cash(
                db,
                self.clinic_id,
                self.admin_id,
                ChartToCashRequest(patient_id=patient.id),
            )
            await db.refresh(item)
            self.assertEqual(item.quantity, 3)
            self.assertEqual(invoice.line_items[0].inventory_item_id, item.id)
            self.assertEqual(invoice.line_items[0].line_kind, "supply")

    async def test_chart_to_cash_procedure_ignores_material_sku(self) -> None:
        async with self.Session() as db:
            material = await self._sku(db, sku="COMP-C2C", qty=6)
            fee = await svc.upsert_fee_item(
                db,
                self.clinic_id,
                self.admin_id,
                FeeScheduleItemCreate(code="filling", label="Filling", unit_price=80000),
            )
            await catalog_svc.update_catalog_item(
                db,
                self.clinic_id,
                self.admin_id,
                fee.catalog_item_id,
                CatalogItemUpdate(inventory_item_id=material.id),
            )
            patient = await svc.create_patient(db, self.clinic_id, self.admin_id, self._patient())
            await svc.add_chart_entry(
                db,
                self.clinic_id,
                self.admin_id,
                patient.id,
                ChartEntryCreate(
                    tooth_number="26",
                    condition_code="filling",
                    condition_label="Filling",
                ),
            )
            invoice = await svc.chart_to_cash(
                db,
                self.clinic_id,
                self.admin_id,
                ChartToCashRequest(patient_id=patient.id),
            )
            await db.refresh(material)
            self.assertEqual(material.quantity, 6)
            self.assertIsNone(invoice.line_items[0].inventory_item_id)

    async def test_multi_line_invoice_rolls_back_when_last_line_short(self) -> None:
        async with self.Session() as db:
            gloves = await self._sku(db, sku="GLOVE-RB", qty=5)
            masks = await self._sku(db, sku="MASK-RB", qty=0)
            patient = await svc.create_patient(db, self.clinic_id, self.admin_id, self._patient())
            with self.assertRaises(ValidationAppError):
                await svc.create_invoice(
                    db,
                    self.clinic_id,
                    self.admin_id,
                    InvoiceCreate(
                        patient_id=patient.id,
                        line_items=[
                            InvoiceLineCreate(
                                description=gloves.name,
                                quantity=1,
                                unit_price=20,
                                inventory_item_id=gloves.id,
                                line_kind="supply",
                            ),
                            InvoiceLineCreate(
                                description=masks.name,
                                quantity=1,
                                unit_price=10,
                                inventory_item_id=masks.id,
                                line_kind="supply",
                            ),
                        ],
                    ),
                )
            await db.refresh(gloves)
            self.assertEqual(gloves.quantity, 5)


if __name__ == "__main__":
    unittest.main()
