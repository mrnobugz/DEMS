"""Department shell domain: inventory, lab, imaging, pharmacy, staff, owner."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationAppError
from app.core.rbac import (
    Role,
    assignable_roles,
    dump_perm_list,
    normalize_overrides,
    parse_perm_list,
    parse_role,
    permission_allowed,
    user_access_payload,
)
from app.core.security import hash_password
from app.services.config_setup import role_grants_for
from app.models import (
    Appointment,
    AppointmentStatus,
    Clinic,
    DrugTemplate,
    ImagingStudy,
    InventoryItem,
    InventoryItemKind,
    Invoice,
    InvoiceStatus,
    LabCase,
    LabCaseStatus,
    Patient,
    Prescription,
    PrescriptionStatus,
    RefreshToken,
    StaffProfile,
    User,
)
from app.schemas import (
    ChairQueueItem,
    ClinicCreate,
    ClinicUpdate,
    DrugTemplateCreate,
    ImagingStudyCreate,
    InventoryAdjust,
    InventoryImportError,
    InventoryItemCreate,
    InventoryItemUpdate,
    LabCaseCreate,
    LabCaseUpdate,
    PrescriptionCreate,
    StaffCreate,
    StaffOut,
    StaffProfileOut,
    StaffUpdate,
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
        .where(User.clinic_id == clinic_id, User.role != Role.PATIENT)
        .options(selectinload(User.staff_profile))
        .order_by(User.full_name)
    )
    return list(result.scalars().all())


async def attach_role_grants(db: AsyncSession, clinic_id: str, users: list[User]) -> None:
    cache: dict[str, set[str] | None] = {}
    for user in users:
        role = user.role
        if role not in cache:
            cache[role] = await role_grants_for(db, clinic_id, role)
        object.__setattr__(user, "_role_grants", cache[role])


def to_staff_out(user: User) -> StaffOut:
    profile = None
    if user.staff_profile:
        profile = StaffProfileOut.model_validate(user.staff_profile)
    access = user_access_payload(user)
    return StaffOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        clinic_id=user.clinic_id,
        phone=user.phone,
        specialty=user.specialty,
        is_active=user.is_active,
        extra_permissions=access["extra_permissions"],
        denied_permissions=access["denied_permissions"],
        effective_permissions=access["effective_permissions"],
        profile=profile,
    )


def _assert_assignable_role(actor: User, role: str) -> Role:
    parsed = parse_role(role)
    if parsed is None or parsed == Role.PATIENT:
        raise ValidationAppError(f"Invalid role: {role}")
    if parsed not in assignable_roles(actor.role):
        raise ForbiddenError(f"Cannot assign role: {role}")
    return parsed


async def _active_admin_count(db: AsyncSession, clinic_id: str, exclude_id: str | None = None) -> int:
    stmt = select(func.count()).select_from(User).where(
        User.clinic_id == clinic_id,
        User.role == Role.CLINIC_ADMIN,
        User.is_active.is_(True),
    )
    if exclude_id:
        stmt = stmt.where(User.id != exclude_id)
    return int((await db.execute(stmt)).scalar_one())


async def get_clinic_staff(db: AsyncSession, clinic_id: str, staff_id: str) -> User:
    user = (
        await db.execute(
            select(User)
            .where(User.id == staff_id, User.clinic_id == clinic_id, User.role != Role.PATIENT)
            .options(selectinload(User.staff_profile))
        )
    ).scalar_one_or_none()
    if not user:
        raise NotFoundError("Staff")
    return user


async def create_staff(db: AsyncSession, clinic_id: str, actor: User, data: StaffCreate) -> User:
    role = _assert_assignable_role(actor, data.role)
    extras = normalize_overrides(data.extra_permissions, "extra_permissions")
    denies = normalize_overrides(data.denied_permissions, "denied_permissions")

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
        role=role.value,
        phone=data.phone,
        specialty=data.specialty,
    )
    user.extra_permissions = dump_perm_list(extras)
    user.denied_permissions = dump_perm_list(denies)
    db.add(user)
    await db.flush()
    profile = StaffProfile(
        clinic_id=clinic_id,
        user_id=user.id,
        title=data.title,
        specialty=data.specialty,
        department=data.department,
        license_no=data.license_no,
        default_operatory_id=data.default_operatory_id,
        production_goal=data.production_goal,
        commission_rate_bps=data.commission_rate_bps or 0,
        is_scheduling_provider=True if data.is_scheduling_provider is None else data.is_scheduling_provider,
        cert_expires_at=data.cert_expires_at,
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


async def update_staff(
    db: AsyncSession,
    clinic_id: str,
    actor: User,
    staff_id: str,
    data: StaffUpdate,
) -> User:
    user = await get_clinic_staff(db, clinic_id, staff_id)
    if user.role == Role.SUPER_ADMIN and actor.role != Role.SUPER_ADMIN:
        raise ForbiddenError("Cannot edit a platform owner")

    payload = data.model_dump(exclude_unset=True)
    next_role = user.role
    next_active = user.is_active
    next_extras = parse_perm_list(user.extra_permissions)
    next_denies = parse_perm_list(user.denied_permissions)

    if "role" in payload and payload["role"] is not None:
        next_role = _assert_assignable_role(actor, payload["role"]).value
    if "is_active" in payload and payload["is_active"] is not None:
        next_active = bool(payload["is_active"])
    if "extra_permissions" in payload:
        next_extras = normalize_overrides(payload["extra_permissions"], "extra_permissions")
    if "denied_permissions" in payload:
        next_denies = normalize_overrides(payload["denied_permissions"], "denied_permissions")

    if staff_id == actor.id:
        if next_role != actor.role:
            raise ForbiddenError("You cannot change your own role")
        if not next_active:
            raise ForbiddenError("You cannot deactivate your own account")
        if not permission_allowed(next_role, next_extras, next_denies, "staff:*"):
            raise ForbiddenError("You cannot remove your own staff management access")

    was_admin = user.role == Role.CLINIC_ADMIN and user.is_active
    still_admin = next_role == Role.CLINIC_ADMIN and next_active
    if was_admin and not still_admin:
        remaining = await _active_admin_count(db, clinic_id, exclude_id=user.id)
        if remaining < 1:
            raise ValidationAppError("The clinic must keep at least one active clinic admin")

    if "email" in payload and payload["email"]:
        email = str(payload["email"]).lower()
        clash = (
            await db.execute(
                select(User).where(
                    User.clinic_id == clinic_id,
                    User.email == email,
                    User.id != user.id,
                )
            )
        ).scalar_one_or_none()
        if clash:
            raise ConflictError("Staff email already exists in this clinic")
        user.email = email
    if "full_name" in payload and payload["full_name"]:
        user.full_name = payload["full_name"]
    if "phone" in payload:
        user.phone = payload["phone"]
    if "specialty" in payload:
        user.specialty = payload["specialty"]
    user.role = next_role
    user.is_active = next_active
    if "extra_permissions" in payload:
        user.extra_permissions = dump_perm_list(next_extras)
    if "denied_permissions" in payload:
        user.denied_permissions = dump_perm_list(next_denies)

    profile = user.staff_profile
    if profile is None:
        profile = StaffProfile(clinic_id=clinic_id, user_id=user.id)
        db.add(profile)
        user.staff_profile = profile
    if "title" in payload:
        profile.title = payload["title"]
    if "specialty" in payload:
        profile.specialty = payload["specialty"]
    if "department" in payload:
        profile.department = payload["department"]
    if "notes" in payload:
        profile.notes = payload["notes"]
    for key in (
        "license_no",
        "default_operatory_id",
        "production_goal",
        "is_scheduling_provider",
        "cert_expires_at",
    ):
        if key in payload:
            setattr(profile, key, payload[key])
    if "commission_rate_bps" in payload and payload["commission_rate_bps"] is not None:
        profile.commission_rate_bps = payload["commission_rate_bps"]

    await db.flush()
    await db.refresh(user, attribute_names=["staff_profile"])
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor.id,
        action="update",
        resource_type="staff",
        resource_id=user.id,
        after={"email": user.email, "role": user.role, "is_active": user.is_active},
    )
    return user


async def reset_staff_password(
    db: AsyncSession,
    clinic_id: str,
    actor: User,
    staff_id: str,
    password: str,
) -> User:
    user = await get_clinic_staff(db, clinic_id, staff_id)
    if user.role == Role.SUPER_ADMIN and actor.role != Role.SUPER_ADMIN:
        raise ForbiddenError("Cannot reset a platform owner's password")
    user.hashed_password = hash_password(password)
    user.failed_login_attempts = 0
    user.locked_until = None
    await db.execute(update(RefreshToken).where(RefreshToken.user_id == user.id).values(revoked=True))
    await db.flush()
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor.id,
        action="password_reset",
        resource_type="staff",
        resource_id=user.id,
        after={"reset": True},
    )
    return user


DEFAULT_REGISTRATION_CATALOG = (
    {
        "sku": "FEE-CONSULT",
        "name": "Consultation fee",
        "category": "registration",
        "sale_price": 30000,
        "target_department": "general",
    },
    {
        "sku": "FEE-REG",
        "name": "Registration / file opening",
        "category": "registration",
        "sale_price": 15000,
        "target_department": "general",
    },
    {
        "sku": "FEE-RESTOR",
        "name": "Restorative consultation",
        "category": "registration",
        "sale_price": 30000,
        "target_department": "restorative",
    },
    {
        "sku": "FEE-SURG",
        "name": "Maxillofacial consultation",
        "category": "registration",
        "sale_price": 40000,
        "target_department": "maxillofacial",
    },
    {
        "sku": "FEE-ORTHO",
        "name": "Orthodontic assessment",
        "category": "registration",
        "sale_price": 40000,
        "target_department": "orthodontic",
    },
    {
        "sku": "FEE-PAED",
        "name": "Paediatric consultation",
        "category": "registration",
        "sale_price": 25000,
        "target_department": "paediatric",
    },
    {
        "sku": "FEE-EMERG",
        "name": "Emergency consultation",
        "category": "registration",
        "sale_price": 45000,
        "target_department": "general",
    },
)


async def ensure_registration_catalog(db: AsyncSession, clinic_id: str) -> list[InventoryItem]:
    """Seed admin-managed registration fees when a clinic has none yet."""
    existing = (
        await db.execute(
            select(InventoryItem).where(
                InventoryItem.clinic_id == clinic_id,
                InventoryItem.billable_at_registration.is_(True),
            )
        )
    ).scalars().all()
    if existing:
        return list(existing)
    created: list[InventoryItem] = []
    for row in DEFAULT_REGISTRATION_CATALOG:
        clash = (
            await db.execute(
                select(InventoryItem).where(
                    InventoryItem.clinic_id == clinic_id, InventoryItem.sku == row["sku"]
                )
            )
        ).scalar_one_or_none()
        if clash:
            clash.billable_at_registration = True
            clash.item_kind = InventoryItemKind.SERVICE
            if not clash.sale_price:
                clash.sale_price = float(row["sale_price"])
            if not clash.target_department:
                clash.target_department = row["target_department"]
            created.append(clash)
            continue
        item = InventoryItem(
            clinic_id=clinic_id,
            sku=row["sku"],
            name=row["name"],
            category=row["category"],
            quantity=0,
            reorder_level=0,
            unit="visit",
            unit_cost=0,
            sale_price=float(row["sale_price"]),
            item_kind=InventoryItemKind.SERVICE,
            billable_at_registration=True,
            target_department=row["target_department"],
            notes="Billable at patient registration — managed in Warehouse",
        )
        db.add(item)
        created.append(item)
    await db.flush()
    return created


# ── Inventory ─────────────────────────────────────────
async def list_inventory(
    db: AsyncSession,
    clinic_id: str,
    *,
    low_only: bool = False,
    include_inactive: bool = False,
    billable_at_registration: bool | None = None,
    item_kind: str | None = None,
    seed_registration: bool = False,
) -> list[InventoryItem]:
    if seed_registration or billable_at_registration:
        await ensure_registration_catalog(db, clinic_id)
    q = select(InventoryItem).where(InventoryItem.clinic_id == clinic_id)
    if not include_inactive:
        q = q.where(InventoryItem.is_active.is_(True))
    if low_only:
        q = q.where(
            InventoryItem.item_kind == InventoryItemKind.STOCK,
            InventoryItem.quantity <= InventoryItem.reorder_level,
        )
    if billable_at_registration is not None:
        q = q.where(InventoryItem.billable_at_registration.is_(billable_at_registration))
    if item_kind:
        q = q.where(InventoryItem.item_kind == item_kind)
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
    if item.item_kind == InventoryItemKind.SERVICE:
        item.quantity = 0
        item.requires_expiry = False
    opening = float(item.quantity or 0)
    if item.item_kind == InventoryItemKind.STOCK:
        item.quantity = 0
    db.add(item)
    await db.flush()
    if item.item_kind == InventoryItemKind.STOCK and opening > 0:
        from app.services import warehouse as stock

        await stock.receive(
            db,
            clinic_id,
            actor_id,
            inventory_item_id=item.id,
            quantity=opening,
            unit_cost=float(item.unit_cost or 0),
            expiry_date=item.expiry_date,
            reason="opening-balance",
        )
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="create",
        resource_type="inventory_item",
        resource_id=item.id,
    )
    return item


async def import_inventory_items(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    items: list[InventoryItemCreate],
) -> dict:
    """Create many SKUs. A bad row is reported and does not undo the others."""
    created = 0
    errors: list[InventoryImportError] = []
    seen: set[str] = set()
    for index, raw in enumerate(items, start=1):
        data = raw.model_copy(update={"sku": raw.sku.strip(), "name": raw.name.strip()})
        key = data.sku.casefold()
        if not data.sku or not data.name:
            errors.append(InventoryImportError(row=index, sku=data.sku, message="SKU and name are required"))
            continue
        if key in seen:
            errors.append(InventoryImportError(row=index, sku=data.sku, message="Repeated in this import"))
            continue
        if (
            data.item_kind == "stock"
            and float(data.quantity or 0) > 0
            and data.requires_expiry
            and data.expiry_date is None
        ):
            errors.append(
                InventoryImportError(
                    row=index,
                    sku=data.sku,
                    message="Opening quantity needs an expiry date",
                )
            )
            continue
        seen.add(key)
        try:
            async with db.begin_nested():
                await create_inventory_item(db, clinic_id, actor_id, data)
            created += 1
        except (ConflictError, ValidationAppError) as exc:
            errors.append(InventoryImportError(row=index, sku=data.sku, message=exc.message))
    return {"created": created, "errors": [err.model_dump() for err in errors]}


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
    payload = data.model_dump(exclude_unset=True)
    payload.pop("quantity", None)
    for k, v in payload.items():
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
    from app.services import warehouse as stock

    return await stock.adjust(
        db,
        clinic_id,
        actor_id,
        inventory_item_id=item.id,
        delta=float(data.delta),
        reason=data.reason,
        location_id=getattr(data, "location_id", None),
    )


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
    q = (
        select(LabCase)
        .where(LabCase.clinic_id == clinic_id)
        .options(selectinload(LabCase.patient), selectinload(LabCase.dentist))
    )
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
    case.patient = patient
    if actor.role == Role.DENTIST:
        case.dentist = actor
    await _sync_lab_charge(db, clinic_id, actor.id, case)
    return case


async def _sync_lab_charge(db: AsyncSession, clinic_id: str, actor_id: str | None, case: LabCase) -> None:
    """One lab case posts one lab line. Later cost edits update that unpaid invoice."""
    if not actor_id or case.status == LabCaseStatus.CANCELLED:
        return
    amount = float(case.lab_cost or 0)
    if amount <= 0:
        return
    from app.services.billing_ledger import ensure_posted_charge

    label = f"Lab {case.case_type}"
    if case.lab_name:
        label = f"{label} · {case.lab_name}"
    await ensure_posted_charge(
        db,
        clinic_id,
        actor_id,
        patient_id=case.patient_id,
        idempotency_key=f"lab-case:{case.id}",
        description=label,
        amount=amount,
        line_kind="lab",
        notes=f"Lab case {case.case_type}",
        tooth_number=case.tooth,
    )


async def update_lab_case(
    db: AsyncSession,
    clinic_id: str,
    case_id: str,
    data: LabCaseUpdate,
    *,
    actor_id: str | None = None,
) -> LabCase:
    case = (
        await db.execute(
            select(LabCase)
            .where(LabCase.id == case_id, LabCase.clinic_id == clinic_id)
            .options(selectinload(LabCase.patient), selectinload(LabCase.dentist))
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
            was_received = case.received_at is not None
            case.received_at = now
            if not was_received:
                from app.services.staff_inbox import notify_lab_case_received

                p_name = f"{case.patient.first_name} {case.patient.last_name}".strip() if case.patient else "Patient"
                await notify_lab_case_received(
                    db,
                    clinic_id=clinic_id,
                    actor_id=actor_id,
                    case_id=case.id,
                    patient_id=case.patient_id,
                    patient_name=p_name,
                    case_type=case.case_type,
                    tooth=case.tooth,
                    lab_name=case.lab_name,
                    dentist_id=case.dentist_id,
                )
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
    await _sync_lab_charge(db, clinic_id, actor_id or case.dentist_id, case)
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


# ── Pharmacy (delegates to the dispensary service) ────
async def list_drug_templates(db: AsyncSession, clinic_id: str) -> list[DrugTemplate]:
    from app.services.pharmacy import list_drug_templates as impl

    return await impl(db, clinic_id)


async def create_drug_template(
    db: AsyncSession, clinic_id: str, data: DrugTemplateCreate
) -> DrugTemplate:
    from app.services.pharmacy import create_drug_template as impl

    return await impl(db, clinic_id, data)


async def list_prescriptions(
    db: AsyncSession, clinic_id: str, *, patient_id: str | None = None
) -> list[Prescription]:
    from app.services.pharmacy import list_prescriptions as impl

    return await impl(db, clinic_id, patient_id=patient_id)


async def create_prescription(
    db: AsyncSession, clinic_id: str, actor_id: str, data: PrescriptionCreate
) -> Prescription:
    from app.services.pharmacy import create_prescription as impl

    return await impl(db, clinic_id, actor_id, data)


async def update_prescription_status(
    db: AsyncSession, clinic_id: str, actor_id: str, rx_id: str, status: str, bill: bool = False
) -> Prescription:
    from app.services.pharmacy import update_prescription_status as impl

    return await impl(db, clinic_id, actor_id, rx_id, status, bill=bill)


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
                InventoryItem.item_kind == InventoryItemKind.STOCK,
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
                Prescription.status.in_(
                    [PrescriptionStatus.DRAFT, PrescriptionStatus.ACTIVE, PrescriptionStatus.PARTIAL]
                ),
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


async def list_today_appointments(
    db: AsyncSession,
    clinic_id: str,
    *,
    department: str | None = None,
    dentist_id: str | None = None,
) -> list[ChairQueueItem]:
    from app.services.domain import clinic_local_day_bounds

    start, end, _tz = await clinic_local_day_bounds(db, clinic_id)
    stmt = (
        select(Appointment)
        .options(selectinload(Appointment.patient), selectinload(Appointment.dentist))
        .where(
            Appointment.clinic_id == clinic_id,
            Appointment.starts_at >= start,
            Appointment.starts_at < end,
            Appointment.status != AppointmentStatus.CANCELLED,
        )
    )
    if department:
        stmt = stmt.outerjoin(Patient, Patient.id == Appointment.patient_id).where(
            or_(
                Appointment.department == department,
                and_(
                    Appointment.department.is_(None),
                    Patient.destination_department == department,
                ),
            )
        )
    if dentist_id:
        stmt = stmt.where(Appointment.dentist_id == dentist_id)
    stmt = stmt.order_by(func.coalesce(Appointment.queue_number, 9999), Appointment.starts_at)
    rows = (await db.execute(stmt)).scalars().unique().all()
    items: list[ChairQueueItem] = []
    for row in rows:
        person = row.patient
        staff = row.dentist
        items.append(
            ChairQueueItem(
                id=row.id,
                patient_id=row.patient_id,
                patient_code=person.patient_code if person else None,
                patient_name=(
                    f"{person.first_name} {person.last_name}".strip() if person else None
                ),
                dentist_id=row.dentist_id,
                dentist_name=staff.full_name if staff else None,
                queue_number=row.queue_number,
                service_name=row.service_name,
                department=row.department,
                status=row.status,
                starts_at=row.starts_at,
                is_appointment=bool(getattr(row, "is_appointment", True)),
                reason=row.reason,
                chair_number=row.chair_number,
            )
        )
    return items
