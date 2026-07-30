from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import ClinicId, DbSession, require_permission
from app.models import User
from app.schemas import (
    InventoryAdjust,
    InventoryItemCreate,
    InventoryItemOut,
    InventoryItemUpdate,
)
from app.services import departments as dept

router = APIRouter(prefix="/inventory", tags=["inventory"])


@router.get("", response_model=list[InventoryItemOut])
async def list_items(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("inventory:read"))],
    low_only: bool = Query(False),
):
    _ = user
    return await dept.list_inventory(db, clinic_id, low_only=low_only)


@router.post("", response_model=InventoryItemOut, status_code=201)
async def create_item(
    body: InventoryItemCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("inventory:*"))],
):
    return await dept.create_inventory_item(db, clinic_id, user.id, body)


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
    user: Annotated[User, Depends(require_permission("inventory:*"))],
):
    return await dept.adjust_inventory(db, clinic_id, user.id, item_id, body)
