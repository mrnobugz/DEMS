import json
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import ClinicId, DbSession, require_any_permission
from app.models import ApprovalChain, User
from app.schemas import (
    ApprovalChainOut,
    ApprovalChainUpsert,
    ConfigCatalogCreate,
    ConfigCatalogOut,
    ConfigCatalogUpdate,
    ConfigImportOut,
    ConfigImportRequest,
    ConfigTemplateOut,
    ConfigTemplateUpsert,
    DiscountRuleOut,
    DiscountRuleUpsert,
    DomainEventOut,
    FeeScheduleCreate,
    FeeScheduleOut,
    FeeScheduleUpdate,
    HolidayCreate,
    HolidayOut,
    NumberSequenceOut,
    NumberSequenceUpdate,
    OperatoryCreate,
    OperatoryOut,
    OperatoryUpdate,
    OrgDepartmentCreate,
    OrgDepartmentOut,
    OrgDepartmentUpdate,
    PaymentMethodConfigOut,
    PaymentMethodToggle,
    RoleCatalogOut,
    RolePermissionOut,
    RolePermissionSet,
    SystemSettingOut,
    SystemSettingUpsert,
    TaxRateOut,
    TaxRateUpsert,
    WorkingHoursOut,
    WorkingHoursReplace,
)
from app.services import config as cfg
from app.services import config_setup as setup
from app.services import events as bus

router = APIRouter(prefix="/config", tags=["config"])

ConfigWriter = Annotated[User, Depends(require_any_permission("config:*", "config:clinic", "staff:*"))]
ConfigReader = Annotated[
    User, Depends(require_any_permission("config:*", "config:clinic", "staff:*", "appointments:read"))
]


@router.get("/departments", response_model=list[OrgDepartmentOut])
async def list_departments(
    db: DbSession,
    clinic_id: ClinicId,
    user: ConfigReader,
    include_inactive: bool = Query(False),
):
    _ = user
    return await cfg.list_departments(db, clinic_id, include_inactive=include_inactive)


@router.post("/departments", response_model=OrgDepartmentOut, status_code=201)
async def create_department(
    body: OrgDepartmentCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: ConfigWriter,
):
    return await cfg.create_department(
        db,
        clinic_id,
        user.id,
        code=body.code,
        name=body.name,
        head_user_id=body.head_user_id,
        sort_order=body.sort_order,
        notes=body.notes,
    )


@router.patch("/departments/{dept_id}", response_model=OrgDepartmentOut)
async def patch_department(
    dept_id: str,
    body: OrgDepartmentUpdate,
    db: DbSession,
    clinic_id: ClinicId,
    user: ConfigWriter,
):
    return await cfg.update_department(
        db, clinic_id, user.id, dept_id, body.model_dump(exclude_unset=True)
    )


@router.get("/operatories", response_model=list[OperatoryOut])
async def list_operatories(
    db: DbSession,
    clinic_id: ClinicId,
    user: ConfigReader,
    include_inactive: bool = Query(False),
):
    _ = user
    return await cfg.list_operatories(db, clinic_id, include_inactive=include_inactive)


@router.post("/operatories", response_model=OperatoryOut, status_code=201)
async def create_operatory(
    body: OperatoryCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: ConfigWriter,
):
    return await cfg.create_operatory(
        db,
        clinic_id,
        user.id,
        code=body.code,
        name=body.name,
        department_id=body.department_id,
        chair_number=body.chair_number,
        sort_order=body.sort_order,
        notes=body.notes,
    )


@router.patch("/operatories/{operatory_id}", response_model=OperatoryOut)
async def patch_operatory(
    operatory_id: str,
    body: OperatoryUpdate,
    db: DbSession,
    clinic_id: ClinicId,
    user: ConfigWriter,
):
    return await cfg.update_operatory(
        db, clinic_id, user.id, operatory_id, body.model_dump(exclude_unset=True)
    )


@router.get("/hours", response_model=list[WorkingHoursOut])
async def list_hours(db: DbSession, clinic_id: ClinicId, user: ConfigReader):
    _ = user
    return await cfg.list_hours(db, clinic_id)


@router.put("/hours", response_model=list[WorkingHoursOut])
async def replace_hours(
    body: WorkingHoursReplace,
    db: DbSession,
    clinic_id: ClinicId,
    user: ConfigWriter,
):
    return await cfg.replace_clinic_hours(
        db, clinic_id, user.id, [d.model_dump() for d in body.days]
    )


@router.get("/holidays", response_model=list[HolidayOut])
async def list_holidays(
    db: DbSession,
    clinic_id: ClinicId,
    user: ConfigReader,
    include_inactive: bool = Query(False),
):
    _ = user
    return await cfg.list_holidays(db, clinic_id, include_inactive=include_inactive)


@router.post("/holidays", response_model=HolidayOut, status_code=201)
async def create_holiday(
    body: HolidayCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: ConfigWriter,
):
    return await cfg.create_holiday(
        db,
        clinic_id,
        user.id,
        holiday_date=body.holiday_date,
        name=body.name,
        notes=body.notes,
    )


@router.delete("/holidays/{holiday_id}", response_model=HolidayOut)
async def deactivate_holiday(
    holiday_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: ConfigWriter,
):
    return await cfg.deactivate_holiday(db, clinic_id, user.id, holiday_id)


@router.get("/settings", response_model=list[SystemSettingOut])
async def list_settings(db: DbSession, clinic_id: ClinicId, user: ConfigWriter):
    _ = user
    await cfg.ensure_clinic_config(db, clinic_id)
    return await cfg.list_settings(db, clinic_id)


@router.put("/settings", response_model=SystemSettingOut)
async def upsert_setting(
    body: SystemSettingUpsert,
    db: DbSession,
    clinic_id: ClinicId,
    user: ConfigWriter,
):
    return await cfg.upsert_setting(
        db,
        clinic_id=clinic_id,
        actor_id=user.id,
        key=body.key,
        value=body.value,
        scope=body.scope,
        user_id=body.user_id,
    )


@router.get("/sequences", response_model=list[NumberSequenceOut])
async def list_sequences(db: DbSession, clinic_id: ClinicId, user: ConfigWriter):
    _ = user
    return await cfg.list_sequences(db, clinic_id)


@router.patch("/sequences/{seq_id}", response_model=NumberSequenceOut)
async def patch_sequence(
    seq_id: str,
    body: NumberSequenceUpdate,
    db: DbSession,
    clinic_id: ClinicId,
    user: ConfigWriter,
):
    return await cfg.update_sequence(
        db, clinic_id, user.id, seq_id, **body.model_dump(exclude_unset=True)
    )


@router.get("/events", response_model=list[DomainEventOut])
async def list_events(
    db: DbSession,
    clinic_id: ClinicId,
    user: ConfigWriter,
    event_type: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    _ = user
    return await bus.list_events(db, clinic_id, event_type=event_type, limit=limit)


def _chain_out(row: ApprovalChain) -> ApprovalChainOut:
    out = ApprovalChainOut.model_validate(row)
    try:
        steps = json.loads(row.steps_json or "[]")
    except json.JSONDecodeError:
        steps = []
    if not isinstance(steps, list):
        steps = []
    return out.model_copy(update={"steps": steps})


@router.get("/roles", response_model=list[RoleCatalogOut])
async def list_role_matrix(db: DbSession, clinic_id: ClinicId, user: ConfigWriter):
    return await setup.matrix_payload(db, clinic_id, user.role)


@router.put("/roles/{role}/permissions", response_model=RolePermissionOut)
async def set_role_permission(
    role: str,
    body: RolePermissionSet,
    db: DbSession,
    clinic_id: ClinicId,
    user: ConfigWriter,
):
    return await setup.set_role_permission(
        db, clinic_id, user.id, role, body.permission_id, body.allowed
    )


@router.get("/catalogs/{kind}", response_model=list[ConfigCatalogOut])
async def list_catalog(
    kind: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: ConfigReader,
    include_inactive: bool = Query(False),
):
    _ = user
    return await setup.list_catalog(db, clinic_id, kind, include_inactive=include_inactive)


@router.post("/catalogs/{kind}", response_model=ConfigCatalogOut, status_code=201)
async def create_catalog_entry(
    kind: str,
    body: ConfigCatalogCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: ConfigWriter,
):
    return await setup.create_catalog_entry(
        db,
        clinic_id,
        user.id,
        kind=kind,
        code=body.code,
        label=body.label,
        sort_order=body.sort_order,
        extra_json=body.extra_json,
    )


@router.patch("/catalogs/{kind}/{entry_id}", response_model=ConfigCatalogOut)
async def patch_catalog_entry(
    kind: str,
    entry_id: str,
    body: ConfigCatalogUpdate,
    db: DbSession,
    clinic_id: ClinicId,
    user: ConfigWriter,
):
    _ = kind
    return await setup.update_catalog_entry(
        db, clinic_id, user.id, entry_id, body.model_dump(exclude_unset=True)
    )


@router.get("/fee-schedules", response_model=list[FeeScheduleOut])
async def list_fee_schedules(
    db: DbSession,
    clinic_id: ClinicId,
    user: ConfigReader,
    include_inactive: bool = Query(False),
):
    _ = user
    return await setup.list_fee_schedules(db, clinic_id, include_inactive=include_inactive)


@router.post("/fee-schedules", response_model=FeeScheduleOut, status_code=201)
async def create_fee_schedule(
    body: FeeScheduleCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: ConfigWriter,
):
    return await setup.create_fee_schedule(
        db, clinic_id, user.id, **body.model_dump()
    )


@router.patch("/fee-schedules/{sched_id}", response_model=FeeScheduleOut)
async def patch_fee_schedule(
    sched_id: str,
    body: FeeScheduleUpdate,
    db: DbSession,
    clinic_id: ClinicId,
    user: ConfigWriter,
):
    return await setup.update_fee_schedule(
        db, clinic_id, user.id, sched_id, body.model_dump(exclude_unset=True)
    )


@router.get("/tax-rates", response_model=list[TaxRateOut])
async def list_tax_rates(
    db: DbSession,
    clinic_id: ClinicId,
    user: ConfigReader,
    include_inactive: bool = Query(False),
):
    _ = user
    return await setup.list_tax_rates(db, clinic_id, include_inactive=include_inactive)


@router.put("/tax-rates", response_model=TaxRateOut)
async def upsert_tax_rate(
    body: TaxRateUpsert,
    db: DbSession,
    clinic_id: ClinicId,
    user: ConfigWriter,
    rate_id: str | None = Query(None),
):
    return await setup.upsert_tax_rate(
        db, clinic_id, user.id, rate_id=rate_id, **body.model_dump()
    )


@router.get("/discounts", response_model=list[DiscountRuleOut])
async def list_discounts(
    db: DbSession,
    clinic_id: ClinicId,
    user: ConfigReader,
    include_inactive: bool = Query(False),
):
    _ = user
    return await setup.list_discount_rules(db, clinic_id, include_inactive=include_inactive)


@router.put("/discounts", response_model=DiscountRuleOut)
async def upsert_discount(
    body: DiscountRuleUpsert,
    db: DbSession,
    clinic_id: ClinicId,
    user: ConfigWriter,
    rule_id: str | None = Query(None),
):
    return await setup.upsert_discount_rule(
        db, clinic_id, user.id, rule_id=rule_id, **body.model_dump()
    )


@router.get("/payment-methods", response_model=list[PaymentMethodConfigOut])
async def list_payment_methods(
    db: DbSession,
    clinic_id: ClinicId,
    user: ConfigReader,
    include_inactive: bool = Query(False),
):
    _ = user
    return await setup.list_payment_methods(db, clinic_id, include_inactive=include_inactive)


@router.patch("/payment-methods/{method_id}", response_model=PaymentMethodConfigOut)
async def patch_payment_method(
    method_id: str,
    body: PaymentMethodToggle,
    db: DbSession,
    clinic_id: ClinicId,
    user: ConfigWriter,
):
    return await setup.set_payment_method_active(
        db, clinic_id, user.id, method_id, body.is_active
    )


@router.get("/templates", response_model=list[ConfigTemplateOut])
async def list_templates(
    db: DbSession,
    clinic_id: ClinicId,
    user: ConfigReader,
    kind: str | None = Query(None),
    include_inactive: bool = Query(False),
):
    _ = user
    return await setup.list_templates(db, clinic_id, kind, include_inactive=include_inactive)


@router.put("/templates", response_model=ConfigTemplateOut)
async def upsert_template(
    body: ConfigTemplateUpsert,
    db: DbSession,
    clinic_id: ClinicId,
    user: ConfigWriter,
    template_id: str | None = Query(None),
):
    return await setup.upsert_template(
        db, clinic_id, user.id, template_id=template_id, **body.model_dump()
    )


@router.get("/approval-chains", response_model=list[ApprovalChainOut])
async def list_approval_chains(
    db: DbSession,
    clinic_id: ClinicId,
    user: ConfigReader,
    include_inactive: bool = Query(False),
):
    _ = user
    rows = await setup.list_approval_chains(db, clinic_id, include_inactive=include_inactive)
    return [_chain_out(row) for row in rows]


@router.put("/approval-chains", response_model=ApprovalChainOut)
async def upsert_approval_chain(
    body: ApprovalChainUpsert,
    db: DbSession,
    clinic_id: ClinicId,
    user: ConfigWriter,
    chain_id: str | None = Query(None),
):
    row = await setup.upsert_approval_chain(
        db,
        clinic_id,
        user.id,
        chain_id=chain_id,
        name=body.name,
        department_id=body.department_id,
        category=body.category,
        min_amount=body.min_amount,
        steps=body.steps,
        is_active=body.is_active,
    )
    return _chain_out(row)


@router.post("/import", response_model=ConfigImportOut)
async def import_config_csv(
    body: ConfigImportRequest,
    db: DbSession,
    clinic_id: ClinicId,
    user: ConfigWriter,
):
    return await setup.import_csv(
        db, clinic_id, user.id, kind=body.kind, csv_text=body.csv_text, dry_run=body.dry_run
    )
