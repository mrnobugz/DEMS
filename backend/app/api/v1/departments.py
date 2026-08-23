from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import ClinicId, DbSession, require_permission
from app.models import User
from app.schemas import ChairQueueItem, DepartmentHomeOut
from app.services import departments as dept

router = APIRouter(prefix="/departments", tags=["departments"])


@router.get("/home", response_model=DepartmentHomeOut)
async def department_home(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("departments:read"))],
):
    return await dept.department_home(db, clinic_id, user.role)


@router.get("/today-appointments", response_model=list[ChairQueueItem])
async def today_appointments(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("appointments:read"))],
    department: str | None = Query(None),
    dentist_id: str | None = Query(None),
):
    _ = user
    return await dept.list_today_appointments(
        db, clinic_id, department=department, dentist_id=dentist_id
    )
