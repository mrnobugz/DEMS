from typing import Annotated

from fastapi import APIRouter, Body, Depends, Query

from app.api.deps import ClinicId, DbSession, require_any_permission, require_permission
from app.models import User
from app.schemas import RequisitionCreate, RequisitionDecision, RequisitionFulfill, RequisitionOut
from app.services import requisitions as svc

router = APIRouter(prefix="/requisitions", tags=["requisitions"])

READ = require_any_permission("requisition:create", "requisition:approve", "requisition:fulfill", "requisition:*", "inventory:read")


@router.get("", response_model=list[RequisitionOut])
async def list_requisitions(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(READ)],
    status: str | None = Query(None),
    department: str | None = None,
    mine: bool = False,
    limit: int = Query(80, ge=1, le=200),
):
    return await svc.list_requisitions(
        db,
        clinic_id,
        status=status,
        department=department,
        requested_by_id=user.id if mine else None,
        limit=limit,
    )


@router.post("", response_model=RequisitionOut, status_code=201)
async def create_requisition(
    body: RequisitionCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_any_permission("requisition:create", "requisition:*"))],
):
    return await svc.create_requisition(db, clinic_id, user.id, body)


@router.get("/{requisition_id}", response_model=RequisitionOut)
async def get_requisition(
    requisition_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(READ)],
):
    _ = user
    return await svc.get_requisition(db, clinic_id, requisition_id)


@router.post("/{requisition_id}/submit", response_model=RequisitionOut)
async def submit_requisition(
    requisition_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_any_permission("requisition:create", "requisition:*"))],
):
    return await svc.submit_requisition(db, clinic_id, user.id, requisition_id)


@router.post("/{requisition_id}/approve", response_model=RequisitionOut)
async def approve_requisition(
    requisition_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_any_permission("requisition:approve", "requisition:*"))],
):
    return await svc.approve_requisition(db, clinic_id, user.id, requisition_id)


@router.post("/{requisition_id}/reject", response_model=RequisitionOut)
async def reject_requisition(
    requisition_id: str,
    body: RequisitionDecision,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_any_permission("requisition:approve", "requisition:*"))],
):
    return await svc.reject_requisition(db, clinic_id, user.id, requisition_id, reason=body.reason)


@router.post("/{requisition_id}/cancel", response_model=RequisitionOut)
async def cancel_requisition(
    requisition_id: str,
    body: RequisitionDecision,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_any_permission("requisition:create", "requisition:*"))],
):
    return await svc.cancel_requisition(db, clinic_id, user.id, requisition_id, reason=body.reason)


@router.post("/{requisition_id}/fulfill", response_model=RequisitionOut)
async def fulfill_requisition(
    requisition_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[
        User,
        Depends(require_any_permission("requisition:fulfill", "requisition:*", "inventory:issue", "inventory:*")),
    ],
    body: Annotated[RequisitionFulfill | None, Body()] = None,
):
    issue_lines = {line.line_id: line.quantity for line in body.lines} if body and body.lines else None
    return await svc.fulfill_requisition(db, clinic_id, user.id, requisition_id, issue_lines=issue_lines)
