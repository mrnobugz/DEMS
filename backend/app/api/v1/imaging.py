from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import ClinicId, DbSession, require_permission
from app.models import User
from app.schemas import ImagingStudyCreate, ImagingStudyOut
from app.services import departments as dept

router = APIRouter(prefix="/imaging", tags=["imaging"])


@router.get("/studies", response_model=list[ImagingStudyOut])
async def list_studies(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("imaging:read"))],
    patient_id: str | None = Query(None),
):
    _ = user
    return await dept.list_imaging(db, clinic_id, patient_id=patient_id)


@router.post("/studies", response_model=ImagingStudyOut, status_code=201)
async def create_study(
    body: ImagingStudyCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("imaging:*"))],
):
    return await dept.create_imaging_study(db, clinic_id, user.id, body)
