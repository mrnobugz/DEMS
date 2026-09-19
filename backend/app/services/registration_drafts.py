"""Unfinished front-desk registrations: save, resume, cancel.

The wizard state is stored verbatim as JSON so reception can stop mid-registration
(patient left the desk, payment not ready) and pick it up later on any device.
Drafts are never deleted: they are closed as cancelled or completed for audit.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationAppError
from app.models import RegistrationDraft, RegistrationDraftStatus, User
from app.schemas import RegistrationDraftOut, RegistrationDraftSave
from app.services.domain import write_audit

MAX_PAYLOAD_CHARS = 400_000


async def _name_for(db: AsyncSession, user_id: str | None) -> str | None:
    if not user_id:
        return None
    return (
        await db.execute(select(User.full_name).where(User.id == user_id))
    ).scalar_one_or_none()


async def to_out(db: AsyncSession, row: RegistrationDraft) -> RegistrationDraftOut:
    return RegistrationDraftOut.model_validate(row).model_copy(
        update={"created_by_name": await _name_for(db, row.created_by_id)}
    )


def _serialize(payload: dict) -> str:
    text = json.dumps(payload or {}, default=str)
    if len(text) > MAX_PAYLOAD_CHARS:
        raise ValidationAppError(
            "This draft is too large to save. Remove the identity photo or signature and try again."
        )
    return text


async def _get_row(db: AsyncSession, clinic_id: str, draft_id: str) -> RegistrationDraft:
    row = (
        await db.execute(
            select(RegistrationDraft).where(
                RegistrationDraft.clinic_id == clinic_id,
                RegistrationDraft.id == draft_id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise NotFoundError("Registration draft")
    return row


async def list_drafts(
    db: AsyncSession,
    clinic_id: str,
    *,
    status: str = RegistrationDraftStatus.OPEN,
    limit: int = 50,
) -> list[RegistrationDraftOut]:
    stmt = select(RegistrationDraft).where(RegistrationDraft.clinic_id == clinic_id)
    if status != "all":
        stmt = stmt.where(RegistrationDraft.status == status)
    stmt = stmt.order_by(RegistrationDraft.updated_at.desc()).limit(min(limit, 200))
    rows = list((await db.execute(stmt)).scalars().all())
    return [await to_out(db, row) for row in rows]


async def get_draft(db: AsyncSession, clinic_id: str, draft_id: str) -> RegistrationDraftOut:
    return await to_out(db, await _get_row(db, clinic_id, draft_id))


async def save_draft(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    data: RegistrationDraftSave,
    *,
    draft_id: str | None = None,
) -> RegistrationDraftOut:
    payload_json = _serialize(data.payload)
    display_name = (data.display_name or "").strip() or "Unnamed patient"
    summary = (data.summary or "").strip() or None
    if draft_id:
        row = await _get_row(db, clinic_id, draft_id)
        if row.status != RegistrationDraftStatus.OPEN:
            raise ValidationAppError(
                "This registration is already closed. Start a new registration instead."
            )
        row.patient_id = data.patient_id
        row.display_name = display_name
        row.summary = summary
        row.step = data.step
        row.payload_json = payload_json
        row.updated_by_id = actor_id
        action = "update"
    else:
        row = RegistrationDraft(
            clinic_id=clinic_id,
            patient_id=data.patient_id,
            created_by_id=actor_id,
            updated_by_id=actor_id,
            status=RegistrationDraftStatus.OPEN,
            display_name=display_name,
            summary=summary,
            step=data.step,
            payload_json=payload_json,
        )
        db.add(row)
        action = "create"
    await db.flush()
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action=action,
        resource_type="registration_draft",
        resource_id=row.id,
        after={"step": row.step, "patient_id": row.patient_id, "status": row.status},
    )
    return await to_out(db, row)


async def cancel_draft(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    draft_id: str,
    *,
    reason: str | None = None,
) -> RegistrationDraftOut:
    row = await _get_row(db, clinic_id, draft_id)
    if row.status == RegistrationDraftStatus.COMPLETED:
        raise ValidationAppError("This registration was already finalized")
    if row.status != RegistrationDraftStatus.CANCELLED:
        row.status = RegistrationDraftStatus.CANCELLED
        row.cancel_reason = (reason or "").strip() or None
        row.closed_at = datetime.now(UTC)
        row.updated_by_id = actor_id
        await db.flush()
        await write_audit(
            db,
            clinic_id=clinic_id,
            actor_id=actor_id,
            action="cancel",
            resource_type="registration_draft",
            resource_id=row.id,
            after={"status": row.status, "reason": row.cancel_reason},
        )
    return await to_out(db, row)


async def complete_draft(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    draft_id: str,
    *,
    patient_id: str | None = None,
) -> None:
    """Close a draft after its registration is finalized. Silently ignores unknown ids."""
    row = (
        await db.execute(
            select(RegistrationDraft).where(
                RegistrationDraft.clinic_id == clinic_id,
                RegistrationDraft.id == draft_id,
            )
        )
    ).scalar_one_or_none()
    if row is None or row.status == RegistrationDraftStatus.COMPLETED:
        return
    row.status = RegistrationDraftStatus.COMPLETED
    row.closed_at = datetime.now(UTC)
    row.updated_by_id = actor_id
    if patient_id:
        row.patient_id = patient_id
    await db.flush()
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="complete",
        resource_type="registration_draft",
        resource_id=row.id,
        after={"status": row.status, "patient_id": row.patient_id},
    )
