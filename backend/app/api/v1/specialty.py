"""Specialty clinic departments: restorative rollup, maxillofacial, ortho, paediatric."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import ClinicId, DbSession, require_permission
from app.models import User
from app.schemas import (
    DepartmentOverviewOut,
    EndoCaseOut,
    OrthoAdjustmentIn,
    OrthoCaseCreate,
    OrthoCaseOut,
    OrthoCaseUpdate,
    PaediatricProfileIn,
    PaediatricProfileOut,
    PaediatricTreatmentIn,
    RestorationCaseOut,
    SurgicalCaseCreate,
    SurgicalCaseOut,
    SurgicalCaseUpdate,
    SurgicalFollowUpIn,
)
from app.services import specialty

router = APIRouter(prefix="/specialty", tags=["specialty-departments"])


@router.get("/overview", response_model=DepartmentOverviewOut)
async def overview(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("departments:read"))],
):
    _ = user
    return await specialty.clinic_departments_overview(db, clinic_id)


# ── Restorative department (clinic-wide rollup) ───────────────────────────────
@router.get("/restorative/cases", response_model=list[RestorationCaseOut])
async def restorative_cases(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("clinical:read"))],
    status: str | None = Query(None),
):
    _ = user
    return await specialty.list_restoration_cases_clinic(db, clinic_id, status=status)


@router.get("/restorative/endo-cases", response_model=list[EndoCaseOut])
async def restorative_endo_cases(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("clinical:read"))],
    status: str | None = Query(None),
):
    _ = user
    return await specialty.list_endo_cases_clinic(db, clinic_id, status=status)


# ── Maxillofacial surgery ──────────────────────────────────────────────────────
@router.get("/surgical-cases", response_model=list[SurgicalCaseOut])
async def list_surgical(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("clinical:read"))],
    status: str | None = Query(None),
    patient_id: str | None = Query(None),
):
    _ = user
    return await specialty.list_surgical_cases(db, clinic_id, status=status, patient_id=patient_id)


@router.post("/surgical-cases", response_model=SurgicalCaseOut, status_code=201)
async def create_surgical(
    body: SurgicalCaseCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("clinical:*"))],
):
    return await specialty.create_surgical_case(db, clinic_id, user.id, body.model_dump())


@router.patch("/surgical-cases/{case_id}", response_model=SurgicalCaseOut)
async def update_surgical(
    case_id: str,
    body: SurgicalCaseUpdate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("clinical:*"))],
):
    return await specialty.update_surgical_case(
        db, clinic_id, user.id, case_id, body.model_dump(exclude_unset=True)
    )


@router.post("/surgical-cases/{case_id}/follow-ups", response_model=SurgicalCaseOut, status_code=201)
async def add_surgical_follow_up(
    case_id: str,
    body: SurgicalFollowUpIn,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("clinical:*"))],
):
    _ = user
    return await specialty.add_surgical_follow_up(db, clinic_id, case_id, body.model_dump())


# ── Orthodontics ───────────────────────────────────────────────────────────────
@router.get("/ortho-cases", response_model=list[OrthoCaseOut])
async def list_ortho(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("clinical:read"))],
    status: str | None = Query(None),
    patient_id: str | None = Query(None),
):
    _ = user
    return await specialty.list_ortho_cases(db, clinic_id, status=status, patient_id=patient_id)


@router.post("/ortho-cases", response_model=OrthoCaseOut, status_code=201)
async def create_ortho(
    body: OrthoCaseCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("clinical:*"))],
):
    return await specialty.create_ortho_case(db, clinic_id, user.id, body.model_dump())


@router.patch("/ortho-cases/{case_id}", response_model=OrthoCaseOut)
async def update_ortho(
    case_id: str,
    body: OrthoCaseUpdate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("clinical:*"))],
):
    return await specialty.update_ortho_case(
        db, clinic_id, user.id, case_id, body.model_dump(exclude_unset=True)
    )


@router.post("/ortho-cases/{case_id}/adjustments", response_model=OrthoCaseOut, status_code=201)
async def add_adjustment(
    case_id: str,
    body: OrthoAdjustmentIn,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("clinical:*"))],
):
    _ = user
    return await specialty.add_ortho_adjustment(db, clinic_id, case_id, body.model_dump())


# ── Paediatrics ────────────────────────────────────────────────────────────────
@router.get("/paediatric/profiles", response_model=list[PaediatricProfileOut])
async def list_paediatric(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("clinical:read"))],
    caries_risk: str | None = Query(None),
):
    _ = user
    return await specialty.list_paediatric_profiles(db, clinic_id, caries_risk=caries_risk)


@router.get("/paediatric/patients/{patient_id}/profile", response_model=PaediatricProfileOut | None)
async def get_paediatric(
    patient_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("clinical:read"))],
):
    _ = user
    return await specialty.get_paediatric_profile(db, clinic_id, patient_id)


@router.put("/paediatric/patients/{patient_id}/profile", response_model=PaediatricProfileOut)
async def upsert_paediatric(
    patient_id: str,
    body: PaediatricProfileIn,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("clinical:*"))],
):
    return await specialty.upsert_paediatric_profile(
        db, clinic_id, user.id, patient_id, body.model_dump()
    )


@router.post(
    "/paediatric/patients/{patient_id}/treatments",
    response_model=PaediatricProfileOut,
    status_code=201,
)
async def add_paediatric_treatment(
    patient_id: str,
    body: PaediatricTreatmentIn,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("clinical:*"))],
):
    return await specialty.add_paediatric_treatment(
        db, clinic_id, user.id, patient_id, body.model_dump()
    )
