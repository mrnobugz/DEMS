from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import ClinicId, DbSession, require_permission
from app.models import User
from app.schemas import (
    DrugTemplateCreate,
    DrugTemplateOut,
    PrescriptionCreate,
    PrescriptionOut,
    PrescriptionStatusUpdate,
)
from app.services import departments as dept

router = APIRouter(prefix="/pharmacy", tags=["pharmacy"])


@router.get("/templates", response_model=list[DrugTemplateOut])
async def list_templates(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("pharmacy:read"))],
):
    _ = user
    return await dept.list_drug_templates(db, clinic_id)


@router.post("/templates", response_model=DrugTemplateOut, status_code=201)
async def create_template(
    body: DrugTemplateCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("pharmacy:*"))],
):
    _ = user
    return await dept.create_drug_template(db, clinic_id, body)


@router.get("/prescriptions", response_model=list[PrescriptionOut])
async def list_rx(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("pharmacy:read"))],
    patient_id: str | None = Query(None),
):
    _ = user
    return await dept.list_prescriptions(db, clinic_id, patient_id=patient_id)


@router.post("/prescriptions", response_model=PrescriptionOut, status_code=201)
async def create_rx(
    body: PrescriptionCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("pharmacy:*"))],
):
    return await dept.create_prescription(db, clinic_id, user.id, body)


@router.patch("/prescriptions/{rx_id}", response_model=PrescriptionOut)
async def update_rx_status(
    rx_id: str,
    body: PrescriptionStatusUpdate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("pharmacy:*"))],
):
    _ = user
    return await dept.update_prescription_status(db, clinic_id, rx_id, body.status)
