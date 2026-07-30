from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from app.ai import gateway as ai
from app.api.deps import ClinicId, CurrentUser, DbSession, require_permission
from app.core.rbac import Role
from app.models import User
from app.models import User as UserModel
from app.schemas import CariesRiskRequest, DashboardStats, SmartSlotRequest
from app.services import domain as svc

router = APIRouter(tags=["ops"])


class SoapDraftRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    chief_complaint: str = Field(min_length=3, max_length=1000)
    findings: str | None = None


@router.get("/dashboard/stats", response_model=DashboardStats)
async def stats(
    db: DbSession,
    clinic_id: ClinicId,
    user: CurrentUser,
):
    _ = user
    return await svc.dashboard_stats(db, clinic_id)


@router.post("/ai/caries-risk")
async def caries_risk(
    body: CariesRiskRequest,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("ai:suggest"))],
):
    _ = user
    return await ai.caries_risk_score(db, clinic_id, body.patient_id)


@router.post("/ai/smart-slots")
async def smart_slots(
    body: SmartSlotRequest,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("appointments:read"))],
):
    _ = user
    return await ai.smart_schedule_slots(
        db,
        clinic_id,
        body.dentist_id,
        body.duration_minutes,
        body.preferred_date,
    )


@router.post("/ai/soap-draft")
async def soap_draft(
    body: SoapDraftRequest,
    user: Annotated[User, Depends(require_permission("clinical:*"))],
):
    _ = user
    return await ai.draft_soap_note(body.chief_complaint, body.findings)


@router.get("/staff/dentists")
async def list_dentists(db: DbSession, clinic_id: ClinicId, user: CurrentUser):
    _ = user
    rows = (
        await db.execute(
            select(UserModel).where(
                UserModel.clinic_id == clinic_id,
                UserModel.role.in_(
                    [Role.DENTIST, Role.HYGIENIST, Role.CLINIC_ADMIN, Role.SUPER_ADMIN]
                ),
                UserModel.is_active.is_(True),
            )
        )
    ).scalars().all()
    return [
        {"id": u.id, "full_name": u.full_name, "role": u.role, "specialty": u.specialty}
        for u in rows
    ]
