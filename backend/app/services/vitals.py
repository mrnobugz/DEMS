"""Nurse-recorded vital signs for registered patients."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ValidationAppError
from app.models import Patient, PatientVitalSign, User
from app.schemas import PatientOut, VitalSignCreate, VitalSignOut, VitalsWorklistItemOut
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
    if not patient.is_active or patient.merged_into_id:
        raise ValidationAppError("This patient file is closed")
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


def _patient_search(q: str):
    like = f"%{q.strip()}%"
    return or_(
        Patient.first_name.ilike(like),
        Patient.middle_name.ilike(like),
        Patient.last_name.ilike(like),
        Patient.patient_code.ilike(like),
        Patient.hospital_reg_number.ilike(like),
        Patient.national_id.ilike(like),
        Patient.phone.ilike(like),
        Patient.insurance_number.ilike(like),
        Patient.email.ilike(like),
        Patient.chief_complaint.ilike(like),
    )


async def list_worklist(
    db: AsyncSession,
    clinic_id: str,
    *,
    q: str | None = None,
    status: str = "needed",
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[VitalsWorklistItemOut], int]:
    """Every active patient file. A search ignores the needed/recorded tab so any name can be found."""
    if status not in ("needed", "recorded", "all"):
        raise ValidationAppError("Status must be needed, recorded, or all")
    latest = (
        select(
            PatientVitalSign.patient_id.label("patient_id"),
            func.max(PatientVitalSign.recorded_at).label("recorded_at"),
        )
        .where(PatientVitalSign.clinic_id == clinic_id)
        .group_by(PatientVitalSign.patient_id)
        .subquery()
    )
    filters = [
        Patient.clinic_id == clinic_id,
        Patient.is_active.is_(True),
        Patient.merged_into_id.is_(None),
    ]
    searching = bool(q and q.strip())
    if searching:
        filters.append(_patient_search(q or ""))
    if not searching and status == "needed":
        filters.append(latest.c.recorded_at.is_(None))
    elif not searching and status == "recorded":
        filters.append(latest.c.recorded_at.is_not(None))

    total = int(
        (
            await db.execute(
                select(func.count(Patient.id))
                .select_from(Patient)
                .outerjoin(latest, latest.c.patient_id == Patient.id)
                .where(*filters)
            )
        ).scalar_one()
        or 0
    )
    if status == "recorded":
        order = (latest.c.recorded_at.desc(), Patient.last_name.asc())
    elif status == "needed":
        order = (Patient.created_at.desc(), Patient.last_name.asc())
    else:
        order = (
            case((latest.c.recorded_at.is_(None), 0), else_=1),
            Patient.created_at.desc(),
        )

    rows = (
        await db.execute(
            select(Patient, latest.c.recorded_at)
            .outerjoin(latest, latest.c.patient_id == Patient.id)
            .where(*filters)
            .order_by(*order)
            .limit(min(limit, 100))
            .offset(max(offset, 0))
        )
    ).all()
    items = [
        VitalsWorklistItemOut(
            patient=PatientOut.model_validate(patient),
            has_vitals=recorded_at is not None,
            last_recorded_at=recorded_at,
        )
        for patient, recorded_at in rows
    ]
    return items, total


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
