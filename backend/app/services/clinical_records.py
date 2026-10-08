"""Clinical records: the clinic-wide patient register.

Every active patient file is listed, including files that have not had a chair
visit yet. Visit dates, examiner, and status filters still limit the list to
patients who match that visit.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.rbac import is_assignment_scoped_role
from app.models import ClinicalNote, ClinicalVisit, Patient, TreatmentPlan, User
from app.schemas import ClinicalRecordDetail, ClinicalRecordRow, ClinicalRecordSummary
from app.schemas.clerkship import age_years
from app.services.domain import get_patient, list_clinical_visits
from app.services.vitals import latest_vitals

SORT_FIELDS = {"last_visit", "first_visit", "visits", "name", "code"}


def _visit_scope(
    clinic_id: str,
    *,
    examiner_id: str | None,
    date_from: date | None,
    date_to: date | None,
    status: str | None,
) -> list:
    clauses = [ClinicalVisit.clinic_id == clinic_id]
    if examiner_id:
        clauses.append(ClinicalVisit.examiner_id == examiner_id)
    if date_from:
        clauses.append(ClinicalVisit.visit_date >= date_from)
    if date_to:
        clauses.append(ClinicalVisit.visit_date <= date_to)
    if status:
        clauses.append(ClinicalVisit.status == status)
    return clauses


def _full_name(patient: Patient) -> str:
    return " ".join(
        part for part in (patient.first_name, patient.middle_name, patient.last_name) if part
    ).strip()


async def _latest_visit_by_patient(
    db: AsyncSession,
    clinic_id: str,
    patient_ids: list[str],
    *,
    visit_clauses: list,
) -> dict[str, ClinicalVisit]:
    """Newest in-scope visit per patient, for the page rows only."""
    if not patient_ids:
        return {}
    rows = list(
        (
            await db.execute(
                select(ClinicalVisit)
                .where(*visit_clauses, ClinicalVisit.patient_id.in_(patient_ids))
                .order_by(
                    ClinicalVisit.patient_id,
                    ClinicalVisit.visit_date.desc(),
                    ClinicalVisit.created_at.desc(),
                )
            )
        )
        .scalars()
        .all()
    )
    latest: dict[str, ClinicalVisit] = {}
    for row in rows:
        latest.setdefault(row.patient_id, row)
    return latest


async def _examiner_names(db: AsyncSession, ids: set[str]) -> dict[str, str]:
    clean = {value for value in ids if value}
    if not clean:
        return {}
    rows = (await db.execute(select(User.id, User.full_name).where(User.id.in_(clean)))).all()
    return {row[0]: row[1] for row in rows}


async def list_records(
    db: AsyncSession,
    clinic_id: str,
    *,
    q: str | None = None,
    department: str | None = None,
    examiner_id: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    status: str | None = None,
    sort: str = "last_visit",
    descending: bool = True,
    limit: int = 25,
    offset: int = 0,
    actor: User | None = None,
) -> tuple[list[ClinicalRecordRow], int]:
    visit_clauses = _visit_scope(
        clinic_id, examiner_id=examiner_id, date_from=date_from, date_to=date_to, status=status
    )
    agg = (
        select(
            ClinicalVisit.patient_id.label("patient_id"),
            func.count(ClinicalVisit.id).label("visit_count"),
            func.min(ClinicalVisit.visit_date).label("first_visit"),
            func.max(ClinicalVisit.visit_date).label("last_visit"),
        )
        .where(*visit_clauses)
        .group_by(ClinicalVisit.patient_id)
        .subquery("visit_agg")
    )

    visit_count = func.coalesce(agg.c.visit_count, 0)
    base = (
        select(Patient, visit_count, agg.c.first_visit, agg.c.last_visit)
        .outerjoin(agg, agg.c.patient_id == Patient.id)
        .where(
            Patient.clinic_id == clinic_id,
            Patient.is_active.is_(True),
            Patient.merged_into_id.is_(None),
        )
    )
    if examiner_id or date_from or date_to or status:
        base = base.where(agg.c.patient_id.is_not(None))
    if department:
        base = base.where(Patient.destination_department == department)
    if actor is not None and is_assignment_scoped_role(actor.role):
        base = base.where(
            or_(Patient.primary_dentist_id == actor.id, Patient.primary_dentist_id.is_(None))
        )
    if q and q.strip():
        matched = (
            select(ClinicalVisit.patient_id)
            .where(*visit_clauses, ClinicalVisit.chief_complaint.ilike(f"%{q.strip()}%"))
            .subquery("complaint_match")
        )
        like = f"%{q.strip()}%"
        base = base.where(
            or_(
                Patient.first_name.ilike(like),
                Patient.middle_name.ilike(like),
                Patient.last_name.ilike(like),
                Patient.patient_code.ilike(like),
                Patient.hospital_reg_number.ilike(like),
                Patient.national_id.ilike(like),
                Patient.phone.ilike(like),
                Patient.town_city.ilike(like),
                Patient.id.in_(select(matched.c.patient_id)),
            )
        )

    total = (
        await db.execute(select(func.count()).select_from(base.subquery("record_rows")))
    ).scalar_one()

    columns = {
        "last_visit": agg.c.last_visit,
        "first_visit": agg.c.first_visit,
        "visits": visit_count,
        "name": Patient.last_name,
        "code": Patient.patient_code,
    }
    column = columns.get(sort if sort in SORT_FIELDS else "last_visit", agg.c.last_visit)
    ordered = column.desc().nulls_last() if descending else column.asc().nulls_last()
    page = (
        base.options(selectinload(Patient.primary_dentist))
        .order_by(ordered, Patient.last_name.asc())
        .limit(limit)
        .offset(offset)
    )
    records = (await db.execute(page)).all()

    patient_ids = [row[0].id for row in records]
    latest = await _latest_visit_by_patient(
        db, clinic_id, patient_ids, visit_clauses=visit_clauses
    )
    names = await _examiner_names(db, {v.examiner_id for v in latest.values() if v.examiner_id})

    rows: list[ClinicalRecordRow] = []
    for patient, visit_count, first_visit, last_visit in records:
        visit = latest.get(patient.id)
        rows.append(
            ClinicalRecordRow(
                patient_id=patient.id,
                patient_code=patient.patient_code,
                full_name=_full_name(patient),
                sex=patient.sex,
                age_years=age_years(patient.date_of_birth),
                phone=patient.phone,
                town_city=patient.town_city,
                department=patient.destination_department,
                primary_dentist_name=(
                    patient.primary_dentist.full_name if patient.primary_dentist else None
                ),
                visit_count=int(visit_count or 0),
                first_visit_date=first_visit,
                last_visit_date=last_visit,
                last_visit_status=visit.status if visit else None,
                last_chief_complaint=(visit.chief_complaint if visit else None)
                or patient.chief_complaint,
                last_examiner_name=names.get(visit.examiner_id) if visit and visit.examiner_id else None,
                has_outstanding=bool(patient.has_outstanding),
            )
        )
    return rows, int(total)


async def record_detail(
    db: AsyncSession,
    clinic_id: str,
    patient_id: str,
    *,
    actor: User | None = None,
) -> ClinicalRecordDetail:
    """Everything the preview dialog shows: file, visit history, vitals, counts."""
    patient = await get_patient(db, clinic_id, patient_id, actor=actor)
    visits = await list_clinical_visits(db, clinic_id, patient_id)
    examiners = await _examiner_names(db, {v.examiner_id for v in visits if v.examiner_id})
    note_count = (
        await db.execute(
            select(func.count())
            .select_from(ClinicalNote)
            .where(ClinicalNote.clinic_id == clinic_id, ClinicalNote.patient_id == patient_id)
        )
    ).scalar_one()
    plan_count = (
        await db.execute(
            select(func.count())
            .select_from(TreatmentPlan)
            .where(TreatmentPlan.clinic_id == clinic_id, TreatmentPlan.patient_id == patient_id)
        )
    ).scalar_one()
    dates = [visit.visit_date for visit in visits if visit.visit_date]
    summary = ClinicalRecordSummary(
        visit_count=len(visits),
        note_count=int(note_count),
        treatment_plan_count=int(plan_count),
        first_visit_date=min(dates) if dates else None,
        last_visit_date=max(dates) if dates else None,
    )
    return ClinicalRecordDetail(
        patient=patient,
        visits=visits,
        examiner_names=examiners,
        latest_vitals=await latest_vitals(db, clinic_id, patient_id, actor=actor),
        summary=summary,
    )
