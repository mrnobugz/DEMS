from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict

from app.api.deps import ClinicId, DbSession, require_any_permission, require_permission
from app.clinical import icd10 as icd10_svc
from app.core.exceptions import NotFoundError
from app.models import User
from app.schemas import (
    ChartEntryCreate,
    ChartEntryOut,
    ClinicalNoteCreate,
    ClinicalNoteOut,
    ClinicalVisitCreate,
    ClinicalVisitOut,
    ClinicalVisitUpdate,
    ConsentCreate,
    ConsentOut,
    PerioExamCreate,
    PerioExamOut,
    TreatmentPlanCreate,
    TreatmentPlanOut,
    TreatmentPlanUpdate,
)
from app.services import domain as svc

router = APIRouter(prefix="/clinical", tags=["clinical"])


class Icd10CodeOut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str
    code_compact: str
    description: str
    category: str
    category_label: str
    billable: bool


class Icd10CatalogMeta(BaseModel):
    model_config = ConfigDict(extra="forbid")
    block: str
    block_label: str
    source: str
    count: int
    categories: list[dict[str, str]]


@router.get("/patients/{patient_id}/chart", response_model=list[ChartEntryOut])
async def get_chart(
    patient_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("clinical:read"))],
):
    _ = user
    return await svc.list_chart_entries(db, clinic_id, patient_id)


@router.post("/patients/{patient_id}/chart", response_model=ChartEntryOut, status_code=201)
async def add_chart(
    patient_id: str,
    body: ChartEntryCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("clinical:*"))],
):
    return await svc.add_chart_entry(db, clinic_id, user.id, patient_id, body)


@router.get("/patients/{patient_id}/notes", response_model=list[ClinicalNoteOut])
async def list_notes(
    patient_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("clinical:read"))],
):
    _ = user
    return await svc.list_clinical_notes(db, clinic_id, patient_id)


@router.post("/patients/{patient_id}/notes", response_model=ClinicalNoteOut, status_code=201)
async def create_note(
    patient_id: str,
    body: ClinicalNoteCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("clinical:*"))],
):
    return await svc.create_clinical_note(db, clinic_id, user.id, patient_id, body)


@router.post("/patients/{patient_id}/consents", response_model=ConsentOut, status_code=201)
async def create_consent(
    patient_id: str,
    body: ConsentCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("patients:*"))],
):
    return await svc.create_consent(db, clinic_id, user.id, patient_id, body)


@router.get("/patients/{patient_id}/treatment-plans", response_model=list[TreatmentPlanOut])
async def list_treatment_plans(
    patient_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("clinical:read"))],
):
    _ = user
    return await svc.list_treatment_plans(db, clinic_id, patient_id)


@router.post("/patients/{patient_id}/treatment-plans", response_model=TreatmentPlanOut, status_code=201)
async def create_treatment_plan(
    patient_id: str,
    body: TreatmentPlanCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("clinical:*"))],
):
    return await svc.create_treatment_plan(db, clinic_id, user.id, patient_id, body)


@router.patch("/treatment-plans/{plan_id}", response_model=TreatmentPlanOut)
async def update_treatment_plan(
    plan_id: str,
    body: TreatmentPlanUpdate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("clinical:*"))],
):
    return await svc.update_treatment_plan(db, clinic_id, user.id, plan_id, body)


@router.get("/patients/{patient_id}/perio", response_model=list[PerioExamOut])
async def list_perio_exams(
    patient_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("clinical:read"))],
):
    _ = user
    return await svc.list_perio_exams(db, clinic_id, patient_id)


@router.post("/patients/{patient_id}/perio", response_model=PerioExamOut, status_code=201)
async def create_perio_exam(
    patient_id: str,
    body: PerioExamCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_any_permission("clinical:*", "clinical:limited"))],
):
    return await svc.create_perio_exam(db, clinic_id, user.id, patient_id, body)


@router.get("/patients/{patient_id}/perio/{exam_id}", response_model=PerioExamOut)
async def get_perio_exam(
    patient_id: str,
    exam_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("clinical:read"))],
):
    _ = user
    exam = await svc.get_perio_exam(db, clinic_id, exam_id)
    if exam.patient_id != patient_id:
        raise NotFoundError("Perio exam")
    return exam


@router.post(
    "/patients/{patient_id}/perio/{exam_id}/to-treatment-plan",
    response_model=TreatmentPlanOut,
    status_code=201,
)
async def perio_to_treatment_plan(
    patient_id: str,
    exam_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("clinical:*"))],
):
    exam = await svc.get_perio_exam(db, clinic_id, exam_id)
    if exam.patient_id != patient_id:
        raise NotFoundError("Perio exam")
    return await svc.perio_exam_to_treatment_plan(db, clinic_id, user.id, exam_id)


@router.get("/patients/{patient_id}/visits", response_model=list[ClinicalVisitOut])
async def list_visits(
    patient_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("clinical:read"))],
):
    _ = user
    return await svc.list_clinical_visits(db, clinic_id, patient_id)


@router.post("/patients/{patient_id}/visits", response_model=ClinicalVisitOut, status_code=201)
async def create_visit(
    patient_id: str,
    body: ClinicalVisitCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("clinical:*"))],
):
    return await svc.create_clinical_visit(db, clinic_id, user.id, patient_id, body)


@router.get("/visits/{visit_id}", response_model=ClinicalVisitOut)
async def get_visit(
    visit_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("clinical:read"))],
):
    _ = user
    return await svc.get_clinical_visit(db, clinic_id, visit_id)


@router.patch("/visits/{visit_id}", response_model=ClinicalVisitOut)
async def update_visit(
    visit_id: str,
    body: ClinicalVisitUpdate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("clinical:*"))],
):
    return await svc.update_clinical_visit(db, clinic_id, user.id, visit_id, body)


@router.get("/icd10", response_model=list[Icd10CodeOut])
async def search_icd10(
    user: Annotated[User, Depends(require_permission("clinical:read"))],
    q: str | None = Query(default=None, max_length=120),
    category: str | None = Query(default=None, max_length=8),
    billable_only: bool = False,
    limit: int = Query(40, ge=1, le=100),
):
    """Search dental ICD-10-CM codes in block K00–K14 (oral cavity & salivary glands)."""
    _ = user
    return icd10_svc.search_codes(q, category=category, billable_only=billable_only, limit=limit)


@router.get("/icd10/meta", response_model=Icd10CatalogMeta)
async def icd10_meta(
    user: Annotated[User, Depends(require_permission("clinical:read"))],
):
    _ = user
    catalog = icd10_svc.load_catalog()
    return {
        "block": catalog["block"],
        "block_label": catalog["block_label"],
        "source": catalog["source"],
        "count": catalog["count"],
        "categories": icd10_svc.categories(),
    }


@router.get("/icd10/{code}", response_model=Icd10CodeOut)
async def get_icd10(
    code: str,
    user: Annotated[User, Depends(require_permission("clinical:read"))],
):
    _ = user
    row = icd10_svc.get_code(code)
    if not row:
        raise NotFoundError("ICD-10 code")
    return row
