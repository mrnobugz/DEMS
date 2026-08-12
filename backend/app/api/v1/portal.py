from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ClinicId, CurrentUser, DbSession, require_permission
from app.core.exceptions import UnauthorizedError
from app.core.security import safe_decode
from app.core.tenant import set_tenant
from app.db.session import apply_tenant_rls, get_db
from app.models import Patient
from app.services import portal as portal_svc

router = APIRouter(prefix="/portal", tags=["portal"])
portal_oauth = OAuth2PasswordBearer(tokenUrl="/api/v1/portal/login", auto_error=False)


class PortalLoginIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    clinic_code: str = Field(min_length=2, max_length=32)
    patient_code: str = Field(min_length=2, max_length=32)
    pin: str = Field(min_length=4, max_length=32)


class PortalEnableIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pin: str = Field(min_length=4, max_length=32)


async def get_portal_patient(
    request: Request,
    token: Annotated[str | None, Depends(portal_oauth)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Patient:
    if not token:
        raise UnauthorizedError()
    payload = safe_decode(token)
    if not payload or payload.get("type") != "portal_access":
        raise UnauthorizedError("Invalid or expired portal session")
    patient_id = payload.get("sub")
    clinic_id = payload.get("clinic_id")
    if not patient_id or not clinic_id:
        raise UnauthorizedError()
    await apply_tenant_rls(db, clinic_id)
    set_tenant(clinic_id, user_id=patient_id, role="patient")
    request.state.clinic_id = clinic_id
    request.state.user_id = patient_id
    return await portal_svc.get_portal_patient(db, clinic_id, patient_id)


PortalPatient = Annotated[Patient, Depends(get_portal_patient)]


@router.post("/login")
async def portal_login(body: PortalLoginIn, db: DbSession):
    return await portal_svc.portal_login(
        db,
        clinic_code=body.clinic_code,
        patient_code=body.patient_code,
        pin=body.pin,
    )


@router.get("/home")
async def portal_home(db: DbSession, patient: PortalPatient, request: Request):
    return await portal_svc.portal_home(db, request.state.clinic_id, patient.id)


@router.post("/patients/{patient_id}/enable")
async def enable_portal(
    patient_id: str,
    body: PortalEnableIn,
    db: DbSession,
    clinic_id: ClinicId,
    _: Annotated[object, Depends(require_permission("patients:*"))],
):
    patient = await portal_svc.enable_portal_access(db, clinic_id, patient_id, body.pin)
    return {
        "id": patient.id,
        "patient_code": patient.patient_code,
        "portal_enabled": patient.portal_enabled,
    }
