from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import ClinicId, DbSession, require_any_permission, require_permission
from app.models import User
from app.schemas import Page, PatientAssignDentist, PatientCreate, PatientOut, PatientUpdate
from app.services import domain as svc

router = APIRouter(prefix="/patients", tags=["patients"])


@router.get("", response_model=Page[PatientOut])
async def list_patients(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("patients:read"))],
    q: str | None = None,
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    items, total = await svc.list_patients(
        db, clinic_id, q=q, limit=limit, offset=offset, actor=user
    )
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.post("", response_model=PatientOut, status_code=201)
async def create_patient(
    body: PatientCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("patients:*"))],
):
    return await svc.create_patient(db, clinic_id, user.id, body)


@router.get("/{patient_id}", response_model=PatientOut)
async def get_patient(
    patient_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("patients:read"))],
):
    return await svc.get_patient(db, clinic_id, patient_id, actor=user)


@router.patch("/{patient_id}", response_model=PatientOut)
async def update_patient(
    patient_id: str,
    body: PatientUpdate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("patients:update"))],
):
    # Enforce assignment scope before mutation
    await svc.get_patient(db, clinic_id, patient_id, actor=user)
    return await svc.update_patient(db, clinic_id, user.id, patient_id, body)


@router.put("/{patient_id}/primary-dentist", response_model=PatientOut)
async def assign_primary_dentist(
    patient_id: str,
    body: PatientAssignDentist,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[
        User, Depends(require_any_permission("patients:assign", "patients:*"))
    ],
):
    return await svc.assign_primary_dentist(
        db, clinic_id, user.id, patient_id, body.dentist_id
    )
