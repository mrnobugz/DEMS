"""Posted charges stay immutable; coverage, claims, remittance, and statements."""

from __future__ import annotations

import unittest

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.exceptions import ValidationAppError
from app.core.rbac import Role
from app.core.security import hash_password
from app.db.session import Base
from app.models import ChargeStatus, ClaimLineStatus, ClaimStatus, Clinic, User
from app.schemas import (
    AdjustmentCreate,
    ClaimCreate,
    InvoiceCreate,
    InvoiceLineCreate,
    PatientCreate,
    PatientInsurancePlanCreate,
    RemittanceCreate,
    StatementCreate,
)
from app.services import billing_ledger as ledger
from app.services import domain as svc


class BillingLedgerTests(unittest.IsolatedAsyncioTestCase):
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
            clinic = Clinic(name="Ledger Clinic", code="LED", currency="TZS")
            db.add(clinic)
            await db.flush()
            billing = User(
                email="billing@example.com",
                hashed_password=hash_password("Demsta!Bill1"),
                full_name="Billing",
                role=Role.ACCOUNTANT,
                clinic_id=clinic.id,
            )
            db.add(billing)
            await db.commit()
            self.clinic_id = clinic.id
            self.actor_id = billing.id

    async def asyncTearDown(self) -> None:
        await self.engine.dispose()

    async def _patient_with_plan(self, db: AsyncSession, coverage_pct: float = 80.0):
        patient = await svc.create_patient(
            db,
            self.clinic_id,
            self.actor_id,
            PatientCreate(first_name="Asha", last_name="Mwamba", phone="0711555010"),
        )
        await svc.upsert_insurance_plan(
            db,
            self.clinic_id,
            self.actor_id,
            patient.id,
            PatientInsurancePlanCreate(
                payer_name="NHIF",
                plan_name="Standard",
                coverage_pct=coverage_pct,
                deductible=0,
            ),
        )
        return patient

    async def test_posting_stamps_coverage_without_changing_fee(self) -> None:
        async with self.Session() as db:
            patient = await self._patient_with_plan(db)
            invoice = await svc.create_invoice(
                db,
                self.clinic_id,
                self.actor_id,
                InvoiceCreate(
                    patient_id=patient.id,
                    line_items=[
                        InvoiceLineCreate(
                            description="Crown",
                            procedure_code="D2740",
                            unit_price=100_000,
                        )
                    ],
                ),
            )
            line = invoice.line_items[0]
            self.assertEqual(line.unit_price, 100_000)
            self.assertEqual(line.fee_charged, 100_000)
            self.assertEqual(line.estimated_insurance, 80_000)
            self.assertEqual(line.estimated_patient, 20_000)
            self.assertEqual(line.charge_status, ChargeStatus.PENDING_INSURANCE)

    async def test_adjustment_does_not_overwrite_posted_fee(self) -> None:
        async with self.Session() as db:
            patient = await self._patient_with_plan(db, coverage_pct=0)
            invoice = await svc.create_invoice(
                db,
                self.clinic_id,
                self.actor_id,
                InvoiceCreate(
                    patient_id=patient.id,
                    line_items=[
                        InvoiceLineCreate(
                            description="Cleaning",
                            procedure_code="D1110",
                            unit_price=50_000,
                        )
                    ],
                ),
            )
            posted_fee = invoice.line_items[0].fee_charged
            updated = await ledger.add_adjustment(
                db,
                self.clinic_id,
                self.actor_id,
                invoice.id,
                AdjustmentCreate(amount=5_000, kind="write_off", notes="courtesy"),
            )
            self.assertEqual(updated.line_items[0].unit_price, 50_000)
            self.assertEqual(updated.line_items[0].fee_charged, posted_fee)
            self.assertEqual(updated.amount_adjusted, 5_000)
            self.assertAlmostEqual(ledger.invoice_balance(updated), 45_000)

    async def test_claim_remittance_keeps_estimate_and_actual_separate(self) -> None:
        async with self.Session() as db:
            patient = await self._patient_with_plan(db)
            invoice = await svc.create_invoice(
                db,
                self.clinic_id,
                self.actor_id,
                InvoiceCreate(
                    patient_id=patient.id,
                    line_items=[
                        InvoiceLineCreate(
                            description="Filling",
                            procedure_code="D2391",
                            unit_price=100_000,
                        )
                    ],
                ),
            )
            claim = await ledger.create_claim(
                db,
                self.clinic_id,
                self.actor_id,
                ClaimCreate(invoice_id=invoice.id),
            )
            self.assertEqual(claim.status, ClaimStatus.DRAFT)
            self.assertIsNone(claim.scrub_notes)
            claim = await ledger.submit_claim(db, self.clinic_id, self.actor_id, claim.id)
            self.assertEqual(claim.status, ClaimStatus.SUBMITTED)
            line = claim.lines[0]
            claim = await ledger.post_remittance(
                db,
                self.clinic_id,
                self.actor_id,
                claim.id,
                RemittanceCreate(
                    claim_line_id=line.id,
                    paid_amount=70_000,
                    allowed_amount=90_000,
                    payer_name="NHIF",
                ),
            )
            charge = claim.lines[0].charge
            self.assertEqual(charge.estimated_insurance, 80_000)
            self.assertEqual(charge.actual_insurance, 70_000)
            self.assertEqual(charge.actual_patient, 20_000)
            self.assertEqual(claim.lines[0].status, ClaimLineStatus.PARTIAL)
            denials = await ledger.list_denials(db, self.clinic_id)
            self.assertEqual(len(denials), 1)
            refreshed = await svc.get_invoice(db, self.clinic_id, invoice.id)
            self.assertEqual(refreshed.amount_paid, 70_000)

    async def test_submit_blocked_when_procedure_code_missing(self) -> None:
        async with self.Session() as db:
            patient = await self._patient_with_plan(db)
            invoice = await svc.create_invoice(
                db,
                self.clinic_id,
                self.actor_id,
                InvoiceCreate(
                    patient_id=patient.id,
                    line_items=[InvoiceLineCreate(description="Uncoded work", unit_price=10_000)],
                ),
            )
            claim = await ledger.create_claim(
                db,
                self.clinic_id,
                self.actor_id,
                ClaimCreate(invoice_id=invoice.id),
            )
            self.assertIsNotNone(claim.scrub_notes)
            with self.assertRaises(ValidationAppError):
                await ledger.submit_claim(db, self.clinic_id, self.actor_id, claim.id)

    async def test_statement_uses_remaining_balance_after_adjustment(self) -> None:
        async with self.Session() as db:
            patient = await self._patient_with_plan(db, coverage_pct=0)
            invoice = await svc.create_invoice(
                db,
                self.clinic_id,
                self.actor_id,
                InvoiceCreate(
                    patient_id=patient.id,
                    line_items=[
                        InvoiceLineCreate(
                            description="Consult",
                            procedure_code="D0140",
                            unit_price=40_000,
                        )
                    ],
                ),
            )
            await ledger.add_adjustment(
                db,
                self.clinic_id,
                self.actor_id,
                invoice.id,
                AdjustmentCreate(amount=10_000, kind="write_off"),
            )
            stmt = await ledger.generate_statement(
                db,
                self.clinic_id,
                self.actor_id,
                StatementCreate(patient_id=patient.id),
            )
            self.assertEqual(stmt.balance_due, 30_000)
            rows = await ledger.list_statements(db, self.clinic_id, patient.id)
            self.assertEqual(len(rows), 1)


if __name__ == "__main__":
    unittest.main()
