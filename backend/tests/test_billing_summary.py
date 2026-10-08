"""Patient ledger: one charge per event, payments, and summary totals."""

from __future__ import annotations

import unittest
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.rbac import Role
from app.core.security import hash_password
from app.db.session import Base
from app.models import Clinic, Invoice, InvoiceStatus, User
from app.schemas import (
    AdjustmentCreate,
    ClaimCreate,
    DispenseLineIn,
    DispenseRequest,
    FeeScheduleItemCreate,
    InventoryItemCreate,
    InvoiceCreate,
    InvoiceFromProceduresRequest,
    InvoiceLineCreate,
    InvoiceOut,
    LabCaseCreate,
    LabCaseUpdate,
    PatientCreate,
    PaymentCreate,
    PrescriptionCreate,
    PrescriptionItemIn,
    ProcedureInvoiceLine,
)
from app.services import billing_ledger as ledger
from app.services import departments as dept
from app.services import domain as svc
from app.services import pharmacy as pharm
from app.services import warehouse as stock


class BillingSummaryTests(unittest.IsolatedAsyncioTestCase):
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
            clinic = Clinic(name="Ledger Clinic", code="LED2", currency="TZS")
            other = Clinic(name="Other Clinic", code="OTH", currency="TZS")
            db.add_all([clinic, other])
            await db.flush()
            actor = User(
                email="bill@example.com",
                hashed_password=hash_password("Demsta!Bill1"),
                full_name="Billing",
                role=Role.CLINIC_ADMIN,
                clinic_id=clinic.id,
            )
            outsider = User(
                email="other@example.com",
                hashed_password=hash_password("Demsta!Bill1"),
                full_name="Other",
                role=Role.CLINIC_ADMIN,
                clinic_id=other.id,
            )
            db.add_all([actor, outsider])
            await db.commit()
            self.clinic_id = clinic.id
            self.other_id = other.id
            self.actor_id = actor.id
            self.outsider_id = outsider.id

    async def asyncTearDown(self) -> None:
        await self.engine.dispose()

    def _patient(self, phone: str = "0711555011") -> PatientCreate:
        return PatientCreate(first_name="Asha", last_name="Mwamba", phone=phone)

    async def _sku(self, db: AsyncSession):
        return await dept.create_inventory_item(
            db,
            self.clinic_id,
            self.actor_id,
            InventoryItemCreate(
                sku="AMOX-500",
                name="Amoxicillin capsules",
                category="drug",
                item_kind="stock",
                quantity=10,
                unit_cost=200,
                sale_price=800,
                reorder_level=2,
                expiry_date=date(2027, 12, 31),
                requires_expiry=True,
            ),
        )

    async def _to_shelf(self, db: AsyncSession, item_id: str, qty: float) -> None:
        await stock.ensure_locations(db, self.clinic_id)
        shelf = await stock.location_by_code(db, self.clinic_id, "PHARM")
        await stock.issue_department(
            db,
            self.clinic_id,
            self.actor_id,
            inventory_item_id=item_id,
            quantity=qty,
            to_location_id=shelf.id,
            reason="stock pharmacy",
        )

    async def test_payment_updates_balance_and_void_clears_it(self) -> None:
        async with self.Session() as db:
            patient = await svc.create_patient(db, self.clinic_id, self.actor_id, self._patient())
            invoice = await svc.create_invoice(
                db,
                self.clinic_id,
                self.actor_id,
                InvoiceCreate(
                    patient_id=patient.id,
                    line_items=[InvoiceLineCreate(description="Filling", procedure_code="D2391", unit_price=10_000)],
                ),
            )
            partial = await svc.add_payment(
                db,
                self.clinic_id,
                self.actor_id,
                invoice.id,
                PaymentCreate(amount=4_000, method="cash"),
            )
            self.assertEqual(partial.status, InvoiceStatus.PARTIALLY_PAID)
            self.assertEqual(partial.amount_paid, 4_000)
            self.assertEqual(ledger.invoice_balance(partial), 6_000)
            closed = await ledger.add_adjustment(
                db,
                self.clinic_id,
                self.actor_id,
                invoice.id,
                AdjustmentCreate(amount=6_000, kind="write_off", notes="courtesy"),
            )
            self.assertEqual(closed.status, InvoiceStatus.PAID)
            self.assertEqual(closed.amount_paid, 4_000)
            self.assertEqual(closed.amount_adjusted, 6_000)
            self.assertEqual(ledger.invoice_balance(closed), 0)

            voidable = await svc.create_invoice(
                db,
                self.clinic_id,
                self.actor_id,
                InvoiceCreate(
                    patient_id=patient.id,
                    line_items=[InvoiceLineCreate(description="Exam", unit_price=5_000)],
                ),
            )
            voided = await ledger.void_invoice(db, self.clinic_id, self.actor_id, voidable.id)
            self.assertEqual(voided.status, InvoiceStatus.VOID)
            self.assertEqual(voided.amount_paid, 0)
            self.assertEqual(ledger.invoice_balance(voided), 0)

    async def test_summary_matches_fixture_invoices(self) -> None:
        async with self.Session() as db:
            patient = await svc.create_patient(db, self.clinic_id, self.actor_id, self._patient("0711555012"))
            current = await svc.create_invoice(
                db,
                self.clinic_id,
                self.actor_id,
                InvoiceCreate(
                    patient_id=patient.id,
                    line_items=[InvoiceLineCreate(description="Crown", procedure_code="D2740", unit_price=100_000)],
                ),
            )
            await svc.add_payment(
                db,
                self.clinic_id,
                self.actor_id,
                current.id,
                PaymentCreate(amount=40_000, method="mobile_money"),
            )
            previous = await svc.create_invoice(
                db,
                self.clinic_id,
                self.actor_id,
                InvoiceCreate(
                    patient_id=patient.id,
                    line_items=[InvoiceLineCreate(description="Cleaning", procedure_code="D1110", unit_price=50_000)],
                ),
            )
            today = datetime.now(UTC).date()
            prev_day = date(today.year - 1, 12, 15) if today.month == 1 else today.replace(month=today.month - 1, day=15)
            previous.issued_at = datetime(prev_day.year, prev_day.month, prev_day.day, tzinfo=UTC)
            previous.due_at = datetime.now(UTC) - timedelta(days=1)
            voided = await svc.create_invoice(
                db,
                self.clinic_id,
                self.actor_id,
                InvoiceCreate(
                    patient_id=patient.id,
                    line_items=[InvoiceLineCreate(description="Cancelled", unit_price=10_000)],
                ),
            )
            await ledger.void_invoice(db, self.clinic_id, self.actor_id, voided.id)
            other_patient = await svc.create_patient(db, self.other_id, self.outsider_id, self._patient("0711555099"))
            await svc.create_invoice(
                db,
                self.other_id,
                self.outsider_id,
                InvoiceCreate(
                    patient_id=other_patient.id,
                    line_items=[InvoiceLineCreate(description="Elsewhere", unit_price=999_000)],
                ),
            )
            await db.flush()

            summary = await ledger.billing_summary(db, self.clinic_id)
            self.assertEqual(summary["currency"], "TZS")
            self.assertEqual(summary["revenue_this_month"], 100_000)
            self.assertEqual(summary["revenue_last_month"], 50_000)
            self.assertEqual(summary["paid_this_month"], 40_000)
            self.assertEqual(summary["outstanding_count"], 2)
            self.assertEqual(summary["outstanding_amount"], 110_000)
            self.assertEqual(summary["overdue_count"], 1)
            self.assertEqual(summary["overdue_amount"], 50_000)
            months = {row["month"]: row["amount"] for row in summary["revenue_by_month"]}
            self.assertEqual(len(summary["revenue_by_month"]), 12)
            issued = previous.issued_at
            self.assertEqual(months[f"{issued.year:04d}-{issued.month:02d}"], 50_000)
            methods = {row["method"]: row["amount"] for row in summary["payment_methods"]}
            self.assertEqual(methods["mobile_money"], 40_000)
            self.assertEqual(summary["recent_invoices"][0]["patient_name"], "Asha Mwamba")
            self.assertTrue(any(row["amount"] == 40_000 for row in summary["recent_payments"]))

    async def test_procedure_pharmacy_lab_and_imaging_share_the_patient_ledger(self) -> None:
        async with self.Session() as db:
            patient = await svc.create_patient(db, self.clinic_id, self.actor_id, self._patient("0711555013"))
            procedure = await svc.upsert_fee_item(
                db,
                self.clinic_id,
                self.actor_id,
                FeeScheduleItemCreate(code="fill-1", label="Occlusal filling", category="restorative", unit_price=80_000),
            )
            imaging = await svc.upsert_fee_item(
                db,
                self.clinic_id,
                self.actor_id,
                FeeScheduleItemCreate(code="opg", label="OPG", category="imaging", unit_price=25_000),
            )
            consult = await svc.upsert_fee_item(
                db,
                self.clinic_id,
                self.actor_id,
                FeeScheduleItemCreate(code="consult", label="Consultation fee", category="consultation", unit_price=30_000),
            )
            await svc.invoice_from_procedures(
                db,
                self.clinic_id,
                self.actor_id,
                InvoiceFromProceduresRequest(
                    patient_id=patient.id,
                    items=[ProcedureInvoiceLine(fee_item_id=procedure.id, tooth_number="16")],
                ),
            )
            imaged = await svc.invoice_from_procedures(
                db,
                self.clinic_id,
                self.actor_id,
                InvoiceFromProceduresRequest(
                    patient_id=patient.id,
                    items=[ProcedureInvoiceLine(fee_item_id=imaging.id)],
                    notes="Radiology investigation",
                ),
            )
            consulted = await svc.invoice_from_procedures(
                db,
                self.clinic_id,
                self.actor_id,
                InvoiceFromProceduresRequest(
                    patient_id=patient.id,
                    items=[ProcedureInvoiceLine(fee_item_id=consult.id)],
                ),
            )
            self.assertEqual(imaged.line_items[0].line_kind, "imaging")
            self.assertEqual(consulted.line_items[0].line_kind, "consultation")

            item = await self._sku(db)
            await self._to_shelf(db, item.id, 6)
            rx = await pharm.create_prescription(
                db,
                self.clinic_id,
                self.actor_id,
                PrescriptionCreate(
                    patient_id=patient.id,
                    bill=True,
                    items=[
                        PrescriptionItemIn(
                            drug_name="Amoxicillin capsules",
                            dose="500mg",
                            quantity="4",
                            inventory_item_id=item.id,
                        )
                    ],
                ),
            )
            self.assertTrue((rx.invoice_id or "") != "")
            order_invoice = await svc.get_invoice(db, self.clinic_id, rx.invoice_id or "")
            self.assertTrue((order_invoice.notes or "").startswith("Pharmacy order"))
            self.assertEqual(order_invoice.line_items[0].line_kind, "drug")
            first = await pharm.dispense_prescription(
                db,
                self.clinic_id,
                self.actor_id,
                rx.id,
                DispenseRequest(
                    lines=[DispenseLineIn(prescription_item_id=rx.items[0].id, quantity=2)],
                    bill=True,
                ),
            )
            second = await pharm.dispense_prescription(
                db,
                self.clinic_id,
                self.actor_id,
                rx.id,
                DispenseRequest(
                    lines=[DispenseLineIn(prescription_item_id=rx.items[0].id, quantity=2)],
                    bill=True,
                ),
            )
            self.assertEqual(first.invoice_id, rx.invoice_id)
            self.assertEqual(second.invoice_id, rx.invoice_id)
            self.assertTrue(all(event.invoice_id == rx.invoice_id for event in second.dispenses))

            actor = await db.get(User, self.actor_id)
            assert actor is not None
            case = await dept.create_lab_case(
                db,
                self.clinic_id,
                actor,
                LabCaseCreate(patient_id=patient.id, case_type="crown", lab_cost=45_000, tooth="16"),
            )
            await dept.update_lab_case(
                db,
                self.clinic_id,
                case.id,
                LabCaseUpdate(lab_cost=48_000),
                actor_id=self.actor_id,
            )

            rows = await svc.list_invoices(db, self.clinic_id, patient.id)
            kinds = {line.line_kind for inv in rows for line in inv.line_items}
            self.assertIn("procedure", kinds)
            self.assertIn("drug", kinds)
            self.assertIn("lab", kinds)
            self.assertIn("imaging", kinds)
            self.assertIn("consultation", kinds)
            drug_invoices = [inv for inv in rows if any(line.line_kind == "drug" for line in inv.line_items)]
            self.assertEqual(len(drug_invoices), 1)
            lab_invoices = [inv for inv in rows if any(line.line_kind == "lab" for line in inv.line_items)]
            self.assertEqual(len(lab_invoices), 1)
            self.assertEqual(lab_invoices[0].total, 48_000)
            pharmacy_count = (
                await db.execute(
                    select(func.count()).select_from(Invoice).where(
                        Invoice.patient_id == patient.id,
                        Invoice.notes.like("Pharmacy order%"),
                    )
                )
            ).scalar_one()
            self.assertEqual(pharmacy_count, 1)

            claim = await ledger.create_claim(
                db, self.clinic_id, self.actor_id, ClaimCreate(invoice_id=order_invoice.id)
            )
            detail = InvoiceOut.model_validate(await svc.get_invoice(db, self.clinic_id, order_invoice.id))
            self.assertEqual(detail.patient_name, "Asha Mwamba")
            self.assertEqual(detail.balance, detail.total)
            self.assertEqual(detail.claims[0].claim_number, claim.claim_number)
            self.assertFalse(detail.is_overdue)

    async def test_unbilled_fill_and_counter_sale_each_create_one_invoice(self) -> None:
        async with self.Session() as db:
            patient = await svc.create_patient(db, self.clinic_id, self.actor_id, self._patient("0711555014"))
            item = await self._sku(db)
            await self._to_shelf(db, item.id, 8)
            rx = await pharm.create_prescription(
                db,
                self.clinic_id,
                self.actor_id,
                PrescriptionCreate(
                    patient_id=patient.id,
                    bill=False,
                    items=[
                        PrescriptionItemIn(
                            drug_name="Amoxicillin capsules",
                            dose="500mg",
                            quantity="2",
                            inventory_item_id=item.id,
                        )
                    ],
                ),
            )
            self.assertIsNone(rx.invoice_id)
            done = await pharm.dispense_prescription(
                db,
                self.clinic_id,
                self.actor_id,
                rx.id,
                DispenseRequest(
                    lines=[DispenseLineIn(prescription_item_id=rx.items[0].id, quantity=2)],
                    bill=True,
                ),
            )
            self.assertIsNotNone(done.invoice_id)
            rows = await svc.list_invoices(db, self.clinic_id, patient.id)
            self.assertEqual(len(rows), 1)
            self.assertFalse((rows[0].notes or "").startswith("Pharmacy order"))
            self.assertEqual(rows[0].line_items[0].line_kind, "drug")


if __name__ == "__main__":
    unittest.main()
