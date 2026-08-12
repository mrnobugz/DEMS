"""Patient portal — limited self-service (plans, appointments, invoices)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundError, UnauthorizedError, ValidationAppError
from app.core.security import create_access_token, hash_password, verify_password
from app.models import Appointment, Clinic, Invoice, Patient, TreatmentPlan


async def enable_portal_access(
    db: AsyncSession, clinic_id: str, patient_id: str, pin: str
) -> Patient:
    if len(pin) < 4:
        raise ValidationAppError("Portal PIN must be at least 4 characters")
    patient = (
        await db.execute(
            select(Patient).where(Patient.id == patient_id, Patient.clinic_id == clinic_id)
        )
    ).scalar_one_or_none()
    if not patient:
        raise NotFoundError("Patient")
    patient.portal_enabled = True
    patient.portal_pin_hash = hash_password(pin)
    await db.flush()
    return patient


async def portal_login(
    db: AsyncSession, *, clinic_code: str, patient_code: str, pin: str
) -> dict:
    clinic = (
        await db.execute(
            select(Clinic).where(Clinic.code == clinic_code.strip().upper(), Clinic.is_active.is_(True))
        )
    ).scalar_one_or_none()
    if not clinic:
        raise UnauthorizedError("Invalid clinic or credentials")

    patient = (
        await db.execute(
            select(Patient).where(
                Patient.clinic_id == clinic.id,
                Patient.patient_code == patient_code.strip().upper(),
                Patient.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if (
        not patient
        or not patient.portal_enabled
        or not patient.portal_pin_hash
        or not verify_password(pin, patient.portal_pin_hash)
    ):
        raise UnauthorizedError("Invalid clinic or credentials")

    token = create_access_token(
        patient.id,
        {
            "type": "portal_access",
            "clinic_id": clinic.id,
            "role": "patient",
            "patient_code": patient.patient_code,
        },
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "patient": {
            "id": patient.id,
            "patient_code": patient.patient_code,
            "first_name": patient.first_name,
            "last_name": patient.last_name,
            "clinic_id": clinic.id,
            "clinic_code": clinic.code,
            "clinic_name": clinic.name,
            "currency": clinic.currency,
        },
    }


async def get_portal_patient(db: AsyncSession, clinic_id: str, patient_id: str) -> Patient:
    patient = (
        await db.execute(
            select(Patient).where(
                Patient.id == patient_id,
                Patient.clinic_id == clinic_id,
                Patient.is_active.is_(True),
                Patient.portal_enabled.is_(True),
            )
        )
    ).scalar_one_or_none()
    if not patient:
        raise UnauthorizedError("Portal session invalid")
    return patient


async def portal_home(db: AsyncSession, clinic_id: str, patient_id: str) -> dict:
    patient = await get_portal_patient(db, clinic_id, patient_id)
    clinic = (await db.execute(select(Clinic).where(Clinic.id == clinic_id))).scalar_one()

    appointments = list(
        (
            await db.execute(
                select(Appointment)
                .where(Appointment.clinic_id == clinic_id, Appointment.patient_id == patient_id)
                .order_by(Appointment.starts_at.desc())
                .limit(10)
            )
        )
        .scalars()
        .all()
    )
    invoices = list(
        (
            await db.execute(
                select(Invoice)
                .options(selectinload(Invoice.line_items), selectinload(Invoice.payments))
                .where(Invoice.clinic_id == clinic_id, Invoice.patient_id == patient_id)
                .order_by(Invoice.created_at.desc())
                .limit(10)
            )
        )
        .scalars()
        .all()
    )
    plans = list(
        (
            await db.execute(
                select(TreatmentPlan)
                .options(selectinload(TreatmentPlan.items))
                .where(
                    TreatmentPlan.clinic_id == clinic_id,
                    TreatmentPlan.patient_id == patient_id,
                )
                .order_by(TreatmentPlan.created_at.desc())
                .limit(5)
            )
        )
        .scalars()
        .all()
    )

    return {
        "patient": {
            "id": patient.id,
            "patient_code": patient.patient_code,
            "first_name": patient.first_name,
            "last_name": patient.last_name,
            "hygiene_recall_due": patient.hygiene_recall_due.isoformat()
            if patient.hygiene_recall_due
            else None,
        },
        "clinic": {
            "id": clinic.id,
            "code": clinic.code,
            "name": clinic.name,
            "currency": clinic.currency,
            "phone": clinic.phone,
        },
        "appointments": [
            {
                "id": a.id,
                "starts_at": a.starts_at.isoformat() if a.starts_at else None,
                "status": a.status,
                "reason": a.reason,
                "chair_number": a.chair_number,
            }
            for a in appointments
        ],
        "invoices": [
            {
                "id": inv.id,
                "invoice_number": inv.invoice_number,
                "status": inv.status,
                "total": inv.total,
                "amount_paid": inv.amount_paid,
                "balance": max(inv.total - inv.amount_paid, 0),
                "currency": inv.currency,
                "issued_at": inv.issued_at.isoformat() if inv.issued_at else None,
            }
            for inv in invoices
        ],
        "treatment_plans": [
            {
                "id": p.id,
                "title": p.title,
                "status": p.status,
                "items": [
                    {
                        "phase_name": i.phase_name,
                        "procedure_name": i.procedure_name,
                        "estimated_fee": i.estimated_fee,
                        "status": i.status,
                    }
                    for i in (p.items or [])
                ],
            }
            for p in plans
        ],
    }
