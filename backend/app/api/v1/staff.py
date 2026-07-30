from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import ClinicId, DbSession, require_permission
from app.models import User
from app.schemas import StaffCreate, StaffOut, StaffProfileOut
from app.services import departments as dept

router = APIRouter(prefix="/staff", tags=["staff"])


def _staff_out(u: User) -> StaffOut:
    profile = None
    if u.staff_profile:
        profile = StaffProfileOut.model_validate(u.staff_profile)
    return StaffOut(
        id=u.id,
        email=u.email,
        full_name=u.full_name,
        role=u.role,
        clinic_id=u.clinic_id,
        phone=u.phone,
        specialty=u.specialty,
        is_active=u.is_active,
        profile=profile,
    )


@router.get("", response_model=list[StaffOut])
async def list_staff(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("staff:*"))],
):
    _ = user
    users = await dept.list_clinic_staff(db, clinic_id)
    return [_staff_out(u) for u in users]


@router.post("", response_model=StaffOut, status_code=201)
async def invite_staff(
    body: StaffCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("staff:*"))],
):
    created = await dept.create_staff(db, clinic_id, user, body)
    # reload with profile
    users = await dept.list_clinic_staff(db, clinic_id)
    match = next(u for u in users if u.id == created.id)
    return _staff_out(match)
