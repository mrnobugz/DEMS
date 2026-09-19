"""Nurse-recorded vital signs for registered patients."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ValidationAppError
from app.models import PatientVitalSign, RegistrationStatus, User
from app.schemas import VitalSignCreate, VitalSignOut
from app.services.domain import get_patient, write_audit


def _bmi(height_cm: float | None, weight_kg: float | None) -> float | None:
    if not height_cm or not weight_kg or height_cm <= 0:
        return None
    metres = height_cm / 100.0
    return round(weight_kg / (metres * metres), 1)


def to_out(row: PatientVitalSign, recorded_by_name: str | None = None) -> VitalSignOut:
    return VitalSignOut.model_validate(row).model_copy(
        update={"recorded_by_name": recorded_by_name}
    )


async def _name_for(db: AsyncSession, user_id: str | None) -> str | None:
    if not user_id:
        return None
    user = (await db.execute(select(User.full_name).where(User.id == user_id))).scalar_one_or_none()
    return user


async def list_vitals(
    db: AsyncSession,
    clinic_id: str,
    patient_id: str,
    *,
    actor: User | None = None,
    limit: int = 20,
) -> list[VitalSignOut]:
    await get_patient(db, clinic_id, patient_id, actor=actor)
    rows = list(
        (
            await db.execute(
                select(PatientVitalSign)
                .where(
                    PatientVitalSign.clinic_id == clinic_id,
                    PatientVitalSign.patient_id == patient_id,
                )
                .order_by(PatientVitalSign.recorded_at.desc())
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    names: dict[str, str | None] = {}
    out: list[VitalSignOut] = []
    for row in rows:
        if row.recorded_by_id and row.recorded_by_id not in names:
            names[row.recorded_by_id] = await _name_for(db, row.recorded_by_id)
        out.append(to_out(row, names.get(row.recorded_by_id) if row.recorded_by_id else None))
    return out


async def latest_vitals(
    db: AsyncSession,
    clinic_id: str,
    patient_id: str,
    *,
    actor: User | None = None,
) -> VitalSignOut | None:
    rows = await list_vitals(db, clinic_id, patient_id, actor=actor, limit=1)
    return rows[0] if rows else None


def visit_vitals_payload(reading: VitalSignOut | PatientVitalSign | None) -> dict[str, object] | None:
    if reading is None:
        return None
    return {
        "bp_systolic": reading.bp_systolic,
        "bp_diastolic": reading.bp_diastolic,
        "pulse": reading.pulse,
        "temperature_c": reading.temperature_c,
        "spo2": reading.spo2,
        "respiratory_rate": reading.respiratory_rate,
        "height_cm": reading.height_cm,
        "weight_kg": reading.weight_kg,
        "posture": reading.posture,
        "gait": reading.gait,
        "appearance": reading.appearance,
    }


async def record_vitals(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    patient_id: str,
    data: VitalSignCreate,
    *,
    actor: User | None = None,
) -> VitalSignOut:
    patient = await get_patient(db, clinic_id, patient_id, actor=actor)
    if patient.registration_status != RegistrationStatus.FINALIZED:
        raise ValidationAppError("Record vitals after the patient is registered")
    payload = data.model_dump()
    if not any(value not in (None, "") for value in payload.values()):
        raise ValidationAppError("Enter at least one vital sign")
    row = PatientVitalSign(
        clinic_id=clinic_id,
        patient_id=patient.id,
        recorded_by_id=actor_id,
        recorded_at=datetime.now(UTC),
        **payload,
    )
    db.add(row)
    await db.flush()
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="create",
        resource_type="patient_vitals",
        resource_id=row.id,
        after={"patient_id": patient.id, "bmi": _bmi(row.height_cm, row.weight_kg)},
    )
    return to_out(row, await _name_for(db, actor_id))


async def move_vitals_on_merge(
    db: AsyncSession,
    clinic_id: str,
    *,
    keep_id: str,
    drop_id: str,
) -> int:
    rows = list(
        (
            await db.execute(
                select(PatientVitalSign).where(
                    PatientVitalSign.clinic_id == clinic_id,
                    PatientVitalSign.patient_id == drop_id,
                )
            )
        )
        .scalars()
        .all()
    )
    for row in rows:
        row.patient_id = keep_id
    if rows:
        await db.flush()
    return len(rows)
