from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ClinicId, CurrentUser, DbSession, require_permission
from app.services import notifications as notif_svc

router = APIRouter(prefix="/notifications", tags=["notifications"])


class ReminderQueueIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    window_hours: int = Field(default=24, ge=1, le=168)


class RecallQueueIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    days_ahead: int = Field(default=14, ge=1, le=90)


@router.post("/reminders/appointments")
async def queue_appointment_reminders(
    body: ReminderQueueIn,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[object, Depends(require_permission("notifications:send"))],
):
    return await notif_svc.queue_appointment_reminders(
        db, clinic_id, user.id, window_hours=body.window_hours
    )


@router.post("/reminders/hygiene-recall")
async def queue_hygiene_recall(
    body: RecallQueueIn,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[object, Depends(require_permission("notifications:send"))],
):
    return await notif_svc.queue_hygiene_recall_reminders(
        db, clinic_id, user.id, days_ahead=body.days_ahead
    )


@router.get("")
async def list_notifications(
    db: DbSession,
    clinic_id: ClinicId,
    _: Annotated[object, Depends(require_permission("notifications:read"))],
):
    rows = await notif_svc.list_notifications(db, clinic_id)
    return [
        {
            "id": r.id,
            "channel": r.channel,
            "template_key": r.template_key,
            "subject": r.subject,
            "body": r.body,
            "status": r.status,
            "to_address": r.to_address,
            "scheduled_for": r.scheduled_for.isoformat() if r.scheduled_for else None,
            "sent_at": r.sent_at.isoformat() if r.sent_at else None,
            "patient_id": r.patient_id,
            "error": r.error,
        }
        for r in rows
    ]
