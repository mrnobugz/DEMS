"""Department shell domain: inventory, lab, imaging, pharmacy, staff, owner."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationAppError
from app.core.rbac import Role
from app.models import (
    Appointment,
    Clinic,
    DrugTemplate,
    ImagingStudy,
    InventoryItem,
    Invoice,
    InvoiceStatus,
    LabCase,
    LabCaseStatus,
    Patient,
    Prescription,
    PrescriptionItem,
    PrescriptionStatus,
    StaffProfile,
    User,
)
from app.schemas import (
    ClinicCreate,
    ClinicUpdate,
    DrugTemplateCreate,
    ImagingStudyCreate,
    InventoryAdjust,
    InventoryItemCreate,
    InventoryItemUpdate,
    LabCaseCreate,
    LabCaseUpdate,
    PrescriptionCreate,
    StaffCreate,
)
from app.services.domain import create_user, write_audit


# ── Owner / clinics ───────────────────────────────────
async def list_clinics(db: AsyncSession) -> list[Clinic]:
    result = await db.execute(select(Clinic).order_by(Clinic.code))
    return list(result.scalars().all())


async def create_clinic(db: AsyncSession, actor: User, data: ClinicCreate) -> Clinic:
    if actor.role != Role.SUPER_ADMIN:
        raise ForbiddenError("Only system owner can create clinics")
    code = data.code.strip().upper()
    exists = (
        await db.execute(select(Clinic).where(Clinic.code == code))
    ).scalar_one_or_none()
    if exists:
        raise ConflictError(f"Clinic code {code} already exists")
    clinic = Clinic(
        name=data.name,
        code=code,
        address=data.address,
        phone=data.phone,
        email=str(data.email) if data.email else None,
        timezone=data.timezone,
        currency=data.currency,
    )
    db.add(clinic)
    await db.flush()
    await write_audit(
        db,
        clinic_id=clinic.id,
        actor_id=actor.id,
        action="create",
        resource_type="clinic",
        resource_id=clinic.id,
        after={"code": clinic.code, "name": clinic.name},
    )
    return clinic


async def update_clinic(db: AsyncSession, actor: User, clinic_id: str, data: ClinicUpdate) -> Clinic:
    if actor.role != Role.SUPER_ADMIN:
        raise ForbiddenError("Only system owner can update clinics")
    clinic = (
        await db.execute(select(Clinic).where(Clinic.id == clinic_id))
    ).scalar_one_or_none()
    if not clinic:
        raise NotFoundError("Clinic not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(clinic, k, v)
    await db.flush()
    return clinic


async def chain_stats(db: AsyncSession) -> dict:
    clinics = (await db.execute(select(func.count()).select_from(Clinic))).scalar_one()
    active = (
        await db.execute(select(func.count()).select_from(Clinic).where(Clinic.is_active.is_(True)))
    ).scalar_one()
    staff = (
        await db.execute(select(func.count()).select_from(User).where(User.clinic_id.is_not(None)))
    ).scalar_one()
    patients = (await db.execute(select(func.count()).select_from(Patient))).scalar_one()
    start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    appts = (
        await db.execute(
            select(func.count())
            .select_from(Appointment)
            .where(Appointment.starts_at >= start, Appointment.starts_at < end)
        )
    ).scalar_one()
    revenue = (
        await db.execute(
            select(func.coalesce(func.sum(Invoice.total - Invoice.amount_paid), 0.0)).where(
                Invoice.status.in_(
                    [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.DRAFT]
                )
            )
        )
    ).scalar_one()
    return {
        "clinics": clinics,
        "active_clinics": active,
        "staff_total": staff,
        "patients_total": patients,
        "appointments_today": appts,
        "revenue_open": float(revenue or 0),
    }


async def list_all_staff(db: AsyncSession) -> list[User]:
    result = await db.execute(
        select(User).options(selectinload(User.staff_profile)).order_by(User.full_name)
    )
    return list(result.scalars().all())


# ── Staff ─────────────────────────────────────────────
async def list_clinic_staff(db: AsyncSession, clinic_id: str) -> list[User]:
    result = await db.execute(
        select(User)
        .where(User.clinic_id == clinic_id)
        .options(selectinload(User.staff_profile))
        .order_by(User.full_name)
    )
    return list(result.scalars().all())


async def create_staff(db: AsyncSession, clinic_id: str, actor: User, data: StaffCreate) -> User:
    try:
        Role(data.role)
    except ValueError as exc:
        raise ValidationAppError(f"Invalid role: {data.role}") from exc
    if data.role == Role.SUPER_ADMIN and actor.role != Role.SUPER_ADMIN:
        raise ForbiddenError("Cannot create platform owner from clinic admin")

    exists = (
        await db.execute(
            select(User).where(User.clinic_id == clinic_id, User.email == str(data.email).lower())
        )
    ).scalar_one_or_none()
    if exists:
        raise ConflictError("Staff email already exists in this clinic")

    user = create_user(
        clinic_id,
        email=str(data.email),
        password=data.password,
        full_name=data.full_name,
        role=data.role,
        phone=data.phone,
        specialty=data.specialty,
    )
    db.add(user)
    await db.flush()
    profile = StaffProfile(
        clinic_id=clinic_id,
        user_id=user.id,
        title=data.title,
        specialty=data.specialty,
        department=data.department,
    )
    db.add(profile)
    await db.flush()
    await db.refresh(user, attribute_names=["staff_profile"])
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor.id,
        action="create",
        resource_type="staff",
        resource_id=user.id,
        after={"email": user.email, "role": user.role},
    )
    return user


# ── Inventory ─────────────────────────────────────────
async def list_inventory(db: AsyncSession, clinic_id: str, *, low_only: bool = False) -> list[InventoryItem]:
    q = select(InventoryItem).where(InventoryItem.clinic_id == clinic_id, InventoryItem.is_active.is_(True))
    if low_only:
        q = q.where(InventoryItem.quantity <= InventoryItem.reorder_level)
    result = await db.execute(q.order_by(InventoryItem.name))
    return list(result.scalars().all())


async def create_inventory_item(
    db: AsyncSession, clinic_id: str, actor_id: str, data: InventoryItemCreate
) -> InventoryItem:
    exists = (
        await db.execute(
            select(InventoryItem).where(
                InventoryItem.clinic_id == clinic_id, InventoryItem.sku == data.sku
            )
        )
    ).scalar_one_or_none()
    if exists:
        raise ConflictError(f"SKU {data.sku} already exists")
    item = InventoryItem(clinic_id=clinic_id, **data.model_dump())
    db.add(item)
    await db.flush()
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="create",
        resource_type="inventory_item",
        resource_id=item.id,
    )
    return item


async def update_inventory_item(
    db: AsyncSession, clinic_id: str, item_id: str, data: InventoryItemUpdate
) -> InventoryItem:
    item = (
        await db.execute(
            select(InventoryItem).where(
                InventoryItem.id == item_id, InventoryItem.clinic_id == clinic_id
            )
        )
    ).scalar_one_or_none()
    if not item:
        raise NotFoundError("Inventory item not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(item, k, v)
    await db.flush()
    return item


async def adjust_inventory(
    db: AsyncSession, clinic_id: str, actor_id: str, item_id: str, data: InventoryAdjust
) -> InventoryItem:
    item = (
        await db.execute(
            select(InventoryItem).where(
                InventoryItem.id == item_id, InventoryItem.clinic_id == clinic_id
            )
        )
    ).scalar_one_or_none()
    if not item:
        raise NotFoundError("Inventory item not found")
    item.quantity = float(item.quantity) + float(data.delta)
    await db.flush()
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="adjust",
        resource_type="inventory_item",
        resource_id=item.id,
        after={"delta": data.delta, "quantity": item.quantity, "reason": data.reason},
    )
    return item


# ── Lab ───────────────────────────────────────────────
def _lab_overdue_clause():
    return and_(
        LabCase.due_at.is_not(None),
        LabCase.due_at < datetime.now(UTC),
        LabCase.status.notin_(
            [LabCaseStatus.FITTED, LabCaseStatus.CANCELLED, LabCaseStatus.DRAFT]
        ),
    )


async def list_lab_cases(
    db: AsyncSession,
    clinic_id: str,
    *,
    status: str | None = None,
    overdue_only: bool = False,
) -> list[LabCase]:
    q = select(LabCase).where(LabCase.clinic_id == clinic_id)
    if status:
        q = q.where(LabCase.status == status)
    if overdue_only:
        q = q.where(_lab_overdue_clause())
    result = await db.execute(q.order_by(LabCase.due_at.asc().nullslast(), LabCase.created_at.desc()))
    return list(result.scalars().all())


async def count_overdue_lab_cases(db: AsyncSession, clinic_id: str) -> int:
    return int(
        (
            await db.execute(
                select(func.count())
                .select_from(LabCase)
                .where(LabCase.clinic_id == clinic_id, _lab_overdue_clause())
            )
        ).scalar_one()
    )


async def _link_restoration(
    db: AsyncSession,
    clinic_id: str,
    case: LabCase,
    *,
    restoration_id: str | None = None,
    restoration_case_id: str | None = None,
) -> None:
    from app.models import Restoration, RestorationCase

    if restoration_id:
        resto = (
            await db.execute(
                select(Restoration).where(
                    Restoration.id == restoration_id,
                    Restoration.clinic_id == clinic_id,
                    Restoration.patient_id == case.patient_id,
                )
            )
        ).scalar_one_or_none()
        if not resto:
            raise ValidationAppError("Restoration not found for this patient")
        case.restoration_id = resto.id
        if resto.case_id:
            case.restoration_case_id = resto.case_id
            rcase = (
                await db.execute(
                    select(RestorationCase).where(RestorationCase.id == resto.case_id)
                )
            ).scalar_one_or_none()
            if rcase:
                rcase.lab_case_id = case.id
    if restoration_case_id:
        rcase = (
            await db.execute(
                select(RestorationCase).where(
                    RestorationCase.id == restoration_case_id,
                    RestorationCase.clinic_id == clinic_id,
                    RestorationCase.patient_id == case.patient_id,
                )
            )
        ).scalar_one_or_none()
        if not rcase:
            raise ValidationAppError("Restoration case not found for this patient")
        case.restoration_case_id = rcase.id
        rcase.lab_case_id = case.id


async def create_lab_case(
    db: AsyncSession, clinic_id: str, actor: User, data: LabCaseCreate
) -> LabCase:
    patient = (
        await db.execute(
            select(Patient).where(Patient.id == data.patient_id, Patient.clinic_id == clinic_id)
        )
    ).scalar_one_or_none()
    if not patient:
        raise NotFoundError("Patient not found")
    payload = data.model_dump()
    restoration_id = payload.pop("restoration_id", None)
    restoration_case_id = payload.pop("restoration_case_id", None)
    case = LabCase(
        clinic_id=clinic_id,
        dentist_id=actor.id if actor.role == Role.DENTIST else None,
        **payload,
    )
    if case.status == LabCaseStatus.SENT and not case.sent_at:
        case.sent_at = datetime.now(UTC)
    db.add(case)
    await db.flush()
    if restoration_id or restoration_case_id:
        await _link_restoration(
            db,
            clinic_id,
            case,
            restoration_id=restoration_id,
            restoration_case_id=restoration_case_id,
        )
        await db.flush()
    return case


async def update_lab_case(
    db: AsyncSession, clinic_id: str, case_id: str, data: LabCaseUpdate
) -> LabCase:
    case = (
        await db.execute(
            select(LabCase).where(LabCase.id == case_id, LabCase.clinic_id == clinic_id)
        )
    ).scalar_one_or_none()
    if not case:
        raise NotFoundError("Lab case not found")
    payload = data.model_dump(exclude_unset=True)
    restoration_id = payload.pop("restoration_id", _UNSET)
    restoration_case_id = payload.pop("restoration_case_id", _UNSET)
    now = datetime.now(UTC)
    if "status" in payload:
        st = payload["status"]
        if st == LabCaseStatus.SENT and not case.sent_at:
            case.sent_at = now
        elif st == LabCaseStatus.RECEIVED:
            case.received_at = now
        elif st == LabCaseStatus.FITTED:
            case.fitted_at = now
    for k, v in payload.items():
        setattr(case, k, v)
    if restoration_id is not _UNSET or restoration_case_id is not _UNSET:
        await _link_restoration(
            db,
            clinic_id,
            case,
            restoration_id=None if restoration_id is _UNSET else restoration_id,
            restoration_case_id=None if restoration_case_id is _UNSET else restoration_case_id,
        )
    await db.flush()
    return case


_UNSET = object()


# ── Imaging ───────────────────────────────────────────
async def list_imaging(
    db: AsyncSession, clinic_id: str, *, patient_id: str | None = None
) -> list[ImagingStudy]:
    q = select(ImagingStudy).where(ImagingStudy.clinic_id == clinic_id)
    if patient_id:
        q = q.where(ImagingStudy.patient_id == patient_id)
    result = await db.execute(q.order_by(ImagingStudy.captured_at.desc()))
    return list(result.scalars().all())


async def get_imaging_study(db: AsyncSession, clinic_id: str, study_id: str) -> ImagingStudy:
    study = (
        await db.execute(
            select(ImagingStudy).where(
                ImagingStudy.id == study_id, ImagingStudy.clinic_id == clinic_id
            )
        )
    ).scalar_one_or_none()
    if not study:
        raise NotFoundError("Imaging study")
    return study


async def create_imaging_study(
    db: AsyncSession, clinic_id: str, actor_id: str, data: ImagingStudyCreate
) -> ImagingStudy:
    patient = (
        await db.execute(
            select(Patient).where(Patient.id == data.patient_id, Patient.clinic_id == clinic_id)
        )
    ).scalar_one_or_none()
    if not patient:
        raise NotFoundError("Patient not found")
    study = ImagingStudy(
        clinic_id=clinic_id,
        captured_by_id=actor_id,
        patient_id=data.patient_id,
        study_type=data.study_type,
        tooth=data.tooth,
        visit_id=data.visit_id,
        storage_key=data.storage_key or f"stub://imaging/{data.patient_id}/{data.study_type}",
        notes=data.notes,
        captured_at=data.captured_at or datetime.now(UTC),
    )
    db.add(study)
    await db.flush()
    return study


ALLOWED_IMAGING_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/dicom",
    "application/octet-stream",
}


async def upload_imaging_content(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    study_id: str,
    *,
    filename: str,
    content_type: str,
    data: bytes,
) -> ImagingStudy:
    from app.core.config import get_settings
    from app.storage import get_object_storage

    settings = get_settings()
    if len(data) > settings.imaging_max_upload_bytes:
        raise ValidationAppError(
            f"File exceeds max size ({settings.imaging_max_upload_bytes} bytes)"
        )
    ctype = (content_type or "application/octet-stream").split(";")[0].strip().lower()
    if ctype not in ALLOWED_IMAGING_TYPES and not ctype.startswith("image/"):
        raise ValidationAppError(f"Unsupported content type: {ctype}")

    study = await get_imaging_study(db, clinic_id, study_id)
    storage = get_object_storage()
    meta = storage.put(
        clinic_id=clinic_id,
        prefix=f"imaging/{study.patient_id}",
        data=data,
        content_type=ctype,
    )
    study.storage_key = meta["storage_key"]
    study.content_type = ctype
    study.byte_size = meta["byte_size"]
    study.checksum_sha256 = meta["checksum_sha256"]
    study.is_encrypted = True
    study.original_filename = filename[:255] if filename else None
    await db.flush()
    return study


async def read_imaging_content(
    db: AsyncSession, clinic_id: str, study_id: str
) -> tuple[ImagingStudy, bytes]:
    from app.storage import get_object_storage

    study = await get_imaging_study(db, clinic_id, study_id)
    if not study.storage_key or not str(study.storage_key).startswith("localenc://"):
        raise ValidationAppError("No encrypted content uploaded for this study")
    data = get_object_storage().get(study.storage_key)
    return study, data


# ── Pharmacy ──────────────────────────────────────────
async def list_drug_templates(db: AsyncSession, clinic_id: str) -> list[DrugTemplate]:
    result = await db.execute(
        select(DrugTemplate)
        .where(DrugTemplate.clinic_id == clinic_id, DrugTemplate.is_active.is_(True))
        .order_by(DrugTemplate.name)
    )
    return list(result.scalars().all())


async def create_drug_template(
    db: AsyncSession, clinic_id: str, data: DrugTemplateCreate
) -> DrugTemplate:
    tmpl = DrugTemplate(clinic_id=clinic_id, **data.model_dump())
    db.add(tmpl)
    await db.flush()
    return tmpl


async def list_prescriptions(
    db: AsyncSession, clinic_id: str, *, patient_id: str | None = None
) -> list[Prescription]:
    q = (
        select(Prescription)
        .where(Prescription.clinic_id == clinic_id)
        .options(selectinload(Prescription.items))
    )
    if patient_id:
        q = q.where(Prescription.patient_id == patient_id)
    result = await db.execute(q.order_by(Prescription.prescribed_at.desc()))
    return list(result.scalars().all())


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
    rx = Prescription(
        clinic_id=clinic_id,
        patient_id=data.patient_id,
        prescribed_by_id=actor_id,
        notes=data.notes,
        status=PrescriptionStatus.ACTIVE,
    )
    db.add(rx)
    await db.flush()
    for item in data.items:
        db.add(
            PrescriptionItem(
                prescription_id=rx.id,
                drug_name=item.drug_name,
                dose=item.dose,
                quantity=item.quantity,
                instructions=item.instructions,
            )
        )
    await db.flush()
    result = await db.execute(
        select(Prescription)
        .where(Prescription.id == rx.id)
        .options(selectinload(Prescription.items))
    )
    return result.scalar_one()


async def update_prescription_status(
    db: AsyncSession, clinic_id: str, rx_id: str, status: str
) -> Prescription:
    rx = (
        await db.execute(
            select(Prescription)
            .where(Prescription.id == rx_id, Prescription.clinic_id == clinic_id)
            .options(selectinload(Prescription.items))
        )
    ).scalar_one_or_none()
    if not rx:
        raise NotFoundError("Prescription not found")
    rx.status = status
    await db.flush()
    return rx


# ── Department home aggregates ────────────────────────
async def department_home(db: AsyncSession, clinic_id: str, role: str) -> dict:
    start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)

    today_appts = (
        await db.execute(
            select(func.count())
            .select_from(Appointment)
            .where(
                Appointment.clinic_id == clinic_id,
                Appointment.starts_at >= start,
                Appointment.starts_at < end,
            )
        )
    ).scalar_one()
    checked_in = (
        await db.execute(
            select(func.count())
            .select_from(Appointment)
            .where(
                Appointment.clinic_id == clinic_id,
                Appointment.starts_at >= start,
                Appointment.starts_at < end,
                Appointment.status == "checked_in",
            )
        )
    ).scalar_one()
    waitlist = (
        await db.execute(
            select(func.count())
            .select_from(Appointment)
            .where(
                Appointment.clinic_id == clinic_id,
                Appointment.waitlist.is_(True),
                Appointment.status.notin_(["cancelled", "no_show", "completed"]),
            )
        )
    ).scalar_one()
    open_lab = (
        await db.execute(
            select(func.count())
            .select_from(LabCase)
            .where(
                LabCase.clinic_id == clinic_id,
                LabCase.status.in_(
                    [LabCaseStatus.SENT, LabCaseStatus.IN_PROGRESS, LabCaseStatus.RECEIVED]
                ),
            )
        )
    ).scalar_one()
    overdue_lab = await count_overdue_lab_cases(db, clinic_id)
    low_stock = (
        await db.execute(
            select(func.count())
            .select_from(InventoryItem)
            .where(
                InventoryItem.clinic_id == clinic_id,
                InventoryItem.is_active.is_(True),
                InventoryItem.quantity <= InventoryItem.reorder_level,
            )
        )
    ).scalar_one()
    open_rx = (
        await db.execute(
            select(func.count())
            .select_from(Prescription)
            .where(
                Prescription.clinic_id == clinic_id,
                Prescription.status == PrescriptionStatus.ACTIVE,
            )
        )
    ).scalar_one()
    outstanding = (
        await db.execute(
            select(func.coalesce(func.sum(Invoice.total - Invoice.amount_paid), 0.0)).where(
                Invoice.clinic_id == clinic_id,
                Invoice.status.in_([InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID]),
            )
        )
    ).scalar_one()
    imaging_today = (
        await db.execute(
            select(func.count())
            .select_from(ImagingStudy)
            .where(
                ImagingStudy.clinic_id == clinic_id,
                ImagingStudy.captured_at >= start,
                ImagingStudy.captured_at < end,
            )
        )
    ).scalar_one()
    patients_total = (
        await db.execute(
            select(func.count()).select_from(Patient).where(Patient.clinic_id == clinic_id)
        )
    ).scalar_one()

    return {
        "role": role,
        "today_appointments": today_appts,
        "checked_in": checked_in,
        "waitlist": waitlist,
        "open_lab_cases": open_lab,
        "overdue_lab_cases": overdue_lab,
        "low_stock_items": low_stock,
        "open_prescriptions": open_rx,
        "outstanding_balance": float(outstanding or 0),
        "imaging_today": imaging_today,
        "patients_total": patients_total,
    }


async def list_today_appointments(db: AsyncSession, clinic_id: str) -> list[Appointment]:
    start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    result = await db.execute(
        select(Appointment)
        .where(
            Appointment.clinic_id == clinic_id,
            Appointment.starts_at >= start,
            Appointment.starts_at < end,
        )
        .order_by(Appointment.starts_at)
    )
    return list(result.scalars().all())
