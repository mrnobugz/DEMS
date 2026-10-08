from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query

from app.api.deps import ClinicId, DbSession, require_any_permission, require_permission
from app.core.rbac import user_has_any_permission
from app.models import User
from app.schemas import (
    InventoryAdjust,
    InventoryItemCreate,
    InventoryItemOut,
    InventoryItemUpdate,
    InventoryImportRequest,
    InventoryImportResult,
    PurchaseOrderCreate,
    PurchaseOrderOut,
    PurchaseOrderReceiveRequest,
    StockIssueRequest,
    StockLocationOut,
    StockMovementOut,
    StockReceiveRequest,
    StocktakeRequest,
    StockWriteoffRequest,
    SupplierCreate,
    SupplierHistoryOut,
    SupplierOut,
    SupplierUpdate,
    WarehouseAlertsOut,
)
from app.services import departments as dept
from app.services import requisitions as reqs
from app.services import warehouse as stock
from app.services.domain import create_invoice
from app.schemas import InvoiceCreate, InvoiceLineCreate

router = APIRouter(prefix="/inventory", tags=["inventory"])


CATALOG_READ = require_any_permission("inventory:read", "requisition:create", "requisition:*")


@router.get("/locations", response_model=list[StockLocationOut])
async def list_locations(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(CATALOG_READ)],
):
    _ = user
    return await stock.list_locations(db, clinic_id)


@router.get("/suppliers", response_model=list[SupplierOut])
async def list_suppliers(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("inventory:read"))],
    include_inactive: bool = Query(False),
):
    _ = user
    return await stock.list_suppliers(db, clinic_id, include_inactive=include_inactive)


@router.post("/suppliers", response_model=SupplierOut, status_code=201)
async def create_supplier(
    body: SupplierCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("inventory:*"))],
):
    _ = user
    return await stock.create_supplier(db, clinic_id, body)


@router.patch("/suppliers/{supplier_id}", response_model=SupplierOut)
async def update_supplier(
    supplier_id: str,
    body: SupplierUpdate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("inventory:*"))],
):
    _ = user
    return await stock.update_supplier(db, clinic_id, supplier_id, body)


@router.get("/suppliers/{supplier_id}/history", response_model=SupplierHistoryOut)
async def supplier_procurement_history(
    supplier_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("inventory:read"))],
):
    _ = user
    return await stock.supplier_history(db, clinic_id, supplier_id)


@router.get("/alerts", response_model=WarehouseAlertsOut)
async def warehouse_alerts(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_any_permission("inventory:read", "requisition:create", "requisition:*"))],
):
    _ = user
    return await stock.warehouse_alerts(db, clinic_id)


@router.get("/purchase-orders", response_model=list[PurchaseOrderOut])
async def list_pos(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("inventory:read"))],
):
    _ = user
    return await stock.list_purchase_orders(db, clinic_id)


@router.post("/purchase-orders", response_model=PurchaseOrderOut, status_code=201)
async def create_po(
    body: PurchaseOrderCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("inventory:*"))],
):
    _ = user
    return await stock.create_purchase_order(db, clinic_id, body)


@router.post("/purchase-orders/{po_id}/receive", response_model=PurchaseOrderOut)
async def receive_po(
    po_id: str,
    body: PurchaseOrderReceiveRequest,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_any_permission("inventory:*", "inventory:issue"))],
):
    lines = [row.model_dump() for row in body.lines]
    return await stock.receive_purchase_order(
        db, clinic_id, user.id, po_id, lines=lines, location_id=body.location_id
    )


@router.post("/purchase-orders/{po_id}/cancel", response_model=PurchaseOrderOut)
async def cancel_po(
    po_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("inventory:*"))],
):
    _ = user
    return await stock.cancel_purchase_order(db, clinic_id, po_id)


@router.get("/expiring")
async def expiring_stock(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("inventory:read"))],
    days: int = Query(90, ge=1, le=365),
):
    _ = user
    return await stock.expiring_lots(db, clinic_id, days=days)


@router.get("/movements", response_model=list[StockMovementOut])
async def list_movements(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("inventory:read"))],
    movement_type: str | None = Query(None),
    inventory_item_id: str | None = Query(None),
    location_id: str | None = Query(None),
):
    _ = user
    return await stock.list_movements(
        db,
        clinic_id,
        movement_type=movement_type,
        inventory_item_id=inventory_item_id,
        location_id=location_id,
    )


@router.get("/analysis")
async def warehouse_analysis(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("inventory:read"))],
    days: int = Query(90),
    category: str | None = Query(None),
    department: str | None = Query(None),
) -> dict[str, Any]:
    _ = user
    return await stock.analysis(db, clinic_id, days=days, category=category, department=department)


@router.post("/receive", response_model=list[StockMovementOut])
async def receive_stock(
    body: StockReceiveRequest,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_any_permission("inventory:*", "inventory:issue"))],
):
    return await stock.receive_lines(
        db,
        clinic_id,
        user.id,
        [line.model_dump() for line in body.lines],
        location_id=body.location_id,
        supplier_id=body.supplier_id,
        purchase_order_id=body.purchase_order_id,
        reason=body.reason,
    )


@router.post("/issue")
async def issue_stock(
    body: StockIssueRequest,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_any_permission("inventory:*", "inventory:issue"))],
):
    if body.patient_id and body.bill:
        item = await stock.get_stock_item(db, clinic_id, body.inventory_item_id)
        price = float(item.sale_price or item.unit_cost or 0)
        invoice = await create_invoice(
            db,
            clinic_id,
            user.id,
            InvoiceCreate(
                patient_id=body.patient_id,
                line_items=[
                    InvoiceLineCreate(
                        description=item.name,
                        quantity=max(int(body.quantity), 1),
                        unit_price=price,
                        procedure_code=item.sku,
                        inventory_item_id=item.id,
                        line_kind="supply",
                    )
                ],
                notes=body.reason or "Warehouse patient issue",
            ),
        )
        return {"ok": True, "invoice_id": invoice.id, "quantity": body.quantity}
    if body.to_location_id:
        rows = await stock.issue_department(
            db,
            clinic_id,
            user.id,
            inventory_item_id=body.inventory_item_id,
            quantity=body.quantity,
            from_location_id=body.from_location_id or body.location_id,
            to_location_id=body.to_location_id,
            lot_code=body.lot_code,
            reason=body.reason,
        )
        return rows
    rows = await stock.issue_patient(
        db,
        clinic_id,
        user.id,
        inventory_item_id=body.inventory_item_id,
        quantity=body.quantity,
        location_id=body.location_id or body.from_location_id,
        reason=body.reason or "issue",
    )
    return rows


@router.post("/writeoff", response_model=list[StockMovementOut])
async def writeoff_stock(
    body: StockWriteoffRequest,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("inventory:*"))],
):
    return await stock.writeoff(
        db,
        clinic_id,
        user.id,
        inventory_item_id=body.inventory_item_id,
        quantity=body.quantity,
        location_id=body.location_id,
        lot_code=body.lot_code,
        reason=body.reason,
    )


@router.post("/stocktake")
async def stocktake_item(
    body: StocktakeRequest,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("inventory:*"))],
):
    mv = await stock.stocktake(
        db,
        clinic_id,
        user.id,
        inventory_item_id=body.inventory_item_id,
        counted=body.counted,
        location_id=body.location_id,
        reason=body.reason,
    )
    return mv


@router.get("", response_model=list[InventoryItemOut])
async def list_items(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(CATALOG_READ)],
    low_only: bool = Query(False),
    include_inactive: bool = Query(False),
    billable_at_registration: bool | None = Query(None),
    item_kind: str | None = Query(None),
):
    if include_inactive and not user_has_any_permission(user, "inventory:read", "inventory:*"):
        include_inactive = False
    await stock.ensure_locations(db, clinic_id)
    items = await dept.list_inventory(
        db,
        clinic_id,
        low_only=low_only,
        include_inactive=include_inactive,
        billable_at_registration=billable_at_registration,
        item_kind=item_kind,
        seed_registration=bool(billable_at_registration),
    )
    return await reqs.with_store_position(db, clinic_id, items)


@router.post("", response_model=InventoryItemOut, status_code=201)
async def create_item(
    body: InventoryItemCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("inventory:*"))],
):
    return await dept.create_inventory_item(db, clinic_id, user.id, body)


@router.post("/import", response_model=InventoryImportResult)
async def import_items(
    body: InventoryImportRequest,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("inventory:*"))],
):
    return await dept.import_inventory_items(db, clinic_id, user.id, body.items)


@router.patch("/{item_id}", response_model=InventoryItemOut)
async def update_item(
    item_id: str,
    body: InventoryItemUpdate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("inventory:*"))],
):
    _ = user
    return await dept.update_inventory_item(db, clinic_id, item_id, body)


@router.post("/{item_id}/adjust", response_model=InventoryItemOut)
async def adjust_item(
    item_id: str,
    body: InventoryAdjust,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_any_permission("inventory:*", "inventory:issue"))],
):
    return await dept.adjust_inventory(db, clinic_id, user.id, item_id, body)
