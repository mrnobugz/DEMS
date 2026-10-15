"""Clinic reports: financial, clinical, and operational summaries."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Appointment,
    ClinicalVisit,
    ImagingStudy,
    InventoryItem,
    InventoryItemKind,
    InventoryUsage,
    Invoice,
    InvoiceLineItem,
    InvoiceStatus,
    LabCase,
    Payment,
    Requisition,
    RequisitionStatus,
    Restoration,
)
from app.services import clinical_depth as depth
from app.services.domain import as_utc


def period_start(days: int) -> datetime:
    return datetime.now(UTC) - timedelta(days=max(1, min(days, 365)))


def day_start(on: date | None = None) -> datetime:
    today = on or date.today()
    return datetime(today.year, today.month, today.day, tzinfo=UTC)


async def financial_report(db: AsyncSession, clinic_id: str, *, days: int = 30) -> dict[str, Any]:
    today = date.today()
    month_start = today.replace(day=1)
    start = period_start(days)
    today_start = day_start(today)
    month_dt = datetime(month_start.year, month_start.month, 1, tzinfo=UTC)

    payments_today = (
        await db.execute(
            select(func.coalesce(func.sum(Payment.amount), 0.0)).where(
                Payment.clinic_id == clinic_id, Payment.paid_at >= today_start
            )
        )
    ).scalar_one()
    payments_month = (
        await db.execute(
            select(func.coalesce(func.sum(Payment.amount), 0.0)).where(
                Payment.clinic_id == clinic_id, Payment.paid_at >= month_dt
            )
        )
    ).scalar_one()
    payments_period = (
        await db.execute(
            select(func.coalesce(func.sum(Payment.amount), 0.0)).where(
                Payment.clinic_id == clinic_id, Payment.paid_at >= start
            )
        )
    ).scalar_one()
    outstanding = (
        await db.execute(
            select(func.coalesce(func.sum(Invoice.total - Invoice.amount_paid), 0.0)).where(
                Invoice.clinic_id == clinic_id,
                Invoice.status.in_([InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID]),
            )
        )
    ).scalar_one()
    invoices_period = (
        await db.execute(
            select(func.count())
            .select_from(Invoice)
            .where(
                Invoice.clinic_id == clinic_id,
                Invoice.created_at >= start,
                Invoice.status != InvoiceStatus.VOID,
            )
        )
    ).scalar_one()

    by_method_rows = (
        await db.execute(
            select(Payment.method, func.coalesce(func.sum(Payment.amount), 0.0), func.count())
            .where(Payment.clinic_id == clinic_id, Payment.paid_at >= start)
            .group_by(Payment.method)
            .order_by(func.sum(Payment.amount).desc())
        )
    ).all()
    by_method = [
        {"method": method or "unknown", "amount": float(amount or 0), "count": int(count or 0)}
        for method, amount, count in by_method_rows
    ]

    # Daily collections in the period (SQLite/Postgres friendly date cast via substr on ISO).
    payment_rows = (
        await db.execute(
            select(Payment.paid_at, Payment.amount).where(
                Payment.clinic_id == clinic_id, Payment.paid_at >= start
            )
        )
    ).all()
    by_day_map: dict[str, float] = {}
    for paid_at, amount in payment_rows:
        if not paid_at:
            continue
        key = as_utc(paid_at).date().isoformat()
        by_day_map[key] = round(by_day_map.get(key, 0.0) + float(amount or 0), 2)
    by_day = [{"date": day, "amount": by_day_map[day]} for day in sorted(by_day_map)]

    aging = {"0_30": 0.0, "31_60": 0.0, "61_90": 0.0, "90_plus": 0.0}
    open_inv = (
        await db.execute(
            select(Invoice).where(
                Invoice.clinic_id == clinic_id,
                Invoice.status.in_([InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID]),
            )
        )
    ).scalars().all()
    now = datetime.now(UTC)
    for inv in open_inv:
        bal = float(inv.total) - float(inv.amount_paid)
        issued = inv.issued_at or inv.created_at
        age_days = (now - as_utc(issued)).days if issued else 0
        if age_days <= 30:
            aging["0_30"] += bal
        elif age_days <= 60:
            aging["31_60"] += bal
        elif age_days <= 90:
            aging["61_90"] += bal
        else:
            aging["90_plus"] += bal

    return {
        "period_days": days,
        "period_start": start.date().isoformat(),
        "period_end": today.isoformat(),
        "revenue_today": float(payments_today or 0),
        "revenue_month": float(payments_month or 0),
        "revenue_period": float(payments_period or 0),
        "outstanding": float(outstanding or 0),
        "invoices_period": int(invoices_period or 0),
        "aging": {k: round(v, 2) for k, v in aging.items()},
        "by_method": by_method,
        "by_day": by_day,
    }


async def clinical_report(
    db: AsyncSession,
    clinic_id: str,
    *,
    days: int = 30,
    provider_id: str | None = None,
) -> dict[str, Any]:
    start = period_start(days)
    start_date = start.date()

    resto_q = (
        select(Restoration.restoration_type, func.count())
        .where(Restoration.clinic_id == clinic_id, Restoration.created_at >= start)
        .group_by(Restoration.restoration_type)
        .order_by(func.count().desc())
        .limit(10)
    )
    # Restorations do not always carry provider; own-scope uses invoice lines + visits instead.
    top_resto = (await db.execute(resto_q)).all() if not provider_id else []

    line_q = (
        select(
            func.coalesce(InvoiceLineItem.procedure_code, InvoiceLineItem.description),
            func.count(),
            func.coalesce(func.sum(InvoiceLineItem.total), 0.0),
        )
        .select_from(InvoiceLineItem)
        .join(Invoice, Invoice.id == InvoiceLineItem.invoice_id)
        .where(
            Invoice.clinic_id == clinic_id,
            Invoice.created_at >= start,
            Invoice.status != InvoiceStatus.VOID,
            InvoiceLineItem.line_kind.in_(["procedure", "imaging", "lab", "service"]),
        )
        .group_by(func.coalesce(InvoiceLineItem.procedure_code, InvoiceLineItem.description))
        .order_by(func.count().desc())
        .limit(10)
    )
    if provider_id:
        line_q = line_q.where(InvoiceLineItem.provider_id == provider_id)
    top_billed = (await db.execute(line_q)).all()

    visits_q = select(func.count()).select_from(ClinicalVisit).where(
        ClinicalVisit.clinic_id == clinic_id, ClinicalVisit.visit_date >= start_date
    )
    if provider_id:
        visits_q = visits_q.where(ClinicalVisit.examiner_id == provider_id)
    visits = (await db.execute(visits_q)).scalar_one()

    imaging_q = select(func.count()).select_from(ImagingStudy).where(
        ImagingStudy.clinic_id == clinic_id, ImagingStudy.captured_at >= start
    )
    if provider_id:
        imaging_q = imaging_q.where(ImagingStudy.captured_by_id == provider_id)
    imaging = (await db.execute(imaging_q)).scalar_one()

    lab_q = select(func.count()).select_from(LabCase).where(
        LabCase.clinic_id == clinic_id, LabCase.created_at >= start
    )
    if provider_id:
        lab_q = lab_q.where(LabCase.dentist_id == provider_id)
    lab_cases = (await db.execute(lab_q)).scalar_one()

    fail = await depth.restoration_failure_rate(db, clinic_id)

    material_q = (
        select(func.coalesce(func.sum(InventoryUsage.quantity * InventoryItem.unit_cost), 0.0))
        .select_from(InventoryUsage)
        .join(InventoryItem, InventoryItem.id == InventoryUsage.inventory_item_id)
        .where(InventoryUsage.clinic_id == clinic_id, InventoryUsage.created_at >= start)
    )
    material_cost = (await db.execute(material_q)).scalar_one()

    top_procedures = [{"type": t, "count": int(c)} for t, c in top_resto]
    if not top_procedures:
        top_procedures = [{"type": label, "count": int(count)} for label, count, _amount in top_billed]

    return {
        "period_days": days,
        "period_start": start_date.isoformat(),
        "period_end": date.today().isoformat(),
        "scope": "own" if provider_id else "clinic",
        "visits": int(visits or 0),
        "imaging_studies": int(imaging or 0),
        "lab_cases": int(lab_cases or 0),
        "top_procedures": top_procedures,
        "top_billed": [
            {"label": label, "count": int(count), "amount": float(amount or 0)}
            for label, count, amount in top_billed
        ],
        "restoration_failures": fail,
        "material_cost_used": float(material_cost or 0),
    }


async def operational_report(db: AsyncSession, clinic_id: str, *, days: int = 7) -> dict[str, Any]:
    start = period_start(days)

    total = (
        await db.execute(
            select(func.count())
            .select_from(Appointment)
            .where(Appointment.clinic_id == clinic_id, Appointment.starts_at >= start)
        )
    ).scalar_one()
    no_shows = (
        await db.execute(
            select(func.count())
            .select_from(Appointment)
            .where(
                Appointment.clinic_id == clinic_id,
                Appointment.starts_at >= start,
                Appointment.status == "no_show",
            )
        )
    ).scalar_one()
    completed = (
        await db.execute(
            select(func.count())
            .select_from(Appointment)
            .where(
                Appointment.clinic_id == clinic_id,
                Appointment.starts_at >= start,
                Appointment.status == "completed",
            )
        )
    ).scalar_one()

    status_rows = (
        await db.execute(
            select(Appointment.status, func.count())
            .where(Appointment.clinic_id == clinic_id, Appointment.starts_at >= start)
            .group_by(Appointment.status)
            .order_by(func.count().desc())
        )
    ).all()

    low_stock = (
        await db.execute(
            select(func.count())
            .select_from(InventoryItem)
            .where(
                InventoryItem.clinic_id == clinic_id,
                InventoryItem.is_active.is_(True),
                InventoryItem.item_kind != InventoryItemKind.SERVICE,
                InventoryItem.quantity <= InventoryItem.reorder_level,
            )
        )
    ).scalar_one()

    open_reqs = (
        await db.execute(
            select(func.count())
            .select_from(Requisition)
            .where(
                Requisition.clinic_id == clinic_id,
                Requisition.status.in_([RequisitionStatus.SUBMITTED, RequisitionStatus.APPROVED]),
            )
        )
    ).scalar_one()

    return {
        "period_days": days,
        "period_start": start.date().isoformat(),
        "period_end": date.today().isoformat(),
        "appointments": int(total or 0),
        "completed": int(completed or 0),
        "no_shows": int(no_shows or 0),
        "no_show_rate": (no_shows / total) if total else 0.0,
        "utilization_proxy": (completed / total) if total else 0.0,
        # Backward-compatible keys used by the first Reports UI.
        "appointments_7d": int(total or 0),
        "completed_7d": int(completed or 0),
        "no_shows_7d": int(no_shows or 0),
        "by_status": [{"status": status or "unknown", "count": int(count)} for status, count in status_rows],
        "low_stock_skus": int(low_stock or 0),
        "open_requisitions": int(open_reqs or 0),
    }
