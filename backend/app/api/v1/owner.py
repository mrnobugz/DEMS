from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.core.config import get_settings
from app.core.exceptions import ForbiddenError, ValidationAppError
from app.core.rbac import Role
from app.db.session import AsyncSessionLocal, apply_tenant_rls
from app.schemas import (
    ChainStatsOut,
    ClinicCreate,
    ClinicOut,
    ClinicUpdate,
    StaffOut,
    StaffProfileOut,
)
from app.services import departments as dept
from app.services.bootstrap import seed_demo_fabric, wipe_demo_data

router = APIRouter(prefix="/owner", tags=["owner"])
settings = get_settings()


def _staff_out(u) -> StaffOut:
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


@router.get("/clinics", response_model=list[ClinicOut])
async def list_clinics(
    db: DbSession,
    user: CurrentUser,
):
    if user.role != Role.SUPER_ADMIN:
        raise ForbiddenError("System owner only")
    await apply_tenant_rls(db, None, bypass=True)
    return await dept.list_clinics(db)


@router.post("/clinics", response_model=ClinicOut, status_code=201)
async def create_clinic(
    body: ClinicCreate,
    db: DbSession,
    user: CurrentUser,
):
    if user.role != Role.SUPER_ADMIN:
        raise ForbiddenError("System owner only")
    await apply_tenant_rls(db, None, bypass=True)
    return await dept.create_clinic(db, user, body)


@router.patch("/clinics/{clinic_id}", response_model=ClinicOut)
async def update_clinic(
    clinic_id: str,
    body: ClinicUpdate,
    db: DbSession,
    user: CurrentUser,
):
    if user.role != Role.SUPER_ADMIN:
        raise ForbiddenError("System owner only")
    await apply_tenant_rls(db, None, bypass=True)
    return await dept.update_clinic(db, user, clinic_id, body)


@router.get("/stats", response_model=ChainStatsOut)
async def owner_stats(db: DbSession, user: CurrentUser):
    if user.role != Role.SUPER_ADMIN:
        raise ForbiddenError("System owner only")
    await apply_tenant_rls(db, None, bypass=True)
    return await dept.chain_stats(db)


@router.get("/staff", response_model=list[StaffOut])
async def owner_staff(db: DbSession, user: CurrentUser):
    if user.role != Role.SUPER_ADMIN:
        raise ForbiddenError("System owner only")
    await apply_tenant_rls(db, None, bypass=True)
    users = await dept.list_all_staff(db)
    return [_staff_out(u) for u in users]


@router.post("/reseed-demo")
async def reseed_demo(user: CurrentUser):
    if user.role != Role.SUPER_ADMIN:
        raise ForbiddenError("System owner only")
    if settings.environment == "production" or not settings.allow_demo_reseed:
        raise ValidationAppError("Demo reseed is disabled")
    async with AsyncSessionLocal() as db:
        await apply_tenant_rls(db, None, bypass=True)
        await wipe_demo_data(db)
        await seed_demo_fabric(db)
        await db.commit()
    return {"status": "reseeding_complete"}
