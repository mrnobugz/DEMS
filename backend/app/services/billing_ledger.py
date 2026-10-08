"""Ledger, claims, remittance, and statements on top of posted invoice charges."""

from __future__ import annotations

import json
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundError, ValidationAppError
from app.models import (
    ChargeStatus,
    ClaimLineItem,
    ClaimLineStatus,
    ClaimStatus,
    Clinic,
    InsuranceClaim,
    Invoice,
    InvoiceLineItem,
    InvoiceStatus,
    LedgerAdjustment,
    Patient,
    PatientStatement,
    Payment,
)
from app.schemas import AdjustmentCreate, ClaimCreate, RemittanceCreate, StatementCreate
from app.services.domain import (
    add_payment,
    as_utc,
    estimate_patient_responsibility,
    get_invoice,
    get_primary_insurance_plan,
    write_audit,
)

# Issued invoices without an explicit due date are overdue 30 days after issue.
DUE_TERM_DAYS = 30
REVENUE_STATUSES = (
    InvoiceStatus.ISSUED,
    InvoiceStatus.PARTIALLY_PAID,
    InvoiceStatus.PAID,
)
OPEN_STATUSES = (InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID)
from app.schemas import PaymentCreate


async def apply_coverage_to_invoice(db: AsyncSession, clinic_id: str, invoice: Invoice) -> None:
    """Stamp immutable fee_charged and provisional insurance/patient split."""
    await db.refresh(invoice, attribute_names=["line_items"])
    lines = list(invoice.line_items)
    subtotal = float(invoice.subtotal or 0)
    plan = await get_primary_insurance_plan(db, clinic_id, invoice.patient_id)
    insurance_total = 0.0
    patient_total = subtotal
    if plan and subtotal > 0:
        remaining_annual = None if plan.annual_max is None else max(plan.annual_max - plan.amount_used_ytd, 0.0)
        deductible_remaining = max(plan.deductible - plan.deductible_met, 0.0)
        insurance_total, patient_total, _ = estimate_patient_responsibility(
            subtotal=subtotal,
            coverage_pct=plan.coverage_pct,
            deductible_remaining=deductible_remaining,
            remaining_annual=remaining_annual,
        )
    allocated_ins = 0.0
    allocated_pat = 0.0
    for i, line in enumerate(lines):
        fee = float(line.total or 0)
        line.fee_charged = fee
        if i == len(lines) - 1:
            ins = round(insurance_total - allocated_ins, 2)
            pat = round(patient_total - allocated_pat, 2)
        elif subtotal > 0:
            share = fee / subtotal
            ins = round(insurance_total * share, 2)
            pat = round(patient_total * share, 2)
        else:
            ins, pat = 0.0, 0.0
        allocated_ins += ins
        allocated_pat += pat
        line.estimated_insurance = ins
        line.estimated_patient = pat
        if line.charge_status == ChargeStatus.VOID:
            continue
        line.charge_status = ChargeStatus.PENDING_INSURANCE if ins > 0 else ChargeStatus.POSTED
    await db.flush()


def invoice_balance(invoice: Invoice) -> float:
    """Open balance. Void and refunded invoices no longer owe the posted total."""
    if invoice.status in (InvoiceStatus.VOID, InvoiceStatus.REFUNDED):
        return 0.0
    raw = float(invoice.total) - float(invoice.amount_paid) - float(invoice.amount_adjusted or 0)
    return round(max(raw, 0.0), 2)


def sync_invoice_status(invoice: Invoice) -> None:
    """Move draft/issued/partial/paid from the balance. Void and refunded stay put."""
    if invoice.status in (InvoiceStatus.VOID, InvoiceStatus.REFUNDED):
        return
    balance = invoice_balance(invoice)
    paid = float(invoice.amount_paid or 0)
    if balance <= 0.001:
        invoice.status = InvoiceStatus.PAID
    elif paid > 0.001:
        invoice.status = InvoiceStatus.PARTIALLY_PAID
    elif invoice.issued_at is not None:
        invoice.status = InvoiceStatus.ISSUED
    else:
        invoice.status = InvoiceStatus.DRAFT


def effective_due(invoice: Invoice) -> datetime | None:
    if invoice.due_at is not None:
        return as_utc(invoice.due_at)
    issued = invoice.issued_at or invoice.created_at
    if issued is None:
        return None
    return as_utc(issued) + timedelta(days=DUE_TERM_DAYS)


def is_overdue(invoice: Invoice, *, now: datetime | None = None) -> bool:
    if invoice.status not in OPEN_STATUSES:
        return False
    if invoice_balance(invoice) <= 0.001:
        return False
    due = effective_due(invoice)
    if due is None:
        return False
    return due < (now or datetime.now(UTC))


def _patient_bits(patient: Patient | None) -> tuple[str, str]:
    if patient is None:
        return "Patient", ""
    return f"{patient.first_name} {patient.last_name}".strip(), patient.patient_code or ""


def _in_period(value: datetime | None, start: date, end: date) -> bool:
    if value is None:
        return False
    day = as_utc(value).date()
    return start <= day <= end


def _month_start(day: date) -> date:
    return day.replace(day=1)


def _add_months(day: date, count: int) -> date:
    month_index = day.month - 1 + count
    year = day.year + month_index // 12
    month = month_index % 12 + 1
    return date(year, month, 1)


def _previous_window(start: date, end: date) -> tuple[date, date]:
    span = (end - start).days + 1
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=span - 1)
    return prev_start, prev_end


async def ensure_posted_charge(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    *,
    patient_id: str,
    idempotency_key: str,
    description: str,
    amount: float,
    line_kind: str,
    notes: str | None = None,
    procedure_code: str | None = None,
    tooth_number: str | None = None,
) -> Invoice | None:
    """Post one invoice for a clinical event. A second call updates an unpaid draft of the same key."""
    if amount <= 0:
        return None
    existing = (
        await db.execute(
            select(Invoice)
            .options(selectinload(Invoice.line_items))
            .where(Invoice.idempotency_key == idempotency_key)
        )
    ).scalar_one_or_none()
    if existing:
        if existing.clinic_id != clinic_id:
            raise ValidationAppError("This charge was already posted for another clinic")
        locked = existing.status in (InvoiceStatus.VOID, InvoiceStatus.REFUNDED, InvoiceStatus.PAID)
        locked = locked or float(existing.amount_paid or 0) > 0.001 or float(existing.amount_adjusted or 0) > 0.001
        line = existing.line_items[0] if existing.line_items else None
        if locked or line is None:
            return await get_invoice(db, clinic_id, existing.id)
        changed = abs(float(line.total or 0) - float(amount)) > 0.001 or line.description != description
        if changed:
            line.description = description[:300]
            line.quantity = 1
            line.unit_price = amount
            line.total = amount
            line.line_kind = line_kind
            line.tooth_number = tooth_number
            line.procedure_code = procedure_code
            existing.subtotal = amount
            existing.total = max(amount + float(existing.tax or 0) - float(existing.discount or 0), 0)
            existing.notes = notes
            sync_invoice_status(existing)
            await apply_coverage_to_invoice(db, clinic_id, existing)
            await db.flush()
        return await get_invoice(db, clinic_id, existing.id)

    from app.schemas import InvoiceCreate, InvoiceLineCreate
    from app.services.domain import create_invoice

    return await create_invoice(
        db,
        clinic_id,
        actor_id,
        InvoiceCreate(
            patient_id=patient_id,
            notes=notes,
            idempotency_key=idempotency_key,
            line_items=[
                InvoiceLineCreate(
                    description=description[:300],
                    quantity=1,
                    unit_price=amount,
                    line_kind=line_kind,
                    procedure_code=procedure_code,
                    tooth_number=tooth_number,
                )
            ],
        ),
    )


async def add_adjustment(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    invoice_id: str,
    data: AdjustmentCreate,
) -> Invoice:
    invoice = await get_invoice(db, clinic_id, invoice_id)
    if invoice.status == InvoiceStatus.VOID:
        raise ValidationAppError("Cannot adjust a void invoice")
    if data.amount <= 0:
        raise ValidationAppError("Adjustment amount must be positive")
    line = None
    if data.line_item_id:
        line = next((li for li in invoice.line_items if li.id == data.line_item_id), None)
        if not line:
            raise NotFoundError("Charge")
        if line.charge_status == ChargeStatus.VOID:
            raise ValidationAppError("Cannot adjust a void charge")
    remaining = invoice_balance(invoice)
    if data.amount > remaining + 0.001:
        raise ValidationAppError("Adjustment exceeds remaining balance")
    adj = LedgerAdjustment(
        clinic_id=clinic_id,
        invoice_id=invoice.id,
        line_item_id=data.line_item_id,
        amount=data.amount,
        kind=data.kind,
        notes=data.notes,
        created_by_id=actor_id,
    )
    db.add(adj)
    invoice.amount_adjusted = float(invoice.amount_adjusted or 0) + data.amount
    sync_invoice_status(invoice)
    if invoice.status == InvoiceStatus.PAID:
        for li in invoice.line_items:
            if li.charge_status not in (ChargeStatus.VOID, ChargeStatus.CLOSED):
                li.charge_status = ChargeStatus.CLOSED
    await db.flush()
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="adjust",
        resource_type="invoice",
        resource_id=invoice.id,
        after={"amount": data.amount, "kind": data.kind},
    )
    return await get_invoice(db, clinic_id, invoice.id)


async def void_invoice(db: AsyncSession, clinic_id: str, actor_id: str, invoice_id: str) -> Invoice:
    invoice = await get_invoice(db, clinic_id, invoice_id)
    if invoice.status == InvoiceStatus.VOID:
        return invoice
    if float(invoice.amount_paid) > 0.001:
        raise ValidationAppError("Void payments first, or post a reversing adjustment")
    invoice.status = InvoiceStatus.VOID
    from app.services import warehouse as stock

    await stock.ensure_locations(db, clinic_id)
    for line in invoice.line_items:
        line.charge_status = ChargeStatus.VOID
        if line.inventory_item_id:
            await stock.return_stock(
                db,
                clinic_id,
                actor_id,
                inventory_item_id=line.inventory_item_id,
                quantity=float(line.quantity),
                invoice_id=invoice.id,
                invoice_line_id=line.id,
                reason="invoice void",
            )
    await db.flush()
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="void",
        resource_type="invoice",
        resource_id=invoice.id,
        after={"status": "void"},
    )
    return await get_invoice(db, clinic_id, invoice.id)


def _scrub_charge(line: InvoiceLineItem) -> list[str]:
    issues: list[str] = []
    if not (line.procedure_code or "").strip():
        issues.append(f"{line.description}: missing procedure code")
    if line.charge_status == ChargeStatus.VOID:
        issues.append(f"{line.description}: charge is void")
    return issues


async def next_claim_number(db: AsyncSession, clinic_id: str) -> str:
    count = (
        await db.execute(select(func.count()).select_from(InsuranceClaim).where(InsuranceClaim.clinic_id == clinic_id))
    ).scalar_one()
    return f"CLM-{datetime.now(UTC).year}-{count + 1:05d}"


async def create_claim(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    data: ClaimCreate,
) -> InsuranceClaim:
    invoice = await get_invoice(db, clinic_id, data.invoice_id)
    if invoice.status == InvoiceStatus.VOID:
        raise ValidationAppError("Cannot claim a void invoice")
    existing = (
        await db.execute(
            select(InsuranceClaim).where(
                InsuranceClaim.invoice_id == invoice.id,
                InsuranceClaim.clinic_id == clinic_id,
                InsuranceClaim.status.notin_([ClaimStatus.VOID, ClaimStatus.DENIED]),
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise ValidationAppError("This invoice already has an open claim")
    claimed_ids = {
        row
        for (row,) in (
            await db.execute(
                select(ClaimLineItem.line_item_id)
                .join(InsuranceClaim)
                .where(
                    InsuranceClaim.clinic_id == clinic_id,
                    InsuranceClaim.status != ClaimStatus.VOID,
                )
            )
        ).all()
    }
    charges = [li for li in invoice.line_items if li.charge_status != ChargeStatus.VOID and li.id not in claimed_ids]
    if data.line_item_ids:
        wanted = set(data.line_item_ids)
        charges = [li for li in charges if li.id in wanted]
    if not charges:
        raise ValidationAppError("No unclaimed charges on this invoice")
    plan = await get_primary_insurance_plan(db, clinic_id, invoice.patient_id)
    issues: list[str] = []
    for line in charges:
        issues.extend(_scrub_charge(line))
    claim = InsuranceClaim(
        clinic_id=clinic_id,
        patient_id=invoice.patient_id,
        invoice_id=invoice.id,
        plan_id=plan.id if plan else None,
        claim_number=await next_claim_number(db, clinic_id),
        status=ClaimStatus.DRAFT,
        scrub_notes="; ".join(issues) if issues else None,
        notes=data.notes,
    )
    db.add(claim)
    await db.flush()
    for line in charges:
        db.add(
            ClaimLineItem(
                claim_id=claim.id,
                line_item_id=line.id,
                billed_amount=float(line.fee_charged or line.total),
                patient_responsibility=float(line.estimated_patient or 0),
                status=ClaimLineStatus.PENDING,
            )
        )
        if line.estimated_insurance > 0:
            line.charge_status = ChargeStatus.PENDING_INSURANCE
    await db.flush()
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="create",
        resource_type="claim",
        resource_id=claim.id,
        after={"invoice_id": invoice.id, "lines": len(charges)},
    )
    return await get_claim(db, clinic_id, claim.id)


async def get_claim(
    db: AsyncSession, clinic_id: str, claim_id: str, *, refresh: bool = False
) -> InsuranceClaim:
    stmt = (
        select(InsuranceClaim)
        .options(selectinload(InsuranceClaim.lines).selectinload(ClaimLineItem.charge))
        .where(InsuranceClaim.id == claim_id, InsuranceClaim.clinic_id == clinic_id)
    )
    if refresh:
        stmt = stmt.execution_options(populate_existing=True)
    claim = (await db.execute(stmt)).scalar_one_or_none()
    if not claim:
        raise NotFoundError("Claim")
    return claim


async def list_claims(
    db: AsyncSession,
    clinic_id: str,
    *,
    status: str | None = None,
    patient_id: str | None = None,
) -> list[InsuranceClaim]:
    stmt = (
        select(InsuranceClaim)
        .options(selectinload(InsuranceClaim.lines).selectinload(ClaimLineItem.charge))
        .where(InsuranceClaim.clinic_id == clinic_id)
    )
    if status:
        stmt = stmt.where(InsuranceClaim.status == status)
    if patient_id:
        stmt = stmt.where(InsuranceClaim.patient_id == patient_id)
    rows = (await db.execute(stmt.order_by(InsuranceClaim.created_at.desc()))).scalars().all()
    return list(rows)


async def submit_claim(db: AsyncSession, clinic_id: str, actor_id: str, claim_id: str) -> InsuranceClaim:
    claim = await get_claim(db, clinic_id, claim_id)
    if claim.status not in (ClaimStatus.DRAFT, ClaimStatus.DENIED):
        raise ValidationAppError("Only draft or denied claims can be submitted")
    if claim.scrub_notes:
        raise ValidationAppError(f"Claim failed scrub: {claim.scrub_notes}")
    claim.status = ClaimStatus.SUBMITTED
    claim.submitted_at = datetime.now(UTC)
    await db.flush()
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="submit",
        resource_type="claim",
        resource_id=claim.id,
        after={"status": "submitted"},
    )
    return await get_claim(db, clinic_id, claim.id)


def _refresh_charge_status(line: InvoiceLineItem) -> None:
    if line.charge_status == ChargeStatus.VOID:
        return
    billed = float(line.fee_charged or line.total or 0)
    actual_ins = float(line.actual_insurance or 0)
    if actual_ins <= 0 and float(line.estimated_insurance or 0) > 0:
        line.charge_status = ChargeStatus.PENDING_INSURANCE
        return
    if actual_ins + 0.001 >= billed:
        line.charge_status = ChargeStatus.PAID
        return
    if actual_ins > 0:
        line.charge_status = ChargeStatus.PARTIAL
        return
    line.charge_status = ChargeStatus.POSTED


async def post_remittance(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    claim_id: str,
    data: RemittanceCreate,
) -> InsuranceClaim:
    claim = await get_claim(db, clinic_id, claim_id)
    if claim.status not in (ClaimStatus.SUBMITTED, ClaimStatus.ADJUDICATED, ClaimStatus.DENIED):
        raise ValidationAppError("Remittance requires a submitted claim")
    line = next((row for row in claim.lines if row.id == data.claim_line_id), None)
    if not line:
        raise NotFoundError("Claim line")
    charge = line.charge
    billed = float(line.billed_amount or charge.fee_charged or charge.total)
    allowed = data.allowed_amount if data.allowed_amount is not None else billed
    paid = float(data.paid_amount)
    if paid < 0:
        raise ValidationAppError("Paid amount cannot be negative")
    line.allowed_amount = allowed
    line.paid_amount = paid
    patient_resp = max(allowed - paid, 0.0)
    if data.denied:
        line.status = ClaimLineStatus.DENIED
        line.denial_reason = data.denial_reason or "Denied"
        line.patient_responsibility = billed
        charge.actual_insurance = float(charge.actual_insurance or 0)
        charge.actual_patient = billed
    elif paid + 0.001 >= allowed:
        line.status = ClaimLineStatus.PAID
        line.patient_responsibility = patient_resp
        line.denial_reason = None
        charge.actual_insurance = (charge.actual_insurance or 0) + paid
        charge.actual_patient = patient_resp
    else:
        line.status = ClaimLineStatus.PARTIAL
        line.patient_responsibility = patient_resp
        line.denial_reason = data.denial_reason
        charge.actual_insurance = (charge.actual_insurance or 0) + paid
        charge.actual_patient = patient_resp
    _refresh_charge_status(charge)
    if paid > 0:
        await add_payment(
            db,
            clinic_id,
            actor_id,
            claim.invoice_id,
            PaymentCreate(
                amount=paid,
                method="insurance",
                payer_type="insurance",
                insurer=data.payer_name,
                reference=data.reference or claim.claim_number,
            ),
        )
        plan = await get_primary_insurance_plan(db, clinic_id, claim.patient_id)
        if plan:
            plan.amount_used_ytd = float(plan.amount_used_ytd or 0) + paid
    # Recording the insurance payment reloads the invoice, which expires this claim's lines.
    claim = await get_claim(db, clinic_id, claim_id, refresh=True)
    statuses = {row.status for row in claim.lines}
    if statuses <= {ClaimLineStatus.DENIED}:
        claim.status = ClaimStatus.DENIED
    elif ClaimLineStatus.PENDING in statuses:
        claim.status = ClaimStatus.SUBMITTED
    else:
        claim.status = ClaimStatus.ADJUDICATED
        claim.adjudicated_at = datetime.now(UTC)
    await db.flush()
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="remit",
        resource_type="claim",
        resource_id=claim.id,
        after={"line_id": line.id, "paid": paid, "denied": data.denied},
    )
    return await get_claim(db, clinic_id, claim.id)


async def list_denials(db: AsyncSession, clinic_id: str) -> list[dict]:
    claims = await list_claims(db, clinic_id)
    out: list[dict] = []
    for claim in claims:
        for line in claim.lines:
            if line.status not in (ClaimLineStatus.DENIED, ClaimLineStatus.PARTIAL):
                continue
            charge = line.charge
            out.append(
                {
                    "claim_id": claim.id,
                    "claim_number": claim.claim_number,
                    "claim_line_id": line.id,
                    "invoice_id": claim.invoice_id,
                    "patient_id": claim.patient_id,
                    "procedure": charge.description if charge else "",
                    "procedure_code": charge.procedure_code if charge else None,
                    "billed_amount": line.billed_amount,
                    "paid_amount": line.paid_amount,
                    "status": line.status,
                    "denial_reason": line.denial_reason,
                }
            )
    return out


async def next_statement_number(db: AsyncSession, clinic_id: str) -> str:
    count = (
        await db.execute(
            select(func.count()).select_from(PatientStatement).where(PatientStatement.clinic_id == clinic_id)
        )
    ).scalar_one()
    return f"STMT-{datetime.now(UTC).year}-{count + 1:05d}"


async def generate_statement(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    data: StatementCreate,
) -> PatientStatement:
    patient = (
        await db.execute(select(Patient).where(Patient.id == data.patient_id, Patient.clinic_id == clinic_id))
    ).scalar_one_or_none()
    if not patient:
        raise NotFoundError("Patient")
    invoices = (
        await db.execute(
            select(Invoice)
            .options(selectinload(Invoice.line_items))
            .where(
                Invoice.clinic_id == clinic_id,
                Invoice.patient_id == data.patient_id,
                Invoice.status.in_([InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID]),
            )
            .order_by(Invoice.issued_at.asc())
        )
    ).scalars().all()
    ids: list[str] = []
    balance = 0.0
    for inv in invoices:
        due = invoice_balance(inv)
        pending_ins = sum(
            max(float(li.estimated_insurance or 0) - float(li.actual_insurance or 0), 0.0)
            for li in inv.line_items
            if li.charge_status == ChargeStatus.PENDING_INSURANCE
        )
        due = max(due - pending_ins, 0.0)
        if due <= 0.001:
            continue
        ids.append(inv.id)
        balance += due
    if balance <= 0.001:
        raise ValidationAppError("No patient balance to statement")
    stmt = PatientStatement(
        clinic_id=clinic_id,
        patient_id=patient.id,
        statement_number=await next_statement_number(db, clinic_id),
        balance_due=round(balance, 2),
        due_date=data.due_date or (date.today() + timedelta(days=14)),
        notes=data.notes,
        invoice_ids=json.dumps(ids),
    )
    db.add(stmt)
    await db.flush()
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="create",
        resource_type="statement",
        resource_id=stmt.id,
        after={"balance_due": stmt.balance_due},
    )
    return stmt


async def list_statements(db: AsyncSession, clinic_id: str, patient_id: str | None = None) -> list[PatientStatement]:
    stmt = select(PatientStatement).where(PatientStatement.clinic_id == clinic_id)
    if patient_id:
        stmt = stmt.where(PatientStatement.patient_id == patient_id)
    rows = (await db.execute(stmt.order_by(PatientStatement.created_at.desc()))).scalars().all()
    return list(rows)


def _invoice_brief(inv: Invoice) -> dict:
    name, code = _patient_bits(inv.patient)
    issued = inv.issued_at or inv.created_at
    return {
        "id": inv.id,
        "invoice_number": inv.invoice_number,
        "patient_id": inv.patient_id,
        "patient_name": name,
        "patient_code": code,
        "status": inv.status,
        "total": float(inv.total or 0),
        "amount_paid": float(inv.amount_paid or 0),
        "balance": invoice_balance(inv),
        "currency": inv.currency or "TZS",
        "issued_at": issued,
        "is_overdue": is_overdue(inv),
    }


def _payment_brief(payment: Payment) -> dict:
    invoice = payment.invoice
    patient = invoice.patient if invoice is not None else None
    name, code = _patient_bits(patient)
    return {
        "id": payment.id,
        "invoice_id": payment.invoice_id,
        "invoice_number": invoice.invoice_number if invoice else "",
        "patient_id": invoice.patient_id if invoice else "",
        "patient_name": name,
        "patient_code": code,
        "amount": float(payment.amount or 0),
        "method": payment.method,
        "payer_type": payment.payer_type or "self",
        "insurer": payment.insurer,
        "paid_at": payment.paid_at,
        "reference": payment.reference,
        "currency": (invoice.currency if invoice else None) or "TZS",
    }


async def list_payments(
    db: AsyncSession,
    clinic_id: str,
    *,
    patient_id: str | None = None,
    method: str | None = None,
    paid_from: date | None = None,
    paid_to: date | None = None,
    q: str | None = None,
) -> list[dict]:
    stmt = (
        select(Payment)
        .join(Invoice, Invoice.id == Payment.invoice_id)
        .options(selectinload(Payment.invoice).selectinload(Invoice.patient))
        .where(Payment.clinic_id == clinic_id, Invoice.clinic_id == clinic_id)
    )
    if patient_id:
        stmt = stmt.where(Invoice.patient_id == patient_id)
    if method:
        stmt = stmt.where(Payment.method == method)
    if paid_from:
        start = datetime(paid_from.year, paid_from.month, paid_from.day, tzinfo=UTC)
        stmt = stmt.where(Payment.paid_at >= start)
    if paid_to:
        end = datetime(paid_to.year, paid_to.month, paid_to.day, tzinfo=UTC) + timedelta(days=1)
        stmt = stmt.where(Payment.paid_at < end)
    if q:
        needle = f"%{q.strip().lower()}%"
        stmt = stmt.join(Patient, Patient.id == Invoice.patient_id).where(
            or_(
                func.lower(Invoice.invoice_number).like(needle),
                func.lower(Patient.first_name).like(needle),
                func.lower(Patient.last_name).like(needle),
                func.lower(Patient.patient_code).like(needle),
                func.lower(func.coalesce(Payment.reference, "")).like(needle),
            )
        )
    rows = (await db.execute(stmt.order_by(Payment.paid_at.desc()))).scalars().unique().all()
    return [_payment_brief(row) for row in rows]


async def billing_summary(
    db: AsyncSession,
    clinic_id: str,
    *,
    period_start: date | None = None,
    period_end: date | None = None,
) -> dict:
    """Totals from posted invoices and payments. Outstanding is the current open balance."""
    today = datetime.now(UTC).date()
    month_start = _month_start(today)
    if period_start and period_end and period_end < period_start:
        raise ValidationAppError("The end date is before the start date")
    if period_start or period_end:
        start = period_start or month_start
        end = period_end or today
        prev_start, prev_end = _previous_window(start, end)
    else:
        start = month_start
        next_month = _add_months(month_start, 1)
        end = next_month - timedelta(days=1)
        prev_start = _add_months(month_start, -1)
        prev_end = month_start - timedelta(days=1)

    clinic = (await db.execute(select(Clinic).where(Clinic.id == clinic_id))).scalar_one()
    invoices = list(
        (
            await db.execute(
                select(Invoice)
                .options(selectinload(Invoice.patient))
                .where(Invoice.clinic_id == clinic_id)
            )
        ).scalars().all()
    )
    payments = list(
        (
            await db.execute(
                select(Payment)
                .options(selectinload(Payment.invoice).selectinload(Invoice.patient))
                .where(Payment.clinic_id == clinic_id)
            )
        ).scalars().all()
    )

    def revenue_between(window_start: date, window_end: date) -> float:
        total = 0.0
        for inv in invoices:
            if inv.status not in REVENUE_STATUSES:
                continue
            if _in_period(inv.issued_at or inv.created_at, window_start, window_end):
                total += float(inv.total or 0)
        return round(total, 2)

    outstanding = [inv for inv in invoices if inv.status in OPEN_STATUSES and invoice_balance(inv) > 0.001]
    overdue = [inv for inv in outstanding if is_overdue(inv)]
    paid = round(
        sum(float(p.amount or 0) for p in payments if _in_period(p.paid_at, start, end)),
        2,
    )
    methods: dict[str, dict[str, float | int]] = {}
    for payment in payments:
        if not _in_period(payment.paid_at, start, end):
            continue
        bucket = methods.setdefault(payment.method or "other", {"amount": 0.0, "count": 0})
        bucket["amount"] = float(bucket["amount"]) + float(payment.amount or 0)
        bucket["count"] = int(bucket["count"]) + 1
    method_rows = [
        {"method": method, "amount": round(float(row["amount"]), 2), "count": int(row["count"])}
        for method, row in methods.items()
    ]
    method_rows.sort(key=lambda row: (-float(row["amount"]), str(row["method"])))

    chart_end = _month_start(end)
    months = [_add_months(chart_end, offset) for offset in range(-11, 1)]
    by_month = {f"{day.year:04d}-{day.month:02d}": 0.0 for day in months}
    for inv in invoices:
        if inv.status not in REVENUE_STATUSES:
            continue
        issued = inv.issued_at or inv.created_at
        if issued is None:
            continue
        key = f"{as_utc(issued).year:04d}-{as_utc(issued).month:02d}"
        if key in by_month:
            by_month[key] += float(inv.total or 0)
    recent_invoices = sorted(
        invoices,
        key=lambda inv: as_utc(inv.created_at) if inv.created_at else datetime.min.replace(tzinfo=UTC),
        reverse=True,
    )[:8]
    recent_payments = sorted(
        payments,
        key=lambda payment: as_utc(payment.paid_at) if payment.paid_at else datetime.min.replace(tzinfo=UTC),
        reverse=True,
    )[:8]
    return {
        "currency": clinic.currency or "TZS",
        "period_start": start,
        "period_end": end,
        "previous_period_start": prev_start,
        "previous_period_end": prev_end,
        "revenue_this_month": revenue_between(start, end),
        "revenue_last_month": revenue_between(prev_start, prev_end),
        "outstanding_count": len(outstanding),
        "outstanding_amount": round(sum(invoice_balance(inv) for inv in outstanding), 2),
        "overdue_count": len(overdue),
        "overdue_amount": round(sum(invoice_balance(inv) for inv in overdue), 2),
        "paid_this_month": paid,
        "revenue_by_month": [{"month": key, "amount": round(amount, 2)} for key, amount in by_month.items()],
        "payment_methods": method_rows,
        "recent_invoices": [_invoice_brief(inv) for inv in recent_invoices],
        "recent_payments": [_payment_brief(payment) for payment in recent_payments],
    }
