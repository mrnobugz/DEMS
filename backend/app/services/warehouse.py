"""Clinic warehouse: locations, lots, and a typed stock movement ledger."""

from __future__ import annotations

import json
import re
from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundError, ValidationAppError
from app.models import (
    CatalogItem,
    InventoryItem,
    InventoryItemKind,
    Invoice,
    InvoiceLineItem,
    PurchaseOrder,
    PurchaseOrderLine,
    PurchaseOrderStatus,
    StockLocation,
    StockLocationKind,
    StockLot,
    StockMovement,
    StockMovementType,
    Supplier,
)

DEFAULT_LOT = "DEFAULT"

DEFAULT_LOCATIONS: tuple[tuple[str, str, str], ...] = (
    ("MAIN", "Main store", StockLocationKind.STORE),
    ("REST", "Restorative", StockLocationKind.DEPARTMENT),
    ("OMFS", "Maxillofacial", StockLocationKind.DEPARTMENT),
    ("ORTHO", "Orthodontic", StockLocationKind.DEPARTMENT),
    ("PAED", "Paediatric", StockLocationKind.DEPARTMENT),
    ("HYG", "Hygiene", StockLocationKind.DEPARTMENT),
    ("PHARM", "Pharmacy", StockLocationKind.PHARMACY),
    ("LAB", "Lab", StockLocationKind.DEPARTMENT),
)

INBOUND_TYPES = {
    StockMovementType.RECEIVE,
    StockMovementType.RETURN,
    StockMovementType.STOCKTAKE,
    StockMovementType.ADJUST,
}


async def ensure_locations(db: AsyncSession, clinic_id: str) -> list[StockLocation]:
    existing = (
        await db.execute(
            select(StockLocation).where(StockLocation.clinic_id == clinic_id).order_by(StockLocation.code)
        )
    ).scalars().all()
    by_code = {row.code: row for row in existing}
    created = False
    for code, name, kind in DEFAULT_LOCATIONS:
        if code in by_code:
            continue
        loc = StockLocation(clinic_id=clinic_id, code=code, name=name, kind=kind, is_active=True)
        db.add(loc)
        by_code[code] = loc
        created = True
    if created:
        await db.flush()
    await _backfill_opening_lots(db, clinic_id, by_code.get("MAIN"))
    return list(by_code.values())


async def _backfill_opening_lots(
    db: AsyncSession, clinic_id: str, main: StockLocation | None
) -> None:
    if not main:
        return
    items = (
        await db.execute(
            select(InventoryItem).where(
                InventoryItem.clinic_id == clinic_id,
                InventoryItem.item_kind == InventoryItemKind.STOCK,
            )
        )
    ).scalars().all()
    for item in items:
        lot_count = (
            await db.execute(
                select(func.count())
                .select_from(StockLot)
                .where(StockLot.clinic_id == clinic_id, StockLot.inventory_item_id == item.id)
            )
        ).scalar_one()
        if lot_count:
            await _refresh_item_qty(db, item)
            continue
        qty = float(item.quantity or 0)
        if qty <= 0:
            continue
        lot = StockLot(
            clinic_id=clinic_id,
            inventory_item_id=item.id,
            location_id=main.id,
            lot_code=DEFAULT_LOT,
            expiry_date=item.expiry_date,
            quantity=qty,
            unit_cost=float(item.unit_cost or 0),
        )
        db.add(lot)
        await db.flush()
        db.add(
            StockMovement(
                clinic_id=clinic_id,
                inventory_item_id=item.id,
                lot_id=lot.id,
                to_location_id=main.id,
                movement_type=StockMovementType.ADJUST,
                quantity=qty,
                unit_cost_snapshot=float(item.unit_cost or 0),
                reason="opening-balance",
            )
        )
    await db.flush()


async def location_by_code(db: AsyncSession, clinic_id: str, code: str) -> StockLocation:
    await ensure_locations(db, clinic_id)
    loc = (
        await db.execute(
            select(StockLocation).where(StockLocation.clinic_id == clinic_id, StockLocation.code == code)
        )
    ).scalar_one_or_none()
    if not loc:
        raise NotFoundError("Stock location")
    return loc


async def get_location(db: AsyncSession, clinic_id: str, location_id: str) -> StockLocation:
    await ensure_locations(db, clinic_id)
    loc = (
        await db.execute(
            select(StockLocation).where(StockLocation.id == location_id, StockLocation.clinic_id == clinic_id)
        )
    ).scalar_one_or_none()
    if not loc:
        raise NotFoundError("Stock location")
    return loc


async def list_locations(db: AsyncSession, clinic_id: str) -> list[StockLocation]:
    return await ensure_locations(db, clinic_id)


async def get_stock_item(db: AsyncSession, clinic_id: str, item_id: str) -> InventoryItem:
    item = (
        await db.execute(
            select(InventoryItem).where(InventoryItem.id == item_id, InventoryItem.clinic_id == clinic_id)
        )
    ).scalar_one_or_none()
    if not item:
        raise NotFoundError("Inventory item")
    return item


def _require_stock(item: InventoryItem) -> None:
    if item.item_kind == InventoryItemKind.SERVICE:
        raise ValidationAppError("Service items do not hold stock — edit the sale price instead")


async def _refresh_item_qty(db: AsyncSession, item: InventoryItem) -> None:
    total = (
        await db.execute(
            select(func.coalesce(func.sum(StockLot.quantity), 0)).where(
                StockLot.clinic_id == item.clinic_id, StockLot.inventory_item_id == item.id
            )
        )
    ).scalar_one()
    item.quantity = float(total or 0)
    await db.flush()


async def _get_or_create_lot(
    db: AsyncSession,
    clinic_id: str,
    item: InventoryItem,
    location_id: str,
    lot_code: str,
    expiry_date: date | None,
    unit_cost: float,
) -> StockLot:
    code = (lot_code or DEFAULT_LOT).strip() or DEFAULT_LOT
    lot = (
        await db.execute(
            select(StockLot).where(
                StockLot.clinic_id == clinic_id,
                StockLot.inventory_item_id == item.id,
                StockLot.location_id == location_id,
                StockLot.lot_code == code,
            )
        )
    ).scalar_one_or_none()
    if lot:
        if expiry_date and not lot.expiry_date:
            lot.expiry_date = expiry_date
        return lot
    lot = StockLot(
        clinic_id=clinic_id,
        inventory_item_id=item.id,
        location_id=location_id,
        lot_code=code,
        expiry_date=expiry_date,
        quantity=0,
        unit_cost=unit_cost,
    )
    db.add(lot)
    await db.flush()
    return lot


async def _lots_fefo(
    db: AsyncSession, clinic_id: str, item_id: str, location_id: str
) -> list[StockLot]:
    rows = (
        await db.execute(
            select(StockLot)
            .where(
                StockLot.clinic_id == clinic_id,
                StockLot.inventory_item_id == item_id,
                StockLot.location_id == location_id,
                StockLot.quantity > 0,
            )
            .order_by(StockLot.expiry_date.asc().nulls_last(), StockLot.created_at)
        )
    ).scalars().all()
    return list(rows)


async def on_hand_at(
    db: AsyncSession, clinic_id: str, item_id: str, location_id: str | None = None
) -> float:
    q = select(func.coalesce(func.sum(StockLot.quantity), 0)).where(
        StockLot.clinic_id == clinic_id, StockLot.inventory_item_id == item_id
    )
    if location_id:
        q = q.where(StockLot.location_id == location_id)
    return float((await db.execute(q)).scalar_one() or 0)


async def _increase_lot(
    db: AsyncSession,
    *,
    clinic_id: str,
    actor_id: str | None,
    item: InventoryItem,
    location_id: str,
    qty: float,
    unit_cost: float,
    movement_type: str,
    lot_code: str | None,
    expiry_date: date | None,
    reason: str | None,
    **refs: Any,
) -> StockMovement:
    if item.track_lots and not (lot_code or "").strip():
        raise ValidationAppError(f"{item.name} requires a lot number on receive")
    lot = await _get_or_create_lot(
        db, clinic_id, item, location_id, lot_code or DEFAULT_LOT, expiry_date, unit_cost
    )
    old_qty = float(item.quantity or 0)
    old_cost = float(item.unit_cost or 0)
    lot.quantity = float(lot.quantity) + qty
    if unit_cost > 0:
        lot.unit_cost = unit_cost
    new_qty = old_qty + qty
    if new_qty > 0 and unit_cost >= 0:
        item.unit_cost = round(((old_qty * old_cost) + (qty * unit_cost)) / new_qty, 4)
    cost_snap = float(item.unit_cost or unit_cost or 0)
    mv = StockMovement(
        clinic_id=clinic_id,
        inventory_item_id=item.id,
        lot_id=lot.id,
        to_location_id=location_id,
        movement_type=movement_type,
        quantity=qty,
        unit_cost_snapshot=cost_snap,
        reason=reason,
        recorded_by_id=actor_id,
        **{k: v for k, v in refs.items() if v is not None},
    )
    db.add(mv)
    await db.flush()
    await _refresh_item_qty(db, item)
    return mv


async def _decrease_lots(
    db: AsyncSession,
    *,
    clinic_id: str,
    actor_id: str | None,
    item: InventoryItem,
    location_id: str,
    qty: float,
    movement_type: str,
    lot_code: str | None = None,
    reason: str | None = None,
    **refs: Any,
) -> list[StockMovement]:
    available = await on_hand_at(db, clinic_id, item.id, location_id)
    if available + 1e-9 < qty:
        raise ValidationAppError(f"Insufficient stock for {item.name}")
    if lot_code:
        lots = [
            lot
            for lot in await _lots_fefo(db, clinic_id, item.id, location_id)
            if lot.lot_code == lot_code
        ]
        if not lots:
            raise ValidationAppError(f"Lot {lot_code} is not available for {item.name}")
    else:
        lots = await _lots_fefo(db, clinic_id, item.id, location_id)
    remaining = qty
    posted: list[StockMovement] = []
    cost_snap = float(item.unit_cost or 0)
    for lot in lots:
        if remaining <= 1e-9:
            break
        take = min(float(lot.quantity), remaining)
        lot.quantity = float(lot.quantity) - take
        remaining -= take
        mv = StockMovement(
            clinic_id=clinic_id,
            inventory_item_id=item.id,
            lot_id=lot.id,
            from_location_id=location_id,
            movement_type=movement_type,
            quantity=take,
            unit_cost_snapshot=cost_snap,
            reason=reason,
            recorded_by_id=actor_id,
            **{k: v for k, v in refs.items() if v is not None},
        )
        db.add(mv)
        posted.append(mv)
    if remaining > 1e-6:
        raise ValidationAppError(f"Insufficient stock for {item.name}")
    await db.flush()
    await _refresh_item_qty(db, item)
    return posted


async def receive(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    *,
    inventory_item_id: str,
    quantity: float,
    unit_cost: float = 0,
    location_id: str | None = None,
    location_code: str | None = None,
    lot_code: str | None = None,
    expiry_date: date | None = None,
    supplier_id: str | None = None,
    purchase_order_id: str | None = None,
    reason: str | None = None,
) -> StockMovement:
    await ensure_locations(db, clinic_id)
    item = await get_stock_item(db, clinic_id, inventory_item_id)
    _require_stock(item)
    if quantity <= 0:
        raise ValidationAppError("Receive quantity must be greater than zero")
    loc = await get_location(db, clinic_id, location_id) if location_id else await location_by_code(
        db, clinic_id, location_code or "MAIN"
    )
    mv = await _increase_lot(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        item=item,
        location_id=loc.id,
        qty=float(quantity),
        unit_cost=float(unit_cost or item.unit_cost or 0),
        movement_type=StockMovementType.RECEIVE,
        lot_code=lot_code,
        expiry_date=expiry_date,
        reason=reason or "receive",
        supplier_id=supplier_id,
        purchase_order_id=purchase_order_id,
    )
    if expiry_date and (not item.expiry_date or expiry_date < item.expiry_date):
        item.expiry_date = expiry_date
    from app.services.domain import write_audit

    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="receive",
        resource_type="inventory_item",
        resource_id=item.id,
        after={"qty": quantity, "location": loc.code},
    )
    return mv


async def receive_lines(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    lines: list[dict[str, Any]],
    *,
    location_id: str | None = None,
    supplier_id: str | None = None,
    purchase_order_id: str | None = None,
    reason: str | None = None,
) -> list[StockMovement]:
    posted: list[StockMovement] = []
    for line in lines:
        posted.append(
            await receive(
                db,
                clinic_id,
                actor_id,
                inventory_item_id=line["inventory_item_id"],
                quantity=float(line["quantity"]),
                unit_cost=float(line.get("unit_cost") or 0),
                location_id=line.get("location_id") or location_id,
                lot_code=line.get("lot_code"),
                expiry_date=line.get("expiry_date"),
                supplier_id=supplier_id,
                purchase_order_id=purchase_order_id,
                reason=reason,
            )
        )
    return posted


async def issue_department(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    *,
    inventory_item_id: str,
    quantity: float,
    from_location_id: str | None = None,
    to_location_id: str,
    lot_code: str | None = None,
    reason: str | None = None,
) -> list[StockMovement]:
    await ensure_locations(db, clinic_id)
    item = await get_stock_item(db, clinic_id, inventory_item_id)
    _require_stock(item)
    if quantity <= 0:
        raise ValidationAppError("Issue quantity must be greater than zero")
    src = await get_location(db, clinic_id, from_location_id) if from_location_id else await location_by_code(
        db, clinic_id, "MAIN"
    )
    dest = await get_location(db, clinic_id, to_location_id)
    if src.id == dest.id:
        raise ValidationAppError("Choose different from and to locations")
    consumed = await _decrease_lots(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        item=item,
        location_id=src.id,
        qty=float(quantity),
        movement_type=StockMovementType.TRANSFER,
        lot_code=lot_code,
        reason=reason or f"issue to {dest.code}",
    )
    for mv in consumed:
        mv.to_location_id = dest.id
        lot = (
            await db.execute(select(StockLot).where(StockLot.id == mv.lot_id))
        ).scalar_one()
        dest_lot = await _get_or_create_lot(
            db, clinic_id, item, dest.id, lot.lot_code, lot.expiry_date, float(lot.unit_cost or 0)
        )
        dest_lot.quantity = float(dest_lot.quantity) + float(mv.quantity)
    await db.flush()
    await _refresh_item_qty(db, item)
    return consumed


async def issue_patient(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    *,
    inventory_item_id: str,
    quantity: float,
    location_id: str | None = None,
    location_code: str | None = None,
    invoice_id: str | None = None,
    invoice_line_id: str | None = None,
    prescription_id: str | None = None,
    reason: str | None = None,
) -> list[StockMovement]:
    await ensure_locations(db, clinic_id)
    item = await get_stock_item(db, clinic_id, inventory_item_id)
    _require_stock(item)
    if quantity <= 0:
        raise ValidationAppError("Issue quantity must be greater than zero")
    loc = (
        await get_location(db, clinic_id, location_id)
        if location_id
        else await location_by_code(db, clinic_id, location_code or "MAIN")
    )
    return await _decrease_lots(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        item=item,
        location_id=loc.id,
        qty=float(quantity),
        movement_type=StockMovementType.ISSUE_PATIENT,
        reason=reason or "patient sale",
        invoice_id=invoice_id,
        invoice_line_id=invoice_line_id,
        prescription_id=prescription_id,
    )


async def return_stock(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    *,
    inventory_item_id: str,
    quantity: float,
    location_id: str | None = None,
    invoice_id: str | None = None,
    invoice_line_id: str | None = None,
    prescription_id: str | None = None,
    reason: str | None = None,
) -> StockMovement:
    await ensure_locations(db, clinic_id)
    item = await get_stock_item(db, clinic_id, inventory_item_id)
    _require_stock(item)
    if quantity <= 0:
        return await _noop_return(item)
    loc = await get_location(db, clinic_id, location_id) if location_id else await location_by_code(
        db, clinic_id, "MAIN"
    )
    return await _increase_lot(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        item=item,
        location_id=loc.id,
        qty=float(quantity),
        unit_cost=float(item.unit_cost or 0),
        movement_type=StockMovementType.RETURN,
        lot_code=DEFAULT_LOT,
        expiry_date=None,
        reason=reason or "return",
        invoice_id=invoice_id,
        invoice_line_id=invoice_line_id,
        prescription_id=prescription_id,
    )


async def _noop_return(item: InventoryItem) -> StockMovement:
    raise ValidationAppError(f"Return quantity must be greater than zero for {item.name}")


async def writeoff(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    *,
    inventory_item_id: str,
    quantity: float,
    location_id: str | None = None,
    reason: str | None = None,
    lot_code: str | None = None,
) -> list[StockMovement]:
    await ensure_locations(db, clinic_id)
    item = await get_stock_item(db, clinic_id, inventory_item_id)
    _require_stock(item)
    loc = await get_location(db, clinic_id, location_id) if location_id else await location_by_code(
        db, clinic_id, "MAIN"
    )
    return await _decrease_lots(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        item=item,
        location_id=loc.id,
        qty=float(quantity),
        movement_type=StockMovementType.WRITEOFF,
        lot_code=lot_code,
        reason=reason or "write-off",
    )


async def stocktake(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    *,
    inventory_item_id: str,
    counted: float,
    location_id: str | None = None,
    reason: str | None = None,
) -> StockMovement | None:
    await ensure_locations(db, clinic_id)
    item = await get_stock_item(db, clinic_id, inventory_item_id)
    _require_stock(item)
    loc = await get_location(db, clinic_id, location_id) if location_id else await location_by_code(
        db, clinic_id, "MAIN"
    )
    on_hand = await on_hand_at(db, clinic_id, item.id, loc.id)
    delta = float(counted) - on_hand
    if abs(delta) < 1e-9:
        return None
    if delta > 0:
        return await _increase_lot(
            db,
            clinic_id=clinic_id,
            actor_id=actor_id,
            item=item,
            location_id=loc.id,
            qty=delta,
            unit_cost=float(item.unit_cost or 0),
            movement_type=StockMovementType.STOCKTAKE,
            lot_code=DEFAULT_LOT,
            expiry_date=None,
            reason=reason or "stocktake variance",
        )
    posted = await _decrease_lots(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        item=item,
        location_id=loc.id,
        qty=abs(delta),
        movement_type=StockMovementType.STOCKTAKE,
        reason=reason or "stocktake variance",
    )
    return posted[0] if posted else None


async def adjust(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    *,
    inventory_item_id: str,
    delta: float,
    reason: str | None = None,
    location_id: str | None = None,
) -> InventoryItem:
    await ensure_locations(db, clinic_id)
    item = await get_stock_item(db, clinic_id, inventory_item_id)
    _require_stock(item)
    loc = await get_location(db, clinic_id, location_id) if location_id else await location_by_code(
        db, clinic_id, "MAIN"
    )
    if delta > 0:
        await _increase_lot(
            db,
            clinic_id=clinic_id,
            actor_id=actor_id,
            item=item,
            location_id=loc.id,
            qty=delta,
            unit_cost=float(item.unit_cost or 0),
            movement_type=StockMovementType.ADJUST,
            lot_code=DEFAULT_LOT,
            expiry_date=None,
            reason=reason or "manual",
        )
    elif delta < 0:
        await _decrease_lots(
            db,
            clinic_id=clinic_id,
            actor_id=actor_id,
            item=item,
            location_id=loc.id,
            qty=abs(delta),
            movement_type=StockMovementType.ADJUST,
            reason=reason or "manual",
        )
    from app.services.domain import write_audit
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="adjust",
        resource_type="inventory_item",
        resource_id=item.id,
        after={"delta": delta, "quantity": item.quantity, "reason": reason},
    )
    return item


async def consume_clinical(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    *,
    inventory_item_id: str,
    quantity: float,
    reason: str | None = None,
    location_code: str | None = None,
) -> list[StockMovement]:
    await ensure_locations(db, clinic_id)
    item = await get_stock_item(db, clinic_id, inventory_item_id)
    _require_stock(item)
    loc = await location_by_code(db, clinic_id, location_code or "REST")
    on_hand = await on_hand_at(db, clinic_id, item.id, loc.id)
    if on_hand + 1e-9 < quantity:
        loc = await location_by_code(db, clinic_id, "MAIN")
    return await _decrease_lots(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        item=item,
        location_id=loc.id,
        qty=float(quantity),
        movement_type=StockMovementType.ISSUE_DEPARTMENT,
        reason=reason or "clinical usage",
    )


def parse_qty(raw: str | float | int | None) -> float:
    if raw is None:
        return 1.0
    if isinstance(raw, (int, float)):
        return float(raw)
    match = re.search(r"[\d.]+", str(raw))
    if not match:
        return 1.0
    try:
        return float(match.group(0))
    except ValueError:
        return 1.0


async def list_movements(
    db: AsyncSession,
    clinic_id: str,
    *,
    movement_type: str | None = None,
    inventory_item_id: str | None = None,
    location_id: str | None = None,
    limit: int = 200,
) -> list[StockMovement]:
    await ensure_locations(db, clinic_id)
    q = select(StockMovement).where(StockMovement.clinic_id == clinic_id)
    if movement_type:
        q = q.where(StockMovement.movement_type == movement_type)
    if inventory_item_id:
        q = q.where(StockMovement.inventory_item_id == inventory_item_id)
    if location_id:
        q = q.where(
            or_(
                StockMovement.from_location_id == location_id,
                StockMovement.to_location_id == location_id,
            )
        )
    q = q.order_by(StockMovement.created_at.desc()).limit(limit)
    return list((await db.execute(q)).scalars().all())


async def analysis(db: AsyncSession, clinic_id: str) -> dict[str, Any]:
    await ensure_locations(db, clinic_id)
    items = (
        await db.execute(
            select(InventoryItem).where(
                InventoryItem.clinic_id == clinic_id,
                InventoryItem.item_kind == InventoryItemKind.STOCK,
                InventoryItem.is_active.is_(True),
            )
        )
    ).scalars().all()
    on_hand_value = sum(float(i.quantity or 0) * float(i.unit_cost or 0) for i in items)
    low = [i for i in items if float(i.quantity or 0) <= float(i.reorder_level or 0)]
    cutoff = date.today() + timedelta(days=90)
    lots = (
        await db.execute(
            select(StockLot).where(
                StockLot.clinic_id == clinic_id,
                StockLot.expiry_date.is_not(None),
                StockLot.expiry_date <= cutoff,
                StockLot.quantity > 0,
            )
        )
    ).scalars().all()
    since = datetime.now(UTC) - timedelta(days=90)
    outbound = (
        await db.execute(
            select(StockMovement).where(
                StockMovement.clinic_id == clinic_id,
                StockMovement.created_at >= since,
                StockMovement.movement_type.in_(
                    [
                        StockMovementType.ISSUE_PATIENT,
                        StockMovementType.ISSUE_DEPARTMENT,
                        StockMovementType.WRITEOFF,
                        StockMovementType.TRANSFER,
                    ]
                ),
            )
        )
    ).scalars().all()
    cogs = sum(float(m.quantity) * float(m.unit_cost_snapshot or 0) for m in outbound)
    billed_lines = (
        await db.execute(
            select(InvoiceLineItem)
            .join(Invoice, Invoice.id == InvoiceLineItem.invoice_id)
            .where(
                Invoice.clinic_id == clinic_id,
                InvoiceLineItem.inventory_item_id.is_not(None),
                InvoiceLineItem.line_kind.in_(["supply", "drug"]),
            )
        )
    ).scalars().all()
    billed_revenue = sum(float(l.total or 0) for l in billed_lines)
    usage_by_type: dict[str, float] = {}
    for m in outbound:
        usage_by_type[m.movement_type] = usage_by_type.get(m.movement_type, 0) + float(m.quantity)
    item_used = {m.inventory_item_id for m in outbound}
    dead = [
        {"id": i.id, "sku": i.sku, "name": i.name, "quantity": i.quantity}
        for i in items
        if i.id not in item_used and float(i.quantity or 0) > 0
    ]
    loc_map = {loc.id: loc for loc in await list_locations(db, clinic_id)}
    usage_by_department: dict[str, float] = {}
    for m in outbound:
        if m.movement_type != StockMovementType.ISSUE_DEPARTMENT or not m.to_location_id:
            continue
        loc = loc_map.get(m.to_location_id)
        key = loc.code if loc else "unknown"
        usage_by_department[key] = usage_by_department.get(key, 0) + float(m.quantity)
    item_map = {i.id: i for i in items}
    expiring = [
        {
            "lot_id": lot.id,
            "inventory_item_id": lot.inventory_item_id,
            "sku": item_map.get(lot.inventory_item_id).sku if item_map.get(lot.inventory_item_id) else "",
            "name": item_map.get(lot.inventory_item_id).name if item_map.get(lot.inventory_item_id) else "",
            "location": loc_map[lot.location_id].code if lot.location_id in loc_map else "",
            "lot_code": lot.lot_code,
            "expiry_date": lot.expiry_date.isoformat() if lot.expiry_date else None,
            "quantity": lot.quantity,
        }
        for lot in lots
    ]
    open_pos = (
        await db.execute(
            select(func.count())
            .select_from(PurchaseOrder)
            .where(
                PurchaseOrder.clinic_id == clinic_id,
                PurchaseOrder.status.in_(
                    [PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.ORDERED, PurchaseOrderStatus.PARTIAL]
                ),
            )
        )
    ).scalar_one()
    return {
        "sku_count": len(items),
        "on_hand_value": round(on_hand_value, 2),
        "low_stock_count": len(low),
        "low_stock": [
            {"id": i.id, "sku": i.sku, "name": i.name, "quantity": i.quantity, "reorder_level": i.reorder_level}
            for i in low
        ],
        "expiring_count": len(expiring),
        "expiring": expiring,
        "open_pos": int(open_pos or 0),
        "cogs_90d": round(cogs, 2),
        "billed_supply_revenue": round(billed_revenue, 2),
        "usage_by_type": usage_by_type,
        "usage_by_department": usage_by_department,
        "dead_stock": dead[:40],
    }


async def expiring_lots(db: AsyncSession, clinic_id: str, days: int = 90) -> list[dict[str, Any]]:
    data = await analysis(db, clinic_id)
    cutoff = date.today() + timedelta(days=days)
    return [row for row in data["expiring"] if row["expiry_date"] and date.fromisoformat(row["expiry_date"]) <= cutoff]


# ── Suppliers / POs ───────────────────────────────────
async def list_suppliers(db: AsyncSession, clinic_id: str, include_inactive: bool = False) -> list[Supplier]:
    q = select(Supplier).where(Supplier.clinic_id == clinic_id)
    if not include_inactive:
        q = q.where(Supplier.is_active.is_(True))
    return list((await db.execute(q.order_by(Supplier.name))).scalars().all())


async def create_supplier(db: AsyncSession, clinic_id: str, data: Any) -> Supplier:
    s = Supplier(
        clinic_id=clinic_id,
        name=data.name,
        contact_email=str(data.contact_email) if getattr(data, "contact_email", None) else None,
        contact_phone=getattr(data, "contact_phone", None),
        notes=getattr(data, "notes", None),
    )
    db.add(s)
    await db.flush()
    return s


async def update_supplier(db: AsyncSession, clinic_id: str, supplier_id: str, data: Any) -> Supplier:
    s = (
        await db.execute(select(Supplier).where(Supplier.id == supplier_id, Supplier.clinic_id == clinic_id))
    ).scalar_one_or_none()
    if not s:
        raise NotFoundError("Supplier")
    payload = data.model_dump(exclude_unset=True) if hasattr(data, "model_dump") else dict(data)
    if "contact_email" in payload and payload["contact_email"] is not None:
        payload["contact_email"] = str(payload["contact_email"])
    for k, v in payload.items():
        setattr(s, k, v)
    await db.flush()
    return s


def _po_lines_payload(po: PurchaseOrder) -> list[dict[str, Any]]:
    rows = []
    for line in po.lines or []:
        rows.append(
            {
                "id": line.id,
                "inventory_item_id": line.inventory_item_id,
                "sku": line.inventory_item.sku if line.inventory_item else "",
                "name": line.inventory_item.name if line.inventory_item else "",
                "quantity_ordered": line.quantity_ordered,
                "quantity_received": line.quantity_received,
                "unit_cost": line.unit_cost,
            }
        )
    return rows


async def create_purchase_order(db: AsyncSession, clinic_id: str, data: Any) -> PurchaseOrder:
    await ensure_locations(db, clinic_id)
    supplier = (
        await db.execute(select(Supplier).where(Supplier.id == data.supplier_id, Supplier.clinic_id == clinic_id))
    ).scalar_one_or_none()
    if not supplier:
        raise NotFoundError("Supplier")
    po = PurchaseOrder(
        clinic_id=clinic_id,
        supplier_id=data.supplier_id,
        status=PurchaseOrderStatus.ORDERED,
        ordered_at=datetime.now(UTC),
        expected_at=getattr(data, "expected_at", None),
        notes=getattr(data, "notes", None),
        lines_json=json.dumps(getattr(data, "lines", []) or []),
    )
    db.add(po)
    await db.flush()
    for raw in getattr(data, "lines", []) or []:
        item_id = raw.get("inventory_item_id") or raw.get("item_id")
        sku = raw.get("sku")
        item = None
        if item_id:
            item = await get_stock_item(db, clinic_id, item_id)
        elif sku:
            item = (
                await db.execute(
                    select(InventoryItem).where(InventoryItem.clinic_id == clinic_id, InventoryItem.sku == sku)
                )
            ).scalar_one_or_none()
        if not item:
            raise ValidationAppError("Each purchase-order line needs a warehouse SKU")
        _require_stock(item)
        qty = float(raw.get("qty") or raw.get("quantity") or raw.get("quantity_ordered") or 0)
        if qty <= 0:
            raise ValidationAppError(f"Ordered quantity for {item.sku} must be greater than zero")
        db.add(
            PurchaseOrderLine(
                purchase_order_id=po.id,
                inventory_item_id=item.id,
                quantity_ordered=qty,
                quantity_received=0,
                unit_cost=float(raw.get("unit_cost") or item.unit_cost or 0),
            )
        )
    await db.flush()
    return await get_purchase_order(db, clinic_id, po.id)


async def get_purchase_order(db: AsyncSession, clinic_id: str, po_id: str) -> PurchaseOrder:
    po = (
        await db.execute(
            select(PurchaseOrder)
            .where(PurchaseOrder.id == po_id, PurchaseOrder.clinic_id == clinic_id)
            .options(selectinload(PurchaseOrder.lines).selectinload(PurchaseOrderLine.inventory_item))
        )
    ).scalar_one_or_none()
    if not po:
        raise NotFoundError("Purchase order")
    return po


async def list_purchase_orders(db: AsyncSession, clinic_id: str) -> list[PurchaseOrder]:
    return list(
        (
            await db.execute(
                select(PurchaseOrder)
                .where(PurchaseOrder.clinic_id == clinic_id)
                .options(selectinload(PurchaseOrder.lines).selectinload(PurchaseOrderLine.inventory_item))
                .order_by(PurchaseOrder.created_at.desc())
            )
        ).scalars().all()
    )


def _refresh_po_status(po: PurchaseOrder) -> None:
    if po.status == PurchaseOrderStatus.CANCELLED:
        return
    if not po.lines:
        return
    if all(float(l.quantity_received) + 1e-9 >= float(l.quantity_ordered) for l in po.lines):
        po.status = PurchaseOrderStatus.RECEIVED
    elif any(float(l.quantity_received) > 0 for l in po.lines):
        po.status = PurchaseOrderStatus.PARTIAL
    else:
        po.status = PurchaseOrderStatus.ORDERED


async def receive_purchase_order(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    po_id: str,
    lines: list[dict[str, Any]] | None = None,
    location_id: str | None = None,
) -> PurchaseOrder:
    po = await get_purchase_order(db, clinic_id, po_id)
    if po.status == PurchaseOrderStatus.CANCELLED:
        raise ValidationAppError("Cannot receive a cancelled purchase order")
    loc = await get_location(db, clinic_id, location_id) if location_id else await location_by_code(
        db, clinic_id, "MAIN"
    )
    wanted = {row.get("line_id") or row.get("id"): row for row in (lines or []) if row.get("line_id") or row.get("id")}
    for line in po.lines:
        remaining = float(line.quantity_ordered) - float(line.quantity_received)
        if remaining <= 1e-9:
            continue
        qty = remaining
        lot_code = None
        expiry = None
        cost = float(line.unit_cost or 0)
        if wanted:
            spec = wanted.get(line.id)
            if not spec:
                continue
            qty = float(spec.get("quantity") or remaining)
            lot_code = spec.get("lot_code")
            expiry = spec.get("expiry_date")
            if spec.get("unit_cost") is not None:
                cost = float(spec["unit_cost"])
        qty = min(qty, remaining)
        if qty <= 0:
            continue
        await receive(
            db,
            clinic_id,
            actor_id,
            inventory_item_id=line.inventory_item_id,
            quantity=qty,
            unit_cost=cost,
            location_id=loc.id,
            lot_code=lot_code,
            expiry_date=expiry,
            supplier_id=po.supplier_id,
            purchase_order_id=po.id,
            reason=f"PO {po.id[:8]}",
        )
        line.quantity_received = float(line.quantity_received) + qty
    _refresh_po_status(po)
    await db.flush()
    return await get_purchase_order(db, clinic_id, po.id)


async def cancel_purchase_order(db: AsyncSession, clinic_id: str, po_id: str) -> PurchaseOrder:
    po = await get_purchase_order(db, clinic_id, po_id)
    if po.status == PurchaseOrderStatus.RECEIVED:
        raise ValidationAppError("A fully received purchase order cannot be cancelled")
    po.status = PurchaseOrderStatus.CANCELLED
    await db.flush()
    return po


async def inventory_item_id_for_catalog(db: AsyncSession, clinic_id: str, catalog: CatalogItem | None) -> str | None:
    if not catalog:
        return None
    return catalog.inventory_item_id


def _sale_location_codes(line_kind: str | None) -> tuple[str, ...]:
    if (line_kind or "").lower() == "drug":
        return ("PHARM", "MAIN")
    return ("MAIN",)


async def location_for_invoice_issue(
    db: AsyncSession,
    clinic_id: str,
    inventory_item_id: str,
    quantity: float,
    line_kind: str | None = None,
) -> StockLocation:
    """Pick PHARM then MAIN for drugs, MAIN for supplies. Refuse if neither has enough."""
    await ensure_locations(db, clinic_id)
    item = await get_stock_item(db, clinic_id, inventory_item_id)
    _require_stock(item)
    last_have = 0.0
    last_loc: StockLocation | None = None
    for code in _sale_location_codes(line_kind):
        loc = await location_by_code(db, clinic_id, code)
        have = await on_hand_at(db, clinic_id, inventory_item_id, loc.id)
        last_have = have
        last_loc = loc
        if have + 1e-9 >= float(quantity):
            return loc
    sku = item.sku
    raise ValidationAppError(
        f"Insufficient stock for {sku}: need {quantity}, have {last_have}"
        + (f" at {last_loc.code}" if last_loc else "")
    )


async def issue_for_invoice_line(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    *,
    inventory_item_id: str,
    quantity: float,
    line_kind: str | None = None,
    invoice_id: str | None = None,
    invoice_line_id: str | None = None,
    reason: str | None = None,
) -> list[StockMovement]:
    loc = await location_for_invoice_issue(
        db, clinic_id, inventory_item_id, quantity, line_kind
    )
    return await issue_patient(
        db,
        clinic_id,
        actor_id,
        inventory_item_id=inventory_item_id,
        quantity=quantity,
        location_id=loc.id,
        invoice_id=invoice_id,
        invoice_line_id=invoice_line_id,
        reason=reason or "invoiced supply",
    )
