"""Append-only domain event outbox. Publish in the same transaction as the write."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DomainEvent

APPOINTMENT_CREATED = "appointment.created"
APPOINTMENT_STATUS_CHANGED = "appointment.status_changed"
CONFIG_CHANGED = "config.changed"
PROCEDURE_COMPLETED = "procedure.completed"
STOCK_BELOW_PAR = "stock.below_par"
REQUISITION_APPROVED = "requisition.approved"
NOTE_SIGNED = "note.signed"
INVOICE_CREATED = "invoice.created"
CLAIM_DENIED = "claim.denied"


async def publish(
    db: AsyncSession,
    *,
    clinic_id: str,
    event_type: str,
    aggregate_type: str,
    aggregate_id: str,
    payload: dict[str, Any] | None = None,
    actor_id: str | None = None,
    occurred_at: datetime | None = None,
) -> DomainEvent:
    row = DomainEvent(
        clinic_id=clinic_id,
        event_type=event_type,
        aggregate_type=aggregate_type,
        aggregate_id=aggregate_id,
        payload_json=json.dumps(payload or {}, default=str),
        actor_id=actor_id,
        occurred_at=occurred_at or datetime.now(UTC),
    )
    db.add(row)
    await db.flush()
    return row


async def list_events(
    db: AsyncSession,
    clinic_id: str,
    *,
    event_type: str | None = None,
    limit: int = 100,
) -> list[DomainEvent]:
    stmt = select(DomainEvent).where(DomainEvent.clinic_id == clinic_id)
    if event_type:
        stmt = stmt.where(DomainEvent.event_type == event_type)
    stmt = stmt.order_by(DomainEvent.occurred_at.desc()).limit(min(limit, 500))
    return list((await db.execute(stmt)).scalars().all())
