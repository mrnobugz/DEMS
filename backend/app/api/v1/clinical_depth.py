"""Phase 2 restorative + endodontics routes."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import ClinicId, DbSession, require_permission
from app.models import User
from app.schemas import (
    EndoCaseCreate,
    EndoCaseOut,
    EndoCaseUpdate,
    EndoObturationIn,
    RestorationCaseCreate,
    RestorationCaseOut,
    RestorationCreate,
    RestorationOut,
    RestorationQualityIn,
    RestorationQualityOut,
    RestorationStatusUpdate,
)
from app.services import clinical_depth as depth

router = APIRouter(prefix="/clinical", tags=["clinical-depth"])


@router.get("/patients/{patient_id}/restoration-cases", response_model=list[RestorationCaseOut])
async def list_cases(
    patient_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("clinical:read"))],
):
    _ = user
    return await depth.list_restoration_cases(db, clinic_id, patient_id)


@router.post("/patients/{patient_id}/restoration-cases", response_model=RestorationCaseOut, status_code=201)
async def create_case(
    patient_id: str,
    body: RestorationCaseCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("clinical:*"))],
):
    case = await depth.create_restoration_case(
        db,
        clinic_id,
        user.id,
        patient_id,
        primary_tooth=body.primary_tooth,
        case_type=body.case_type,
        warranty_months=body.warranty_months,
        lab_case_id=body.lab_case_id,
        fee_code=body.fee_code,
        notes=body.notes,
    )
    cases = await depth.list_restoration_cases(db, clinic_id, patient_id)
    return next(c for c in cases if c.id == case.id)


@router.get("/patients/{patient_id}/restorations", response_model=list[RestorationOut])
async def list_restorations(
    patient_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("clinical:read"))],
    tooth: str | None = Query(None),
):
    _ = user
    return await depth.list_restorations(db, clinic_id, patient_id, tooth=tooth)


@router.post("/patients/{patient_id}/restorations", response_model=RestorationOut, status_code=201)
async def create_restoration(
    patient_id: str,
    body: RestorationCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("clinical:*"))],
):
    return await depth.create_restoration(
        db, clinic_id, user.id, patient_id, body.model_dump()
    )


@router.patch("/restorations/{restoration_id}/status", response_model=RestorationOut)
async def patch_restoration_status(
    restoration_id: str,
    body: RestorationStatusUpdate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("clinical:*"))],
):
    return await depth.update_restoration_status(
        db,
        clinic_id,
        user.id,
        restoration_id,
        body.status,
        inventory_item_id=body.inventory_item_id,
        inventory_qty=body.inventory_qty,
    )


@router.put("/restorations/{restoration_id}/quality", response_model=RestorationQualityOut)
async def put_quality(
    restoration_id: str,
    body: RestorationQualityIn,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("clinical:*"))],
):
    _ = user
    return await depth.upsert_restoration_quality(
        db, clinic_id, restoration_id, body.model_dump(exclude_unset=True)
    )


@router.get("/patients/{patient_id}/endo-cases", response_model=list[EndoCaseOut])
async def list_endo(
    patient_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("clinical:read"))],
):
    _ = user
    return await depth.list_endo_cases(db, clinic_id, patient_id)


@router.post("/patients/{patient_id}/endo-cases", response_model=EndoCaseOut, status_code=201)
async def create_endo(
    patient_id: str,
    body: EndoCaseCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("clinical:*"))],
):
    return await depth.create_endo_case(db, clinic_id, user.id, patient_id, body.model_dump())


@router.patch("/endo-cases/{case_id}", response_model=EndoCaseOut)
async def patch_endo(
    case_id: str,
    body: EndoCaseUpdate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("clinical:*"))],
):
    _ = user
    return await depth.update_endo_case(db, clinic_id, case_id, body.model_dump(exclude_unset=True))


@router.post("/endo-cases/{case_id}/obturations", response_model=EndoCaseOut, status_code=201)
async def add_obturation(
    case_id: str,
    body: EndoObturationIn,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("clinical:*"))],
):
    _ = user
    return await depth.add_obturation(db, clinic_id, case_id, body.model_dump())
