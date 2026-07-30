"""Phase 2 reports + procurement + HR + Rx warnings."""

from __future__ import annotations

import json
from datetime import UTC, date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select

from app.api.deps import ClinicId, DbSession, require_any_permission, require_permission
from app.core.exceptions import NotFoundError
from app.models import (
    Appointment,
    InventoryItem,
    InventoryUsage,
    Invoice,
    InvoiceStatus,
    Patient,
    Payment,
    PurchaseOrder,
    Restoration,
    StaffLeave,
    StaffProfile,
    StaffShift,
    Supplier,
    User,
)
from app.schemas import (
    PurchaseOrderCreate,
    PurchaseOrderOut,
    RxWarnOut,
    RxWarnRequest,
    StaffLeaveCreate,
    StaffLeaveOut,
    StaffShiftCreate,
    StaffShiftOut,
    SupplierCreate,
    SupplierOut,
)
from app.services import clinical_depth as depth

router = APIRouter(tags=["phase2-ops"])

# Simple advisory allergy/drug map (never auto-blocks)
_DRUG_ALLERGY_HINTS = {
    "amoxicillin": ["penicillin", "beta-lactam", "amoxicillin"],
    "penicillin": ["penicillin", "beta-lactam"],
    "ibuprofen": ["nsaid", "ibuprofen", "aspirin"],
    "aspirin": ["aspirin", "nsaid", "salicylate"],
}


@router.get("/reports/financial")
async def financial_report(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("reports:financial"))],
):
    _ = user
    today = date.today()
    month_start = today.replace(day=1)
    day_start = datetime(today.year, today.month, today.day, tzinfo=UTC)
    payments_today = (
        await db.execute(
            select(func.coalesce(func.sum(Payment.amount), 0.0)).where(
                Payment.clinic_id == clinic_id, Payment.paid_at >= day_start
            )
        )
    ).scalar_one()
    payments_month = (
        await db.execute(
            select(func.coalesce(func.sum(Payment.amount), 0.0)).where(
                Payment.clinic_id == clinic_id,
                Payment.paid_at >= datetime(month_start.year, month_start.month, 1, tzinfo=UTC),
            )
        )
    ).scalar_one()
    outstanding = (
        await db.execute(
            select(func.coalesce(func.sum(Invoice.total - Invoice.amount_paid), 0.0)).where(
                Invoice.clinic_id == clinic_id,
                Invoice.status.in_([InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID]),
            )
        )
    ).scalar_one()
    # Simple aging buckets by issued_at
    aging = {"0_30": 0.0, "31_60": 0.0, "61_90": 0.0, "90_plus": 0.0}
    open_inv = (
        await db.execute(
            select(Invoice).where(
                Invoice.clinic_id == clinic_id,
                Invoice.status.in_([InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID]),
            )
        )
    ).scalars().all()
    now = datetime.now(UTC)
    for inv in open_inv:
        bal = float(inv.total) - float(inv.amount_paid)
        issued = inv.issued_at or inv.created_at
        days = (now - issued).days if issued else 0
        if days <= 30:
            aging["0_30"] += bal
        elif days <= 60:
            aging["31_60"] += bal
        elif days <= 90:
            aging["61_90"] += bal
        else:
            aging["90_plus"] += bal
    return {
        "revenue_today": float(payments_today or 0),
        "revenue_month": float(payments_month or 0),
        "outstanding": float(outstanding or 0),
        "aging": aging,
    }


@router.get("/reports/clinical")
async def clinical_report(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_any_permission("reports:own", "reports:financial", "reports:*"))],
):
    # clinic_admin / dentist / accountant (read clinical metrics)
    _ = user
    top = (
        await db.execute(
            select(Restoration.restoration_type, func.count())
            .where(Restoration.clinic_id == clinic_id)
            .group_by(Restoration.restoration_type)
            .order_by(func.count().desc())
            .limit(10)
        )
    ).all()
    fail = await depth.restoration_failure_rate(db, clinic_id)
    material_cost = (
        await db.execute(
            select(func.coalesce(func.sum(InventoryUsage.quantity * InventoryItem.unit_cost), 0.0))
            .select_from(InventoryUsage)
            .join(InventoryItem, InventoryItem.id == InventoryUsage.inventory_item_id)
            .where(InventoryUsage.clinic_id == clinic_id)
        )
    ).scalar_one()
    return {
        "top_procedures": [{"type": t, "count": c} for t, c in top],
        "restoration_failures": fail,
        "material_cost_used": float(material_cost or 0),
    }


@router.get("/reports/operational")
async def operational_report(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("reports:*"))],
):
    _ = user
    week_ago = datetime.now(UTC) - timedelta(days=7)
    total = (
        await db.execute(
            select(func.count())
            .select_from(Appointment)
            .where(Appointment.clinic_id == clinic_id, Appointment.starts_at >= week_ago)
        )
    ).scalar_one()
    no_shows = (
        await db.execute(
            select(func.count())
            .select_from(Appointment)
            .where(
                Appointment.clinic_id == clinic_id,
                Appointment.starts_at >= week_ago,
                Appointment.status == "no_show",
            )
        )
    ).scalar_one()
    completed = (
        await db.execute(
            select(func.count())
            .select_from(Appointment)
            .where(
                Appointment.clinic_id == clinic_id,
                Appointment.starts_at >= week_ago,
                Appointment.status == "completed",
            )
        )
    ).scalar_one()
    return {
        "appointments_7d": total,
        "completed_7d": completed,
        "no_shows_7d": no_shows,
        "no_show_rate": (no_shows / total) if total else 0.0,
        "utilization_proxy": (completed / total) if total else 0.0,
    }


# Allow dentist reports:own on clinical report; financial needs reports:financial
# Fix clinical report permission - dentists have reports:own, clinic_admin has reports:*
# has_permission("reports:own") works for dentist; for clinic_admin reports:* covers reports:own? 
# Looking at has_permission - reports:* covers reports:own via resource wildcard. Good.
# For operational, only reports:* - accountant doesn't have it. Clinic admin does. Dentist doesn't.
# Plan says dentist own for clinical - OK.

@router.get("/inventory/suppliers", response_model=list[SupplierOut])
async def list_suppliers(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("inventory:read"))],
):
    _ = user
    rows = (
        await db.execute(
            select(Supplier).where(Supplier.clinic_id == clinic_id, Supplier.is_active.is_(True))
        )
    ).scalars().all()
    return list(rows)


@router.post("/inventory/suppliers", response_model=SupplierOut, status_code=201)
async def create_supplier(
    body: SupplierCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("inventory:*"))],
):
    _ = user
    s = Supplier(
        clinic_id=clinic_id,
        name=body.name,
        contact_email=str(body.contact_email) if body.contact_email else None,
        contact_phone=body.contact_phone,
        notes=body.notes,
    )
    db.add(s)
    await db.flush()
    return s


@router.post("/inventory/purchase-orders", response_model=PurchaseOrderOut, status_code=201)
async def create_po(
    body: PurchaseOrderCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("inventory:*"))],
):
    _ = user
    po = PurchaseOrder(
        clinic_id=clinic_id,
        supplier_id=body.supplier_id,
        status="ordered",
        ordered_at=datetime.now(UTC),
        expected_at=body.expected_at,
        notes=body.notes,
        lines_json=json.dumps(body.lines),
    )
    db.add(po)
    await db.flush()
    return po


@router.get("/inventory/purchase-orders", response_model=list[PurchaseOrderOut])
async def list_pos(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("inventory:read"))],
):
    _ = user
    rows = (
        await db.execute(
            select(PurchaseOrder)
            .where(PurchaseOrder.clinic_id == clinic_id)
            .order_by(PurchaseOrder.created_at.desc())
        )
    ).scalars().all()
    return list(rows)


@router.get("/inventory/expiring")
async def expiring_stock(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("inventory:read"))],
    days: int = Query(60, ge=1, le=365),
):
    _ = user
    cutoff = date.today() + timedelta(days=days)
    rows = (
        await db.execute(
            select(InventoryItem).where(
                InventoryItem.clinic_id == clinic_id,
                InventoryItem.expiry_date.is_not(None),
                InventoryItem.expiry_date <= cutoff,
                InventoryItem.is_active.is_(True),
            )
        )
    ).scalars().all()
    return [
        {
            "id": i.id,
            "sku": i.sku,
            "name": i.name,
            "expiry_date": i.expiry_date.isoformat() if i.expiry_date else None,
            "quantity": i.quantity,
        }
        for i in rows
    ]


@router.post("/pharmacy/warn", response_model=RxWarnOut)
async def rx_warn(
    body: RxWarnRequest,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("pharmacy:read"))],
):
    _ = user
    patient = (
        await db.execute(
            select(Patient).where(Patient.id == body.patient_id, Patient.clinic_id == clinic_id)
        )
    ).scalar_one_or_none()
    if not patient:
        raise NotFoundError("Patient not found")
    allergy_blob = " ".join(
        filter(
            None,
            [
                (patient.allergies or "").lower(),
                (patient.chronic_conditions or "").lower(),
                (patient.medical_history_json or "").lower(),
            ],
        )
    )
    drug = body.drug_name.lower()
    warnings: list[str] = []
    for key, tokens in _DRUG_ALLERGY_HINTS.items():
        if key in drug:
            for tok in tokens:
                if tok in allergy_blob:
                    warnings.append(
                        f"Advisory: patient record mentions '{tok}' — review before dispensing {body.drug_name}."
                    )
                    break
    return RxWarnOut(warnings=warnings, severity="advisory" if warnings else "none")


@router.get("/staff/shifts", response_model=list[StaffShiftOut])
async def list_shifts(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("staff:*"))],
):
    _ = user
    rows = (
        await db.execute(
            select(StaffShift)
            .where(StaffShift.clinic_id == clinic_id)
            .order_by(StaffShift.starts_at.desc())
            .limit(100)
        )
    ).scalars().all()
    return list(rows)


@router.post("/staff/shifts", response_model=StaffShiftOut, status_code=201)
async def create_shift(
    body: StaffShiftCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("staff:*"))],
):
    _ = user
    s = StaffShift(clinic_id=clinic_id, **body.model_dump())
    db.add(s)
    await db.flush()
    return s


@router.get("/staff/leaves", response_model=list[StaffLeaveOut])
async def list_leaves(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("staff:*"))],
):
    _ = user
    rows = (
        await db.execute(
            select(StaffLeave)
            .where(StaffLeave.clinic_id == clinic_id)
            .order_by(StaffLeave.starts_on.desc())
        )
    ).scalars().all()
    return list(rows)


@router.post("/staff/leaves", response_model=StaffLeaveOut, status_code=201)
async def create_leave(
    body: StaffLeaveCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("staff:*"))],
):
    _ = user
    leave = StaffLeave(clinic_id=clinic_id, **body.model_dump())
    db.add(leave)
    await db.flush()
    return leave


@router.get("/staff/cert-expiring")
async def cert_expiring(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("staff:*"))],
    days: int = Query(30, ge=1, le=365),
):
    _ = user
    cutoff = date.today() + timedelta(days=days)
    rows = (
        await db.execute(
            select(StaffProfile, User)
            .join(User, User.id == StaffProfile.user_id)
            .where(
                StaffProfile.clinic_id == clinic_id,
                StaffProfile.cert_expires_at.is_not(None),
                StaffProfile.cert_expires_at <= cutoff,
            )
        )
    ).all()
    return [
        {
            "user_id": u.id,
            "full_name": u.full_name,
            "cert_expires_at": p.cert_expires_at.isoformat() if p.cert_expires_at else None,
            "title": p.title,
        }
        for p, u in rows
    ]


@router.get("/patients/hygiene-recall-due")
async def hygiene_recall_due(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("patients:read"))],
):
    _ = user
    rows = (
        await db.execute(
            select(Patient)
            .where(
                Patient.clinic_id == clinic_id,
                Patient.hygiene_recall_due.is_not(None),
                Patient.hygiene_recall_due <= date.today() + timedelta(days=14),
            )
            .order_by(Patient.hygiene_recall_due)
        )
    ).scalars().all()
    return [
        {
            "id": p.id,
            "patient_code": p.patient_code,
            "name": f"{p.first_name} {p.last_name}",
            "hygiene_recall_due": p.hygiene_recall_due.isoformat() if p.hygiene_recall_due else None,
            "perio_risk_band": p.perio_risk_band,
        }
        for p in rows
    ]
