"""Idempotent demo stock, counter sales, and chairside links for local testing.

Runs on an already-seeded development database. Production clinics are left alone
unless a full demo fabric seed asks for it.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.exceptions import ConflictError
from app.models import (
    ClinicalNote,
    DentalChartEntry,
    DrugTemplate,
    ImagingStudy,
    InventoryItem,
    Patient,
    PatientSafetyItem,
    PharmacySale,
    Prescription,
    PrescriptionItem,
    Requisition,
    StockLot,
    User,
)
from app.schemas import (
    CounterSaleCreate,
    CounterSaleLineIn,
    DispenseLineIn,
    DispenseRequest,
    DrugTemplateCreate,
    InventoryItemCreate,
    PrescriptionCreate,
    PrescriptionItemIn,
    ShelfRequest,
    ShelfRequestLine,
)
from app.services import departments as dept
from app.services import pharmacy as pharm
from app.services import warehouse as stock
from app.services.config import allocate_number

settings = get_settings()

# sku, name, form, strength, dose, default qty, instructions, unit, cost, price,
# reorder, store qty, shelf qty, controlled, expiry days, near-expiry shelf qty
_DRUGS: tuple[tuple, ...] = (
    ("AMOX-500", "Amoxicillin 500mg", "capsule", "500mg", "500mg TID", "21", "Take after meals for 7 days", "capsule", 180, 500, 20, 80, 40, False, 400, 0),
    ("IBU-400", "Ibuprofen 400mg", "tablet", "400mg", "400mg TID PRN", "15", "With food; max 1200mg/day", "tablet", 40, 200, 30, 100, 16, False, 500, 8),
    ("CHX-012", "Chlorhexidine 0.12%", "rinse", "0.12%", "15ml BID", "2", "Rinse 30 seconds; do not swallow", "bottle", 3500, 8000, 4, 24, 8, False, 300, 0),
    ("PARA-500", "Paracetamol 500mg", "tablet", "500mg", "500mg QDS PRN", "10", "Maximum 4g in 24 hours", "tablet", 20, 100, 40, 200, 60, False, 540, 0),
    ("METRO-400", "Metronidazole 400mg", "tablet", "400mg", "400mg TID", "15", "Avoid alcohol", "tablet", 80, 300, 10, 40, 0, False, 360, 0),
    ("CODEINE-30", "Codeine 30mg", "tablet", "30mg", "30mg QDS PRN", "8", "Controlled. Counsel on drowsiness", "tablet", 400, 1500, 6, 20, 8, True, 400, 0),
    ("DICLO-50", "Diclofenac 50mg", "tablet", "50mg", "50mg TID with food", "9", "With food. Stop if stomach pain", "tablet", 60, 250, 10, 30, 18, False, 420, 6),
)

_SUPPLIES: tuple[tuple, ...] = (
    ("BURS-FG", "Diamond burs FG pack", "restorative", "pack", 36, 12, 8000, 15000, 700),
    ("SUTURE-3-0", "Suture silk 3-0", "surgery", "pack", 14, 8, 4500, 9000, 500),
    ("ALG-CHROMA", "Chromatic alginate", "prosthodontics", "bag", 6, 8, 12000, 22000, 200),
    ("GUTTA-04", "Gutta-percha 4%", "endodontics", "pack", 40, 10, 6000, 14000, 600),
    ("XRAY-FILM", "Periapical film", "imaging", "box", 18, 6, 25000, 40000, 365),
    ("COTTON-ROLL", "Cotton rolls", "consumable", "pack", 80, 20, 3000, 7000, 800),
)

_PRICE_FIX = {"COMP-A2": 45000.0, "GLOVE-M": 15000.0, "ANES-LIDO": 2500.0}


async def ensure_demo_operations(db: AsyncSession, *, force: bool = False) -> None:
    if settings.environment == "production" and not force:
        return
    from app.models import Clinic

    main = (
        await db.execute(select(Clinic).where(Clinic.code == settings.default_clinic_code))
    ).scalar_one_or_none()
    if not main:
        return
    main_id = main.id

    pharmacist = (
        await db.execute(select(User).where(User.email == "pharmacy@demsta.clinic"))
    ).scalar_one_or_none()
    dentist = (
        await db.execute(select(User).where(User.email == "dentist@demsta.clinic"))
    ).scalar_one_or_none()
    imaging = (
        await db.execute(select(User).where(User.email == "imaging@demsta.clinic"))
    ).scalar_one_or_none()
    actor = pharmacist or dentist
    prescriber = dentist or actor
    if not actor or not prescriber:
        return
    patients = list(
        (
            await db.execute(
                select(Patient)
                .where(Patient.clinic_id == main_id)
                .order_by(Patient.patient_code)
            )
        ).scalars().all()
    )
    if not patients:
        return

    await _backfill_lots(db, main_id, actor.id)
    await _touch_prices(db, main_id)
    for spec in _SUPPLIES:
        await _ensure_supply(db, main_id, actor.id, spec)
    drugs: dict[str, InventoryItem] = {}
    for spec in _DRUGS:
        drugs[spec[0]] = await _ensure_drug(db, main_id, actor.id, spec)
    lido = await _sku(db, main_id, "ANES-LIDO")
    if lido:
        drugs["ANES-LIDO"] = lido
        await _place_on_shelf(db, main_id, actor.id, lido, 12)
        await _template(
            db,
            main_id,
            lido,
            name="Lidocaine 2% carpules",
            category="anaesthetic",
            form="injection",
            strength="2%",
            dose="1 carpule",
            default_quantity="1",
            instructions="Chairside local anaesthetic",
            reorder=8,
            controlled=False,
        )
    for spec in _DRUGS:
        item = drugs[spec[0]]
        await _template(
            db,
            main_id,
            item,
            name=spec[1],
            category="analgesic" if spec[0] in {"IBU-400", "PARA-500", "DICLO-50", "CODEINE-30"} else "antibiotic" if spec[0] in {"AMOX-500", "METRO-400"} else "mouthwash" if spec[0] == "CHX-012" else "other",
            form=spec[2],
            strength=spec[3],
            dose=spec[4],
            default_quantity=spec[5],
            instructions=spec[6],
            reorder=spec[10],
            controlled=spec[13],
        )
    await _link_unlinked_lines(db, main_id)
    await _number_blank_scripts(db, main_id)
    amox_patient = await _amox_patient(db, main_id, patients[0])
    await _allergy(db, main_id, amox_patient)
    await _charts_and_notes(db, main_id, patients, prescriber.id, imaging.id if imaging else prescriber.id)
    await _scripts(db, main_id, patients, prescriber.id, actor.id, drugs)
    await _sample_sale(db, main_id, actor.id, patients, drugs)
    metro = drugs.get("METRO-400")
    if metro:
        await _sample_request(db, main_id, actor.id, metro)


async def _sku(db: AsyncSession, clinic_id: str, sku: str) -> InventoryItem | None:
    return (
        await db.execute(
            select(InventoryItem).where(InventoryItem.clinic_id == clinic_id, InventoryItem.sku == sku)
        )
    ).scalar_one_or_none()


async def _backfill_lots(db: AsyncSession, clinic_id: str, actor_id: str) -> None:
    items = (
        await db.execute(
            select(InventoryItem).where(
                InventoryItem.clinic_id == clinic_id,
                InventoryItem.item_kind == "stock",
            )
        )
    ).scalars().all()
    for item in items:
        lots = (
            await db.execute(select(func.count()).select_from(StockLot).where(StockLot.inventory_item_id == item.id))
        ).scalar_one()
        opening = float(item.quantity or 0)
        if int(lots or 0) > 0 or opening <= 0:
            continue
        expiry = item.expiry_date or (date.today() + timedelta(days=365))
        if item.requires_expiry and item.expiry_date is None:
            item.expiry_date = expiry
        await stock.receive(
            db,
            clinic_id,
            actor_id,
            inventory_item_id=item.id,
            quantity=opening,
            unit_cost=float(item.unit_cost or 0),
            location_code="MAIN",
            lot_code="OPENING",
            expiry_date=expiry,
            reason="demo opening balance",
        )


async def _touch_prices(db: AsyncSession, clinic_id: str) -> None:
    rows = (
        await db.execute(select(InventoryItem).where(InventoryItem.clinic_id == clinic_id))
    ).scalars().all()
    for item in rows:
        price = _PRICE_FIX.get(item.sku)
        if price and float(item.sale_price or 0) <= 0:
            item.sale_price = price


async def _ensure_supply(db: AsyncSession, clinic_id: str, actor_id: str, spec: tuple) -> None:
    sku, name, category, unit, qty, reorder, cost, price, days = spec
    if await _sku(db, clinic_id, sku):
        return
    try:
        await dept.create_inventory_item(
            db,
            clinic_id,
            actor_id,
            InventoryItemCreate(
                sku=sku,
                name=name,
                category=category,
                item_kind="stock",
                quantity=qty,
                reorder_level=reorder,
                unit=unit,
                unit_cost=cost,
                sale_price=price,
                expiry_date=date.today() + timedelta(days=days),
                requires_expiry=True,
                notes="Demo stock for inventory and chairside use",
            ),
        )
    except ConflictError:
        return


async def _ensure_drug(db: AsyncSession, clinic_id: str, actor_id: str, spec: tuple) -> InventoryItem:
    sku = spec[0]
    existing = await _sku(db, clinic_id, sku)
    created = False
    if existing is None:
        try:
            existing = await dept.create_inventory_item(
                db,
                clinic_id,
                actor_id,
                InventoryItemCreate(
                    sku=sku,
                    name=spec[1],
                    category="drug",
                    item_kind="stock",
                    quantity=float(spec[11]) + float(spec[12]),
                    reorder_level=spec[10],
                    unit=spec[7],
                    unit_cost=spec[8],
                    sale_price=spec[9],
                    expiry_date=date.today() + timedelta(days=spec[14]),
                    requires_expiry=True,
                    notes="Demo pharmacy stock",
                ),
            )
            created = True
        except ConflictError:
            existing = await _sku(db, clinic_id, sku)
    if existing is None:
        raise RuntimeError(f"Missing demo SKU {sku}")
    if created or not await _has_location_lot(db, existing.id, clinic_id, "PHARM"):
        await _place_on_shelf(db, clinic_id, actor_id, existing, int(spec[12]))
    near = int(spec[15])
    if near > 0 and not await _has_lot_code(db, existing.id, "EXP-SOON"):
        await stock.receive(
            db,
            clinic_id,
            actor_id,
            inventory_item_id=existing.id,
            quantity=near,
            unit_cost=float(spec[8]),
            location_code="PHARM",
            lot_code="EXP-SOON",
            expiry_date=date.today() + timedelta(days=21),
            reason="demo near-expiry lot",
        )
    return existing


async def _has_location_lot(db: AsyncSession, item_id: str, clinic_id: str, code: str) -> bool:
    await stock.ensure_locations(db, clinic_id)
    loc = await stock.location_by_code(db, clinic_id, code)
    found = (
        await db.execute(
            select(StockLot.id).where(StockLot.inventory_item_id == item_id, StockLot.location_id == loc.id).limit(1)
        )
    ).scalar_one_or_none()
    return found is not None


async def _has_lot_code(db: AsyncSession, item_id: str, lot_code: str) -> bool:
    found = (
        await db.execute(
            select(StockLot.id).where(StockLot.inventory_item_id == item_id, StockLot.lot_code == lot_code).limit(1)
        )
    ).scalar_one_or_none()
    return found is not None


async def _place_on_shelf(db: AsyncSession, clinic_id: str, actor_id: str, item: InventoryItem, target: int) -> None:
    if target <= 0:
        return
    await stock.ensure_locations(db, clinic_id)
    shelf = await stock.location_by_code(db, clinic_id, "PHARM")
    main = await stock.location_by_code(db, clinic_id, "MAIN")
    have = await stock.on_hand_at(db, clinic_id, item.id, shelf.id)
    if have + 1e-9 >= target:
        return
    available = await stock.on_hand_at(db, clinic_id, item.id, main.id)
    move = min(target - have, available)
    if move <= 0:
        return
    await stock.issue_department(
        db,
        clinic_id,
        actor_id,
        inventory_item_id=item.id,
        quantity=float(move),
        from_location_id=main.id,
        to_location_id=shelf.id,
        reason="demo pharmacy shelf",
    )


async def _template(
    db: AsyncSession,
    clinic_id: str,
    item: InventoryItem,
    *,
    name: str,
    category: str,
    form: str,
    strength: str,
    dose: str,
    default_quantity: str,
    instructions: str,
    reorder: float,
    controlled: bool,
) -> DrugTemplate:
    row = (
        await db.execute(
            select(DrugTemplate).where(DrugTemplate.clinic_id == clinic_id, DrugTemplate.name == name)
        )
    ).scalar_one_or_none()
    if row:
        if row.inventory_item_id is None:
            row.inventory_item_id = item.id
            row.form = form
            row.strength = strength
            row.reorder_level = reorder
            row.is_controlled = controlled
            row.category = category
            if not row.default_dose:
                row.default_dose = dose
        return row
    return await pharm.create_drug_template(
        db,
        clinic_id,
        DrugTemplateCreate(
            name=name,
            category=category,
            default_dose=dose,
            default_quantity=default_quantity,
            instructions=instructions,
            form=form,
            strength=strength,
            route="oral" if form != "injection" else "infiltration",
            inventory_item_id=item.id,
            reorder_level=reorder,
            is_controlled=controlled,
        ),
    )


async def _link_unlinked_lines(db: AsyncSession, clinic_id: str) -> None:
    templates = (
        await db.execute(select(DrugTemplate).where(DrugTemplate.clinic_id == clinic_id))
    ).scalars().all()
    by_name = {row.name.lower(): row for row in templates}
    lines = (
        await db.execute(
            select(PrescriptionItem)
            .join(Prescription, Prescription.id == PrescriptionItem.prescription_id)
            .where(Prescription.clinic_id == clinic_id, PrescriptionItem.inventory_item_id.is_(None))
        )
    ).scalars().all()
    for line in lines:
        tmpl = by_name.get(line.drug_name.lower())
        if not tmpl or not tmpl.inventory_item_id:
            continue
        line.inventory_item_id = tmpl.inventory_item_id
        line.drug_template_id = tmpl.id


async def _number_blank_scripts(db: AsyncSession, clinic_id: str) -> None:
    rows = (
        await db.execute(
            select(Prescription).where(Prescription.clinic_id == clinic_id, Prescription.rx_number.is_(None))
        )
    ).scalars().all()
    for rx in rows:
        rx.rx_number = await allocate_number(db, clinic_id, "prescription")


async def _amox_patient(db: AsyncSession, clinic_id: str, fallback: Patient) -> Patient:
    patient_id = (
        await db.execute(
            select(Prescription.patient_id)
            .join(PrescriptionItem, PrescriptionItem.prescription_id == Prescription.id)
            .where(
                Prescription.clinic_id == clinic_id,
                PrescriptionItem.drug_name.ilike("%amoxicillin%"),
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if not patient_id:
        return fallback
    patient = (
        await db.execute(select(Patient).where(Patient.id == patient_id, Patient.clinic_id == clinic_id))
    ).scalar_one_or_none()
    return patient or fallback


async def _allergy(db: AsyncSession, clinic_id: str, patient: Patient) -> None:
    text = (patient.allergies or "").lower()
    if "penicillin" not in text:
        patient.allergies = ((patient.allergies or "").strip() + " penicillin").strip()
    found = (
        await db.execute(
            select(PatientSafetyItem.id).where(
                PatientSafetyItem.clinic_id == clinic_id,
                PatientSafetyItem.patient_id == patient.id,
                PatientSafetyItem.kind == "allergy",
                PatientSafetyItem.code == "penicillin",
            )
        )
    ).scalar_one_or_none()
    if found:
        return
    db.add(
        PatientSafetyItem(
            clinic_id=clinic_id,
            patient_id=patient.id,
            kind="allergy",
            code="penicillin",
            label="Penicillin",
            notes="Confirm before any penicillin or amoxicillin.",
        )
    )
    await db.flush()


async def _charts_and_notes(
    db: AsyncSession,
    clinic_id: str,
    patients: list[Patient],
    dentist_id: str,
    imaging_id: str,
) -> None:
    charts = [
        (0, "16", "O", "caries", "Caries", "existing", "demo:chart-16-caries", "Occlusal caries on 16, tied to the pharmacy script."),
        (1, "46", "MO", "caries", "Caries", "existing", "demo:chart-46-caries", "MO caries on 46. Bitewing is on the imaging list."),
        (2, "21", "I", "crown", "Crown", "planned", "demo:chart-21-crown", "Planned crown on 21 after the lab case."),
    ]
    for index, tooth, surfaces, code, label, kind, note, friendly in charts:
        if index >= len(patients):
            continue
        exists = (
            await db.execute(
                select(DentalChartEntry).where(
                    DentalChartEntry.clinic_id == clinic_id,
                    or_(DentalChartEntry.notes == note, DentalChartEntry.notes == friendly),
                )
            )
        ).scalar_one_or_none()
        if exists:
            if exists.notes == note:
                exists.notes = friendly
            continue
        db.add(
            DentalChartEntry(
                clinic_id=clinic_id,
                patient_id=patients[index].id,
                tooth_number=tooth,
                surfaces=surfaces,
                condition_code=code,
                condition_label=label,
                entry_kind=kind,
                status="recorded" if kind == "existing" else "planned",
                notes=friendly,
                recorded_by_id=dentist_id,
                visit_date=date.today(),
            )
        )
    note_plan = "demo:pharmacy-plan Dispense the signed script from the pharmacy shelf."
    friendly_plan = "Dispense the signed script from the pharmacy shelf and confirm the penicillin allergy."
    noted = (
        await db.execute(
            select(ClinicalNote).where(
                ClinicalNote.clinic_id == clinic_id,
                or_(ClinicalNote.plan == note_plan, ClinicalNote.plan == friendly_plan),
            )
        )
    ).scalar_one_or_none()
    if noted and noted.plan == note_plan:
        noted.plan = friendly_plan
    if not noted:
        db.add(
            ClinicalNote(
                clinic_id=clinic_id,
                patient_id=patients[0].id,
                author_id=dentist_id,
                note_type="progress",
                subjective="Pain on tooth 16 and ongoing endodontic treatment on 36.",
                objective="Caries charted on 16. Periapical image is on the imaging list.",
                assessment="Restorative caries plus post-operative antibiotic cover.",
                plan=friendly_plan,
                is_finalized=True,
            )
        )
    image_key = "stub://imaging/demo/bw-46"
    imaged = (
        await db.execute(
            select(ImagingStudy.id).where(
                ImagingStudy.clinic_id == clinic_id,
                ImagingStudy.storage_key == image_key,
            )
        )
    ).scalar_one_or_none()
    if not imaged and len(patients) > 1:
        db.add(
            ImagingStudy(
                clinic_id=clinic_id,
                patient_id=patients[1].id,
                captured_by_id=imaging_id,
                study_type="BW",
                tooth="46",
                storage_key=image_key,
                notes="Bitewing before the restorative prescription",
                captured_at=datetime.now(UTC) - timedelta(hours=3),
            )
        )
    await db.flush()


async def _scripts(
    db: AsyncSession,
    clinic_id: str,
    patients: list[Patient],
    prescriber_id: str,
    pharmacist_id: str,
    drugs: dict[str, InventoryItem],
) -> None:
    specs = [
        ("demo:rx-rinse", "Chlorhexidine rinse after caries on tooth 46.", 1, "CHX-012", "2", 1, False),
        ("demo:rx-analgesic", "Analgesia after the restorative visit.", 2, "PARA-500", "10", 10, False),
        ("demo:rx-metro", "Metronidazole cover. The shelf is empty until the store issues it.", 3, "METRO-400", "15", 0, False),
        ("demo:rx-codeine", "Controlled analgesic. Record the register before dispensing.", 4, "CODEINE-30", "8", 0, True),
    ]
    for note, friendly, index, sku, qty, give, controlled in specs:
        if sku not in drugs or index >= len(patients):
            continue
        item = drugs[sku]
        tmpl = (
            await db.execute(
                select(DrugTemplate).where(
                    DrugTemplate.clinic_id == clinic_id,
                    DrugTemplate.inventory_item_id == item.id,
                )
            )
        ).scalars().first()
        rx = (
            await db.execute(
                select(Prescription)
                .where(
                    Prescription.clinic_id == clinic_id,
                    or_(Prescription.notes == note, Prescription.notes == friendly),
                )
                .options(selectinload(Prescription.items))
            )
        ).scalar_one_or_none()
        if rx is not None and rx.notes == note:
            rx.notes = friendly
        if rx is None:
            rx = await pharm.create_prescription(
                db,
                clinic_id,
                prescriber_id,
                PrescriptionCreate(
                    patient_id=patients[index].id,
                    notes=friendly,
                    items=[
                        PrescriptionItemIn(
                            drug_name=item.name,
                            dose=tmpl.default_dose if tmpl else "as directed",
                            quantity=qty,
                            instructions="Controlled register" if controlled else "Demo chairside script",
                            drug_template_id=tmpl.id if tmpl else None,
                            inventory_item_id=item.id,
                        )
                    ],
                ),
            )
        if give <= 0:
            continue
        line = rx.items[0]
        if float(line.quantity_dispensed or 0) > 0 or line.line_status not in ("pending", "partial"):
            continue
        await pharm.dispense_prescription(
            db,
            clinic_id,
            pharmacist_id,
            rx.id,
            DispenseRequest(
                lines=[DispenseLineIn(prescription_item_id=line.id, quantity=float(give))],
                bill=True,
                collect_payment=False,
                notes="Demo fill" if not controlled else "Demo controlled register",
            ),
        )


async def _sample_sale(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    patients: list[Patient],
    drugs: dict[str, InventoryItem],
) -> None:
    found = (
        await db.execute(
            select(PharmacySale.id).where(
                PharmacySale.clinic_id == clinic_id,
                PharmacySale.notes == "demo:counter-sale",
            )
        )
    ).scalar_one_or_none()
    if found or "IBU-400" not in drugs or "PARA-500" not in drugs:
        return
    patient = patients[-1]
    await pharm.checkout_sale(
        db,
        clinic_id,
        actor_id,
        CounterSaleCreate(
            patient_id=patient.id,
            lines=[
                CounterSaleLineIn(inventory_item_id=drugs["IBU-400"].id, quantity=2),
                CounterSaleLineIn(inventory_item_id=drugs["PARA-500"].id, quantity=1),
            ],
            payment_method="cash",
            amount_tendered=1000,
            notes="demo:counter-sale",
        ),
    )


async def _sample_request(db: AsyncSession, clinic_id: str, actor_id: str, metro: InventoryItem) -> None:
    friendly = "Move metronidazole from the main store onto the pharmacy shelf."
    found = (
        await db.execute(
            select(Requisition).where(
                Requisition.clinic_id == clinic_id,
                or_(Requisition.notes == "demo:metro-shelf", Requisition.notes == friendly),
            )
        )
    ).scalar_one_or_none()
    if found:
        if found.notes == "demo:metro-shelf":
            found.notes = friendly
        return
    await pharm.request_shelf(
        db,
        clinic_id,
        actor_id,
        ShelfRequest(
            notes=friendly,
            lines=[ShelfRequestLine(inventory_item_id=metro.id, quantity=20)],
        ),
    )
