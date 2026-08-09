from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from app.api.deps import ClinicId, DbSession, require_any_permission, require_permission
from app.core.rbac import is_assignment_scoped_role
from app.models import AppointmentType, User
from app.schemas import (
    AppointmentCreate,
    AppointmentOut,
    AppointmentTypeOut,
    AppointmentUpdate,
)
from app.services import domain as svc

router = APIRouter(prefix="/appointments", tags=["appointments"])


@router.get("/types", response_model=list[AppointmentTypeOut])
async def list_types(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("appointments:read"))],
):
    _ = user
    rows = (
        await db.execute(
            select(AppointmentType).where(
                AppointmentType.clinic_id == clinic_id,
                AppointmentType.is_active.is_(True),
            )
        )
    ).scalars().all()
    return list(rows)


@router.get("", response_model=list[AppointmentOut])
async def list_appointments(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("appointments:read"))],
    start: datetime | None = None,
    end: datetime | None = None,
    dentist_id: str | None = None,
    waitlist: bool | None = Query(default=None),
):
    scoped_dentist = dentist_id
    if is_assignment_scoped_role(user.role) and not dentist_id:
        scoped_dentist = user.id
    return await svc.list_appointments(
        db,
        clinic_id,
        start=start,
        end=end,
        dentist_id=scoped_dentist,
        waitlist=waitlist,
    )


@router.post("", response_model=AppointmentOut, status_code=201)
async def create_appointment(
    body: AppointmentCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("appointments:*"))],
):
    return await svc.create_appointment(db, clinic_id, user.id, body)


@router.patch("/{appointment_id}", response_model=AppointmentOut)
async def update_appointment(
    appointment_id: str,
    body: AppointmentUpdate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[
        User,
        Depends(require_any_permission("appointments:*", "appointments:update_own")),
    ],
):
    return await svc.update_appointment(
        db, clinic_id, user.id, appointment_id, body, actor=user
    )
