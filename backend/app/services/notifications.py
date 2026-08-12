"""Recall & Reach — pluggable notification gateway (email/SMS/WhatsApp/push)."""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundError, ValidationAppError
from app.models import (
    Appointment,
    Clinic,
    NotificationChannel,
    NotificationOutbox,
    NotificationStatus,
    Patient,
)
from app.services.domain import write_audit

logger = logging.getLogger("demsta.notifications")

TEMPLATES: dict[str, dict[str, str]] = {
    "appointment_reminder_24h": {
        "subject": "DEMSTA appointment tomorrow",
        "body": (
            "Habari {name}, your dental appointment at {clinic} is tomorrow "
            "({when}). Clinic: {clinic_phone}. — DEMSTA"
        ),
    },
    "appointment_reminder_2h": {
        "subject": "DEMSTA appointment in 2 hours",
        "body": (
            "Habari {name}, your appointment at {clinic} starts at {when}. "
            "See you soon. — DEMSTA"
        ),
    },
    "hygiene_recall_due": {
        "subject": "Hygiene recall due",
        "body": (
            "Habari {name}, your hygiene recall is due on {when}. "
            "Please call {clinic_phone} to book. — {clinic}"
        ),
    },
}


def _render(template_key: str, ctx: dict[str, Any]) -> tuple[str, str]:
    tpl = TEMPLATES.get(template_key)
    if not tpl:
        raise ValidationAppError(f"Unknown notification template: {template_key}")
    return tpl["subject"].format(**ctx), tpl["body"].format(**ctx)


async def enqueue_notification(
    db: AsyncSession,
    *,
    clinic_id: str,
    patient_id: str | None,
    template_key: str,
    channel: str = NotificationChannel.LOG,
    to_address: str | None = None,
    context: dict[str, Any] | None = None,
    scheduled_for: datetime | None = None,
    actor_id: str | None = None,
    meta: dict[str, Any] | None = None,
) -> NotificationOutbox:
    ctx = context or {}
    subject, body = _render(template_key, ctx)
    row = NotificationOutbox(
        clinic_id=clinic_id,
        patient_id=patient_id,
        channel=channel,
        template_key=template_key,
        subject=subject,
        body=body,
        status=NotificationStatus.PENDING,
        to_address=to_address,
        scheduled_for=scheduled_for or datetime.now(UTC),
        meta_json=json.dumps(meta or {}),
        created_by_id=actor_id,
    )
    db.add(row)
    await db.flush()
    return row


async def dispatch_pending(db: AsyncSession, clinic_id: str, *, limit: int = 50) -> list[NotificationOutbox]:
    """Process due outbox rows. Default provider is structured log (swap later)."""
    now = datetime.now(UTC)
    rows = list(
        (
            await db.execute(
                select(NotificationOutbox)
                .where(
                    NotificationOutbox.clinic_id == clinic_id,
                    NotificationOutbox.status == NotificationStatus.PENDING,
                    NotificationOutbox.scheduled_for <= now,
                )
                .order_by(NotificationOutbox.scheduled_for.asc())
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    for row in rows:
        try:
            # Provider swap point — email/SMS/WhatsApp adapters plug in here
            logger.info(
                "notification.sent channel=%s to=%s template=%s body=%s",
                row.channel,
                row.to_address,
                row.template_key,
                row.body,
            )
            row.status = NotificationStatus.SENT
            row.sent_at = datetime.now(UTC)
            row.error = None
        except Exception as exc:  # noqa: BLE001 — isolate provider failures
            row.status = NotificationStatus.FAILED
            row.error = str(exc)
    await db.flush()
    return rows


async def queue_appointment_reminders(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    *,
    window_hours: int = 24,
) -> dict[str, int]:
    """Queue reminders for upcoming appointments in the next `window_hours`."""
    clinic = (await db.execute(select(Clinic).where(Clinic.id == clinic_id))).scalar_one()
    now = datetime.now(UTC)
    end = now + timedelta(hours=window_hours)
    appts = list(
        (
            await db.execute(
                select(Appointment)
                .options(selectinload(Appointment.patient))
                .where(
                    Appointment.clinic_id == clinic_id,
                    Appointment.starts_at >= now,
                    Appointment.starts_at <= end,
                    Appointment.status.in_(["scheduled", "confirmed", "checked_in"]),
                )
            )
        )
        .scalars()
        .all()
    )
    queued = 0
    for appt in appts:
        patient = appt.patient
        if not patient:
            continue
        hours = (appt.starts_at - now).total_seconds() / 3600
        template = "appointment_reminder_2h" if hours <= 3 else "appointment_reminder_24h"
        channel = NotificationChannel.SMS if patient.phone else NotificationChannel.EMAIL
        to_addr = patient.phone or patient.email
        if not to_addr:
            channel = NotificationChannel.LOG
            to_addr = f"patient:{patient.patient_code}"
        await enqueue_notification(
            db,
            clinic_id=clinic_id,
            patient_id=patient.id,
            template_key=template,
            channel=channel,
            to_address=to_addr,
            context={
                "name": f"{patient.first_name} {patient.last_name}".strip(),
                "clinic": clinic.name,
                "clinic_phone": clinic.phone or "the clinic",
                "when": appt.starts_at.astimezone(UTC).strftime("%d %b %Y %H:%M UTC"),
            },
            actor_id=actor_id,
            meta={"appointment_id": appt.id},
        )
        queued += 1

    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="queue_reminders",
        resource_type="notification_outbox",
        resource_id=clinic_id,
        after={"queued": queued, "window_hours": window_hours},
    )
    sent = await dispatch_pending(db, clinic_id)
    return {"queued": queued, "dispatched": len(sent)}


async def queue_hygiene_recall_reminders(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    *,
    days_ahead: int = 14,
) -> dict[str, int]:
    clinic = (await db.execute(select(Clinic).where(Clinic.id == clinic_id))).scalar_one()
    today = datetime.now(UTC).date()
    end = today + timedelta(days=days_ahead)
    patients = list(
        (
            await db.execute(
                select(Patient).where(
                    Patient.clinic_id == clinic_id,
                    Patient.is_active.is_(True),
                    Patient.hygiene_recall_due.is_not(None),
                    Patient.hygiene_recall_due <= end,
                )
            )
        )
        .scalars()
        .all()
    )
    queued = 0
    for patient in patients:
        channel = NotificationChannel.SMS if patient.phone else NotificationChannel.EMAIL
        to_addr = patient.phone or patient.email or f"patient:{patient.patient_code}"
        if not patient.phone and not patient.email:
            channel = NotificationChannel.LOG
        await enqueue_notification(
            db,
            clinic_id=clinic_id,
            patient_id=patient.id,
            template_key="hygiene_recall_due",
            channel=channel,
            to_address=to_addr,
            context={
                "name": f"{patient.first_name} {patient.last_name}".strip(),
                "clinic": clinic.name,
                "clinic_phone": clinic.phone or "the clinic",
                "when": patient.hygiene_recall_due.isoformat() if patient.hygiene_recall_due else "",
            },
            actor_id=actor_id,
            meta={"hygiene_recall_due": str(patient.hygiene_recall_due)},
        )
        queued += 1
    sent = await dispatch_pending(db, clinic_id)
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="queue_recall_reminders",
        resource_type="notification_outbox",
        resource_id=clinic_id,
        after={"queued": queued},
    )
    return {"queued": queued, "dispatched": len(sent)}


async def list_notifications(
    db: AsyncSession, clinic_id: str, *, limit: int = 50
) -> list[NotificationOutbox]:
    return list(
        (
            await db.execute(
                select(NotificationOutbox)
                .where(NotificationOutbox.clinic_id == clinic_id)
                .order_by(NotificationOutbox.created_at.desc())
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )


async def get_notification(db: AsyncSession, clinic_id: str, notification_id: str) -> NotificationOutbox:
    row = (
        await db.execute(
            select(NotificationOutbox).where(
                NotificationOutbox.id == notification_id,
                NotificationOutbox.clinic_id == clinic_id,
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise NotFoundError("Notification")
    return row
