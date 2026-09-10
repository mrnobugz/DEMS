"""Catalog core feeds versioned fee schedules; billing consumes them."""

from __future__ import annotations

import unittest
from datetime import date, timedelta

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.rbac import Role
from app.core.security import hash_password
from app.db.session import Base
from app.models import CatalogItemKind, Clinic, InventoryItem, InventoryItemKind, User
from app.schemas import (
    CatalogFeeRateCreate,
    CatalogItemCreate,
    FeeScheduleItemCreate,
    InvoiceFromProceduresRequest,
    PatientCreate,
    PatientInsurancePlanCreate,
    ProcedureInvoiceLine,
)
from app.services import catalog as catalog_svc
from app.services import domain as svc
from app.services import departments as dept


class CatalogCoreTests(unittest.IsolatedAsyncioTestCase):
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
            clinic = Clinic(name="Catalog Clinic", code="CAT", currency="TZS")
            db.add(clinic)
            await db.flush()
            admin = User(
                email="admin@example.com",
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

    async def test_procedure_upsert_creates_catalog_item_and_office_rate(self) -> None:
        async with self.Session() as db:
            fee = await svc.upsert_fee_item(
                db,
                self.clinic_id,
                self.admin_id,
                FeeScheduleItemCreate(code="rct-ant", label="Anterior RCT", unit_price=420000),
            )
            self.assertIsNotNone(fee.catalog_item_id)
            item = await catalog_svc.get_catalog_item(db, self.clinic_id, fee.catalog_item_id)
            self.assertEqual(item.kind, CatalogItemKind.PROCEDURE)
            self.assertEqual(item.sku, "rct-ant")
            self.assertEqual(item.list_price, 420000)
            office = [r for r in item.fee_rates if r.payer_name == ""]
            self.assertEqual(office[0].amount, 420000)

    async def test_price_change_writes_history_not_silent_overwrite_only(self) -> None:
        async with self.Session() as db:
            fee = await svc.upsert_fee_item(
                db,
                self.clinic_id,
                self.admin_id,
                FeeScheduleItemCreate(code="crown", label="Crown", unit_price=600000),
            )
            await svc.upsert_fee_item(
                db,
                self.clinic_id,
                self.admin_id,
                FeeScheduleItemCreate(code="crown", label="Crown", unit_price=650000),
            )
            history = await catalog_svc.list_price_history(db, self.clinic_id, fee.catalog_item_id)
            self.assertEqual(len(history), 1)
            self.assertEqual(history[0].old_price, 600000)
            self.assertEqual(history[0].new_price, 650000)

    async def test_payer_rate_and_effective_date_drive_billing_price(self) -> None:
        async with self.Session() as db:
            patient = await svc.create_patient(
                db,
                self.clinic_id,
                self.admin_id,
                PatientCreate(first_name="Asha", last_name="Mwamba", phone="0711555099"),
            )
            await svc.upsert_insurance_plan(
                db,
                self.clinic_id,
                self.admin_id,
                patient.id,
                PatientInsurancePlanCreate(payer_name="NHIF", coverage_pct=80),
            )
            fee = await svc.upsert_fee_item(
                db,
                self.clinic_id,
                self.admin_id,
                FeeScheduleItemCreate(code="filling", label="Filling", unit_price=80000),
            )
            yesterday = date.today() - timedelta(days=1)
            await catalog_svc.add_fee_rate(
                db,
                self.clinic_id,
                self.admin_id,
                fee.catalog_item_id,
                CatalogFeeRateCreate(payer_name="NHIF", amount=50000, effective_from=yesterday),
            )
            invoice = await svc.invoice_from_procedures(
                db,
                self.clinic_id,
                self.admin_id,
                InvoiceFromProceduresRequest(
                    patient_id=patient.id,
                    items=[ProcedureInvoiceLine(fee_item_id=fee.id, quantity=1, tooth_number="16")],
                ),
            )
            self.assertEqual(invoice.line_items[0].unit_price, 50000)
            self.assertEqual(invoice.line_items[0].fee_charged, 50000)
            item = await catalog_svc.get_catalog_item(db, self.clinic_id, fee.catalog_item_id)
            past = await catalog_svc.resolve_fee(
                db, self.clinic_id, item, payer_name="NHIF", on_date=yesterday - timedelta(days=1)
            )
            self.assertEqual(past, 80000)

    async def test_warehouse_sku_is_not_a_catalog_item(self) -> None:
        async with self.Session() as db:
            db.add(
                InventoryItem(
                    clinic_id=self.clinic_id,
                    sku="REG-CARD",
                    name="Registration card",
                    item_kind=InventoryItemKind.SERVICE,
                    billable_at_registration=True,
                    sale_price=10000,
                )
            )
            await db.flush()
            rows = await catalog_svc.list_catalog(db, self.clinic_id, active=None)
            self.assertFalse(any(row.sku == "reg-card" or row.sku == "REG-CARD" for row in rows))

    async def test_lab_and_drug_kinds_are_billable_catalog_not_stock(self) -> None:
        async with self.Session() as db:
            drug = await catalog_svc.create_catalog_item(
                db,
                self.clinic_id,
                self.admin_id,
                CatalogItemCreate(
                    sku="amox-500",
                    label="Amoxicillin 500mg",
                    kind="drug",
                    list_price=8000,
                    ndc_code="0002-1234-01",
                    drug_schedule="unscheduled",
                ),
            )
            lab = await catalog_svc.create_catalog_item(
                db,
                self.clinic_id,
                self.admin_id,
                CatalogItemCreate(
                    sku="pfm-crown-lab",
                    label="PFM crown lab fee",
                    kind="lab",
                    list_price=180000,
                    vendor_fee_basis="per-unit",
                ),
            )
            supply = await catalog_svc.create_catalog_item(
                db,
                self.clinic_id,
                self.admin_id,
                CatalogItemCreate(
                    sku="alginate-scoop",
                    label="Alginate impression",
                    kind="supply",
                    list_price=5000,
                    unit_of_measure="scoop",
                ),
            )
            self.assertEqual(drug.kind, "drug")
            self.assertEqual(lab.vendor_fee_basis, "per-unit")
            self.assertEqual(supply.unit_of_measure, "scoop")
            stock = await dept.list_inventory(db, self.clinic_id)
            self.assertFalse(any(row.sku == "amox-500" for row in stock))
            fees = await svc.list_fee_schedule(db, self.clinic_id)
            codes = {row.code for row in fees}
            self.assertIn("amox-500", codes)
            self.assertIn("alginate-scoop", codes)
            self.assertNotIn("pfm-crown-lab", codes)


if __name__ == "__main__":
    unittest.main()
