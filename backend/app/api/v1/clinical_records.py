from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import ClinicId, DbSession, require_any_permission
from app.models import User
from app.schemas import ClinicalRecordDetail, ClinicalRecordRow, Page
from app.services import clinical_records as svc

router = APIRouter(prefix="/clinical-records", tags=["clinical-records"])

READ = require_any_permission("clinical:read", "clinical:*")


@router.get("", response_model=Page[ClinicalRecordRow])
async def list_clinical_records(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(READ)],
    q: str | None = None,
    department: str | None = None,
    examiner_id: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    status: str | None = None,
    sort: str = Query("last_visit", pattern="^(last_visit|first_visit|visits|name|code)$"),
    descending: bool = True,
    limit: int = Query(25, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    items, total = await svc.list_records(
        db,
        clinic_id,
        q=q,
        department=department,
        examiner_id=examiner_id,
        date_from=date_from,
        date_to=date_to,
        status=status,
        sort=sort,
        descending=descending,
        limit=limit,
        offset=offset,
        actor=user,
    )
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/{patient_id}", response_model=ClinicalRecordDetail)
async def get_clinical_record(
    patient_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(READ)],
):
    return await svc.record_detail(db, clinic_id, patient_id, actor=user)
