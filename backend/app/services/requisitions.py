"""Internal supply requisitions: clinical departments request, store fulfills."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundError, ValidationAppError
from app.models import (
    InventoryItem,
    InventoryItemKind,
    Requisition,
    RequisitionLine,
    RequisitionStatus,
    StockLocation,
    StockLot,
    User,
)
from app.schemas import InventoryItemOut, RequisitionCreate, RequisitionLineOut, RequisitionOut
from app.services import events as bus
from app.services import warehouse as stock
from app.services.config import allocate_number
from app.services.domain import write_audit

DEPT_LOCATION = {
    "restorative": "REST",
    "maxillofacial": "OMFS",
    "orthodontic": "ORTHO",
    "paediatric": "PAED",
    "hygiene": "HYG",
    "pharmacy": "PHARM",
    "lab": "LAB",
    "front_desk": "MAIN",
    "warehouse": "MAIN",
}

OPEN_STATUSES = (RequisitionStatus.DRAFT, RequisitionStatus.SUBMITTED, RequisitionStatus.APPROVED)


async def _name_for(db: AsyncSession, user_id: str | None) -> str | None:
    if not user_id:
        return None
    return (await db.execute(select(User.full_name).where(User.id == user_id))).scalar_one_or_none()


async def _location_name(db: AsyncSession, location_id: str | None) -> str | None:
    if not location_id:
        return None
    loc = (await db.execute(select(StockLocation).where(StockLocation.id == location_id))).scalar_one_or_none()
    return loc.name if loc else None


def _line_out(line: RequisitionLine, store_on_hand: float | None = None) -> RequisitionLineOut:
    item = line.inventory_item
    requested = float(line.quantity_requested or 0)
    issued = float(line.quantity_issued or 0)
    outstanding = max(requested - issued, 0.0)
    in_store = store_on_hand
    shortfall = max(outstanding - in_store, 0.0) if in_store is not None else 0.0
    return RequisitionLineOut(
        id=line.id,
        inventory_item_id=line.inventory_item_id,
        quantity_requested=requested,
        quantity_issued=issued,
        quantity_outstanding=outstanding,
        notes=line.notes,
        sku=item.sku if item else None,
        item_name=item.name if item else None,
        unit=item.unit if item else None,
        on_hand=float(item.quantity) if item else None,
        store_on_hand=in_store,
        shortfall=shortfall,
        reorder_level=float(item.reorder_level) if item else None,
    )


async def main_store_on_hand(
    db: AsyncSession, clinic_id: str, item_ids: set[str]
) -> dict[str, float]:
    if not item_ids:
        return {}
    await stock.ensure_locations(db, clinic_id)
    main = await stock.location_by_code(db, clinic_id, "MAIN")
    rows = (
        await db.execute(
            select(StockLot.inventory_item_id, func.coalesce(func.sum(StockLot.quantity), 0.0))
            .where(
                StockLot.clinic_id == clinic_id,
                StockLot.location_id == main.id,
                StockLot.inventory_item_id.in_(item_ids),
            )
            .group_by(StockLot.inventory_item_id)
        )
    ).all()
    found = {item_id: float(qty or 0) for item_id, qty in rows}
    return {item_id: found.get(item_id, 0.0) for item_id in item_ids}


async def open_line_totals(db: AsyncSession, clinic_id: str) -> dict[str, tuple[float, float]]:
    """Outstanding request and already issued quantity on lines still at the store."""
    rows = (
        await db.execute(
            select(
                RequisitionLine.inventory_item_id,
                func.coalesce(
                    func.sum(RequisitionLine.quantity_requested - func.coalesce(RequisitionLine.quantity_issued, 0)),
                    0.0,
                ),
                func.coalesce(func.sum(func.coalesce(RequisitionLine.quantity_issued, 0)), 0.0),
            )
            .join(Requisition, Requisition.id == RequisitionLine.requisition_id)
            .where(
                Requisition.clinic_id == clinic_id,
                Requisition.status.in_((RequisitionStatus.SUBMITTED, RequisitionStatus.APPROVED)),
            )
            .group_by(RequisitionLine.inventory_item_id)
        )
    ).all()
    return {item_id: (float(outstanding or 0), float(issued or 0)) for item_id, outstanding, issued in rows}


async def with_store_position(
    db: AsyncSession, clinic_id: str, items: list[InventoryItem]
) -> list[InventoryItemOut]:
    store = await main_store_on_hand(db, clinic_id, {item.id for item in items})
    commitments = await open_line_totals(db, clinic_id)
    out: list[InventoryItemOut] = []
    for item in items:
        outstanding, issued = commitments.get(item.id, (0.0, 0.0))
        out.append(
            InventoryItemOut.model_validate(item).model_copy(
                update={
                    "store_on_hand": store.get(item.id, 0.0),
                    "quantity_requested_open": outstanding,
                    "quantity_issued_open": issued,
                }
            )
        )
    return out


async def to_out(
    db: AsyncSession, row: Requisition, store: dict[str, float] | None = None
) -> RequisitionOut:
    names = {
        "requested_by_name": await _name_for(db, row.requested_by_id),
        "approved_by_name": await _name_for(db, row.approved_by_id),
        "destination_location_name": await _location_name(db, row.destination_location_id),
    }
    if store is None:
        store = await main_store_on_hand(
            db, row.clinic_id, {line.inventory_item_id for line in (row.lines or [])}
        )
    return RequisitionOut.model_validate(row).model_copy(
        update={
            **names,
            "lines": [
                _line_out(line, store.get(line.inventory_item_id, 0.0)) for line in (row.lines or [])
            ],
        }
    )


async def _get_row(db: AsyncSession, clinic_id: str, requisition_id: str) -> Requisition:
    row = (
        await db.execute(
            select(Requisition)
            .where(Requisition.clinic_id == clinic_id, Requisition.id == requisition_id)
            .options(selectinload(Requisition.lines).selectinload(RequisitionLine.inventory_item))
        )
    ).scalar_one_or_none()
    if row is None:
        raise NotFoundError("Requisition")
    return row


async def _destination(
    db: AsyncSession, clinic_id: str, department: str, location_id: str | None
) -> StockLocation:
    await stock.ensure_locations(db, clinic_id)
    if location_id:
        return await stock.get_location(db, clinic_id, location_id)
    code = DEPT_LOCATION.get(department, "MAIN")
    return await stock.location_by_code(db, clinic_id, code)


async def list_requisitions(
    db: AsyncSession,
    clinic_id: str,
    *,
    status: str | None = None,
    department: str | None = None,
    requested_by_id: str | None = None,
    limit: int = 80,
) -> list[RequisitionOut]:
    stmt = (
        select(Requisition)
        .where(Requisition.clinic_id == clinic_id)
        .options(selectinload(Requisition.lines).selectinload(RequisitionLine.inventory_item))
    )
    if status and status != "all":
        if status == "open":
            stmt = stmt.where(Requisition.status.in_(OPEN_STATUSES))
        else:
            stmt = stmt.where(Requisition.status == status)
    if department:
        stmt = stmt.where(Requisition.department == department)
    if requested_by_id:
        stmt = stmt.where(Requisition.requested_by_id == requested_by_id)
    stmt = stmt.order_by(Requisition.created_at.desc()).limit(min(limit, 200))
    rows = list((await db.execute(stmt)).scalars().all())
    store = await main_store_on_hand(
        db, clinic_id, {line.inventory_item_id for row in rows for line in row.lines}
    )
    return [await to_out(db, row, store) for row in rows]


async def get_requisition(db: AsyncSession, clinic_id: str, requisition_id: str) -> RequisitionOut:
    return await to_out(db, await _get_row(db, clinic_id, requisition_id))


async def create_requisition(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    data: RequisitionCreate,
) -> RequisitionOut:
    if data.department not in DEPT_LOCATION:
        raise ValidationAppError(
            "Department must be restorative, maxillofacial, orthodontic, paediatric, "
            "hygiene, pharmacy, lab, front_desk, or warehouse"
        )
    dest = await _destination(db, clinic_id, data.department, data.destination_location_id)
    number = await allocate_number(db, clinic_id, "requisition")
    now = datetime.now(UTC)
    submitted = bool(data.submit)
    row = Requisition(
        clinic_id=clinic_id,
        req_number=number,
        status=RequisitionStatus.SUBMITTED if submitted else RequisitionStatus.DRAFT,
        department=data.department,
        destination_location_id=dest.id,
        requested_by_id=actor_id,
        notes=(data.notes or "").strip() or None,
        submitted_at=now if submitted else None,
    )
    db.add(row)
    await db.flush()
    for line in data.lines:
        item = await stock.get_stock_item(db, clinic_id, line.inventory_item_id)
        if item.item_kind == InventoryItemKind.SERVICE:
            raise ValidationAppError(f"{item.name} is a service, not a stock item")
        db.add(
            RequisitionLine(
                requisition_id=row.id,
                inventory_item_id=item.id,
                quantity_requested=float(line.quantity),
                notes=(line.notes or "").strip() or None,
            )
        )
    await db.flush()
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="create",
        resource_type="requisition",
        resource_id=row.id,
        after={"req_number": row.req_number, "status": row.status, "department": row.department},
    )
    return await to_out(db, await _get_row(db, clinic_id, row.id))


async def submit_requisition(
    db: AsyncSession, clinic_id: str, actor_id: str, requisition_id: str
) -> RequisitionOut:
    row = await _get_row(db, clinic_id, requisition_id)
    if row.status != RequisitionStatus.DRAFT:
        raise ValidationAppError("Only a draft requisition can be submitted")
    if not row.lines:
        raise ValidationAppError("Add at least one supply line before submitting")
    row.status = RequisitionStatus.SUBMITTED
    row.submitted_at = datetime.now(UTC)
    await db.flush()
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="submit",
        resource_type="requisition",
        resource_id=row.id,
        after={"status": row.status},
    )
    return await to_out(db, row)


async def approve_requisition(
    db: AsyncSession, clinic_id: str, actor_id: str, requisition_id: str
) -> RequisitionOut:
    row = await _get_row(db, clinic_id, requisition_id)
    if row.status != RequisitionStatus.SUBMITTED:
        raise ValidationAppError("Approve a submitted requisition")
    row.status = RequisitionStatus.APPROVED
    row.approved_by_id = actor_id
    row.approved_at = datetime.now(UTC)
    await db.flush()
    await bus.publish(
        db,
        clinic_id=clinic_id,
        event_type=bus.REQUISITION_APPROVED,
        aggregate_type="requisition",
        aggregate_id=row.id,
        payload={"req_number": row.req_number, "department": row.department},
        actor_id=actor_id,
    )
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="approve",
        resource_type="requisition",
        resource_id=row.id,
        after={"status": row.status},
    )
    return await to_out(db, row)


async def reject_requisition(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    requisition_id: str,
    *,
    reason: str | None = None,
) -> RequisitionOut:
    row = await _get_row(db, clinic_id, requisition_id)
    if row.status not in (RequisitionStatus.SUBMITTED, RequisitionStatus.APPROVED):
        raise ValidationAppError("Only a submitted or approved requisition can be rejected")
    row.status = RequisitionStatus.REJECTED
    row.reject_reason = (reason or "").strip() or None
    row.closed_at = datetime.now(UTC)
    row.approved_by_id = actor_id
    await db.flush()
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="reject",
        resource_type="requisition",
        resource_id=row.id,
        after={"status": row.status, "reason": row.reject_reason},
    )
    return await to_out(db, row)


async def cancel_requisition(
    db: AsyncSession, clinic_id: str, actor_id: str, requisition_id: str, *, reason: str | None = None
) -> RequisitionOut:
    row = await _get_row(db, clinic_id, requisition_id)
    if row.status not in (RequisitionStatus.DRAFT, RequisitionStatus.SUBMITTED):
        raise ValidationAppError("An approved requisition must be rejected, not cancelled")
    row.status = RequisitionStatus.CANCELLED
    row.reject_reason = (reason or "").strip() or None
    row.closed_at = datetime.now(UTC)
    await db.flush()
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="cancel",
        resource_type="requisition",
        resource_id=row.id,
        after={"status": row.status},
    )
    return await to_out(db, row)


async def fulfill_requisition(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    requisition_id: str,
    *,
    from_location_id: str | None = None,
    issue_lines: dict[str, float] | None = None,
) -> RequisitionOut:
    row = await _get_row(db, clinic_id, requisition_id)
    if row.status != RequisitionStatus.APPROVED:
        raise ValidationAppError("Fulfill an approved requisition")
    if not row.destination_location_id:
        raise ValidationAppError("This requisition has no destination location")
    by_id = {line.id: line for line in row.lines}
    if issue_lines is not None:
        unknown = set(issue_lines) - set(by_id)
        if unknown:
            raise ValidationAppError("One of the issue lines is not on this requisition")
    await stock.ensure_locations(db, clinic_id)
    source = (
        await stock.get_location(db, clinic_id, from_location_id)
        if from_location_id
        else await stock.location_by_code(db, clinic_id, "MAIN")
    )
    issued_any = False
    for line in row.lines:
        remaining = float(line.quantity_requested) - float(line.quantity_issued or 0)
        if remaining <= 1e-9:
            continue
        if issue_lines is not None and line.id not in issue_lines:
            continue
        qty = remaining if issue_lines is None else float(issue_lines[line.id])
        if qty - remaining > 1e-9:
            name = line.inventory_item.name if line.inventory_item else "This item"
            raise ValidationAppError(f"{name} only has {remaining:g} still to issue")
        if qty <= 1e-9:
            continue
        available = await stock.on_hand_at(db, clinic_id, line.inventory_item_id, source.id)
        if qty - available > 1e-9:
            name = line.inventory_item.name if line.inventory_item else "This item"
            unit = line.inventory_item.unit if line.inventory_item else ""
            raise ValidationAppError(f"Only {available:g} {unit} of {name} is in the store".strip())
        await stock.issue_department(
            db,
            clinic_id,
            actor_id,
            inventory_item_id=line.inventory_item_id,
            quantity=qty,
            from_location_id=source.id,
            to_location_id=row.destination_location_id,
            reason=f"REQ {row.req_number}",
            requisition_id=row.id,
        )
        line.quantity_issued = float(line.quantity_issued or 0) + qty
        issued_any = True
    if not issued_any:
        raise ValidationAppError("Nothing in the store to issue")
    still_open = any(
        float(line.quantity_requested) - float(line.quantity_issued or 0) > 1e-6 for line in row.lines
    )
    if not still_open:
        row.status = RequisitionStatus.FULFILLED
        row.fulfilled_by_id = actor_id
        row.fulfilled_at = datetime.now(UTC)
        row.closed_at = row.fulfilled_at
    await db.flush()
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="fulfill",
        resource_type="requisition",
        resource_id=row.id,
        after={"status": row.status},
    )
    return await to_out(db, await _get_row(db, clinic_id, row.id))
