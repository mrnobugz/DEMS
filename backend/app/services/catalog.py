"""Catalog core: SKUs, category tree, price history, and payer fee schedules.

Warehouse inventory remains the registration/stock catalog. This module is what
billing consumes for clinical procedures, drugs, supplies, and lab items.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundError, ValidationAppError
from app.models import (
    CatalogCategory,
    CatalogFeeRate,
    CatalogItem,
    CatalogItemKind,
    CatalogPriceHistory,
    FeeScheduleItem,
)
from app.schemas import CatalogFeeRateCreate, CatalogItemCreate, CatalogItemUpdate
from app.services.domain import ensure_fee_schedule, get_primary_insurance_plan, write_audit

OFFICE_PAYER = ""
TOOTH_REQUIRED_CODES = {"filling", "crown", "rct", "extraction"}
FEE_SYNC_KINDS = {CatalogItemKind.PROCEDURE, CatalogItemKind.DRUG, CatalogItemKind.SUPPLY}
SOLD_GOODS_KINDS = {CatalogItemKind.DRUG, CatalogItemKind.SUPPLY}


def _slug(value: str) -> str:
    return (value or "general").strip().lower().replace(" ", "-")[:80]


async def ensure_category(
    db: AsyncSession, clinic_id: str, name: str, *, parent_id: str | None = None
) -> CatalogCategory:
    slug = _slug(name)
    row = (
        await db.execute(
            select(CatalogCategory).where(
                CatalogCategory.clinic_id == clinic_id, CatalogCategory.slug == slug
            )
        )
    ).scalar_one_or_none()
    if row:
        return row
    row = CatalogCategory(
        clinic_id=clinic_id,
        name=name.strip() or slug,
        slug=slug,
        parent_id=parent_id,
    )
    db.add(row)
    await db.flush()
    return row


async def _record_price_history(
    db: AsyncSession,
    clinic_id: str,
    item: CatalogItem,
    old_price: float,
    new_price: float,
    actor_id: str | None,
) -> None:
    if round(old_price, 4) == round(new_price, 4):
        return
    db.add(
        CatalogPriceHistory(
            clinic_id=clinic_id,
            catalog_item_id=item.id,
            old_price=old_price,
            new_price=new_price,
            changed_by_id=actor_id,
        )
    )


async def _set_office_rate(
    db: AsyncSession, clinic_id: str, item: CatalogItem, amount: float, on_date: date | None = None
) -> CatalogFeeRate:
    on_date = on_date or date.today()
    existing = (
        await db.execute(
            select(CatalogFeeRate).where(
                CatalogFeeRate.clinic_id == clinic_id,
                CatalogFeeRate.catalog_item_id == item.id,
                CatalogFeeRate.payer_name == OFFICE_PAYER,
                CatalogFeeRate.effective_from == on_date,
            )
        )
    ).scalar_one_or_none()
    if existing:
        existing.amount = amount
        return existing
    rate = CatalogFeeRate(
        clinic_id=clinic_id,
        catalog_item_id=item.id,
        payer_name=OFFICE_PAYER,
        amount=amount,
        effective_from=on_date,
    )
    db.add(rate)
    await db.flush()
    return rate


async def sync_fee_item_to_catalog(
    db: AsyncSession,
    clinic_id: str,
    fee: FeeScheduleItem,
    actor_id: str | None = None,
) -> CatalogItem:
    """Keep procedure fee rows mirrored as catalog procedure SKUs."""
    category = await ensure_category(db, clinic_id, fee.category or "general")
    item = None
    if fee.catalog_item_id:
        item = (
            await db.execute(
                select(CatalogItem).where(
                    CatalogItem.id == fee.catalog_item_id, CatalogItem.clinic_id == clinic_id
                )
            )
        ).scalar_one_or_none()
    if item is None:
        item = (
            await db.execute(
                select(CatalogItem).where(CatalogItem.clinic_id == clinic_id, CatalogItem.sku == fee.code)
            )
        ).scalar_one_or_none()
    price = float(fee.unit_price or 0)
    if item is None:
        item = CatalogItem(
            clinic_id=clinic_id,
            sku=fee.code,
            label=fee.label,
            kind=CatalogItemKind.PROCEDURE,
            list_price=price,
            currency=fee.currency or "TZS",
            is_active=bool(fee.is_active),
            billable=bool(fee.billable),
            category_id=category.id,
            notes=fee.notes,
            cdt_code=fee.code if str(fee.code).upper().startswith("D") else None,
            tooth_required=fee.code.lower() in TOOTH_REQUIRED_CODES,
        )
        db.add(item)
        await db.flush()
        await _set_office_rate(db, clinic_id, item, price, fee.effective_from)
    else:
        await _record_price_history(db, clinic_id, item, float(item.list_price or 0), price, actor_id)
        item.sku = fee.code
        item.label = fee.label
        item.list_price = price
        item.currency = fee.currency or item.currency
        item.is_active = bool(fee.is_active)
        item.billable = bool(fee.billable)
        item.category_id = category.id
        item.notes = fee.notes
        await _set_office_rate(db, clinic_id, item, price)
    fee.catalog_item_id = item.id
    await db.flush()
    return item


def sold_goods_kind(kind: str | CatalogItemKind | None) -> str | None:
    if kind in SOLD_GOODS_KINDS or kind in ("drug", "supply"):
        return str(kind)
    return None


async def sync_catalog_item_to_fee(db: AsyncSession, clinic_id: str, item: CatalogItem) -> FeeScheduleItem | None:
    """Mirror billable procedure/drug/supply catalog rows onto the fee schedule Billing uses."""
    kind = item.kind
    if kind not in FEE_SYNC_KINDS and str(kind) not in {"procedure", "drug", "supply"}:
        return None
    fee = (
        await db.execute(
            select(FeeScheduleItem).where(
                FeeScheduleItem.clinic_id == clinic_id, FeeScheduleItem.catalog_item_id == item.id
            )
        )
    ).scalar_one_or_none()
    if fee is None:
        fee = (
            await db.execute(
                select(FeeScheduleItem).where(
                    FeeScheduleItem.clinic_id == clinic_id, FeeScheduleItem.code == item.sku
                )
            )
        ).scalar_one_or_none()
    cat_row = None
    if item.category_id:
        cat_row = (
            await db.execute(
                select(CatalogCategory).where(
                    CatalogCategory.id == item.category_id, CatalogCategory.clinic_id == clinic_id
                )
            )
        ).scalar_one_or_none()
    category_slug = cat_row.slug if cat_row else (
        str(kind) if kind != CatalogItemKind.PROCEDURE else "general"
    )
    if fee is None:
        from app.services.config_setup import ensure_fee_schedules

        default = await ensure_fee_schedules(db, clinic_id)
        fee = FeeScheduleItem(
            clinic_id=clinic_id,
            fee_schedule_id=default.id,
            code=item.sku,
            label=item.label,
            category=category_slug,
            unit_price=item.list_price,
            currency=item.currency or "TZS",
            is_active=bool(item.is_active),
            billable=bool(item.billable),
            notes=item.notes,
            catalog_item_id=item.id,
        )
        db.add(fee)
    else:
        fee.catalog_item_id = item.id
        fee.label = item.label
        fee.unit_price = item.list_price
        fee.is_active = bool(item.is_active)
        fee.billable = bool(item.billable)
        fee.notes = item.notes
        fee.category = category_slug
    await db.flush()
    return fee


async def decorate_fee_schedule(
    db: AsyncSession, clinic_id: str, items: list[FeeScheduleItem]
) -> list[FeeScheduleItem]:
    """Attach catalog kind / warehouse on-hand for Billing UI (not persisted)."""
    catalog_ids = [row.catalog_item_id for row in items if row.catalog_item_id]
    catalogs: dict[str, CatalogItem] = {}
    if catalog_ids:
        rows = (
            await db.execute(select(CatalogItem).where(CatalogItem.id.in_(catalog_ids)))
        ).scalars().all()
        catalogs = {row.id: row for row in rows}
    from app.services import warehouse as stock

    on_hand: dict[str, float] = {}
    for fee in items:
        cat = catalogs.get(fee.catalog_item_id) if fee.catalog_item_id else None
        kind = str(cat.kind) if cat else None
        fee.catalog_kind = kind
        inv_id = cat.inventory_item_id if cat and sold_goods_kind(cat.kind) else None
        fee.inventory_item_id = inv_id
        fee.quantity_on_hand = 0.0
        if inv_id and inv_id not in on_hand:
            on_hand[inv_id] = await stock.on_hand_at(db, clinic_id, inv_id)
        if inv_id:
            fee.quantity_on_hand = on_hand.get(inv_id, 0.0)
    return items


async def sync_fee_schedule_catalog(db: AsyncSession, clinic_id: str) -> None:
    fees = (
        await db.execute(select(FeeScheduleItem).where(FeeScheduleItem.clinic_id == clinic_id))
    ).scalars().all()
    for fee in fees:
        if not fee.catalog_item_id:
            await sync_fee_item_to_catalog(db, clinic_id, fee)


async def resolve_fee(
    db: AsyncSession,
    clinic_id: str,
    item: CatalogItem,
    *,
    payer_name: str | None = None,
    on_date: date | None = None,
) -> float:
    """Pick the latest fee-schedule row in force on the date of service."""
    on_date = on_date or date.today()
    rates = (
        await db.execute(
            select(CatalogFeeRate)
            .where(
                CatalogFeeRate.clinic_id == clinic_id,
                CatalogFeeRate.catalog_item_id == item.id,
                CatalogFeeRate.effective_from <= on_date,
            )
            .order_by(CatalogFeeRate.effective_from.desc())
        )
    ).scalars().all()
    wanted = (payer_name or "").strip()
    for rate in rates:
        if wanted and rate.payer_name == wanted:
            return float(rate.amount)
    for rate in rates:
        if rate.payer_name == OFFICE_PAYER:
            return float(rate.amount)
    return float(item.list_price or 0)


async def resolve_fee_for_patient(
    db: AsyncSession,
    clinic_id: str,
    item: CatalogItem,
    patient_id: str | None,
    *,
    on_date: date | None = None,
) -> float:
    payer_name = None
    if patient_id:
        plan = await get_primary_insurance_plan(db, clinic_id, patient_id)
        if plan:
            payer_name = plan.payer_name
    return await resolve_fee(db, clinic_id, item, payer_name=payer_name, on_date=on_date)


async def get_catalog_item(db: AsyncSession, clinic_id: str, item_id: str) -> CatalogItem:
    item = (
        await db.execute(
            select(CatalogItem)
            .options(
                selectinload(CatalogItem.category),
                selectinload(CatalogItem.price_history),
                selectinload(CatalogItem.fee_rates),
            )
            .where(CatalogItem.id == item_id, CatalogItem.clinic_id == clinic_id)
        )
    ).scalar_one_or_none()
    if not item:
        raise NotFoundError("Catalog item")
    return item


async def list_catalog(
    db: AsyncSession,
    clinic_id: str,
    *,
    kind: str | None = None,
    active: bool | None = True,
    billable: bool | None = None,
) -> list[CatalogItem]:
    await ensure_fee_schedule(db, clinic_id)
    await sync_fee_schedule_catalog(db, clinic_id)
    stmt = (
        select(CatalogItem)
        .options(selectinload(CatalogItem.category), selectinload(CatalogItem.fee_rates))
        .where(CatalogItem.clinic_id == clinic_id)
    )
    if kind:
        stmt = stmt.where(CatalogItem.kind == kind)
    if active is not None:
        stmt = stmt.where(CatalogItem.is_active.is_(active))
    if billable is not None:
        stmt = stmt.where(CatalogItem.billable.is_(billable))
    rows = (await db.execute(stmt.order_by(CatalogItem.kind, CatalogItem.sku))).scalars().all()
    return list(rows)


async def list_categories(db: AsyncSession, clinic_id: str) -> list[CatalogCategory]:
    rows = (
        await db.execute(
            select(CatalogCategory)
            .where(CatalogCategory.clinic_id == clinic_id)
            .order_by(CatalogCategory.sort_order, CatalogCategory.name)
        )
    ).scalars().all()
    return list(rows)


def _apply_kind_fields(item: CatalogItem, data: CatalogItemCreate | CatalogItemUpdate) -> None:
    payload = data.model_dump(exclude_unset=True)
    for field in (
        "cdt_code",
        "tooth_required",
        "ndc_code",
        "drug_schedule",
        "unit_of_measure",
        "vendor_fee_basis",
    ):
        if field in payload:
            setattr(item, field, payload[field])


async def create_catalog_item(
    db: AsyncSession, clinic_id: str, actor_id: str, data: CatalogItemCreate
) -> CatalogItem:
    sku = data.sku.strip().lower()
    existing = (
        await db.execute(
            select(CatalogItem).where(CatalogItem.clinic_id == clinic_id, CatalogItem.sku == sku)
        )
    ).scalar_one_or_none()
    if existing:
        raise ValidationAppError("A catalog item with this SKU already exists")
    category = None
    if data.category_id:
        category = (
            await db.execute(
                select(CatalogCategory).where(
                    CatalogCategory.id == data.category_id, CatalogCategory.clinic_id == clinic_id
                )
            )
        ).scalar_one_or_none()
        if not category:
            raise NotFoundError("Catalog category")
    elif data.category:
        category = await ensure_category(db, clinic_id, data.category)
    item = CatalogItem(
        clinic_id=clinic_id,
        sku=sku,
        label=data.label,
        kind=data.kind,
        list_price=data.list_price,
        currency=data.currency,
        is_active=data.is_active,
        billable=data.billable,
        category_id=category.id if category else None,
        notes=data.notes,
        cdt_code=data.cdt_code,
        tooth_required=data.tooth_required,
        ndc_code=data.ndc_code,
        drug_schedule=data.drug_schedule,
        unit_of_measure=data.unit_of_measure,
        vendor_fee_basis=data.vendor_fee_basis,
        inventory_item_id=data.inventory_item_id,
    )
    db.add(item)
    await db.flush()
    await _set_office_rate(db, clinic_id, item, data.list_price, data.effective_from)
    await sync_catalog_item_to_fee(db, clinic_id, item)
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="create",
        resource_type="catalog_item",
        resource_id=item.id,
        after={"sku": item.sku, "kind": item.kind, "list_price": item.list_price},
    )
    return await get_catalog_item(db, clinic_id, item.id)


async def update_catalog_item(
    db: AsyncSession, clinic_id: str, actor_id: str, item_id: str, data: CatalogItemUpdate
) -> CatalogItem:
    item = await get_catalog_item(db, clinic_id, item_id)
    payload = data.model_dump(exclude_unset=True)
    if "list_price" in payload:
        await _record_price_history(
            db, clinic_id, item, float(item.list_price or 0), float(payload["list_price"]), actor_id
        )
        await _set_office_rate(db, clinic_id, item, float(payload["list_price"]))
    if "category" in payload and payload["category"]:
        category = await ensure_category(db, clinic_id, payload.pop("category"))
        item.category_id = category.id
        payload.pop("category_id", None)
    elif payload.get("category_id"):
        category = (
            await db.execute(
                select(CatalogCategory).where(
                    CatalogCategory.id == payload["category_id"], CatalogCategory.clinic_id == clinic_id
                )
            )
        ).scalar_one_or_none()
        if not category:
            raise NotFoundError("Catalog category")
    for key in ("label", "kind", "list_price", "currency", "is_active", "billable", "notes", "category_id", "inventory_item_id"):
        if key in payload:
            setattr(item, key, payload[key])
    _apply_kind_fields(item, data)
    await db.flush()
    await sync_catalog_item_to_fee(db, clinic_id, item)
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="update",
        resource_type="catalog_item",
        resource_id=item.id,
        after=data.model_dump(exclude_unset=True),
    )
    return await get_catalog_item(db, clinic_id, item.id)


async def add_fee_rate(
    db: AsyncSession, clinic_id: str, actor_id: str, item_id: str, data: CatalogFeeRateCreate
) -> CatalogFeeRate:
    item = await get_catalog_item(db, clinic_id, item_id)
    payer = (data.payer_name or "").strip()
    on_date = data.effective_from or date.today()
    existing = (
        await db.execute(
            select(CatalogFeeRate).where(
                CatalogFeeRate.clinic_id == clinic_id,
                CatalogFeeRate.catalog_item_id == item.id,
                CatalogFeeRate.payer_name == payer,
                CatalogFeeRate.effective_from == on_date,
            )
        )
    ).scalar_one_or_none()
    if existing:
        existing.amount = data.amount
        rate = existing
    else:
        rate = CatalogFeeRate(
            clinic_id=clinic_id,
            catalog_item_id=item.id,
            payer_name=payer,
            amount=data.amount,
            effective_from=on_date,
        )
        db.add(rate)
        await db.flush()
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="create",
        resource_type="catalog_fee_rate",
        resource_id=rate.id,
        after={"sku": item.sku, "payer_name": payer, "amount": data.amount},
    )
    return rate


async def list_price_history(
    db: AsyncSession, clinic_id: str, item_id: str
) -> list[CatalogPriceHistory]:
    await get_catalog_item(db, clinic_id, item_id)
    rows = (
        await db.execute(
            select(CatalogPriceHistory)
            .where(
                CatalogPriceHistory.clinic_id == clinic_id,
                CatalogPriceHistory.catalog_item_id == item_id,
            )
            .order_by(CatalogPriceHistory.created_at.desc())
        )
    ).scalars().all()
    return list(rows)
