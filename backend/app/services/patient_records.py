"""Lean patient-record extras: safety list, duplicate hints, merge."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.models import Patient, PatientSafetyItem
from app.schemas.clerkship import MedicalHistoryFlags, loads_block
from app.services.config import deactivate
from app.services.domain import get_patient, write_audit
from app.services import events as bus

SAFETY_KINDS = ("allergy", "condition", "medication", "alert")
MERGE_COPY_FIELDS = (
    "phone",
    "email",
    "national_id",
    "date_of_birth",
    "sex",
    "address",
    "emergency_contact_name",
    "emergency_contact_phone",
    "next_of_kin",
    "next_of_kin_phone",
    "pregnancy_trimester",
    "current_medications",
    "chronic_conditions",
    "photo_storage_key",
    "photo_content_type",
    "guarantor_patient_id",
)
PATIENT_MERGED = "patient.merged"


async def list_safety(
    db: AsyncSession, clinic_id: str, patient_id: str, *, include_inactive: bool = False
) -> list[PatientSafetyItem]:
    await get_patient(db, clinic_id, patient_id)
    stmt = select(PatientSafetyItem).where(
        PatientSafetyItem.clinic_id == clinic_id,
        PatientSafetyItem.patient_id == patient_id,
    )
    if not include_inactive:
        stmt = stmt.where(PatientSafetyItem.is_active.is_(True))
    return list(
        (await db.execute(stmt.order_by(PatientSafetyItem.kind, PatientSafetyItem.label))).scalars()
    )


async def safety_summary(db: AsyncSession, clinic_id: str, patient_id: str) -> dict[str, Any]:
    patient = await get_patient(db, clinic_id, patient_id)
    items = await list_safety(db, clinic_id, patient_id)
    flags = loads_block(patient.medical_history_json, MedicalHistoryFlags)
    return {
        "patient_id": patient.id,
        "pregnancy_trimester": patient.pregnancy_trimester,
        "latex_allergy": bool(flags.latex_allergy),
        "history_reviewed_at": patient.medical_history_reviewed_at,
        "merged_into_id": patient.merged_into_id,
        "items": items,
        "allergies_text": patient.allergies,
        "conditions_text": patient.chronic_conditions,
        "medications_text": patient.current_medications,
    }


async def add_safety_item(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str | None,
    patient_id: str,
    *,
    kind: str,
    code: str,
    label: str,
    notes: str | None = None,
) -> PatientSafetyItem:
    await get_patient(db, clinic_id, patient_id)
    if kind not in SAFETY_KINDS:
        raise ValidationAppError("kind must be allergy, condition, medication, or alert")
    code = code.strip().lower().replace(" ", "_")
    label = label.strip()
    if not code or not label:
        raise ValidationAppError("code and label are required")
    dup = (
        await db.execute(
            select(PatientSafetyItem).where(
                PatientSafetyItem.clinic_id == clinic_id,
                PatientSafetyItem.patient_id == patient_id,
                PatientSafetyItem.kind == kind,
                PatientSafetyItem.code == code,
            )
        )
    ).scalar_one_or_none()
    if dup:
        if not dup.is_active:
            dup.is_active = True
            dup.deactivated_at = None
            dup.deactivated_by_id = None
            dup.label = label
            dup.notes = notes
            await db.flush()
            return dup
        raise ConflictError("That safety item already exists")
    row = PatientSafetyItem(
        clinic_id=clinic_id,
        patient_id=patient_id,
        kind=kind,
        code=code,
        label=label,
        notes=notes,
    )
    db.add(row)
    await db.flush()
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="create",
        resource_type="patient_safety",
        resource_id=row.id,
        after={"patient_id": patient_id, "kind": kind, "code": code, "label": label},
    )
    return row


async def deactivate_safety_item(
    db: AsyncSession, clinic_id: str, actor_id: str | None, patient_id: str, item_id: str
) -> PatientSafetyItem:
    await get_patient(db, clinic_id, patient_id)
    row = (
        await db.execute(
            select(PatientSafetyItem).where(
                PatientSafetyItem.id == item_id,
                PatientSafetyItem.clinic_id == clinic_id,
                PatientSafetyItem.patient_id == patient_id,
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise NotFoundError("Safety item")
    await deactivate(db, row, clinic_id=clinic_id, actor_id=actor_id, resource_type="patient_safety")
    return row


async def mark_history_reviewed(
    db: AsyncSession, clinic_id: str, actor_id: str | None, patient_id: str
) -> Patient:
    patient = await get_patient(db, clinic_id, patient_id)
    patient.medical_history_reviewed_at = datetime.now(UTC)
    await db.flush()
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="update",
        resource_type="patient",
        resource_id=patient.id,
        after={"medical_history_reviewed_at": patient.medical_history_reviewed_at.isoformat()},
    )
    return patient


async def find_duplicates(db: AsyncSession, clinic_id: str, patient: Patient) -> list[Patient]:
    clauses = []
    if patient.national_id:
        clauses.append(Patient.national_id == patient.national_id)
    if patient.phone:
        clauses.append(Patient.phone == patient.phone)
    if patient.email:
        clauses.append(Patient.email == patient.email)
    name_match = (func.lower(Patient.first_name) == patient.first_name.lower()) & (
        func.lower(Patient.last_name) == patient.last_name.lower()
    )
    clauses.append(name_match)
    stmt = (
        select(Patient)
        .where(
            Patient.clinic_id == clinic_id,
            Patient.id != patient.id,
            Patient.is_active.is_(True),
            Patient.merged_into_id.is_(None),
            or_(*clauses),
        )
        .order_by(Patient.created_at.desc())
        .limit(8)
    )
    return list((await db.execute(stmt)).scalars())


async def merge_patients(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str | None,
    *,
    keep_id: str,
    drop_id: str,
) -> Patient:
    if keep_id == drop_id:
        raise ValidationAppError("Cannot merge a patient into itself")
    keep = await get_patient(db, clinic_id, keep_id)
    drop = await get_patient(db, clinic_id, drop_id)
    if keep.merged_into_id or not keep.is_active:
        raise ValidationAppError("The surviving patient is already merged or inactive")
    if drop.merged_into_id:
        raise ValidationAppError("That record is already merged")

    copied: list[str] = []
    for field in MERGE_COPY_FIELDS:
        if getattr(keep, field) in (None, "") and getattr(drop, field) not in (None, ""):
            setattr(keep, field, getattr(drop, field))
            copied.append(field)
    if keep.allergies and drop.allergies and drop.allergies not in keep.allergies:
        keep.allergies = f"{keep.allergies}; {drop.allergies}"
        copied.append("allergies")
    elif not keep.allergies and drop.allergies:
        keep.allergies = drop.allergies
        copied.append("allergies")

    drop_items = await list_safety(db, clinic_id, drop.id, include_inactive=True)
    keep_keys = {(row.kind, row.code) for row in await list_safety(db, clinic_id, keep.id, include_inactive=True)}
    for item in drop_items:
        key = (item.kind, item.code)
        if key in keep_keys:
            if item.is_active:
                await deactivate(
                    db, item, clinic_id=clinic_id, actor_id=actor_id, resource_type="patient_safety"
                )
            continue
        item.patient_id = keep.id
        keep_keys.add(key)

    from app.services.vitals import move_vitals_on_merge

    await move_vitals_on_merge(db, clinic_id, keep_id=keep.id, drop_id=drop.id)

    drop.merged_into_id = keep.id
    drop.is_active = False
    await db.flush()
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="merge",
        resource_type="patient",
        resource_id=keep.id,
        before={"drop_id": drop.id, "drop_code": drop.patient_code},
        after={"copied": copied},
    )
    await bus.publish(
        db,
        clinic_id=clinic_id,
        event_type=PATIENT_MERGED,
        aggregate_type="patient",
        aggregate_id=keep.id,
        payload={"drop_id": drop.id, "drop_code": drop.patient_code, "copied": copied},
        actor_id=actor_id,
    )
    return keep
