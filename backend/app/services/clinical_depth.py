"""Phase 2 clinical depth: restorative graph, endodontics, inventory usage."""

from __future__ import annotations

import json
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundError, ValidationAppError
from app.models import (
    DentalChartEntry,
    EndoCase,
    EndoObturation,
    InventoryItem,
    InventoryUsage,
    Patient,
    Restoration,
    RestorationCase,
    RestorationQuality,
)
from app.services.domain import write_audit

RESTORATION_STATUSES = {"planned", "in_progress", "completed", "failed", "replaced"}


async def list_restoration_cases(db: AsyncSession, clinic_id: str, patient_id: str) -> list[RestorationCase]:
    result = await db.execute(
        select(RestorationCase)
        .where(RestorationCase.clinic_id == clinic_id, RestorationCase.patient_id == patient_id)
        .options(selectinload(RestorationCase.restorations).selectinload(Restoration.quality))
        .order_by(RestorationCase.created_at.desc())
    )
    return list(result.scalars().all())


async def create_restoration_case(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    patient_id: str,
    *,
    primary_tooth: str,
    case_type: str = "restorative",
    warranty_months: int = 12,
    lab_case_id: str | None = None,
    fee_code: str | None = None,
    notes: str | None = None,
) -> RestorationCase:
    patient = (
        await db.execute(
            select(Patient).where(Patient.id == patient_id, Patient.clinic_id == clinic_id)
        )
    ).scalar_one_or_none()
    if not patient:
        raise NotFoundError("Patient not found")
    case = RestorationCase(
        clinic_id=clinic_id,
        patient_id=patient_id,
        primary_tooth=primary_tooth,
        case_type=case_type,
        status="planned",
        warranty_months=warranty_months,
        lab_case_id=lab_case_id,
        fee_code=fee_code,
        notes=notes,
        created_by_id=actor_id,
    )
    db.add(case)
    await db.flush()
    return case


async def list_restorations(
    db: AsyncSession, clinic_id: str, patient_id: str, *, tooth: str | None = None
) -> list[Restoration]:
    q = (
        select(Restoration)
        .where(Restoration.clinic_id == clinic_id, Restoration.patient_id == patient_id)
        .options(selectinload(Restoration.quality))
        .order_by(Restoration.created_at.desc())
    )
    if tooth:
        q = q.where(Restoration.tooth_number == tooth)
    return list((await db.execute(q)).scalars().all())


async def create_restoration(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    patient_id: str,
    data: dict,
) -> Restoration:
    patient = (
        await db.execute(
            select(Patient).where(Patient.id == patient_id, Patient.clinic_id == clinic_id)
        )
    ).scalar_one_or_none()
    if not patient:
        raise NotFoundError("Patient not found")

    surfaces = "".join(sorted(set((data.get("surfaces") or "").upper()))) 
    # Keep clinical order MODBLFIP
    order = "MODBLFIP"
    surfaces = "".join(ch for ch in order if ch in surfaces)

    # Mirror onto odontogram chart entry
    chart = DentalChartEntry(
        clinic_id=clinic_id,
        patient_id=patient_id,
        tooth_number=data["tooth_number"],
        surfaces=surfaces or None,
        condition_code=_chart_code(data["restoration_type"]),
        condition_label=data["restoration_type"].replace("_", " ").title(),
        entry_kind="planned" if data.get("status", "planned") == "planned" else "existing",
        status=data.get("status", "planned"),
        material=data.get("material"),
        shade=data.get("shade"),
        notes=data.get("notes"),
        recorded_by_id=actor_id,
        visit_date=date.today(),
    )
    db.add(chart)
    await db.flush()

    rest = Restoration(
        clinic_id=clinic_id,
        case_id=data.get("case_id"),
        patient_id=patient_id,
        tooth_number=data["tooth_number"],
        surfaces=surfaces,
        restoration_type=data["restoration_type"],
        cavity_size=data.get("cavity_size"),
        blacks_class=data.get("blacks_class"),
        material=data.get("material"),
        shade=data.get("shade"),
        status=data.get("status", "planned"),
        chart_entry_id=chart.id,
        notes=data.get("notes"),
        recorded_by_id=actor_id,
    )
    db.add(rest)
    await db.flush()

    if data.get("case_id"):
        case = (
            await db.execute(
                select(RestorationCase).where(
                    RestorationCase.id == data["case_id"],
                    RestorationCase.clinic_id == clinic_id,
                )
            )
        ).scalar_one_or_none()
        if case and case.status == "planned":
            case.status = "in_progress"

    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="create",
        resource_type="restoration",
        resource_id=rest.id,
    )
    result = await db.execute(
        select(Restoration)
        .where(Restoration.id == rest.id)
        .options(selectinload(Restoration.quality))
    )
    return result.scalar_one()


def _chart_code(restoration_type: str) -> str:
    t = restoration_type.lower()
    if "crown" in t:
        return "crown"
    if "veneer" in t:
        return "crown"
    if "rct" in t:
        return "rct"
    if "filling" in t or "inlay" in t or "onlay" in t or "gic" in t or "amalgam" in t or "composite" in t:
        return "filling"
    if "bridge" in t or "post" in t:
        return "crown"
    return "planned"


async def update_restoration_status(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    restoration_id: str,
    status: str,
    *,
    inventory_item_id: str | None = None,
    inventory_qty: float = 1.0,
) -> Restoration:
    if status not in RESTORATION_STATUSES:
        raise ValidationAppError(f"Invalid status: {status}")
    rest = (
        await db.execute(
            select(Restoration)
            .where(Restoration.id == restoration_id, Restoration.clinic_id == clinic_id)
            .options(selectinload(Restoration.quality))
        )
    ).scalar_one_or_none()
    if not rest:
        raise NotFoundError("Restoration not found")
    prev = rest.status
    rest.status = status
    if rest.chart_entry_id:
        chart = (
            await db.execute(
                select(DentalChartEntry).where(DentalChartEntry.id == rest.chart_entry_id)
            )
        ).scalar_one_or_none()
        if chart:
            chart.status = status
            if status == "completed":
                chart.entry_kind = "existing"

    if status == "completed" and rest.case_id:
        case = (
            await db.execute(select(RestorationCase).where(RestorationCase.id == rest.case_id))
        ).scalar_one_or_none()
        if case:
            case.status = "completed"
            case.recall_due_at = date.today() + timedelta(days=30 * (case.warranty_months or 12))

    if status == "completed" and inventory_item_id:
        await record_inventory_usage(
            db,
            clinic_id,
            actor_id,
            inventory_item_id=inventory_item_id,
            quantity=inventory_qty,
            restoration_id=rest.id,
            reason=f"restoration:{rest.restoration_type}",
        )

    if status == "failed" and rest.case_id:
        case = (
            await db.execute(select(RestorationCase).where(RestorationCase.id == rest.case_id))
        ).scalar_one_or_none()
        if case:
            case.status = "failed"

    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="status_change",
        resource_type="restoration",
        resource_id=rest.id,
        before={"status": prev},
        after={"status": status},
    )
    await db.flush()
    return rest


async def upsert_restoration_quality(
    db: AsyncSession, clinic_id: str, restoration_id: str, data: dict
) -> RestorationQuality:
    rest = (
        await db.execute(
            select(Restoration)
            .where(Restoration.id == restoration_id, Restoration.clinic_id == clinic_id)
            .options(selectinload(Restoration.quality))
        )
    ).scalar_one_or_none()
    if not rest:
        raise NotFoundError("Restoration not found")
    q = rest.quality
    if not q:
        q = RestorationQuality(restoration_id=rest.id)
        db.add(q)
    for k, v in data.items():
        if v is not None and hasattr(q, k):
            setattr(q, k, v)
    await db.flush()
    return q


async def record_inventory_usage(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    *,
    inventory_item_id: str,
    quantity: float,
    restoration_id: str | None = None,
    chart_entry_id: str | None = None,
    reason: str | None = None,
) -> InventoryUsage:
    item = (
        await db.execute(
            select(InventoryItem).where(
                InventoryItem.id == inventory_item_id, InventoryItem.clinic_id == clinic_id
            )
        )
    ).scalar_one_or_none()
    if not item:
        raise NotFoundError("Inventory item not found")
    item.quantity = float(item.quantity) - float(quantity)
    usage = InventoryUsage(
        clinic_id=clinic_id,
        inventory_item_id=inventory_item_id,
        quantity=quantity,
        restoration_id=restoration_id,
        chart_entry_id=chart_entry_id,
        recorded_by_id=actor_id,
        reason=reason,
    )
    db.add(usage)
    await db.flush()
    return usage


# ── Endodontics ───────────────────────────────────────
async def list_endo_cases(db: AsyncSession, clinic_id: str, patient_id: str) -> list[EndoCase]:
    result = await db.execute(
        select(EndoCase)
        .where(EndoCase.clinic_id == clinic_id, EndoCase.patient_id == patient_id)
        .options(selectinload(EndoCase.obturations))
        .order_by(EndoCase.created_at.desc())
    )
    return list(result.scalars().all())


async def create_endo_case(
    db: AsyncSession, clinic_id: str, actor_id: str, patient_id: str, data: dict
) -> EndoCase:
    patient = (
        await db.execute(
            select(Patient).where(Patient.id == patient_id, Patient.clinic_id == clinic_id)
        )
    ).scalar_one_or_none()
    if not patient:
        raise NotFoundError("Patient not found")

    # Chart mark
    chart = DentalChartEntry(
        clinic_id=clinic_id,
        patient_id=patient_id,
        tooth_number=data["tooth_number"],
        condition_code="rct",
        condition_label=data.get("procedure_type", "rct").upper(),
        entry_kind="existing",
        status="in_progress",
        recorded_by_id=actor_id,
        visit_date=date.today(),
    )
    db.add(chart)

    case = EndoCase(
        clinic_id=clinic_id,
        patient_id=patient_id,
        tooth_number=data["tooth_number"],
        procedure_type=data.get("procedure_type", "rct"),
        tooth_length_mm=data.get("tooth_length_mm"),
        canal_count=data.get("canal_count"),
        working_length_mm=data.get("working_length_mm"),
        prep_method=data.get("prep_method"),
        irrigants_json=json.dumps(data.get("irrigants") or []),
        dressings_json=json.dumps(data.get("dressings") or []),
        status=data.get("status", "in_progress"),
        notes=data.get("notes"),
        recorded_by_id=actor_id,
    )
    db.add(case)
    await db.flush()
    result = await db.execute(
        select(EndoCase)
        .where(EndoCase.id == case.id)
        .options(selectinload(EndoCase.obturations))
    )
    return result.scalar_one()


async def update_endo_case(
    db: AsyncSession, clinic_id: str, case_id: str, data: dict
) -> EndoCase:
    case = (
        await db.execute(
            select(EndoCase)
            .where(EndoCase.id == case_id, EndoCase.clinic_id == clinic_id)
            .options(selectinload(EndoCase.obturations))
        )
    ).scalar_one_or_none()
    if not case:
        raise NotFoundError("Endo case not found")
    for key in (
        "procedure_type",
        "tooth_length_mm",
        "canal_count",
        "working_length_mm",
        "prep_method",
        "status",
        "notes",
        "final_restoration_id",
    ):
        if key in data and data[key] is not None:
            setattr(case, key, data[key])
    if "irrigants" in data:
        case.irrigants_json = json.dumps(data["irrigants"] or [])
    if "dressings" in data:
        case.dressings_json = json.dumps(data["dressings"] or [])
    await db.flush()
    return case


async def add_obturation(
    db: AsyncSession, clinic_id: str, case_id: str, data: dict
) -> EndoCase:
    case = (
        await db.execute(
            select(EndoCase)
            .where(EndoCase.id == case_id, EndoCase.clinic_id == clinic_id)
            .options(selectinload(EndoCase.obturations))
        )
    ).scalar_one_or_none()
    if not case:
        raise NotFoundError("Endo case not found")
    visit = data.get("visit_date")
    if isinstance(visit, str):
        visit = date.fromisoformat(visit)
    db.add(
        EndoObturation(
            endo_case_id=case.id,
            visit_date=visit or date.today(),
            canals_filled=data.get("canals_filled"),
            material=data.get("material"),
            notes=data.get("notes"),
        )
    )
    await db.flush()
    await db.refresh(case, attribute_names=["obturations"])
    return case


async def restoration_failure_rate(db: AsyncSession, clinic_id: str) -> dict:
    total = (
        await db.execute(
            select(func.count())
            .select_from(Restoration)
            .where(Restoration.clinic_id == clinic_id)
        )
    ).scalar_one()
    failed = (
        await db.execute(
            select(func.count())
            .select_from(Restoration)
            .where(
                Restoration.clinic_id == clinic_id,
                Restoration.status.in_(["failed", "replaced"]),
            )
        )
    ).scalar_one()
    return {
        "total": total,
        "failed_or_replaced": failed,
        "failure_rate": (failed / total) if total else 0.0,
    }
