"""Clinic organization, settings, sequences, and deactivate-not-delete helpers."""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.models import (
    Appointment,
    Holiday,
    Invoice,
    NumberSequence,
    Operatory,
    OrgDepartment,
    Patient,
    SystemSetting,
    WorkingHours,
)
from app.services.domain import write_audit
from app.services import events as bus

DEFAULT_DEPARTMENTS: tuple[tuple[str, str, int], ...] = (
    ("front_desk", "Front desk", 10),
    ("restorative", "Restorative", 20),
    ("maxillofacial", "Maxillofacial", 30),
    ("orthodontic", "Orthodontic", 40),
    ("paediatric", "Paediatric", 50),
    ("hygiene", "Hygiene", 60),
    ("imaging", "Imaging", 70),
    ("lab", "Lab", 80),
    ("pharmacy", "Pharmacy", 90),
    ("warehouse", "Warehouse", 100),
)

DEFAULT_OPERATORIES: tuple[tuple[str, str, int, str], ...] = (
    ("CH1", "Chair 1", 1, "restorative"),
    ("CH2", "Chair 2", 2, "restorative"),
    ("CH3", "Chair 3", 3, "maxillofacial"),
    ("CH4", "Chair 4", 4, "hygiene"),
)

DEFAULT_HOURS: tuple[tuple[int, str, str], ...] = (
    (0, "08:00", "17:00"),
    (1, "08:00", "17:00"),
    (2, "08:00", "17:00"),
    (3, "08:00", "17:00"),
    (4, "08:00", "17:00"),
    (5, "08:00", "13:00"),
)

SEQUENCE_SPECS: tuple[tuple[str, str, int, bool], ...] = (
    ("patient", "P", 5, True),
    ("invoice", "INV-", 5, True),
    ("requisition", "REQ-", 5, True),
    ("purchase_order", "PO-", 5, True),
    ("prescription", "RX-", 5, True),
    ("pharmacy_sale", "PS-", 5, True),
)

SETTING_TOOTH_NOTATION = "clinical.tooth_notation"
DEFAULT_SETTINGS: tuple[tuple[str, str], ...] = (
    (SETTING_TOOTH_NOTATION, "fdi"),
    ("feature.requisition", "true"),
    ("feature.analytics_phi_drilldown", "false"),
    ("feature.dicom", "false"),
    ("feature.patient_portal", "true"),
    ("notify.sms_enabled", "false"),
    ("notify.email_enabled", "true"),
    ("billing.default_tax", "vat0"),
)

_TIME_RE = __import__("re").compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def _require_hhmm(value: str, field: str) -> str:
    if not _TIME_RE.match(value or ""):
        raise ValidationAppError(f"{field} must be HH:MM")
    return value


def _snapshot(row: Any, *fields: str) -> dict[str, Any]:
    return {name: getattr(row, name) for name in fields}


async def _config_audit(
    db: AsyncSession,
    *,
    clinic_id: str,
    actor_id: str | None,
    action: str,
    resource_type: str,
    resource_id: str,
    before: dict | None = None,
    after: dict | None = None,
) -> None:
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        before=before,
        after=after,
    )
    await bus.publish(
        db,
        clinic_id=clinic_id,
        event_type=bus.CONFIG_CHANGED,
        aggregate_type=resource_type,
        aggregate_id=resource_id,
        payload={"action": action, "before": before, "after": after},
        actor_id=actor_id,
    )


async def deactivate(
    db: AsyncSession,
    row: Any,
    *,
    clinic_id: str,
    actor_id: str | None,
    resource_type: str,
) -> None:
    if not row.is_active:
        return
    before = {"is_active": True}
    row.is_active = False
    row.deactivated_at = datetime.now(UTC)
    row.deactivated_by_id = actor_id
    await db.flush()
    await _config_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="deactivate",
        resource_type=resource_type,
        resource_id=row.id,
        before=before,
        after={"is_active": False},
    )


async def ensure_clinic_config(db: AsyncSession, clinic_id: str) -> None:
    """Idempotent seed so a clinic can book chairs without a setup wizard."""
    existing = (
        await db.execute(select(OrgDepartment.id).where(OrgDepartment.clinic_id == clinic_id).limit(1))
    ).scalar_one_or_none()
    if existing is None:
        for code, name, sort in DEFAULT_DEPARTMENTS:
            db.add(
                OrgDepartment(
                    clinic_id=clinic_id,
                    code=code,
                    name=name,
                    sort_order=sort,
                )
            )
        await db.flush()

    depts = {
        d.code: d
        for d in (
            await db.execute(select(OrgDepartment).where(OrgDepartment.clinic_id == clinic_id))
        ).scalars()
    }
    existing_ops = (
        await db.execute(select(Operatory.id).where(Operatory.clinic_id == clinic_id).limit(1))
    ).scalar_one_or_none()
    if existing_ops is None:
        for code, name, chair, dept_code in DEFAULT_OPERATORIES:
            dept = depts.get(dept_code)
            db.add(
                Operatory(
                    clinic_id=clinic_id,
                    department_id=dept.id if dept else None,
                    code=code,
                    name=name,
                    chair_number=chair,
                    sort_order=chair,
                )
            )
        await db.flush()

    hours_exist = (
        await db.execute(select(WorkingHours.id).where(WorkingHours.clinic_id == clinic_id).limit(1))
    ).scalar_one_or_none()
    if hours_exist is None:
        for day, start, end in DEFAULT_HOURS:
            db.add(
                WorkingHours(
                    clinic_id=clinic_id,
                    owner_type="clinic",
                    day_of_week=day,
                    starts_on=start,
                    ends_on=end,
                )
            )

    for key, value in DEFAULT_SETTINGS:
        found = (
            await db.execute(
                select(SystemSetting).where(
                    SystemSetting.clinic_id == clinic_id,
                    SystemSetting.scope == "clinic",
                    SystemSetting.key == key,
                )
            )
        ).scalar_one_or_none()
        if found is None:
            db.add(
                SystemSetting(
                    clinic_id=clinic_id,
                    scope="clinic",
                    key=key,
                    value=value,
                )
            )

    year = datetime.now(UTC).year
    patient_count = (
        await db.execute(select(func.count()).select_from(Patient).where(Patient.clinic_id == clinic_id))
    ).scalar_one()
    invoice_count = (
        await db.execute(select(func.count()).select_from(Invoice).where(Invoice.clinic_id == clinic_id))
    ).scalar_one()
    starters = {
        "patient": int(patient_count) + 1,
        "invoice": int(invoice_count) + 1,
        "requisition": 1,
        "purchase_order": 1,
        "prescription": 1,
        "pharmacy_sale": 1,
    }
    for doc_type, prefix, padding, year_reset in SEQUENCE_SPECS:
        found = (
            await db.execute(
                select(NumberSequence).where(
                    NumberSequence.clinic_id == clinic_id,
                    NumberSequence.document_type == doc_type,
                )
            )
        ).scalar_one_or_none()
        if found is None:
            db.add(
                NumberSequence(
                    clinic_id=clinic_id,
                    document_type=doc_type,
                    prefix=prefix,
                    padding=padding,
                    year_reset=year_reset,
                    current_year=year,
                    next_value=starters.get(doc_type, 1),
                )
            )
    await db.flush()
    from app.services.config_setup import ensure_full_setup

    await ensure_full_setup(db, clinic_id)


async def get_setting(
    db: AsyncSession,
    *,
    key: str,
    clinic_id: str | None = None,
    user_id: str | None = None,
) -> str | None:
    """Resolve user override → clinic → platform."""
    if user_id and clinic_id:
        row = (
            await db.execute(
                select(SystemSetting).where(
                    SystemSetting.scope == "user",
                    SystemSetting.clinic_id == clinic_id,
                    SystemSetting.user_id == user_id,
                    SystemSetting.key == key,
                )
            )
        ).scalar_one_or_none()
        if row:
            return row.value
    if clinic_id:
        row = (
            await db.execute(
                select(SystemSetting).where(
                    SystemSetting.scope == "clinic",
                    SystemSetting.clinic_id == clinic_id,
                    SystemSetting.user_id.is_(None),
                    SystemSetting.key == key,
                )
            )
        ).scalar_one_or_none()
        if row:
            return row.value
    row = (
        await db.execute(
            select(SystemSetting).where(
                SystemSetting.scope == "platform",
                SystemSetting.clinic_id.is_(None),
                SystemSetting.key == key,
            )
        )
    ).scalar_one_or_none()
    return row.value if row else None


async def upsert_setting(
    db: AsyncSession,
    *,
    clinic_id: str,
    actor_id: str | None,
    key: str,
    value: str,
    scope: str = "clinic",
    user_id: str | None = None,
) -> SystemSetting:
    if scope not in {"platform", "clinic", "user"}:
        raise ValidationAppError("scope must be platform, clinic, or user")
    if key == SETTING_TOOTH_NOTATION and value not in {"fdi", "universal", "palmer"}:
        raise ValidationAppError("tooth notation must be fdi, universal, or palmer")
    stmt = select(SystemSetting).where(SystemSetting.key == key, SystemSetting.scope == scope)
    if scope == "platform":
        stmt = stmt.where(SystemSetting.clinic_id.is_(None))
    else:
        stmt = stmt.where(SystemSetting.clinic_id == clinic_id)
    if scope == "user":
        if not user_id:
            raise ValidationAppError("user_id required for user scope")
        stmt = stmt.where(SystemSetting.user_id == user_id)
    else:
        stmt = stmt.where(SystemSetting.user_id.is_(None))
    row = (await db.execute(stmt)).scalar_one_or_none()
    before = {"value": row.value} if row else None
    if row is None:
        row = SystemSetting(
            clinic_id=None if scope == "platform" else clinic_id,
            user_id=user_id if scope == "user" else None,
            scope=scope,
            key=key,
            value=value,
        )
        db.add(row)
        await db.flush()
    else:
        row.value = value
        await db.flush()
    await _config_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="upsert",
        resource_type="system_setting",
        resource_id=row.id,
        before=before,
        after={"key": key, "value": value, "scope": scope},
    )
    return row


async def list_settings(db: AsyncSession, clinic_id: str) -> list[SystemSetting]:
    return list(
        (
            await db.execute(
                select(SystemSetting)
                .where(
                    (SystemSetting.clinic_id == clinic_id) | (SystemSetting.scope == "platform")
                )
                .order_by(SystemSetting.scope, SystemSetting.key)
            )
        ).scalars()
    )


async def list_sequences(db: AsyncSession, clinic_id: str) -> list[NumberSequence]:
    await ensure_clinic_config(db, clinic_id)
    return list(
        (
            await db.execute(
                select(NumberSequence)
                .where(NumberSequence.clinic_id == clinic_id)
                .order_by(NumberSequence.document_type)
            )
        ).scalars()
    )


async def allocate_number(db: AsyncSession, clinic_id: str, document_type: str) -> str:
    await ensure_clinic_config(db, clinic_id)
    row = (
        await db.execute(
            select(NumberSequence).where(
                NumberSequence.clinic_id == clinic_id,
                NumberSequence.document_type == document_type,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise NotFoundError("Number sequence")
    year = datetime.now(UTC).year
    if row.year_reset and row.current_year != year:
        row.current_year = year
        row.next_value = 1
    n = row.next_value
    row.next_value = n + 1
    await db.flush()
    body = str(n).zfill(max(row.padding, 1))
    if row.year_reset:
        if row.prefix.endswith("-"):
            return f"{row.prefix}{year}-{body}"
        return f"{row.prefix}{year}{body}"
    return f"{row.prefix}{body}"


async def update_sequence(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str | None,
    seq_id: str,
    *,
    prefix: str | None = None,
    padding: int | None = None,
    next_value: int | None = None,
    year_reset: bool | None = None,
) -> NumberSequence:
    row = (
        await db.execute(
            select(NumberSequence).where(
                NumberSequence.id == seq_id, NumberSequence.clinic_id == clinic_id
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise NotFoundError("Number sequence")
    before = _snapshot(row, "prefix", "padding", "next_value", "year_reset")
    if prefix is not None:
        row.prefix = prefix
    if padding is not None:
        if padding < 1 or padding > 10:
            raise ValidationAppError("padding must be 1–10")
        row.padding = padding
    if next_value is not None:
        if next_value < 1:
            raise ValidationAppError("next_value must be ≥ 1")
        row.next_value = next_value
    if year_reset is not None:
        row.year_reset = year_reset
    await db.flush()
    await _config_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="update",
        resource_type="number_sequence",
        resource_id=row.id,
        before=before,
        after=_snapshot(row, "prefix", "padding", "next_value", "year_reset"),
    )
    return row


async def list_departments(db: AsyncSession, clinic_id: str, *, include_inactive: bool = False) -> list[OrgDepartment]:
    await ensure_clinic_config(db, clinic_id)
    stmt = select(OrgDepartment).where(OrgDepartment.clinic_id == clinic_id)
    if not include_inactive:
        stmt = stmt.where(OrgDepartment.is_active.is_(True))
    return list((await db.execute(stmt.order_by(OrgDepartment.sort_order, OrgDepartment.name))).scalars())


async def create_department(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str | None,
    *,
    code: str,
    name: str,
    head_user_id: str | None = None,
    sort_order: int = 0,
    notes: str | None = None,
) -> OrgDepartment:
    code = code.strip().lower().replace(" ", "_")
    if not code or not name.strip():
        raise ValidationAppError("code and name are required")
    dup = (
        await db.execute(
            select(OrgDepartment).where(OrgDepartment.clinic_id == clinic_id, OrgDepartment.code == code)
        )
    ).scalar_one_or_none()
    if dup:
        raise ConflictError("Department code already exists")
    row = OrgDepartment(
        clinic_id=clinic_id,
        code=code,
        name=name.strip(),
        head_user_id=head_user_id,
        sort_order=sort_order,
        notes=notes,
    )
    db.add(row)
    await db.flush()
    await _config_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="create",
        resource_type="org_department",
        resource_id=row.id,
        after={"code": row.code, "name": row.name},
    )
    return row


async def update_department(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str | None,
    dept_id: str,
    data: dict[str, Any],
) -> OrgDepartment:
    row = await get_department(db, clinic_id, dept_id, include_inactive=True)
    before = _snapshot(row, "name", "head_user_id", "sort_order", "notes", "is_active")
    if data.get("is_active") is False:
        await deactivate(db, row, clinic_id=clinic_id, actor_id=actor_id, resource_type="org_department")
        return row
    for key in ("name", "head_user_id", "sort_order", "notes", "stock_location_id"):
        if key in data:
            setattr(row, key, data[key])
    if data.get("is_active") is True:
        row.is_active = True
        row.deactivated_at = None
        row.deactivated_by_id = None
    await db.flush()
    await _config_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="update",
        resource_type="org_department",
        resource_id=row.id,
        before=before,
        after=_snapshot(row, "name", "head_user_id", "sort_order", "notes", "is_active"),
    )
    return row


async def get_department(
    db: AsyncSession, clinic_id: str, dept_id: str, *, include_inactive: bool = False
) -> OrgDepartment:
    row = (
        await db.execute(
            select(OrgDepartment).where(OrgDepartment.id == dept_id, OrgDepartment.clinic_id == clinic_id)
        )
    ).scalar_one_or_none()
    if not row or (not include_inactive and not row.is_active):
        raise NotFoundError("Department")
    return row


async def list_operatories(
    db: AsyncSession, clinic_id: str, *, include_inactive: bool = False
) -> list[Operatory]:
    await ensure_clinic_config(db, clinic_id)
    stmt = select(Operatory).where(Operatory.clinic_id == clinic_id)
    if not include_inactive:
        stmt = stmt.where(Operatory.is_active.is_(True))
    return list((await db.execute(stmt.order_by(Operatory.sort_order, Operatory.name))).scalars())


async def get_operatory(
    db: AsyncSession, clinic_id: str, operatory_id: str, *, include_inactive: bool = False
) -> Operatory:
    row = (
        await db.execute(
            select(Operatory).where(Operatory.id == operatory_id, Operatory.clinic_id == clinic_id)
        )
    ).scalar_one_or_none()
    if not row or (not include_inactive and not row.is_active):
        raise NotFoundError("Operatory")
    return row


async def resolve_operatory(
    db: AsyncSession,
    clinic_id: str,
    *,
    operatory_id: str | None = None,
    chair_number: int | None = None,
) -> Operatory | None:
    await ensure_clinic_config(db, clinic_id)
    if operatory_id:
        return await get_operatory(db, clinic_id, operatory_id)
    if chair_number is None:
        return None
    row = (
        await db.execute(
            select(Operatory).where(
                Operatory.clinic_id == clinic_id,
                Operatory.is_active.is_(True),
                Operatory.chair_number == chair_number,
            )
        )
    ).scalar_one_or_none()
    return row


async def create_operatory(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str | None,
    *,
    code: str,
    name: str,
    department_id: str | None = None,
    chair_number: int | None = None,
    sort_order: int = 0,
    notes: str | None = None,
) -> Operatory:
    code = code.strip().upper().replace(" ", "")
    if not code or not name.strip():
        raise ValidationAppError("code and name are required")
    if department_id:
        await get_department(db, clinic_id, department_id)
    dup = (
        await db.execute(
            select(Operatory).where(Operatory.clinic_id == clinic_id, Operatory.code == code)
        )
    ).scalar_one_or_none()
    if dup:
        raise ConflictError("Operatory code already exists")
    row = Operatory(
        clinic_id=clinic_id,
        code=code,
        name=name.strip(),
        department_id=department_id,
        chair_number=chair_number,
        sort_order=sort_order or (chair_number or 0),
        notes=notes,
    )
    db.add(row)
    await db.flush()
    await _config_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="create",
        resource_type="operatory",
        resource_id=row.id,
        after={"code": row.code, "name": row.name, "chair_number": row.chair_number},
    )
    return row


async def update_operatory(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str | None,
    operatory_id: str,
    data: dict[str, Any],
) -> Operatory:
    row = await get_operatory(db, clinic_id, operatory_id, include_inactive=True)
    if data.get("is_active") is False:
        booked = (
            await db.execute(
                select(func.count())
                .select_from(Appointment)
                .where(
                    Appointment.clinic_id == clinic_id,
                    Appointment.operatory_id == row.id,
                    Appointment.status.notin_(["cancelled", "no_show", "completed"]),
                )
            )
        ).scalar_one()
        if booked:
            raise ConflictError("Cannot deactivate an operatory with open appointments")
        await deactivate(db, row, clinic_id=clinic_id, actor_id=actor_id, resource_type="operatory")
        return row
    before = _snapshot(row, "name", "department_id", "chair_number", "sort_order", "notes", "is_active")
    if data.get("department_id"):
        await get_department(db, clinic_id, data["department_id"])
    for key in ("name", "department_id", "chair_number", "sort_order", "notes"):
        if key in data:
            setattr(row, key, data[key])
    if data.get("is_active") is True:
        row.is_active = True
        row.deactivated_at = None
        row.deactivated_by_id = None
    await db.flush()
    await _config_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="update",
        resource_type="operatory",
        resource_id=row.id,
        before=before,
        after=_snapshot(row, "name", "department_id", "chair_number", "sort_order", "notes", "is_active"),
    )
    return row


async def list_hours(db: AsyncSession, clinic_id: str) -> list[WorkingHours]:
    await ensure_clinic_config(db, clinic_id)
    return list(
        (
            await db.execute(
                select(WorkingHours)
                .where(WorkingHours.clinic_id == clinic_id, WorkingHours.is_active.is_(True))
                .order_by(WorkingHours.owner_type, WorkingHours.day_of_week)
            )
        ).scalars()
    )


async def replace_clinic_hours(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str | None,
    days: list[dict[str, Any]],
) -> list[WorkingHours]:
    if not days:
        raise ValidationAppError("At least one working-hours row is required")
    existing = (
        await db.execute(
            select(WorkingHours).where(
                WorkingHours.clinic_id == clinic_id,
                WorkingHours.owner_type == "clinic",
            )
        )
    ).scalars().all()
    for row in existing:
        db.delete(row)
    created: list[WorkingHours] = []
    for item in days:
        dow = int(item["day_of_week"])
        if dow < 0 or dow > 6:
            raise ValidationAppError("day_of_week must be 0–6 (Monday=0)")
        start = _require_hhmm(str(item["starts_on"]), "starts_on")
        end = _require_hhmm(str(item["ends_on"]), "ends_on")
        if end <= start:
            raise ValidationAppError("ends_on must be after starts_on")
        row = WorkingHours(
            clinic_id=clinic_id,
            owner_type="clinic",
            day_of_week=dow,
            starts_on=start,
            ends_on=end,
        )
        db.add(row)
        created.append(row)
    await db.flush()
    await _config_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="replace",
        resource_type="working_hours",
        resource_id=clinic_id,
        after={"days": [{"day_of_week": r.day_of_week, "starts_on": r.starts_on, "ends_on": r.ends_on} for r in created]},
    )
    return created


async def list_holidays(db: AsyncSession, clinic_id: str, *, include_inactive: bool = False) -> list[Holiday]:
    stmt = select(Holiday).where(Holiday.clinic_id == clinic_id)
    if not include_inactive:
        stmt = stmt.where(Holiday.is_active.is_(True))
    return list((await db.execute(stmt.order_by(Holiday.holiday_date))).scalars())


async def create_holiday(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str | None,
    *,
    holiday_date: date,
    name: str,
    notes: str | None = None,
) -> Holiday:
    if not name.strip():
        raise ValidationAppError("name is required")
    dup = (
        await db.execute(
            select(Holiday).where(Holiday.clinic_id == clinic_id, Holiday.holiday_date == holiday_date)
        )
    ).scalar_one_or_none()
    if dup:
        if not dup.is_active:
            dup.is_active = True
            dup.deactivated_at = None
            dup.name = name.strip()
            dup.notes = notes
            await db.flush()
            return dup
        raise ConflictError("A holiday already exists on that date")
    row = Holiday(clinic_id=clinic_id, holiday_date=holiday_date, name=name.strip(), notes=notes)
    db.add(row)
    await db.flush()
    await _config_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="create",
        resource_type="holiday",
        resource_id=row.id,
        after={"date": str(holiday_date), "name": row.name},
    )
    return row


async def deactivate_holiday(db: AsyncSession, clinic_id: str, actor_id: str | None, holiday_id: str) -> Holiday:
    row = (
        await db.execute(select(Holiday).where(Holiday.id == holiday_id, Holiday.clinic_id == clinic_id))
    ).scalar_one_or_none()
    if not row:
        raise NotFoundError("Holiday")
    await deactivate(db, row, clinic_id=clinic_id, actor_id=actor_id, resource_type="holiday")
    return row
