from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import ClinicId, DbSession, require_permission
from app.models import User
from app.schemas import (
    AdjustmentCreate,
    BillableChartEntryOut,
    CashUpOut,
    CatalogFeeRateCreate,
    CatalogFeeRateOut,
    CatalogItemCreate,
    CatalogItemOut,
    CatalogItemUpdate,
    CatalogPriceHistoryOut,
    ChartToCashRequest,
    ClaimCreate,
    ClaimOut,
    DenialOut,
    FeeScheduleItemCreate,
    FeeScheduleItemOut,
    FeeScheduleItemUpdate,
    InvoiceCreate,
    InvoiceFromProceduresRequest,
    InvoiceOut,
    OutstandingInvoiceOut,
    PaymentCreate,
    RemittanceCreate,
    StatementCreate,
    StatementOut,
)
from app.services import billing_ledger as ledger
from app.services import catalog as catalog_svc
from app.services import domain as svc

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/fee-schedule", response_model=list[FeeScheduleItemOut])
async def list_fees(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("billing:read"))],
    billable: bool | None = Query(None),
    active: bool | None = Query(None),
):
    _ = user
    return await svc.list_fee_schedule(db, clinic_id, billable=billable, active=active)


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


@router.get("/catalog", response_model=list[CatalogItemOut])
async def list_catalog(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("billing:read"))],
    kind: str | None = Query(None),
    billable: bool | None = Query(None),
    active: bool | None = Query(True),
):
    _ = user
    return await catalog_svc.list_catalog(db, clinic_id, kind=kind, active=active, billable=billable)


@router.post("/catalog", response_model=CatalogItemOut, status_code=201)
async def create_catalog_item(
    body: CatalogItemCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("billing:*"))],
):
    return await catalog_svc.create_catalog_item(db, clinic_id, user.id, body)


@router.patch("/catalog/{item_id}", response_model=CatalogItemOut)
async def patch_catalog_item(
    item_id: str,
    body: CatalogItemUpdate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("billing:*"))],
):
    return await catalog_svc.update_catalog_item(db, clinic_id, user.id, item_id, body)


@router.get("/catalog/{item_id}/price-history", response_model=list[CatalogPriceHistoryOut])
async def catalog_price_history(
    item_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("billing:read"))],
):
    _ = user
    return await catalog_svc.list_price_history(db, clinic_id, item_id)


@router.post("/catalog/{item_id}/rates", response_model=CatalogFeeRateOut, status_code=201)
async def add_catalog_fee_rate(
    item_id: str,
    body: CatalogFeeRateCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("billing:*"))],
):
    return await catalog_svc.add_fee_rate(db, clinic_id, user.id, item_id, body)


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


@router.post("/invoices/from-procedures", response_model=InvoiceOut, status_code=201)
async def invoice_from_procedures(
    body: InvoiceFromProceduresRequest,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("billing:create"))],
):
    """Specialist invoice: line items and prices come from the admin procedure catalog."""
    return await svc.invoice_from_procedures(db, clinic_id, user.id, body)


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


@router.post("/invoices/{invoice_id}/adjustments", response_model=InvoiceOut)
async def adjust_invoice(
    invoice_id: str,
    body: AdjustmentCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("billing:*"))],
):
    return await ledger.add_adjustment(db, clinic_id, user.id, invoice_id, body)


@router.post("/invoices/{invoice_id}/void", response_model=InvoiceOut)
async def void_invoice(
    invoice_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("billing:*"))],
):
    return await ledger.void_invoice(db, clinic_id, user.id, invoice_id)


@router.get("/claims", response_model=list[ClaimOut])
async def list_claims(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("billing:read"))],
    status: str | None = Query(None),
    patient_id: str | None = Query(None),
):
    _ = user
    return await ledger.list_claims(db, clinic_id, status=status, patient_id=patient_id)


@router.post("/claims", response_model=ClaimOut, status_code=201)
async def create_claim(
    body: ClaimCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("billing:create"))],
):
    return await ledger.create_claim(db, clinic_id, user.id, body)


@router.post("/claims/{claim_id}/submit", response_model=ClaimOut)
async def submit_claim(
    claim_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("billing:create"))],
):
    return await ledger.submit_claim(db, clinic_id, user.id, claim_id)


@router.post("/claims/{claim_id}/remittance", response_model=ClaimOut)
async def post_remittance(
    claim_id: str,
    body: RemittanceCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("billing:*"))],
):
    return await ledger.post_remittance(db, clinic_id, user.id, claim_id, body)


@router.get("/denials", response_model=list[DenialOut])
async def list_denials(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("billing:read"))],
):
    _ = user
    return await ledger.list_denials(db, clinic_id)


@router.get("/statements", response_model=list[StatementOut])
async def list_statements(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("billing:read"))],
    patient_id: str | None = Query(None),
):
    _ = user
    return await ledger.list_statements(db, clinic_id, patient_id)


@router.post("/statements", response_model=StatementOut, status_code=201)
async def generate_statement(
    body: StatementCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("billing:create"))],
):
    return await ledger.generate_statement(db, clinic_id, user.id, body)
