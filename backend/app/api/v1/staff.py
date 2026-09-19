from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import ClinicId, DbSession, require_permission
from app.core.rbac import catalog_payload
from app.models import User
from app.schemas import (
    PermissionCatalogOut,
    RoleCatalogOut,
    StaffCreate,
    StaffOut,
    StaffPasswordReset,
    StaffUpdate,
)
from app.services import config_setup as setup
from app.services import departments as dept

router = APIRouter(prefix="/staff", tags=["staff"])


@router.get("/roles", response_model=list[RoleCatalogOut])
async def list_roles(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("staff:*"))],
):
    return await setup.matrix_payload(db, clinic_id, user.role)


@router.get("/permissions", response_model=list[PermissionCatalogOut])
async def list_permissions(
    user: Annotated[User, Depends(require_permission("staff:*"))],
):
    _ = user
    return catalog_payload()


@router.get("", response_model=list[StaffOut])
async def list_staff(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("staff:*"))],
):
    _ = user
    users = await dept.list_clinic_staff(db, clinic_id)
    await dept.attach_role_grants(db, clinic_id, users)
    return [dept.to_staff_out(u) for u in users]


@router.post("", response_model=StaffOut, status_code=201)
async def invite_staff(
    body: StaffCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("staff:*"))],
):
    created = await dept.create_staff(db, clinic_id, user, body)
    loaded = await dept.get_clinic_staff(db, clinic_id, created.id)
    await dept.attach_role_grants(db, clinic_id, [loaded])
    return dept.to_staff_out(loaded)


@router.get("/{staff_id}", response_model=StaffOut)
async def get_staff(
    staff_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("staff:*"))],
):
    _ = user
    loaded = await dept.get_clinic_staff(db, clinic_id, staff_id)
    await dept.attach_role_grants(db, clinic_id, [loaded])
    return dept.to_staff_out(loaded)


@router.patch("/{staff_id}", response_model=StaffOut)
async def patch_staff(
    staff_id: str,
    body: StaffUpdate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("staff:*"))],
):
    updated = await dept.update_staff(db, clinic_id, user, staff_id, body)
    await dept.attach_role_grants(db, clinic_id, [updated])
    return dept.to_staff_out(updated)


@router.post("/{staff_id}/password", response_model=StaffOut)
async def reset_password(
    staff_id: str,
    body: StaffPasswordReset,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("staff:*"))],
):
    updated = await dept.reset_staff_password(db, clinic_id, user, staff_id, body.password)
    return dept.to_staff_out(updated)
