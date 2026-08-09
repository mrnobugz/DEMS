from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import ClinicId, DbSession, require_any_permission, require_permission
from app.models import User
from app.schemas import (
    InsuranceEstimateOut,
    PatientInsurancePlanCreate,
    PatientInsurancePlanOut,
    PatientInsurancePlanUpdate,
)
from app.services import domain as svc

router = APIRouter(prefix="/insurance", tags=["insurance"])


@router.get("/patients/{patient_id}/plans", response_model=list[PatientInsurancePlanOut])
async def list_plans(
    patient_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("patients:read"))],
):
    _ = user
    return await svc.list_insurance_plans(db, clinic_id, patient_id)


@router.post(
    "/patients/{patient_id}/plans",
    response_model=PatientInsurancePlanOut,
    status_code=201,
)
async def create_plan(
    patient_id: str,
    body: PatientInsurancePlanCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[
        User, Depends(require_any_permission("patients:*", "billing:*", "patients:update"))
    ],
):
    return await svc.upsert_insurance_plan(db, clinic_id, user.id, patient_id, body)


@router.patch("/plans/{plan_id}", response_model=PatientInsurancePlanOut)
async def patch_plan(
    plan_id: str,
    body: PatientInsurancePlanUpdate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[
        User, Depends(require_any_permission("patients:*", "billing:*", "patients:update"))
    ],
):
    return await svc.update_insurance_plan(db, clinic_id, user.id, plan_id, body)


@router.get(
    "/patients/{patient_id}/estimate",
    response_model=InsuranceEstimateOut,
)
async def estimate(
    patient_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("billing:read"))],
    amount: float | None = Query(None, ge=0),
):
    _ = user
    return await svc.insurance_estimate_for_patient(
        db, clinic_id, patient_id, amount=amount
    )
