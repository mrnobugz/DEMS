"""Phase 2 reports + procurement + HR + Rx warnings."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from app.api.deps import ClinicId, DbSession, require_any_permission, require_permission
from app.core.rbac import user_has_any_permission
from app.models import (
    Patient,
    StaffLeave,
    StaffProfile,
    StaffShift,
    User,
)
from app.schemas import (
    RxWarnOut,
    RxWarnRequest,
    StaffLeaveCreate,
    StaffLeaveOut,
    StaffShiftCreate,
    StaffShiftOut,
)
from app.services import reports as report_svc

router = APIRouter(tags=["phase2-ops"])


@router.get("/reports/financial")
async def financial_report(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_any_permission("reports:financial", "reports:*"))],
    days: int = Query(30, ge=1, le=365),
):
    _ = user
    return await report_svc.financial_report(db, clinic_id, days=days)


@router.get("/reports/clinical")
async def clinical_report(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_any_permission("reports:own", "reports:financial", "reports:*"))],
    days: int = Query(30, ge=1, le=365),
):
    clinic_wide = user_has_any_permission(user, "reports:financial", "reports:*")
    provider_id = None if clinic_wide else user.id
    return await report_svc.clinical_report(db, clinic_id, days=days, provider_id=provider_id)


@router.get("/reports/operational")
async def operational_report(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_any_permission("reports:*", "reports:financial"))],
    days: int = Query(7, ge=1, le=365),
):
    _ = user
    return await report_svc.operational_report(db, clinic_id, days=days)


@router.post("/pharmacy/warn", response_model=RxWarnOut)
async def rx_warn(
    body: RxWarnRequest,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("pharmacy:read"))],
):
    _ = user
    from app.services.pharmacy import drug_warnings

    warnings = await drug_warnings(db, clinic_id, body.patient_id, body.drug_name)
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
