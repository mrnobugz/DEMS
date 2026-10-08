"""Clinic pharmacy: formulary, queue, shelf dispense, returns, and store requests."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundError, ValidationAppError
from app.models import (
    DispenseEvent,
    DrugTemplate,
    InventoryItem,
    InventoryItemKind,
    Invoice,
    Patient,
    PatientSafetyItem,
    PaymentMethod,
    PharmacySale,
    PharmacySaleLine,
    Prescription,
    PrescriptionItem,
    PrescriptionStatus,
    StockLot,
    User,
)
from app.schemas import (
    CancelPrescription,
    DispenseRequest,
    DrugTemplateCreate,
    DrugTemplateUpdate,
    ExternalRelease,
    CounterSaleCreate,
    PharmacyBoardOut,
    PharmacyExpiryOut,
    PharmacyShelfRow,
    PrescriptionCourseUpdate,
    PrescriptionCreate,
    RequisitionCreate,
    RequisitionLineIn,
    ReturnDispense,
    ShelfRequest,
    ShelfRequestLine,
)
from app.services import warehouse as stock
from app.services.config import allocate_number
from app.services.requisitions import create_requisition

OPEN_QUEUE = (PrescriptionStatus.DRAFT, PrescriptionStatus.ACTIVE, PrescriptionStatus.PARTIAL)
CLOSED_LINE = ("dispensed", "external", "cancelled")

# Advisory only. Dispense stops until the pharmacist confirms the warning.
DRUG_ALLERGY_HINTS = {
    "amoxicillin": ["penicillin", "beta-lactam", "amoxicillin"],
    "penicillin": ["penicillin", "beta-lactam"],
    "ibuprofen": ["nsaid", "ibuprofen", "aspirin"],
    "aspirin": ["aspirin", "nsaid", "salicylate"],
    "diclofenac": ["nsaid", "diclofenac", "aspirin"],
    "metronidazole": ["metronidazole"],
    "clindamycin": ["clindamycin"],
    "codeine": ["codeine", "opioid"],
    "paracetamol": ["paracetamol", "acetaminophen"],
    "chlorhexidine": ["chlorhexidine"],
}


def _qty(raw: str | float | int | None) -> float:
    return stock.parse_qty(raw)


def _fmt(value: float) -> str:
    text = f"{value:.2f}".rstrip("0").rstrip(".")
    return text or "0"


async def drug_warnings(db: AsyncSession, clinic_id: str, patient_id: str, drug_name: str) -> list[str]:
    patient = (
        await db.execute(select(Patient).where(Patient.id == patient_id, Patient.clinic_id == clinic_id))
    ).scalar_one_or_none()
    if not patient:
        raise NotFoundError("Patient not found")
    safety = (
        await db.execute(
            select(PatientSafetyItem).where(
                PatientSafetyItem.clinic_id == clinic_id,
                PatientSafetyItem.patient_id == patient_id,
                PatientSafetyItem.is_active.is_(True),
            )
        )
    ).scalars().all()
    blob = " ".join(
        filter(
            None,
            [
                (patient.allergies or "").lower(),
                (patient.chronic_conditions or "").lower(),
                (patient.medical_history_json or "").lower(),
                " ".join(
                    f"{row.label} {row.code} {row.notes or ''}".lower() for row in safety
                ),
            ],
        )
    )
    drug = drug_name.lower()
    warnings: list[str] = []
    for key, tokens in DRUG_ALLERGY_HINTS.items():
        if key not in drug:
            continue
        for tok in tokens:
            if tok in blob:
                warnings.append(
                    f"Patient record mentions '{tok}'. Review before giving {drug_name}."
                )
                break
    return warnings


async def _load_rx(db: AsyncSession, clinic_id: str, rx_id: str) -> Prescription:
    rx = (
        await db.execute(
            select(Prescription)
            .where(Prescription.id == rx_id, Prescription.clinic_id == clinic_id)
            .options(
                selectinload(Prescription.items),
                selectinload(Prescription.dispenses),
                selectinload(Prescription.patient),
                selectinload(Prescription.prescribed_by),
            )
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if not rx:
        raise NotFoundError("Prescription not found")
    return rx


async def _locs(db: AsyncSession, clinic_id: str):
    await stock.ensure_locations(db, clinic_id)
    shelf = await stock.location_by_code(db, clinic_id, "PHARM")
    store = await stock.location_by_code(db, clinic_id, "MAIN")
    return shelf, store


async def _on_hand_map(
    db: AsyncSession, clinic_id: str, location_id: str, item_ids: set[str]
) -> dict[str, float]:
    if not item_ids:
        return {}
    rows = await db.execute(
        select(StockLot.inventory_item_id, func.coalesce(func.sum(StockLot.quantity), 0.0))
        .where(
            StockLot.clinic_id == clinic_id,
            StockLot.location_id == location_id,
            StockLot.inventory_item_id.in_(item_ids),
        )
        .group_by(StockLot.inventory_item_id)
    )
    return {item_id: float(qty or 0) for item_id, qty in rows.all()}


async def _stock_item(db: AsyncSession, clinic_id: str, item_id: str | None) -> InventoryItem | None:
    if not item_id:
        return None
    return (
        await db.execute(
            select(InventoryItem).where(InventoryItem.id == item_id, InventoryItem.clinic_id == clinic_id)
        )
    ).scalar_one_or_none()


async def list_drug_templates(
    db: AsyncSession, clinic_id: str, *, include_inactive: bool = False
) -> list[DrugTemplate]:
    q = select(DrugTemplate).where(DrugTemplate.clinic_id == clinic_id)
    if not include_inactive:
        q = q.where(DrugTemplate.is_active.is_(True))
    result = await db.execute(q.order_by(DrugTemplate.name))
    return list(result.scalars().all())


async def create_drug_template(
    db: AsyncSession, clinic_id: str, data: DrugTemplateCreate
) -> DrugTemplate:
    payload = data.model_dump()
    if payload.get("inventory_item_id"):
        item = await _stock_item(db, clinic_id, payload["inventory_item_id"])
        if not item:
            raise NotFoundError("Inventory item")
    tmpl = DrugTemplate(clinic_id=clinic_id, **payload)
    db.add(tmpl)
    await db.flush()
    return tmpl


async def update_drug_template(
    db: AsyncSession, clinic_id: str, template_id: str, data: DrugTemplateUpdate
) -> DrugTemplate:
    tmpl = (
        await db.execute(
            select(DrugTemplate).where(DrugTemplate.id == template_id, DrugTemplate.clinic_id == clinic_id)
        )
    ).scalar_one_or_none()
    if not tmpl:
        raise NotFoundError("Drug not found")
    changes = data.model_dump(exclude_unset=True)
    if "inventory_item_id" in changes and changes["inventory_item_id"]:
        item = await _stock_item(db, clinic_id, changes["inventory_item_id"])
        if not item:
            raise NotFoundError("Inventory item")
    for key, value in changes.items():
        setattr(tmpl, key, value)
    await db.flush()
    return tmpl


async def list_prescriptions(
    db: AsyncSession,
    clinic_id: str,
    *,
    patient_id: str | None = None,
    status: str | None = None,
    q: str | None = None,
) -> list[Prescription]:
    stmt = (
        select(Prescription)
        .where(Prescription.clinic_id == clinic_id)
        .options(
            selectinload(Prescription.items),
            selectinload(Prescription.dispenses),
            selectinload(Prescription.patient),
            selectinload(Prescription.prescribed_by),
        )
    )
    if patient_id:
        stmt = stmt.where(Prescription.patient_id == patient_id)
    if status == "waiting":
        stmt = stmt.where(Prescription.status.in_(OPEN_QUEUE))
    elif status and status != "all":
        stmt = stmt.where(Prescription.status == status)
    needle = (q or "").strip().lower()
    if needle:
        like = f"%{needle}%"
        stmt = stmt.join(Patient, Patient.id == Prescription.patient_id).where(
            or_(
                func.lower(Patient.first_name).like(like),
                func.lower(Patient.last_name).like(like),
                func.lower(Patient.patient_code).like(like),
                func.lower(func.coalesce(Prescription.rx_number, "")).like(like),
            )
        )
    result = await db.execute(stmt.order_by(Prescription.prescribed_at.desc()).limit(150))
    return list(result.scalars().unique().all())


async def create_prescription(
    db: AsyncSession, clinic_id: str, actor_id: str, data: PrescriptionCreate
) -> Prescription:
    patient = (
        await db.execute(
            select(Patient).where(Patient.id == data.patient_id, Patient.clinic_id == clinic_id)
        )
    ).scalar_one_or_none()
    if not patient:
        raise NotFoundError("Patient not found")
    for item in data.items:
        if item.start_date and item.end_date and item.end_date < item.start_date:
            raise ValidationAppError("End date cannot be before start date")
    rx = Prescription(
        clinic_id=clinic_id,
        patient_id=data.patient_id,
        prescribed_by_id=actor_id,
        notes=data.notes,
        status=PrescriptionStatus.ACTIVE,
        rx_number=await allocate_number(db, clinic_id, "prescription"),
    )
    db.add(rx)
    await db.flush()
    for item in data.items:
        drug_name = item.drug_name
        dose = item.dose
        quantity = item.quantity
        instructions = item.instructions
        inventory_item_id = item.inventory_item_id
        template_id = item.drug_template_id
        if template_id:
            tmpl = (
                await db.execute(
                    select(DrugTemplate).where(
                        DrugTemplate.id == template_id,
                        DrugTemplate.clinic_id == clinic_id,
                        DrugTemplate.is_active.is_(True),
                    )
                )
            ).scalar_one_or_none()
            if not tmpl:
                raise NotFoundError("Drug not found")
            drug_name = tmpl.name
            dose = item.dose or tmpl.default_dose
            quantity = item.quantity or tmpl.default_quantity
            instructions = item.instructions if item.instructions is not None else tmpl.instructions
            inventory_item_id = item.inventory_item_id or tmpl.inventory_item_id
        if inventory_item_id:
            stock_item = await _stock_item(db, clinic_id, inventory_item_id)
            if not stock_item:
                raise NotFoundError("Inventory item")
            if not template_id:
                drug_name = stock_item.name
        db.add(
            PrescriptionItem(
                prescription_id=rx.id,
                drug_name=drug_name,
                dose=dose,
                quantity=quantity or "1",
                frequency=(item.frequency or "").strip() or None,
                days=item.days,
                start_date=item.start_date,
                end_date=item.end_date,
                instructions=instructions,
                inventory_item_id=inventory_item_id,
                drug_template_id=template_id,
                quantity_dispensed=0,
                line_status="pending",
            )
        )
    await db.flush()
    loaded = await _load_rx(db, clinic_id, rx.id)
    if data.bill:
        await _bill_prescription_order(db, clinic_id, actor_id, loaded)
        loaded = await _load_rx(db, clinic_id, rx.id)
    return loaded


async def update_prescription_course(
    db: AsyncSession,
    clinic_id: str,
    rx_id: str,
    data: PrescriptionCourseUpdate,
) -> Prescription:
    """Correct course details on lines that have not left the shelf yet."""
    rx = await _load_rx(db, clinic_id, rx_id)
    if rx.status not in OPEN_QUEUE:
        raise ValidationAppError("This prescription can no longer be edited")
    by_id = {line.id: line for line in rx.items}
    invoice = None
    if rx.invoice_id:
        invoice = (
            await db.execute(
                select(Invoice)
                .where(Invoice.id == rx.invoice_id, Invoice.clinic_id == clinic_id)
                .options(selectinload(Invoice.line_items))
            )
        ).scalar_one_or_none()
    drug_lines = [line for line in (invoice.line_items if invoice else []) if line.line_kind == "drug"]
    paid = bool(invoice and float(invoice.amount_paid or 0) > 0)
    order = {line.id: index for index, line in enumerate(rx.items)}

    for patch in data.items:
        line = by_id.get(patch.id)
        if not line:
            raise NotFoundError("Prescription line")
        if float(line.quantity_dispensed or 0) > 0 or line.line_status in CLOSED_LINE:
            raise ValidationAppError(f"{line.drug_name} has already been dispensed and cannot be edited")
        if patch.start_date and patch.end_date and patch.end_date < patch.start_date:
            raise ValidationAppError("End date cannot be before start date")
        new_qty = _parse_qty(patch.quantity)
        old_qty = _parse_qty(line.quantity)
        old_name = line.drug_name
        template_changed = bool(patch.drug_template_id and patch.drug_template_id != line.drug_template_id)
        money_changed = template_changed or new_qty != old_qty
        if paid and money_changed:
            raise ValidationAppError(
                "This prescription is already paid. Frequency, dates, and instructions can still be edited."
            )
        price = None
        sku = None
        if template_changed:
            tmpl = (
                await db.execute(
                    select(DrugTemplate).where(
                        DrugTemplate.id == patch.drug_template_id,
                        DrugTemplate.clinic_id == clinic_id,
                        DrugTemplate.is_active.is_(True),
                    )
                )
            ).scalar_one_or_none()
            if not tmpl:
                raise NotFoundError("Drug not found")
            line.drug_template_id = tmpl.id
            line.drug_name = tmpl.name
            line.dose = tmpl.default_dose or line.dose
            line.inventory_item_id = tmpl.inventory_item_id
        if line.inventory_item_id and (template_changed or (invoice and new_qty != old_qty)):
            stock_item = await _stock_item(db, clinic_id, line.inventory_item_id)
            if not stock_item:
                raise NotFoundError("Inventory item")
            price = float(stock_item.sale_price or stock_item.unit_cost or 0)
            sku = stock_item.sku
        line.frequency = (patch.frequency or "").strip() or None
        line.days = patch.days
        line.quantity = str(new_qty)
        line.start_date = patch.start_date
        line.end_date = patch.end_date
        line.instructions = (patch.instructions or "").strip() or None
        if invoice and money_changed:
            index = order.get(line.id, 0)
            bill_line = None
            if index < len(drug_lines) and drug_lines[index].description == old_name:
                bill_line = drug_lines[index]
            else:
                bill_line = next((row for row in drug_lines if row.description == old_name), None)
            if bill_line:
                unit = price if price is not None else float(bill_line.unit_price or 0)
                if unit <= 0:
                    raise ValidationAppError(
                        f"{line.drug_name} has no sale price. Link it to stock with a price before billing."
                    )
                bill_line.description = line.drug_name
                bill_line.quantity = new_qty
                bill_line.unit_price = unit
                bill_line.total = round(new_qty * unit, 2)
                if sku:
                    bill_line.procedure_code = sku
    if data.notes is not None:
        rx.notes = data.notes.strip() or None
    if invoice:
        subtotal = round(sum(float(row.total or 0) for row in invoice.line_items), 2)
        invoice.subtotal = subtotal
        invoice.total = max(subtotal + float(invoice.tax or 0) - float(invoice.discount or 0), 0)
    await db.flush()
    return await _load_rx(db, clinic_id, rx.id)


def _parse_qty(raw: str | None) -> int:
    import re

    match = re.match(r"\s*(\d+(?:\.\d+)?)", (raw or "").strip())
    if not match:
        return 1
    return max(int(round(float(match.group(1)))), 1)


async def _bill_prescription_order(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    rx: Prescription,
) -> None:
    """Create a billing invoice for the signed script before pharmacy dispenses stock."""
    from app.schemas import InvoiceCreate, InvoiceLineCreate
    from app.services.domain import create_invoice

    if rx.invoice_id:
        return
    bill_lines = []
    for line in rx.items:
        qty = _parse_qty(line.quantity)
        price = 0.0
        sku = None
        if line.inventory_item_id:
            item = await stock.get_stock_item(db, clinic_id, line.inventory_item_id)
            price = float(item.sale_price or item.unit_cost or 0)
            sku = item.sku
        if price <= 0:
            raise ValidationAppError(
                f"{line.drug_name} has no sale price. Link it to stock with a price before billing."
            )
        bill_lines.append(
            InvoiceLineCreate(
                description=line.drug_name,
                quantity=qty,
                unit_price=price,
                procedure_code=sku,
                inventory_item_id=None,
                line_kind="drug",
            )
        )
    if not bill_lines:
        raise ValidationAppError("Nothing to bill on this prescription")
    invoice = await create_invoice(
        db,
        clinic_id,
        actor_id,
        InvoiceCreate(
            patient_id=rx.patient_id,
            line_items=bill_lines,
            notes=f"Pharmacy order {rx.rx_number or ''}".strip(),
        ),
    )
    rx.invoice_id = invoice.id
    await db.flush()


async def present_templates(
    db: AsyncSession, clinic_id: str, rows: list[DrugTemplate]
) -> list[dict]:
    ids = {row.inventory_item_id for row in rows if row.inventory_item_id}
    prices: dict[str, float] = {}
    if ids:
        result = await db.execute(
            select(InventoryItem).where(
                InventoryItem.clinic_id == clinic_id,
                InventoryItem.id.in_(ids),
            )
        )
        for item in result.scalars().all():
            prices[item.id] = float(item.sale_price or item.unit_cost or 0)
    out = []
    for row in rows:
        out.append(
            {
                "id": row.id,
                "name": row.name,
                "category": row.category,
                "default_dose": row.default_dose,
                "default_quantity": row.default_quantity,
                "instructions": row.instructions,
                "form": row.form,
                "strength": row.strength,
                "route": row.route,
                "inventory_item_id": row.inventory_item_id,
                "reorder_level": float(row.reorder_level or 0),
                "is_controlled": bool(row.is_controlled),
                "is_active": bool(row.is_active),
                "sale_price": prices.get(row.inventory_item_id) if row.inventory_item_id else None,
            }
        )
    return out


def _refresh_status(rx: Prescription, actor_id: str) -> None:
    if rx.status == PrescriptionStatus.CANCELLED:
        return
    open_lines = [line for line in rx.items if line.line_status not in CLOSED_LINE]
    any_given = any(float(line.quantity_dispensed or 0) > 0 for line in rx.items)
    finished = [line for line in rx.items if line.line_status in ("dispensed", "external")]
    now = datetime.now(UTC)
    if not open_lines and finished:
        rx.status = PrescriptionStatus.DISPENSED
        rx.dispensed_at = rx.dispensed_at or now
        rx.dispensed_by_id = rx.dispensed_by_id or actor_id
    elif any_given:
        rx.status = PrescriptionStatus.PARTIAL
        rx.dispensed_at = None


async def _record_issue(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    rx: Prescription,
    line: PrescriptionItem,
    qty: float,
    *,
    location_code: str,
    notes: str | None,
    patient_name: str,
) -> DispenseEvent:
    moves = await stock.issue_patient(
        db,
        clinic_id,
        actor_id,
        inventory_item_id=line.inventory_item_id or "",
        quantity=qty,
        location_code=location_code,
        prescription_id=rx.id,
        reason="pharmacy dispense",
    )
    lot_ids = [mv.lot_id for mv in moves if mv.lot_id]
    lots = []
    if lot_ids:
        lots = list(
            (
                await db.execute(select(StockLot).where(StockLot.id.in_(lot_ids)))
            ).scalars().all()
        )
    lot_codes = []
    expiry = None
    for lot in lots:
        if lot.lot_code and lot.lot_code not in lot_codes:
            lot_codes.append(lot.lot_code)
        if lot.expiry_date and (expiry is None or lot.expiry_date < expiry):
            expiry = lot.expiry_date
    item = await stock.get_stock_item(db, clinic_id, line.inventory_item_id or "")
    price = float(item.sale_price or item.unit_cost or 0)
    label = (
        f"{rx.rx_number or 'RX'}  {patient_name}\n"
        f"{line.drug_name}  {_fmt(qty)} {item.unit}\n"
        f"{line.dose}"
        + (f"\n{line.instructions}" if line.instructions else "")
        + (f"\nLot {', '.join(lot_codes)}" if lot_codes else "")
        + (f"  exp {expiry.isoformat()}" if expiry else "")
    )
    event = DispenseEvent(
        clinic_id=clinic_id,
        prescription_id=rx.id,
        prescription_item_id=line.id,
        inventory_item_id=line.inventory_item_id,
        quantity=qty,
        lot_code=", ".join(lot_codes)[:64] or None,
        expiry_date=expiry,
        unit_price=price,
        label_text=label,
        dispensed_by_id=actor_id,
        notes=(notes or "").strip() or None,
    )
    db.add(event)
    line.quantity_dispensed = float(line.quantity_dispensed or 0) + qty
    prescribed = _qty(line.quantity)
    line.line_status = "dispensed" if line.quantity_dispensed + 1e-9 >= prescribed else "partial"
    await db.flush()
    return event


async def dispense_prescription(
    db: AsyncSession, clinic_id: str, actor_id: str, rx_id: str, data: DispenseRequest
) -> Prescription:
    rx = await _load_rx(db, clinic_id, rx_id)
    if rx.status not in OPEN_QUEUE:
        raise ValidationAppError("This prescription is not waiting to be dispensed")
    by_id = {line.id: line for line in rx.items}
    chosen: list[tuple[PrescriptionItem, float]] = []
    for entry in data.lines:
        line = by_id.get(entry.prescription_item_id)
        if not line:
            raise NotFoundError("Prescription line")
        if line.line_status in CLOSED_LINE:
            raise ValidationAppError(f"{line.drug_name} is already closed")
        if not line.inventory_item_id:
            raise ValidationAppError(
                f"{line.drug_name} is not linked to a shelf item. Release it as an outside prescription, "
                "or link the formulary drug to a SKU."
            )
        remaining = _qty(line.quantity) - float(line.quantity_dispensed or 0)
        if entry.quantity > remaining + 1e-9:
            raise ValidationAppError(
                f"{line.drug_name}: {_fmt(remaining)} still to give, not {_fmt(entry.quantity)}"
            )
        chosen.append((line, float(entry.quantity)))

    names = [line.drug_name for line, _qty_n in chosen]
    warnings: list[str] = []
    for name in names:
        warnings.extend(await drug_warnings(db, clinic_id, rx.patient_id, name))
    if warnings and not data.acknowledge_warnings:
        raise ValidationAppError("Review before dispensing: " + " ".join(warnings))

    template_ids = {line.drug_template_id for line, _q in chosen if line.drug_template_id}
    controlled = False
    if template_ids:
        rows = (
            await db.execute(select(DrugTemplate).where(DrugTemplate.id.in_(template_ids)))
        ).scalars().all()
        controlled = any(row.is_controlled for row in rows)
    if controlled and not (data.notes or "").strip():
        raise ValidationAppError("Controlled medicine needs a register note before dispensing")

    shelf, store = await _locs(db, clinic_id)
    for line, qty in chosen:
        item_id = line.inventory_item_id or ""
        on_shelf = await stock.on_hand_at(db, clinic_id, item_id, shelf.id)
        if on_shelf + 1e-9 < qty:
            on_store = await stock.on_hand_at(db, clinic_id, item_id, store.id)
            raise ValidationAppError(
                f"{line.drug_name}: pharmacy shelf has {_fmt(on_shelf)}, this fill needs {_fmt(qty)}. "
                f"Main store has {_fmt(on_store)}. Request it onto the shelf before dispensing."
            )

    patient_name = ""
    if rx.patient:
        patient_name = f"{rx.patient.first_name} {rx.patient.last_name}".strip()
    events: list[DispenseEvent] = []
    for line, qty in chosen:
        events.append(
            await _record_issue(
                db,
                clinic_id,
                actor_id,
                rx,
                line,
                qty,
                location_code="PHARM",
                notes=data.notes,
                patient_name=patient_name or "Patient",
            )
        )
    if rx.verified_at is None:
        rx.verified_at = datetime.now(UTC)
        rx.verified_by_id = actor_id
    _refresh_status(rx, actor_id)
    order_billed = await _order_already_billed(db, rx)
    if data.bill and not order_billed:
        await _bill(db, clinic_id, actor_id, rx, events)
    elif order_billed:
        for event in events:
            event.invoice_id = rx.invoice_id
    if data.collect_payment:
        if not rx.invoice_id or (not data.bill and not order_billed):
            raise ValidationAppError("Bill the fill before taking payment")
        await _collect_invoice(db, clinic_id, actor_id, rx.invoice_id, data.payment_method, data.payment_reference)
    await db.flush()
    return await _load_rx(db, clinic_id, rx.id)


async def _bill(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    rx: Prescription,
    events: list[DispenseEvent],
) -> None:
    from app.schemas import InvoiceCreate, InvoiceLineCreate
    from app.services.domain import create_invoice

    if await _order_already_billed(db, rx):
        for event in events:
            event.invoice_id = rx.invoice_id
        await db.flush()
        return

    bill_lines = []
    for event in events:
        if not event.inventory_item_id:
            continue
        item = await stock.get_stock_item(db, clinic_id, event.inventory_item_id)
        line = next((row for row in rx.items if row.id == event.prescription_item_id), None)
        billed = max(int(round(event.quantity)), 1)
        bill_lines.append(
            InvoiceLineCreate(
                description=line.drug_name if line else item.name,
                quantity=billed,
                unit_price=float(event.unit_price or item.sale_price or 0),
                procedure_code=item.sku,
                inventory_item_id=None,
                line_kind="drug",
            )
        )
    if not bill_lines:
        return
    invoice = await create_invoice(
        db,
        clinic_id,
        actor_id,
        InvoiceCreate(patient_id=rx.patient_id, line_items=bill_lines, notes=f"Pharmacy {rx.rx_number or ''}".strip()),
    )
    rx.invoice_id = invoice.id
    for event in events:
        event.invoice_id = invoice.id
    await db.flush()


COUNTER_METHODS = {
    PaymentMethod.CASH,
    PaymentMethod.CARD,
    PaymentMethod.MOBILE_MONEY,
    PaymentMethod.BANK_TRANSFER,
    PaymentMethod.OTHER,
}


def _payment_method(raw: str | None) -> str:
    method = (raw or PaymentMethod.CASH).strip().lower()
    if method not in COUNTER_METHODS:
        raise ValidationAppError("Choose cash, card, mobile money, bank transfer, or other")
    return method


async def _collect_invoice(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    invoice_id: str,
    method: str,
    reference: str | None,
):
    from app.schemas import PaymentCreate
    from app.services.domain import add_payment, get_invoice

    invoice = await get_invoice(db, clinic_id, invoice_id)
    remaining = float(invoice.total or 0) - float(invoice.amount_paid or 0) - float(invoice.amount_adjusted or 0)
    if remaining <= 0.001:
        return invoice
    return await add_payment(
        db,
        clinic_id,
        actor_id,
        invoice.id,
        PaymentCreate(
            amount=round(remaining, 2),
            method=_payment_method(method),
            reference=(reference or "").strip() or None,
        ),
    )


async def update_prescription_status(
    db: AsyncSession, clinic_id: str, actor_id: str, rx_id: str, status: str, bill: bool = False
) -> Prescription:
    """Legacy whole-script dispense. Tries the pharmacy shelf, then the main store."""
    rx = await _load_rx(db, clinic_id, rx_id)
    previous = rx.status
    if status == PrescriptionStatus.DISPENSED and previous != PrescriptionStatus.DISPENSED:
        patient_name = ""
        if rx.patient:
            patient_name = f"{rx.patient.first_name} {rx.patient.last_name}".strip()
        events: list[DispenseEvent] = []
        for line in rx.items:
            if not line.inventory_item_id:
                continue
            remaining = _qty(line.quantity) - float(line.quantity_dispensed or 0)
            if remaining <= 1e-9:
                line.line_status = "dispensed"
                continue
            try:
                event = await _record_issue(
                    db,
                    clinic_id,
                    actor_id,
                    rx,
                    line,
                    remaining,
                    location_code="PHARM",
                    notes=None,
                    patient_name=patient_name or "Patient",
                )
            except ValidationAppError:
                event = await _record_issue(
                    db,
                    clinic_id,
                    actor_id,
                    rx,
                    line,
                    remaining,
                    location_code="MAIN",
                    notes=None,
                    patient_name=patient_name or "Patient",
                )
            events.append(event)
        rx.status = PrescriptionStatus.DISPENSED
        rx.dispensed_at = datetime.now(UTC)
        rx.dispensed_by_id = actor_id
        order_billed = await _order_already_billed(db, rx)
        if order_billed:
            for event in events:
                event.invoice_id = rx.invoice_id
        elif bill and events:
            await _bill(db, clinic_id, actor_id, rx, events)
    else:
        rx.status = status
    await db.flush()
    return await _load_rx(db, clinic_id, rx.id)


async def cancel_prescription(
    db: AsyncSession, clinic_id: str, actor_id: str, rx_id: str, data: CancelPrescription
) -> Prescription:
    _ = actor_id
    rx = await _load_rx(db, clinic_id, rx_id)
    if rx.status in (PrescriptionStatus.DISPENSED, PrescriptionStatus.CANCELLED):
        raise ValidationAppError("This prescription is already closed")
    if any(float(line.quantity_dispensed or 0) > 0 for line in rx.items):
        raise ValidationAppError("Return what was already dispensed before cancelling the prescription")
    rx.status = PrescriptionStatus.CANCELLED
    rx.cancel_reason = data.reason.strip()
    for line in rx.items:
        if line.line_status not in CLOSED_LINE:
            line.line_status = "cancelled"
    await db.flush()
    return await _load_rx(db, clinic_id, rx.id)


async def release_external(
    db: AsyncSession, clinic_id: str, actor_id: str, rx_id: str, data: ExternalRelease
) -> Prescription:
    rx = await _load_rx(db, clinic_id, rx_id)
    if rx.status not in OPEN_QUEUE:
        raise ValidationAppError("This prescription is not open")
    by_id = {line.id: line for line in rx.items}
    for item_id in data.item_ids:
        line = by_id.get(item_id)
        if not line:
            raise NotFoundError("Prescription line")
        if float(line.quantity_dispensed or 0) > 0:
            raise ValidationAppError(f"{line.drug_name} was already dispensed from the shelf")
        line.line_status = "external"
    _refresh_status(rx, actor_id)
    await db.flush()
    return await _load_rx(db, clinic_id, rx.id)


async def return_dispense(
    db: AsyncSession, clinic_id: str, actor_id: str, event_id: str, data: ReturnDispense
) -> Prescription:
    event = (
        await db.execute(
            select(DispenseEvent).where(DispenseEvent.id == event_id, DispenseEvent.clinic_id == clinic_id)
        )
    ).scalar_one_or_none()
    if not event:
        raise NotFoundError("Dispense not found")
    left = float(event.quantity or 0) - float(event.quantity_returned or 0)
    if data.quantity > left + 1e-9:
        raise ValidationAppError(f"Only {_fmt(left)} can be returned from this fill")
    if not event.inventory_item_id:
        raise ValidationAppError("This fill is not linked to stock")
    shelf, _store = await _locs(db, clinic_id)
    await stock.return_stock(
        db,
        clinic_id,
        actor_id,
        inventory_item_id=event.inventory_item_id,
        quantity=float(data.quantity),
        location_id=shelf.id,
        prescription_id=event.prescription_id,
        reason=data.reason.strip(),
    )
    event.quantity_returned = float(event.quantity_returned or 0) + float(data.quantity)
    rx = await _load_rx(db, clinic_id, event.prescription_id)
    line = next((row for row in rx.items if row.id == event.prescription_item_id), None)
    if line:
        line.quantity_dispensed = max(0.0, float(line.quantity_dispensed or 0) - float(data.quantity))
        prescribed = _qty(line.quantity)
        if line.quantity_dispensed <= 1e-9:
            line.line_status = "pending"
            line.quantity_dispensed = 0
        elif line.quantity_dispensed + 1e-9 < prescribed:
            line.line_status = "partial"
        else:
            line.line_status = "dispensed"
    if rx.status != PrescriptionStatus.CANCELLED:
        rx.status = PrescriptionStatus.ACTIVE
        _refresh_status(rx, actor_id)
    note = (event.notes or "").strip()
    event.notes = f"{note} Returned {_fmt(data.quantity)}: {data.reason.strip()}".strip()[:300]
    await db.flush()
    return await _load_rx(db, clinic_id, rx.id)


async def board(db: AsyncSession, clinic_id: str) -> PharmacyBoardOut:
    waiting = (
        await db.execute(
            select(func.count())
            .select_from(Prescription)
            .where(
                Prescription.clinic_id == clinic_id,
                Prescription.status.in_((PrescriptionStatus.ACTIVE, PrescriptionStatus.DRAFT)),
            )
        )
    ).scalar_one()
    partial = (
        await db.execute(
            select(func.count())
            .select_from(Prescription)
            .where(Prescription.clinic_id == clinic_id, Prescription.status == PrescriptionStatus.PARTIAL)
        )
    ).scalar_one()
    start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    dispensed_today = (
        await db.execute(
            select(func.count())
            .select_from(Prescription)
            .where(
                Prescription.clinic_id == clinic_id,
                Prescription.status == PrescriptionStatus.DISPENSED,
                Prescription.dispensed_at.is_not(None),
                Prescription.dispensed_at >= start,
            )
        )
    ).scalar_one()
    shelf_rows = await shelf(db, clinic_id)
    short = sum(1 for row in shelf_rows if row.inventory_item_id and row.shelf_on_hand <= row.reorder_level)
    shelf_loc, _store = await _locs(db, clinic_id)
    horizon = date.today() + timedelta(days=90)
    expiring_rows = (
        await db.execute(
            select(StockLot, InventoryItem)
            .join(InventoryItem, InventoryItem.id == StockLot.inventory_item_id)
            .where(
                StockLot.clinic_id == clinic_id,
                StockLot.location_id == shelf_loc.id,
                StockLot.quantity > 0,
                StockLot.expiry_date.is_not(None),
                StockLot.expiry_date <= horizon,
            )
            .order_by(StockLot.expiry_date)
            .limit(12)
        )
    ).all()
    expiring = [
        PharmacyExpiryOut(
            sku=item.sku,
            name=item.name,
            lot_code=lot.lot_code,
            expiry_date=lot.expiry_date,
            quantity=float(lot.quantity or 0),
        )
        for lot, item in expiring_rows
        if lot.expiry_date is not None
    ]
    sales_today = (
        await db.execute(
            select(func.count())
            .select_from(PharmacySale)
            .where(
                PharmacySale.clinic_id == clinic_id,
                PharmacySale.status == "completed",
                PharmacySale.created_at >= start,
            )
        )
    ).scalar_one()
    return PharmacyBoardOut(
        waiting=int(waiting or 0),
        partial=int(partial or 0),
        dispensed_today=int(dispensed_today or 0),
        sales_today=int(sales_today or 0),
        shelf_short=short,
        expiring=expiring,
    )


async def shelf(db: AsyncSession, clinic_id: str) -> list[PharmacyShelfRow]:
    templates = await list_drug_templates(db, clinic_id, include_inactive=True)
    item_ids = {row.inventory_item_id for row in templates if row.inventory_item_id}
    items: dict[str, InventoryItem] = {}
    if item_ids:
        rows = (
            await db.execute(select(InventoryItem).where(InventoryItem.id.in_(item_ids)))
        ).scalars().all()
        items = {row.id: row for row in rows}
    shelf_loc, store_loc = await _locs(db, clinic_id)
    on_shelf = await _on_hand_map(db, clinic_id, shelf_loc.id, item_ids)
    on_store = await _on_hand_map(db, clinic_id, store_loc.id, item_ids)
    out: list[PharmacyShelfRow] = []
    for tmpl in templates:
        item = items.get(tmpl.inventory_item_id or "")
        out.append(
            PharmacyShelfRow(
                template_id=tmpl.id,
                name=tmpl.name,
                category=tmpl.category,
                form=tmpl.form or "tablet",
                strength=tmpl.strength,
                dose=tmpl.default_dose,
                inventory_item_id=tmpl.inventory_item_id,
                sku=item.sku if item else None,
                unit=item.unit if item else None,
                sale_price=float(item.sale_price) if item and item.sale_price is not None else None,
                reorder_level=float(tmpl.reorder_level or 0),
                shelf_on_hand=on_shelf.get(tmpl.inventory_item_id or "", 0),
                store_on_hand=on_store.get(tmpl.inventory_item_id or "", 0),
                is_controlled=bool(tmpl.is_controlled),
                is_active=bool(tmpl.is_active),
            )
        )
    return out


async def request_shelf(
    db: AsyncSession, clinic_id: str, actor_id: str, data: ShelfRequest
):
    lines = list(data.lines)
    if not lines:
        for row in await shelf(db, clinic_id):
            if not row.is_active or not row.inventory_item_id:
                continue
            if row.shelf_on_hand > row.reorder_level:
                continue
            target = max(row.reorder_level * 2, row.reorder_level + 5, 1) - row.shelf_on_hand
            qty = min(target, row.store_on_hand)
            if qty <= 0:
                continue
            lines.append(ShelfRequestLine(inventory_item_id=row.inventory_item_id, quantity=qty))
    if not lines:
        raise ValidationAppError(
            "Nothing to request. The shelf covers the reorder levels, or the main store has no stock."
        )
    return await create_requisition(
        db,
        clinic_id,
        actor_id,
        RequisitionCreate(
            department="pharmacy",
            submit=True,
            notes=(data.notes or "").strip() or "Pharmacy shelf replenishment",
            lines=[
                RequisitionLineIn(inventory_item_id=line.inventory_item_id, quantity=float(line.quantity))
                for line in lines
            ],
        ),
    )


def present_sale(sale: PharmacySale) -> dict:
    patient = sale.patient
    invoice = sale.invoice
    lines = []
    for line in sale.lines:
        item = line.inventory_item
        lines.append(
            {
                "id": line.id,
                "inventory_item_id": line.inventory_item_id,
                "sku": item.sku if item else None,
                "description": line.description,
                "quantity": int(line.quantity or 0),
                "unit_price": float(line.unit_price or 0),
                "line_total": float(line.line_total or 0),
            }
        )
    return {
        "id": sale.id,
        "sale_number": sale.sale_number,
        "patient_id": sale.patient_id,
        "patient_name": f"{patient.first_name} {patient.last_name}".strip() if patient else None,
        "patient_code": patient.patient_code if patient else None,
        "invoice_id": sale.invoice_id,
        "invoice_number": invoice.invoice_number if invoice else None,
        "status": sale.status,
        "subtotal": float(sale.subtotal or 0),
        "total": float(sale.total or 0),
        "amount_paid": float(sale.amount_paid or 0),
        "amount_tendered": float(sale.amount_tendered or 0),
        "change_due": float(sale.change_due or 0),
        "payment_method": sale.payment_method,
        "payment_reference": sale.payment_reference,
        "notes": sale.notes,
        "created_at": sale.created_at,
        "lines": lines,
    }


async def _load_sale(db: AsyncSession, clinic_id: str, sale_id: str) -> PharmacySale:
    sale = (
        await db.execute(
            select(PharmacySale)
            .where(PharmacySale.id == sale_id, PharmacySale.clinic_id == clinic_id)
            .options(
                selectinload(PharmacySale.lines).selectinload(PharmacySaleLine.inventory_item),
                selectinload(PharmacySale.patient),
                selectinload(PharmacySale.invoice),
            )
        )
    ).scalar_one_or_none()
    if not sale:
        raise NotFoundError("Sale")
    return sale


async def list_sales(db: AsyncSession, clinic_id: str, limit: int = 40) -> list[dict]:
    rows = (
        await db.execute(
            select(PharmacySale)
            .where(PharmacySale.clinic_id == clinic_id)
            .options(
                selectinload(PharmacySale.lines).selectinload(PharmacySaleLine.inventory_item),
                selectinload(PharmacySale.patient),
                selectinload(PharmacySale.invoice),
            )
            .order_by(PharmacySale.created_at.desc())
            .limit(max(1, min(limit, 100)))
        )
    ).scalars().unique().all()
    return [present_sale(row) for row in rows]


async def checkout_sale(
    db: AsyncSession, clinic_id: str, actor_id: str, data: CounterSaleCreate
) -> dict:
    patient = (
        await db.execute(select(Patient).where(Patient.id == data.patient_id, Patient.clinic_id == clinic_id))
    ).scalar_one_or_none()
    if not patient:
        raise NotFoundError("Patient not found")

    merged: dict[str, int] = {}
    for line in data.lines:
        merged[line.inventory_item_id] = merged.get(line.inventory_item_id, 0) + int(line.quantity)
    if not merged:
        raise ValidationAppError("Add at least one item")

    items = (
        await db.execute(
            select(InventoryItem).where(
                InventoryItem.clinic_id == clinic_id,
                InventoryItem.id.in_(list(merged)),
            )
        )
    ).scalars().all()
    by_id = {row.id: row for row in items}
    missing = [item_id for item_id in merged if item_id not in by_id]
    if missing:
        raise NotFoundError("Shelf item")

    shelf_loc, store_loc = await _locs(db, clinic_id)
    prepared: list[tuple[InventoryItem, int, float]] = []
    for item_id, qty in merged.items():
        item = by_id[item_id]
        if not item.is_active or item.item_kind != InventoryItemKind.STOCK:
            raise ValidationAppError(f"{item.name} is not for sale")
        price = float(item.sale_price or 0)
        if price <= 0:
            raise ValidationAppError(f"Set a sale price for {item.name} before selling it")
        on_shelf = await stock.on_hand_at(db, clinic_id, item.id, shelf_loc.id)
        if on_shelf + 1e-9 < qty:
            on_store = await stock.on_hand_at(db, clinic_id, item.id, store_loc.id)
            raise ValidationAppError(
                f"{item.name}: pharmacy shelf has {_fmt(on_shelf)}, this sale needs {_fmt(qty)}. "
                f"Main store has {_fmt(on_store)}. Request it onto the shelf before selling."
            )
        prepared.append((item, qty, price))

    warnings: list[str] = []
    for item, _qty, _price in prepared:
        warnings.extend(await drug_warnings(db, clinic_id, patient.id, item.name))
    if warnings and not data.acknowledge_warnings:
        raise ValidationAppError("Review before selling: " + " ".join(warnings))

    templates = (
        await db.execute(
            select(DrugTemplate).where(
                DrugTemplate.clinic_id == clinic_id,
                DrugTemplate.inventory_item_id.in_(list(merged)),
                DrugTemplate.is_controlled.is_(True),
            )
        )
    ).scalars().all()
    if templates and not (data.notes or "").strip():
        names = ", ".join(row.name for row in templates)
        raise ValidationAppError(f"Controlled medicine needs a register note before selling: {names}")

    method = _payment_method(data.payment_method)
    subtotal = round(sum(qty * price for _item, qty, price in prepared), 2)
    tendered = subtotal if data.amount_tendered is None or method != PaymentMethod.CASH else float(data.amount_tendered)
    if tendered + 0.001 < subtotal:
        raise ValidationAppError(f"Amount received {_fmt(tendered)} is less than {_fmt(subtotal)}")
    change = round(tendered - subtotal, 2) if method == PaymentMethod.CASH else 0.0
    if method != PaymentMethod.CASH:
        tendered = subtotal

    sale_number = await allocate_number(db, clinic_id, "pharmacy_sale")
    sale = PharmacySale(
        clinic_id=clinic_id,
        sale_number=sale_number,
        patient_id=patient.id,
        sold_by_id=actor_id,
        status="completed",
        subtotal=subtotal,
        total=subtotal,
        amount_paid=0,
        amount_tendered=tendered,
        change_due=change,
        payment_method=method,
        payment_reference=(data.payment_reference or "").strip() or None,
        notes=(data.notes or "").strip() or None,
    )
    db.add(sale)
    await db.flush()
    for item, qty, price in prepared:
        db.add(
            PharmacySaleLine(
                sale_id=sale.id,
                inventory_item_id=item.id,
                description=item.name,
                quantity=qty,
                unit_price=price,
                line_total=round(qty * price, 2),
            )
        )
    await db.flush()

    from app.schemas import InvoiceCreate, InvoiceLineCreate
    from app.services.domain import create_invoice

    invoice = await create_invoice(
        db,
        clinic_id,
        actor_id,
        InvoiceCreate(
            patient_id=patient.id,
            notes=f"Pharmacy counter {sale_number}",
            line_items=[
                InvoiceLineCreate(
                    description=item.name,
                    quantity=qty,
                    unit_price=price,
                    procedure_code=item.sku,
                    inventory_item_id=None,
                    line_kind="drug",
                )
                for item, qty, price in prepared
            ],
        ),
    )
    sale.invoice_id = invoice.id
    for item, qty, _price in prepared:
        await stock.issue_patient(
            db,
            clinic_id,
            actor_id,
            inventory_item_id=item.id,
            quantity=float(qty),
            location_code="PHARM",
            invoice_id=invoice.id,
            reason=f"Counter sale {sale_number}",
        )
    paid = await _collect_invoice(db, clinic_id, actor_id, invoice.id, method, data.payment_reference)
    sale.total = float(paid.total or subtotal)
    sale.amount_paid = float(paid.amount_paid or 0)
    await db.flush()
    loaded = await _load_sale(db, clinic_id, sale.id)
    return present_sale(loaded)


async def _order_already_billed(db: AsyncSession, rx: Prescription) -> bool:
    """True when the chair already invoiced the whole course, so a fill must not bill again."""
    if not rx.invoice_id:
        return False
    notes = (
        await db.execute(select(Invoice.notes).where(Invoice.id == rx.invoice_id))
    ).scalar_one_or_none()
    return str(notes or "").startswith("Pharmacy order")


def present(
    rx: Prescription,
    shelf_map: dict[str, float],
    store_map: dict[str, float],
    *,
    order_billed: bool = False,
) -> dict:
    patient = rx.patient
    prescriber = rx.prescribed_by
    items = []
    for line in rx.items:
        items.append(
            {
                "id": line.id,
                "drug_name": line.drug_name,
                "dose": line.dose,
                "quantity": line.quantity,
                "frequency": line.frequency,
                "days": line.days,
                "start_date": line.start_date,
                "end_date": line.end_date,
                "instructions": line.instructions,
                "inventory_item_id": line.inventory_item_id,
                "drug_template_id": line.drug_template_id,
                "quantity_dispensed": float(line.quantity_dispensed or 0),
                "line_status": line.line_status or "pending",
                "shelf_on_hand": shelf_map.get(line.inventory_item_id, 0.0) if line.inventory_item_id else None,
                "store_on_hand": store_map.get(line.inventory_item_id, 0.0) if line.inventory_item_id else None,
            }
        )
    names = {line.id: line.drug_name for line in rx.items}
    dispenses = [
        {
            "id": event.id,
            "prescription_item_id": event.prescription_item_id,
            "inventory_item_id": event.inventory_item_id,
            "drug_name": names.get(event.prescription_item_id),
            "quantity": float(event.quantity or 0),
            "quantity_returned": float(event.quantity_returned or 0),
            "lot_code": event.lot_code,
            "expiry_date": event.expiry_date,
            "unit_price": float(event.unit_price or 0),
            "label_text": event.label_text,
            "invoice_id": event.invoice_id,
            "notes": event.notes,
            "created_at": event.created_at,
        }
        for event in rx.dispenses
    ]
    return {
        "id": rx.id,
        "patient_id": rx.patient_id,
        "patient_name": f"{patient.first_name} {patient.last_name}".strip() if patient else None,
        "patient_code": patient.patient_code if patient else None,
        "prescribed_by_id": rx.prescribed_by_id,
        "prescriber_name": prescriber.full_name if prescriber else None,
        "status": rx.status,
        "notes": rx.notes,
        "prescribed_at": rx.prescribed_at,
        "rx_number": rx.rx_number,
        "verified_at": rx.verified_at,
        "dispensed_at": rx.dispensed_at,
        "invoice_id": rx.invoice_id,
        "order_billed": order_billed,
        "cancel_reason": rx.cancel_reason,
        "items": items,
        "dispenses": dispenses,
        "created_at": rx.created_at,
    }


async def present_many(db: AsyncSession, clinic_id: str, rows: list[Prescription]) -> list[dict]:
    item_ids = {line.inventory_item_id for rx in rows for line in rx.items if line.inventory_item_id}
    shelf_loc, store_loc = await _locs(db, clinic_id)
    shelf_map = await _on_hand_map(db, clinic_id, shelf_loc.id, item_ids)
    store_map = await _on_hand_map(db, clinic_id, store_loc.id, item_ids)
    invoice_ids = {rx.invoice_id for rx in rows if rx.invoice_id}
    order_ids: set[str] = set()
    if invoice_ids:
        noted = await db.execute(
            select(Invoice.id, Invoice.notes).where(Invoice.id.in_(invoice_ids))
        )
        order_ids = {row.id for row in noted if str(row.notes or "").startswith("Pharmacy order")}
    return [
        present(rx, shelf_map, store_map, order_billed=bool(rx.invoice_id and rx.invoice_id in order_ids))
        for rx in rows
    ]
