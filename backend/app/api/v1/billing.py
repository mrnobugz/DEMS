from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import ClinicId, DbSession, require_permission
from app.models import User
from app.schemas import (
    BillableChartEntryOut,
    CashUpOut,
    ChartToCashRequest,
    FeeScheduleItemCreate,
    FeeScheduleItemOut,
    FeeScheduleItemUpdate,
    InvoiceCreate,
    InvoiceOut,
    OutstandingInvoiceOut,
    PaymentCreate,
)
from app.services import domain as svc

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/fee-schedule", response_model=list[FeeScheduleItemOut])
async def list_fees(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("billing:read"))],
):
    _ = user
    return await svc.list_fee_schedule(db, clinic_id)


@router.post("/fee-schedule", response_model=FeeScheduleItemOut, status_code=201)
async def upsert_fee(
    body: FeeScheduleItemCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("billing:*"))],
):
    return await svc.upsert_fee_item(db, clinic_id, user.id, body)


@router.patch("/fee-schedule/{item_id}", response_model=FeeScheduleItemOut)
async def patch_fee(
    item_id: str,
    body: FeeScheduleItemUpdate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("billing:*"))],
):
    return await svc.update_fee_item(db, clinic_id, user.id, item_id, body)


@router.get(
    "/patients/{patient_id}/billable-chart",
    response_model=list[BillableChartEntryOut],
)
async def billable_chart(
    patient_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("billing:read"))],
):
    _ = user
    return await svc.list_billable_chart_entries(db, clinic_id, patient_id)


@router.post("/chart-to-cash", response_model=InvoiceOut, status_code=201)
async def chart_to_cash(
    body: ChartToCashRequest,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("billing:create"))],
):
    """Generate invoice lines from completed odontogram chart entries."""
    return await svc.chart_to_cash(db, clinic_id, user.id, body)


@router.get("/invoices", response_model=list[InvoiceOut])
async def list_invoices(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("billing:read"))],
    patient_id: str | None = Query(None),
    outstanding: bool = Query(False),
):
    _ = user
    return await svc.list_invoices(
        db, clinic_id, patient_id, outstanding_only=outstanding
    )


@router.get("/outstanding", response_model=list[OutstandingInvoiceOut])
async def outstanding_invoices(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("billing:read"))],
):
    _ = user
    return await svc.list_outstanding_invoices(db, clinic_id)


@router.get("/cash-up", response_model=CashUpOut)
async def cash_up(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("billing:read"))],
    on_date: date | None = Query(None, alias="date"),
):
    _ = user
    return await svc.daily_cash_up(db, clinic_id, on_date)


@router.post("/invoices", response_model=InvoiceOut, status_code=201)
async def create_invoice(
    body: InvoiceCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("billing:create"))],
):
    return await svc.create_invoice(db, clinic_id, user.id, body)


@router.get("/invoices/{invoice_id}", response_model=InvoiceOut)
async def get_invoice(
    invoice_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("billing:read"))],
):
    _ = user
    return await svc.get_invoice(db, clinic_id, invoice_id)


@router.post("/invoices/{invoice_id}/payments", response_model=InvoiceOut)
async def pay_invoice(
    invoice_id: str,
    body: PaymentCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("billing:create"))],
):
    return await svc.add_payment(db, clinic_id, user.id, invoice_id, body)
