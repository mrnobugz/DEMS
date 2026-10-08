from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import ClinicId, DbSession, require_any_permission, require_permission
from app.models import User
from app.schemas import (
    CancelPrescription,
    CounterSaleCreate,
    CounterSaleOut,
    DispenseRequest,
    DrugTemplateCreate,
    DrugTemplateOut,
    DrugTemplateUpdate,
    ExternalRelease,
    PharmacyBoardOut,
    PharmacyShelfRow,
    PrescriptionCourseUpdate,
    PrescriptionCreate,
    PrescriptionOut,
    PrescriptionStatusUpdate,
    RequisitionOut,
    ReturnDispense,
    ShelfRequest,
)
from app.services import pharmacy as pharm

router = APIRouter(prefix="/pharmacy", tags=["pharmacy"])


@router.get("/board", response_model=PharmacyBoardOut)
async def pharmacy_board(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("pharmacy:read"))],
):
    _ = user
    return await pharm.board(db, clinic_id)


@router.get("/shelf", response_model=list[PharmacyShelfRow])
async def pharmacy_shelf(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("pharmacy:read"))],
):
    _ = user
    return await pharm.shelf(db, clinic_id)


@router.get("/sales", response_model=list[CounterSaleOut])
async def list_counter_sales(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("pharmacy:read"))],
    limit: int = Query(40, ge=1, le=100),
):
    _ = user
    return await pharm.list_sales(db, clinic_id, limit)


@router.post("/sales", response_model=CounterSaleOut, status_code=201)
async def checkout_counter(
    body: CounterSaleCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("pharmacy:*"))],
):
    return await pharm.checkout_sale(db, clinic_id, user.id, body)


@router.post("/shelf/request", response_model=RequisitionOut, status_code=201)
async def request_from_store(
    body: ShelfRequest,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_any_permission("pharmacy:*", "requisition:*"))],
):
    return await pharm.request_shelf(db, clinic_id, user.id, body)


@router.get("/templates", response_model=list[DrugTemplateOut])
async def list_templates(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("pharmacy:read"))],
    include_inactive: bool = Query(False),
):
    _ = user
    rows = await pharm.list_drug_templates(db, clinic_id, include_inactive=include_inactive)
    return await pharm.present_templates(db, clinic_id, rows)


@router.post("/templates", response_model=DrugTemplateOut, status_code=201)
async def create_template(
    body: DrugTemplateCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_any_permission("pharmacy:*", "config:*"))],
):
    _ = user
    return await pharm.create_drug_template(db, clinic_id, body)


@router.patch("/templates/{template_id}", response_model=DrugTemplateOut)
async def update_template(
    template_id: str,
    body: DrugTemplateUpdate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_any_permission("pharmacy:*", "config:*"))],
):
    _ = user
    return await pharm.update_drug_template(db, clinic_id, template_id, body)


@router.get("/prescriptions", response_model=list[PrescriptionOut])
async def list_rx(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("pharmacy:read"))],
    patient_id: str | None = Query(None),
    status: str | None = Query(None),
    q: str | None = Query(None),
):
    _ = user
    rows = await pharm.list_prescriptions(db, clinic_id, patient_id=patient_id, status=status, q=q)
    return await pharm.present_many(db, clinic_id, rows)


@router.post("/prescriptions", response_model=PrescriptionOut, status_code=201)
async def create_rx(
    body: PrescriptionCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("pharmacy:*"))],
):
    rx = await pharm.create_prescription(db, clinic_id, user.id, body)
    return (await pharm.present_many(db, clinic_id, [rx]))[0]


@router.patch("/prescriptions/{rx_id}/course", response_model=PrescriptionOut)
async def update_rx_course(
    rx_id: str,
    body: PrescriptionCourseUpdate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("pharmacy:*"))],
):
    _ = user
    rx = await pharm.update_prescription_course(db, clinic_id, rx_id, body)
    return (await pharm.present_many(db, clinic_id, [rx]))[0]


@router.patch("/prescriptions/{rx_id}", response_model=PrescriptionOut)
async def update_rx_status(
    rx_id: str,
    body: PrescriptionStatusUpdate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("pharmacy:*"))],
):
    rx = await pharm.update_prescription_status(
        db, clinic_id, user.id, rx_id, body.status, bill=body.bill
    )
    return (await pharm.present_many(db, clinic_id, [rx]))[0]


@router.post("/prescriptions/{rx_id}/dispense", response_model=PrescriptionOut)
async def dispense_rx(
    rx_id: str,
    body: DispenseRequest,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("pharmacy:*"))],
):
    rx = await pharm.dispense_prescription(db, clinic_id, user.id, rx_id, body)
    return (await pharm.present_many(db, clinic_id, [rx]))[0]


@router.post("/prescriptions/{rx_id}/cancel", response_model=PrescriptionOut)
async def cancel_rx(
    rx_id: str,
    body: CancelPrescription,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("pharmacy:*"))],
):
    rx = await pharm.cancel_prescription(db, clinic_id, user.id, rx_id, body)
    return (await pharm.present_many(db, clinic_id, [rx]))[0]


@router.post("/prescriptions/{rx_id}/external", response_model=PrescriptionOut)
async def release_external(
    rx_id: str,
    body: ExternalRelease,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("pharmacy:*"))],
):
    rx = await pharm.release_external(db, clinic_id, user.id, rx_id, body)
    return (await pharm.present_many(db, clinic_id, [rx]))[0]


@router.post("/dispenses/{event_id}/return", response_model=PrescriptionOut)
async def return_fill(
    event_id: str,
    body: ReturnDispense,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("pharmacy:*"))],
):
    rx = await pharm.return_dispense(db, clinic_id, user.id, event_id, body)
    return (await pharm.present_many(db, clinic_id, [rx]))[0]
