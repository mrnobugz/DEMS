"""Specialty clinic departments: restorative rollup, maxillofacial, ortho, paediatric.

Restorative records themselves live in clinical_depth (Surface-True Restorative Graph);
this module adds the clinic-wide department views plus the three net-new departments.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import set_committed_value

from app.core.exceptions import NotFoundError, ValidationAppError
from app.models import (
    EndoCase,
    OrthoAdjustment,
    OrthoCase,
    OrthoCaseStatus,
    PaediatricProfile,
    PaediatricTreatment,
    Patient,
    Restoration,
    RestorationCase,
    SurgicalCase,
    SurgicalCaseStatus,
    SurgicalFollowUp,
)
from app.services.domain import write_audit

SURGICAL_STATUSES = {s.value for s in SurgicalCaseStatus}
ORTHO_STATUSES = {s.value for s in OrthoCaseStatus}
_SURGICAL_OPEN = (
    SurgicalCaseStatus.PLANNED,
    SurgicalCaseStatus.SCHEDULED,
    SurgicalCaseStatus.FOLLOW_UP,
)


async def _get_patient(db: AsyncSession, clinic_id: str, patient_id: str) -> Patient:
    patient = (
        await db.execute(
            select(Patient).where(Patient.id == patient_id, Patient.clinic_id == clinic_id)
        )
    ).scalar_one_or_none()
    if not patient:
        raise NotFoundError("Patient not found")
    return patient


def _attach_patient_name(rows: list, names: dict[str, str]) -> None:
    for row in rows:
        row.patient_name = names.get(row.patient_id)


async def _patient_names(db: AsyncSession, clinic_id: str, patient_ids: set[str]) -> dict[str, str]:
    if not patient_ids:
        return {}
    result = await db.execute(
        select(Patient.id, Patient.first_name, Patient.last_name).where(
            Patient.clinic_id == clinic_id, Patient.id.in_(patient_ids)
        )
    )
    return {pid: f"{first} {last}" for pid, first, last in result.all()}


# ── Department overview (Clinic dropdown landing) ─────────────────────────────
async def clinic_departments_overview(db: AsyncSession, clinic_id: str) -> dict:
    async def count(stmt) -> int:
        return int((await db.execute(stmt)).scalar() or 0)

    today = datetime.now(UTC).date()
    week_ahead = datetime.now(UTC) + timedelta(days=7)

    return {
        "restorative_open_cases": await count(
            select(func.count(RestorationCase.id)).where(
                RestorationCase.clinic_id == clinic_id,
                RestorationCase.status.notin_(("completed", "failed")),
            )
        ),
        "restorative_planned": await count(
            select(func.count(Restoration.id)).where(
                Restoration.clinic_id == clinic_id, Restoration.status == "planned"
            )
        ),
        "endo_in_progress": await count(
            select(func.count(EndoCase.id)).where(
                EndoCase.clinic_id == clinic_id, EndoCase.status == "in_progress"
            )
        ),
        "surgical_open": await count(
            select(func.count(SurgicalCase.id)).where(
                SurgicalCase.clinic_id == clinic_id,
                SurgicalCase.status.in_([s.value for s in _SURGICAL_OPEN]),
            )
        ),
        "surgical_scheduled_week": await count(
            select(func.count(SurgicalCase.id)).where(
                SurgicalCase.clinic_id == clinic_id,
                SurgicalCase.status == SurgicalCaseStatus.SCHEDULED,
                SurgicalCase.scheduled_at.isnot(None),
                SurgicalCase.scheduled_at <= week_ahead,
            )
        ),
        "ortho_active": await count(
            select(func.count(OrthoCase.id)).where(
                OrthoCase.clinic_id == clinic_id,
                OrthoCase.status.in_((OrthoCaseStatus.ACTIVE, OrthoCaseStatus.RETENTION)),
            )
        ),
        "ortho_reviews_due": await count(
            select(func.count(OrthoCase.id)).where(
                OrthoCase.clinic_id == clinic_id,
                OrthoCase.status.in_((OrthoCaseStatus.ACTIVE, OrthoCaseStatus.RETENTION)),
                OrthoCase.next_review_due.isnot(None),
                OrthoCase.next_review_due <= today,
            )
        ),
        "paediatric_profiles": await count(
            select(func.count(PaediatricProfile.id)).where(
                PaediatricProfile.clinic_id == clinic_id
            )
        ),
        "paediatric_fluoride_due": await count(
            select(func.count(PaediatricProfile.id)).where(
                PaediatricProfile.clinic_id == clinic_id,
                PaediatricProfile.fluoride_next.isnot(None),
                PaediatricProfile.fluoride_next <= today,
            )
        ),
    }


# ── Restorative department (clinic-wide rollup over clinical_depth data) ──────
async def list_restoration_cases_clinic(
    db: AsyncSession, clinic_id: str, *, status: str | None = None
) -> list[RestorationCase]:
    q = (
        select(RestorationCase)
        .where(RestorationCase.clinic_id == clinic_id)
        .options(selectinload(RestorationCase.restorations).selectinload(Restoration.quality))
        .order_by(RestorationCase.created_at.desc())
        .limit(200)
    )
    if status:
        q = q.where(RestorationCase.status == status)
    rows = list((await db.execute(q)).scalars().all())
    names = await _patient_names(db, clinic_id, {r.patient_id for r in rows})
    _attach_patient_name(rows, names)
    return rows


async def list_endo_cases_clinic(
    db: AsyncSession, clinic_id: str, *, status: str | None = None
) -> list[EndoCase]:
    q = (
        select(EndoCase)
        .where(EndoCase.clinic_id == clinic_id)
        .options(selectinload(EndoCase.obturations))
        .order_by(EndoCase.created_at.desc())
        .limit(200)
    )
    if status:
        q = q.where(EndoCase.status == status)
    rows = list((await db.execute(q)).scalars().all())
    names = await _patient_names(db, clinic_id, {r.patient_id for r in rows})
    _attach_patient_name(rows, names)
    return rows


# ── Maxillofacial surgery ──────────────────────────────────────────────────────
async def _load_surgical_case(db: AsyncSession, clinic_id: str, case_id: str) -> SurgicalCase:
    case = (
        await db.execute(
            select(SurgicalCase)
            .where(SurgicalCase.id == case_id, SurgicalCase.clinic_id == clinic_id)
            .options(selectinload(SurgicalCase.follow_ups))
        )
    ).scalar_one_or_none()
    if not case:
        raise NotFoundError("Surgical case not found")
    return case


async def list_surgical_cases(
    db: AsyncSession, clinic_id: str, *, status: str | None = None, patient_id: str | None = None
) -> list[SurgicalCase]:
    q = (
        select(SurgicalCase)
        .where(SurgicalCase.clinic_id == clinic_id)
        .options(selectinload(SurgicalCase.follow_ups))
        .order_by(SurgicalCase.created_at.desc())
        .limit(200)
    )
    if status:
        q = q.where(SurgicalCase.status == status)
    if patient_id:
        q = q.where(SurgicalCase.patient_id == patient_id)
    rows = list((await db.execute(q)).scalars().all())
    names = await _patient_names(db, clinic_id, {r.patient_id for r in rows})
    _attach_patient_name(rows, names)
    return rows


async def create_surgical_case(
    db: AsyncSession, clinic_id: str, actor_id: str, data: dict
) -> SurgicalCase:
    patient = await _get_patient(db, clinic_id, data["patient_id"])
    if data.get("status") not in SURGICAL_STATUSES:
        raise ValidationAppError(f"Invalid status: {data.get('status')}")
    case = SurgicalCase(clinic_id=clinic_id, **data)
    db.add(case)
    await db.flush()
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="create",
        resource_type="surgical_case",
        resource_id=case.id,
        after={"procedure_type": case.procedure_type, "status": case.status},
    )
    case.patient_name = f"{patient.first_name} {patient.last_name}"
    set_committed_value(case, "follow_ups", [])
    return case


async def update_surgical_case(
    db: AsyncSession, clinic_id: str, actor_id: str, case_id: str, changes: dict
) -> SurgicalCase:
    case = await _load_surgical_case(db, clinic_id, case_id)
    new_status = changes.get("status")
    if new_status is not None and new_status not in SURGICAL_STATUSES:
        raise ValidationAppError(f"Invalid status: {new_status}")
    before_status = case.status
    for key, value in changes.items():
        if key == "status" and value is None:
            continue
        setattr(case, key, value)
    if new_status == SurgicalCaseStatus.COMPLETED and not case.performed_at:
        case.performed_at = datetime.now(UTC)
    await db.flush()
    if new_status and new_status != before_status:
        await write_audit(
            db,
            clinic_id=clinic_id,
            actor_id=actor_id,
            action="status_change",
            resource_type="surgical_case",
            resource_id=case.id,
            before={"status": before_status},
            after={"status": new_status},
        )
    names = await _patient_names(db, clinic_id, {case.patient_id})
    _attach_patient_name([case], names)
    return case


async def add_surgical_follow_up(
    db: AsyncSession, clinic_id: str, case_id: str, data: dict
) -> SurgicalCase:
    case = await _load_surgical_case(db, clinic_id, case_id)
    follow_up = SurgicalFollowUp(
        surgical_case_id=case.id,
        visit_date=data.get("visit_date") or datetime.now(UTC).date(),
        pain_score=data.get("pain_score"),
        swelling=data.get("swelling"),
        healing=data.get("healing", "normal"),
        sutures_removed=data.get("sutures_removed", False),
        notes=data.get("notes"),
    )
    db.add(follow_up)
    if case.status == SurgicalCaseStatus.COMPLETED:
        case.status = SurgicalCaseStatus.FOLLOW_UP
    await db.flush()
    await db.refresh(case, ["follow_ups"])
    names = await _patient_names(db, clinic_id, {case.patient_id})
    _attach_patient_name([case], names)
    return case


# ── Orthodontics ───────────────────────────────────────────────────────────────
async def _load_ortho_case(db: AsyncSession, clinic_id: str, case_id: str) -> OrthoCase:
    case = (
        await db.execute(
            select(OrthoCase)
            .where(OrthoCase.id == case_id, OrthoCase.clinic_id == clinic_id)
            .options(selectinload(OrthoCase.adjustments))
        )
    ).scalar_one_or_none()
    if not case:
        raise NotFoundError("Orthodontic case not found")
    return case


async def list_ortho_cases(
    db: AsyncSession, clinic_id: str, *, status: str | None = None, patient_id: str | None = None
) -> list[OrthoCase]:
    q = (
        select(OrthoCase)
        .where(OrthoCase.clinic_id == clinic_id)
        .options(selectinload(OrthoCase.adjustments))
        .order_by(OrthoCase.created_at.desc())
        .limit(200)
    )
    if status:
        q = q.where(OrthoCase.status == status)
    if patient_id:
        q = q.where(OrthoCase.patient_id == patient_id)
    rows = list((await db.execute(q)).scalars().all())
    names = await _patient_names(db, clinic_id, {r.patient_id for r in rows})
    _attach_patient_name(rows, names)
    return rows


async def create_ortho_case(db: AsyncSession, clinic_id: str, actor_id: str, data: dict) -> OrthoCase:
    patient = await _get_patient(db, clinic_id, data["patient_id"])
    if data.get("status") not in ORTHO_STATUSES:
        raise ValidationAppError(f"Invalid status: {data.get('status')}")
    case = OrthoCase(clinic_id=clinic_id, **data)
    db.add(case)
    await db.flush()
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="create",
        resource_type="ortho_case",
        resource_id=case.id,
        after={"appliance_type": case.appliance_type, "status": case.status},
    )
    case.patient_name = f"{patient.first_name} {patient.last_name}"
    set_committed_value(case, "adjustments", [])
    return case


async def update_ortho_case(
    db: AsyncSession, clinic_id: str, actor_id: str, case_id: str, changes: dict
) -> OrthoCase:
    case = await _load_ortho_case(db, clinic_id, case_id)
    new_status = changes.get("status")
    if new_status is not None and new_status not in ORTHO_STATUSES:
        raise ValidationAppError(f"Invalid status: {new_status}")
    before_status = case.status
    for key, value in changes.items():
        if key == "status" and value is None:
            continue
        setattr(case, key, value)
    if new_status == OrthoCaseStatus.ACTIVE and not case.started_on:
        case.started_on = datetime.now(UTC).date()
    if new_status in (OrthoCaseStatus.RETENTION, OrthoCaseStatus.COMPLETED) and not case.debonded_on:
        case.debonded_on = datetime.now(UTC).date()
    await db.flush()
    if new_status and new_status != before_status:
        await write_audit(
            db,
            clinic_id=clinic_id,
            actor_id=actor_id,
            action="status_change",
            resource_type="ortho_case",
            resource_id=case.id,
            before={"status": before_status},
            after={"status": new_status},
        )
    names = await _patient_names(db, clinic_id, {case.patient_id})
    _attach_patient_name([case], names)
    return case


async def add_ortho_adjustment(
    db: AsyncSession, clinic_id: str, case_id: str, data: dict
) -> OrthoCase:
    case = await _load_ortho_case(db, clinic_id, case_id)
    visit_date = data.get("visit_date") or datetime.now(UTC).date()
    next_weeks = data.get("next_visit_weeks", 4)
    adjustment = OrthoAdjustment(
        ortho_case_id=case.id,
        visit_date=visit_date,
        archwire=data.get("archwire"),
        procedures=data.get("procedures"),
        elastics=data.get("elastics"),
        next_visit_weeks=next_weeks,
        notes=data.get("notes"),
    )
    db.add(adjustment)
    # Adjustment cadence drives the recall date (architecture: ortho follow-ups every N weeks)
    case.next_review_due = visit_date + timedelta(weeks=next_weeks)
    if case.status == OrthoCaseStatus.ASSESSMENT:
        case.status = OrthoCaseStatus.ACTIVE
        if not case.started_on:
            case.started_on = visit_date
    await db.flush()
    await db.refresh(case, ["adjustments"])
    names = await _patient_names(db, clinic_id, {case.patient_id})
    _attach_patient_name([case], names)
    return case


# ── Paediatrics ────────────────────────────────────────────────────────────────
def _age_on(dob: date | None, today: date) -> int | None:
    if not dob:
        return None
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def _attach_paediatric_extras(profile: PaediatricProfile, patient: Patient) -> None:
    profile.patient_name = f"{patient.first_name} {patient.last_name}"
    profile.patient_age = _age_on(patient.date_of_birth, datetime.now(UTC).date())


async def list_paediatric_profiles(
    db: AsyncSession, clinic_id: str, *, caries_risk: str | None = None
) -> list[PaediatricProfile]:
    q = (
        select(PaediatricProfile, Patient)
        .join(Patient, Patient.id == PaediatricProfile.patient_id)
        .where(PaediatricProfile.clinic_id == clinic_id)
        .options(selectinload(PaediatricProfile.treatments))
        .order_by(PaediatricProfile.created_at.desc())
        .limit(200)
    )
    if caries_risk:
        q = q.where(PaediatricProfile.caries_risk == caries_risk)
    rows = (await db.execute(q)).all()
    profiles = []
    for profile, patient in rows:
        _attach_paediatric_extras(profile, patient)
        profiles.append(profile)
    return profiles


async def get_paediatric_profile(
    db: AsyncSession, clinic_id: str, patient_id: str
) -> PaediatricProfile | None:
    patient = await _get_patient(db, clinic_id, patient_id)
    profile = (
        await db.execute(
            select(PaediatricProfile)
            .where(
                PaediatricProfile.clinic_id == clinic_id,
                PaediatricProfile.patient_id == patient_id,
            )
            .options(selectinload(PaediatricProfile.treatments))
        )
    ).scalar_one_or_none()
    if profile:
        _attach_paediatric_extras(profile, patient)
    return profile


async def upsert_paediatric_profile(
    db: AsyncSession, clinic_id: str, actor_id: str, patient_id: str, data: dict
) -> PaediatricProfile:
    patient = await _get_patient(db, clinic_id, patient_id)
    profile = (
        await db.execute(
            select(PaediatricProfile)
            .where(
                PaediatricProfile.clinic_id == clinic_id,
                PaediatricProfile.patient_id == patient_id,
            )
            .options(selectinload(PaediatricProfile.treatments))
        )
    ).scalar_one_or_none()
    created = profile is None
    if profile is None:
        profile = PaediatricProfile(clinic_id=clinic_id, patient_id=patient_id, **data)
        db.add(profile)
    else:
        for key, value in data.items():
            setattr(profile, key, value)
    await db.flush()
    if created:
        await db.refresh(profile, ["treatments"])
        await write_audit(
            db,
            clinic_id=clinic_id,
            actor_id=actor_id,
            action="create",
            resource_type="paediatric_profile",
            resource_id=profile.id,
            after={"caries_risk": profile.caries_risk},
        )
    _attach_paediatric_extras(profile, patient)
    return profile


async def add_paediatric_treatment(
    db: AsyncSession, clinic_id: str, actor_id: str, patient_id: str, data: dict
) -> PaediatricProfile:
    patient = await _get_patient(db, clinic_id, patient_id)
    profile = (
        await db.execute(
            select(PaediatricProfile).where(
                PaediatricProfile.clinic_id == clinic_id,
                PaediatricProfile.patient_id == patient_id,
            )
        )
    ).scalar_one_or_none()
    if not profile:
        raise NotFoundError("Paediatric profile not found — create the profile first")
    performed_on = data.get("performed_on") or datetime.now(UTC).date()
    treatment = PaediatricTreatment(
        profile_id=profile.id,
        treatment_type=data.get("treatment_type", "fluoride_varnish"),
        tooth=data.get("tooth"),
        performed_on=performed_on,
        performed_by_id=actor_id,
        notes=data.get("notes"),
    )
    db.add(treatment)
    if treatment.treatment_type == "fluoride_varnish":
        profile.fluoride_last = performed_on
        # Standard preventive recall: high caries risk → 3 months, else 6
        interval_days = 90 if profile.caries_risk == "high" else 180
        profile.fluoride_next = performed_on + timedelta(days=interval_days)
    await db.flush()
    await db.refresh(profile, ["treatments"])
    _attach_paediatric_extras(profile, patient)
    return profile
