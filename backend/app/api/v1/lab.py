from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import ClinicId, DbSession, require_permission
from app.models import User
from app.schemas import LabCaseCreate, LabCaseOut, LabCaseUpdate
from app.services import departments as dept

router = APIRouter(prefix="/lab", tags=["lab"])


@router.get("/cases", response_model=list[LabCaseOut])
async def list_cases(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("lab:read"))],
    status: str | None = Query(None),
):
    _ = user
    return await dept.list_lab_cases(db, clinic_id, status=status)


@router.post("/cases", response_model=LabCaseOut, status_code=201)
async def create_case(
    body: LabCaseCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("lab:*"))],
):
    return await dept.create_lab_case(db, clinic_id, user, body)


@router.patch("/cases/{case_id}", response_model=LabCaseOut)
async def update_case(
    case_id: str,
    body: LabCaseUpdate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("lab:*"))],
):
    _ = user
    return await dept.update_lab_case(db, clinic_id, case_id, body)
