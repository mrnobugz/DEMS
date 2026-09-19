"""Full clinic setup: roles, catalogs, fee schedules, templates, import."""

from __future__ import annotations

import csv
import io
import json
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.core.rbac import KNOWN_PERMISSIONS, PERMISSIONS, ROLE_LABELS, Role, assignable_roles
from app.models import (
    ApprovalChain,
    ConfigCatalogEntry,
    ConfigTemplate,
    DiscountRule,
    DrugTemplate,
    FeeSchedule,
    FeeScheduleItem,
    PaymentMethod,
    PaymentMethodConfig,
    RolePermission,
    TaxRate,
)
from app.services.config import _config_audit, deactivate

CATALOG_KINDS = (
    "diagnosis",
    "allergy",
    "medical_alert",
    "medication",
    "uom",
    "item_category",
    "surface",
)

DEFAULT_CATALOG: tuple[tuple[str, str, str, int], ...] = (
    ("diagnosis", "k02.1", "Dental caries of dentine", 10),
    ("diagnosis", "k04.0", "Pulpitis", 20),
    ("diagnosis", "k05.1", "Chronic gingivitis", 30),
    ("diagnosis", "k08.1", "Complete loss of teeth", 40),
    ("diagnosis", "z01.2", "Dental examination", 50),
    ("allergy", "latex", "Latex", 10),
    ("allergy", "penicillin", "Penicillin", 20),
    ("allergy", "nsaid", "NSAID", 30),
    ("allergy", "local_anaesthetic", "Local anaesthetic", 40),
    ("allergy", "iodine", "Iodine", 50),
    ("medical_alert", "anticoagulant", "Anticoagulant", 10),
    ("medical_alert", "pregnancy", "Pregnancy", 20),
    ("medical_alert", "diabetes", "Diabetes", 30),
    ("medical_alert", "hypertension", "Hypertension", 40),
    ("medical_alert", "endocarditis_prophylaxis", "IE prophylaxis", 50),
    ("medication", "amoxicillin", "Amoxicillin", 10),
    ("medication", "ibuprofen", "Ibuprofen", 20),
    ("medication", "paracetamol", "Paracetamol", 30),
    ("medication", "chlorhexidine", "Chlorhexidine", 40),
    ("uom", "ea", "Each", 10),
    ("uom", "box", "Box", 20),
    ("uom", "ml", "Millilitre", 30),
    ("uom", "g", "Gram", 40),
    ("uom", "cartridge", "Cartridge", 50),
    ("item_category", "consumables", "Consumables", 10),
    ("item_category", "instruments", "Instruments", 20),
    ("item_category", "materials", "Materials", 30),
    ("item_category", "medications", "Medications", 40),
    ("item_category", "implants", "Implants / ortho", 50),
    ("surface", "M", "Mesial", 10),
    ("surface", "O", "Occlusal", 20),
    ("surface", "D", "Distal", 30),
    ("surface", "B", "Buccal", 40),
    ("surface", "L", "Lingual / palatal", 50),
    ("surface", "F", "Facial", 60),
    ("surface", "I", "Incisal", 70),
    ("surface", "P", "Palatal", 80),
)

DEFAULT_TEMPLATES: tuple[tuple[str, str, str, str, str], ...] = (
    (
        "soap",
        "default",
        "SOAP default",
        "",
        "S: \nO: \nA: \nP: ",
    ),
    (
        "progress",
        "procedure",
        "Procedure progress",
        "",
        "Procedure: \nAnaesthesia: \nFindings: \nNext visit: ",
    ),
    (
        "consent",
        "treatment",
        "Treatment consent",
        "Consent for dental treatment",
        "I understand the proposed treatment, alternatives, and risks, and I consent to proceed.",
    ),
    (
        "rx",
        "antibiotic",
        "Antibiotic template",
        "",
        "Amoxicillin 500 mg — 1 capsule three times daily for 5 days after meals.",
    ),
    (
        "letter",
        "referral",
        "Referral letter",
        "Referral",
        "Dear colleague,\n\nRe: {{patient_name}} ({{patient_code}})\n\nI should be grateful for your opinion regarding:\n\nYours sincerely,\n{{provider_name}}",
    ),
    (
        "sms",
        "appointment_reminder",
        "Appointment reminder",
        "",
        "DEMSTA: reminder for {{patient_name}} on {{starts_at}}. Reply to confirm.",
    ),
    (
        "email",
        "appointment_reminder",
        "Appointment reminder email",
        "Your dental appointment",
        "Dear {{patient_name}},\n\nThis is a reminder of your appointment on {{starts_at}}.\n\nDEMSTA Dental Care",
    ),
    (
        "medical_history",
        "periodic_update",
        "Medical history update",
        "",
        "Please confirm allergies, medications, pregnancy status, and any hospital admissions since your last visit.",
    ),
)

DEFAULT_SCHEDULES: tuple[tuple[str, str, str, bool], ...] = (
    ("cash", "Cash", "cash", True),
    ("corporate", "Corporate", "corporate", False),
    ("insurance", "Insurance", "insurance", False),
)


async def ensure_full_setup(db: AsyncSession, clinic_id: str) -> None:
    await ensure_role_matrix(db, clinic_id)
    await ensure_catalog_defaults(db, clinic_id)
    await ensure_templates(db, clinic_id)
    await ensure_fee_schedules(db, clinic_id)
    await ensure_tax_discount_pay(db, clinic_id)
    await ensure_approval_chain(db, clinic_id)


async def ensure_role_matrix(db: AsyncSession, clinic_id: str) -> None:
    existing = (
        await db.execute(select(RolePermission).where(RolePermission.clinic_id == clinic_id))
    ).scalars().all()
    have = {(row.role, row.permission_id) for row in existing}
    added = False
    for role, perms in PERMISSIONS.items():
        if role in {Role.SUPER_ADMIN, Role.PATIENT}:
            continue
        for perm in sorted(perms):
            if (role.value, perm) in have:
                continue
            db.add(
                RolePermission(
                    clinic_id=clinic_id,
                    role=role.value,
                    permission_id=perm,
                    allowed=True,
                )
            )
            have.add((role.value, perm))
            added = True
    if added:
        await db.flush()


async def role_grants_for(db: AsyncSession, clinic_id: str | None, role: str) -> set[str] | None:
    parsed = Role(role) if role in Role._value2member_map_ else None
    if parsed == Role.SUPER_ADMIN:
        return {"*"}
    if not clinic_id or parsed is None:
        return None
    await ensure_role_matrix(db, clinic_id)
    rows = (
        await db.execute(
            select(RolePermission).where(
                RolePermission.clinic_id == clinic_id,
                RolePermission.role == role,
            )
        )
    ).scalars().all()
    if not rows:
        return None
    return {row.permission_id for row in rows if row.allowed}


async def matrix_payload(db: AsyncSession, clinic_id: str, actor_role: str) -> list[dict[str, object]]:
    await ensure_role_matrix(db, clinic_id)
    allowed = set(assignable_roles(actor_role))
    rows: list[dict[str, object]] = []
    for role in Role:
        if role in {Role.PATIENT}:
            continue
        grants = await role_grants_for(db, clinic_id, role.value)
        if grants is None:
            grants = set(PERMISSIONS.get(role, set()))
        rows.append(
            {
                "id": role.value,
                "label": ROLE_LABELS[role],
                "assignable": role in allowed,
                "permissions": sorted(grants),
            }
        )
    return rows


async def set_role_permission(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str | None,
    role: str,
    permission_id: str,
    allowed: bool,
) -> RolePermission:
    if role in {Role.SUPER_ADMIN.value, Role.PATIENT.value}:
        raise ValidationAppError("That role cannot be edited")
    if role not in Role._value2member_map_:
        raise ValidationAppError(f"Unknown role: {role}")
    if permission_id not in KNOWN_PERMISSIONS:
        raise ValidationAppError(f"Unknown permission: {permission_id}")
    protected = {
        ("clinic_admin", "staff:*"),
        ("clinic_admin", "config:*"),
        ("clinic_admin", "config:clinic"),
    }
    if (role, permission_id) in protected and not allowed:
        raise ValidationAppError("Cannot revoke core clinic admin access")
    await ensure_role_matrix(db, clinic_id)
    row = (
        await db.execute(
            select(RolePermission).where(
                RolePermission.clinic_id == clinic_id,
                RolePermission.role == role,
                RolePermission.permission_id == permission_id,
            )
        )
    ).scalar_one_or_none()
    before = {"allowed": row.allowed} if row else None
    if row is None:
        row = RolePermission(
            clinic_id=clinic_id,
            role=role,
            permission_id=permission_id,
            allowed=allowed,
        )
        db.add(row)
    else:
        row.allowed = allowed
    await db.flush()
    await _config_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="upsert",
        resource_type="role_permission",
        resource_id=row.id,
        before=before,
        after={"role": role, "permission_id": permission_id, "allowed": allowed},
    )
    return row


async def ensure_catalog_defaults(db: AsyncSession, clinic_id: str) -> None:
    existing = (
        await db.execute(
            select(ConfigCatalogEntry.id).where(ConfigCatalogEntry.clinic_id == clinic_id).limit(1)
        )
    ).scalar_one_or_none()
    if existing is None:
        for kind, code, label, sort in DEFAULT_CATALOG:
            db.add(
                ConfigCatalogEntry(
                    clinic_id=clinic_id,
                    kind=kind,
                    code=code,
                    label=label,
                    sort_order=sort,
                )
            )
        await db.flush()
    drugs = (
        await db.execute(select(DrugTemplate.id).where(DrugTemplate.clinic_id == clinic_id).limit(1))
    ).scalar_one_or_none()
    if drugs is None:
        for name, cat, dose in (
            ("Amoxicillin 500 mg", "antibiotic", "1 cap TDS x 5 days"),
            ("Ibuprofen 400 mg", "analgesic", "1 tab TDS after food"),
            ("Chlorhexidine 0.2%", "mouthwash", "10 ml BD 7 days"),
        ):
            db.add(
                DrugTemplate(
                    clinic_id=clinic_id,
                    name=name,
                    category=cat,
                    default_dose=dose,
                    default_quantity="1",
                    is_active=True,
                )
            )
        await db.flush()


async def list_catalog(
    db: AsyncSession, clinic_id: str, kind: str, *, include_inactive: bool = False
) -> list[ConfigCatalogEntry]:
    if kind not in CATALOG_KINDS:
        raise ValidationAppError(f"Unknown catalog kind: {kind}")
    await ensure_catalog_defaults(db, clinic_id)
    stmt = select(ConfigCatalogEntry).where(
        ConfigCatalogEntry.clinic_id == clinic_id,
        ConfigCatalogEntry.kind == kind,
    )
    if not include_inactive:
        stmt = stmt.where(ConfigCatalogEntry.is_active.is_(True))
    return list((await db.execute(stmt.order_by(ConfigCatalogEntry.sort_order, ConfigCatalogEntry.label))).scalars())


async def create_catalog_entry(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str | None,
    *,
    kind: str,
    code: str,
    label: str,
    sort_order: int = 0,
    extra_json: str | None = None,
) -> ConfigCatalogEntry:
    if kind not in CATALOG_KINDS:
        raise ValidationAppError(f"Unknown catalog kind: {kind}")
    code = code.strip().lower().replace(" ", "_")
    if not code or not label.strip():
        raise ValidationAppError("code and label are required")
    dup = (
        await db.execute(
            select(ConfigCatalogEntry).where(
                ConfigCatalogEntry.clinic_id == clinic_id,
                ConfigCatalogEntry.kind == kind,
                ConfigCatalogEntry.code == code,
            )
        )
    ).scalar_one_or_none()
    if dup:
        raise ConflictError("That code already exists")
    row = ConfigCatalogEntry(
        clinic_id=clinic_id,
        kind=kind,
        code=code,
        label=label.strip(),
        sort_order=sort_order,
        extra_json=extra_json,
    )
    db.add(row)
    await db.flush()
    await _config_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="create",
        resource_type="config_catalog",
        resource_id=row.id,
        after={"kind": kind, "code": code, "label": row.label},
    )
    return row


async def update_catalog_entry(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str | None,
    entry_id: str,
    data: dict[str, Any],
) -> ConfigCatalogEntry:
    row = (
        await db.execute(
            select(ConfigCatalogEntry).where(
                ConfigCatalogEntry.id == entry_id, ConfigCatalogEntry.clinic_id == clinic_id
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise NotFoundError("Catalog entry")
    if data.get("is_active") is False:
        await deactivate(db, row, clinic_id=clinic_id, actor_id=actor_id, resource_type="config_catalog")
        return row
    for key in ("label", "sort_order", "extra_json"):
        if key in data:
            setattr(row, key, data[key])
    if data.get("is_active") is True:
        row.is_active = True
        row.deactivated_at = None
    await db.flush()
    await _config_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="update",
        resource_type="config_catalog",
        resource_id=row.id,
        after={"label": row.label, "is_active": row.is_active},
    )
    return row


async def ensure_templates(db: AsyncSession, clinic_id: str) -> None:
    existing = (
        await db.execute(select(ConfigTemplate.id).where(ConfigTemplate.clinic_id == clinic_id).limit(1))
    ).scalar_one_or_none()
    if existing:
        return
    for kind, key, name, subject, body in DEFAULT_TEMPLATES:
        db.add(
            ConfigTemplate(
                clinic_id=clinic_id,
                kind=kind,
                key=key,
                name=name,
                subject=subject or None,
                body=body,
            )
        )
    await db.flush()


async def list_templates(
    db: AsyncSession, clinic_id: str, kind: str | None = None, *, include_inactive: bool = False
) -> list[ConfigTemplate]:
    await ensure_templates(db, clinic_id)
    stmt = select(ConfigTemplate).where(ConfigTemplate.clinic_id == clinic_id)
    if kind:
        stmt = stmt.where(ConfigTemplate.kind == kind)
    if not include_inactive:
        stmt = stmt.where(ConfigTemplate.is_active.is_(True))
    return list((await db.execute(stmt.order_by(ConfigTemplate.kind, ConfigTemplate.name))).scalars())


async def upsert_template(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str | None,
    *,
    template_id: str | None = None,
    kind: str,
    key: str,
    name: str,
    subject: str | None = None,
    body: str = "",
    is_active: bool | None = None,
) -> ConfigTemplate:
    row = None
    if template_id:
        row = (
            await db.execute(
                select(ConfigTemplate).where(
                    ConfigTemplate.id == template_id, ConfigTemplate.clinic_id == clinic_id
                )
            )
        ).scalar_one_or_none()
        if not row:
            raise NotFoundError("Template")
    if row is None:
        row = ConfigTemplate(
            clinic_id=clinic_id,
            kind=kind,
            key=key.strip().lower().replace(" ", "_"),
            name=name.strip(),
            subject=subject,
            body=body,
        )
        db.add(row)
        action = "create"
    else:
        row.kind = kind
        row.key = key.strip().lower().replace(" ", "_")
        row.name = name.strip()
        row.subject = subject
        row.body = body
        if is_active is False:
            await deactivate(db, row, clinic_id=clinic_id, actor_id=actor_id, resource_type="config_template")
            return row
        if is_active is True:
            row.is_active = True
            row.deactivated_at = None
        action = "update"
    await db.flush()
    await _config_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action=action,
        resource_type="config_template",
        resource_id=row.id,
        after={"kind": row.kind, "key": row.key, "name": row.name},
    )
    return row


async def ensure_fee_schedules(db: AsyncSession, clinic_id: str) -> FeeSchedule:
    rows = list(
        (
            await db.execute(select(FeeSchedule).where(FeeSchedule.clinic_id == clinic_id))
        ).scalars()
    )
    by_code = {r.code: r for r in rows}
    default: FeeSchedule | None = next((r for r in rows if r.is_default and r.is_active), None)
    if not by_code:
        from app.core.config import get_settings

        currency = get_settings().default_currency
        for code, name, kind, is_default in DEFAULT_SCHEDULES:
            sched = FeeSchedule(
                clinic_id=clinic_id,
                code=code,
                name=name,
                payer_kind=kind,
                currency=currency,
                is_default=is_default,
                effective_from=date.today(),
            )
            db.add(sched)
            by_code[code] = sched
        await db.flush()
        default = by_code["cash"]
    if default is None:
        default = by_code.get("cash") or rows[0]
        default.is_default = True
        await db.flush()
    orphans = (
        await db.execute(
            select(FeeScheduleItem).where(
                FeeScheduleItem.clinic_id == clinic_id,
                FeeScheduleItem.fee_schedule_id.is_(None),
            )
        )
    ).scalars().all()
    for item in orphans:
        item.fee_schedule_id = default.id
    if orphans:
        await db.flush()
    return default


async def list_fee_schedules(db: AsyncSession, clinic_id: str, *, include_inactive: bool = False) -> list[FeeSchedule]:
    await ensure_fee_schedules(db, clinic_id)
    stmt = select(FeeSchedule).where(FeeSchedule.clinic_id == clinic_id)
    if not include_inactive:
        stmt = stmt.where(FeeSchedule.is_active.is_(True))
    return list((await db.execute(stmt.order_by(FeeSchedule.payer_kind, FeeSchedule.name))).scalars())


async def create_fee_schedule(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str | None,
    *,
    code: str,
    name: str,
    payer_kind: str = "cash",
    currency: str = "TZS",
    effective_from: date | None = None,
    effective_to: date | None = None,
    is_default: bool = False,
) -> FeeSchedule:
    code = code.strip().lower().replace(" ", "_")
    if payer_kind not in {"cash", "corporate", "insurance"}:
        raise ValidationAppError("payer_kind must be cash, corporate, or insurance")
    dup = (
        await db.execute(
            select(FeeSchedule).where(FeeSchedule.clinic_id == clinic_id, FeeSchedule.code == code)
        )
    ).scalar_one_or_none()
    if dup:
        raise ConflictError("Fee schedule code already exists")
    if is_default:
        await _clear_default_schedule(db, clinic_id)
    row = FeeSchedule(
        clinic_id=clinic_id,
        code=code,
        name=name.strip(),
        payer_kind=payer_kind,
        currency=currency,
        effective_from=effective_from,
        effective_to=effective_to,
        is_default=is_default,
    )
    db.add(row)
    await db.flush()
    await _config_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="create",
        resource_type="fee_schedule",
        resource_id=row.id,
        after={"code": row.code, "name": row.name, "payer_kind": row.payer_kind},
    )
    return row


async def update_fee_schedule(
    db: AsyncSession, clinic_id: str, actor_id: str | None, sched_id: str, data: dict[str, Any]
) -> FeeSchedule:
    row = (
        await db.execute(
            select(FeeSchedule).where(FeeSchedule.id == sched_id, FeeSchedule.clinic_id == clinic_id)
        )
    ).scalar_one_or_none()
    if not row:
        raise NotFoundError("Fee schedule")
    if data.get("is_active") is False:
        if row.is_default:
            raise ValidationAppError("Set another default schedule before deactivating this one")
        await deactivate(db, row, clinic_id=clinic_id, actor_id=actor_id, resource_type="fee_schedule")
        return row
    if data.get("is_default"):
        await _clear_default_schedule(db, clinic_id)
        row.is_default = True
    for key in ("name", "payer_kind", "currency", "effective_from", "effective_to"):
        if key in data:
            setattr(row, key, data[key])
    if data.get("is_active") is True:
        row.is_active = True
        row.deactivated_at = None
    await db.flush()
    await _config_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="update",
        resource_type="fee_schedule",
        resource_id=row.id,
        after={"name": row.name, "is_default": row.is_default, "is_active": row.is_active},
    )
    return row


async def _clear_default_schedule(db: AsyncSession, clinic_id: str) -> None:
    rows = (
        await db.execute(
            select(FeeSchedule).where(FeeSchedule.clinic_id == clinic_id, FeeSchedule.is_default.is_(True))
        )
    ).scalars().all()
    for row in rows:
        row.is_default = False


async def ensure_tax_discount_pay(db: AsyncSession, clinic_id: str) -> None:
    tax = (
        await db.execute(select(TaxRate.id).where(TaxRate.clinic_id == clinic_id).limit(1))
    ).scalar_one_or_none()
    if tax is None:
        db.add(TaxRate(clinic_id=clinic_id, code="vat0", name="No VAT", rate_bps=0, is_default=True))
        db.add(TaxRate(clinic_id=clinic_id, code="vat18", name="VAT 18%", rate_bps=1800, is_default=False))
    disc = (
        await db.execute(select(DiscountRule.id).where(DiscountRule.clinic_id == clinic_id).limit(1))
    ).scalar_one_or_none()
    if disc is None:
        db.add(
            DiscountRule(
                clinic_id=clinic_id,
                code="staff",
                name="Staff discount",
                percent=10,
                requires_role="clinic_admin",
            )
        )
    pay = (
        await db.execute(
            select(PaymentMethodConfig.id).where(PaymentMethodConfig.clinic_id == clinic_id).limit(1)
        )
    ).scalar_one_or_none()
    if pay is None:
        labels = {
            PaymentMethod.CASH: "Cash",
            PaymentMethod.CARD: "Card",
            PaymentMethod.MOBILE_MONEY: "Mobile money",
            PaymentMethod.BANK_TRANSFER: "Bank transfer",
            PaymentMethod.INSURANCE: "Insurance",
            PaymentMethod.OTHER: "Other",
        }
        for i, method in enumerate(PaymentMethod):
            db.add(
                PaymentMethodConfig(
                    clinic_id=clinic_id,
                    code=method.value,
                    label=labels[method],
                    sort_order=i * 10,
                )
            )
    await db.flush()


async def list_tax_rates(db: AsyncSession, clinic_id: str, *, include_inactive: bool = False) -> list[TaxRate]:
    await ensure_tax_discount_pay(db, clinic_id)
    stmt = select(TaxRate).where(TaxRate.clinic_id == clinic_id)
    if not include_inactive:
        stmt = stmt.where(TaxRate.is_active.is_(True))
    return list((await db.execute(stmt.order_by(TaxRate.name))).scalars())


async def upsert_tax_rate(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str | None,
    *,
    rate_id: str | None = None,
    code: str,
    name: str,
    rate_bps: int,
    is_default: bool = False,
    is_active: bool | None = None,
) -> TaxRate:
    row = None
    if rate_id:
        row = (
            await db.execute(select(TaxRate).where(TaxRate.id == rate_id, TaxRate.clinic_id == clinic_id))
        ).scalar_one_or_none()
        if not row:
            raise NotFoundError("Tax rate")
    if is_default:
        for other in await list_tax_rates(db, clinic_id, include_inactive=True):
            other.is_default = False
    if row is None:
        row = TaxRate(
            clinic_id=clinic_id,
            code=code.strip().lower(),
            name=name.strip(),
            rate_bps=rate_bps,
            is_default=is_default,
        )
        db.add(row)
    else:
        row.code = code.strip().lower()
        row.name = name.strip()
        row.rate_bps = rate_bps
        row.is_default = is_default
        if is_active is False:
            await deactivate(db, row, clinic_id=clinic_id, actor_id=actor_id, resource_type="tax_rate")
            return row
        if is_active is True:
            row.is_active = True
            row.deactivated_at = None
    await db.flush()
    await _config_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="upsert",
        resource_type="tax_rate",
        resource_id=row.id,
        after={"code": row.code, "rate_bps": row.rate_bps},
    )
    return row


async def list_discount_rules(db: AsyncSession, clinic_id: str, *, include_inactive: bool = False) -> list[DiscountRule]:
    await ensure_tax_discount_pay(db, clinic_id)
    stmt = select(DiscountRule).where(DiscountRule.clinic_id == clinic_id)
    if not include_inactive:
        stmt = stmt.where(DiscountRule.is_active.is_(True))
    return list((await db.execute(stmt.order_by(DiscountRule.name))).scalars())


async def upsert_discount_rule(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str | None,
    *,
    rule_id: str | None = None,
    code: str,
    name: str,
    percent: float,
    max_amount: float | None = None,
    requires_role: str | None = None,
    is_active: bool | None = None,
) -> DiscountRule:
    if percent < 0 or percent > 100:
        raise ValidationAppError("percent must be 0–100")
    row = None
    if rule_id:
        row = (
            await db.execute(
                select(DiscountRule).where(DiscountRule.id == rule_id, DiscountRule.clinic_id == clinic_id)
            )
        ).scalar_one_or_none()
        if not row:
            raise NotFoundError("Discount rule")
    if row is None:
        row = DiscountRule(
            clinic_id=clinic_id,
            code=code.strip().lower(),
            name=name.strip(),
            percent=percent,
            max_amount=max_amount,
            requires_role=requires_role,
        )
        db.add(row)
    else:
        row.code = code.strip().lower()
        row.name = name.strip()
        row.percent = percent
        row.max_amount = max_amount
        row.requires_role = requires_role
        if is_active is False:
            await deactivate(db, row, clinic_id=clinic_id, actor_id=actor_id, resource_type="discount_rule")
            return row
        if is_active is True:
            row.is_active = True
            row.deactivated_at = None
    await db.flush()
    await _config_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="upsert",
        resource_type="discount_rule",
        resource_id=row.id,
        after={"code": row.code, "percent": row.percent},
    )
    return row


async def list_payment_methods(
    db: AsyncSession, clinic_id: str, *, include_inactive: bool = False
) -> list[PaymentMethodConfig]:
    await ensure_tax_discount_pay(db, clinic_id)
    stmt = select(PaymentMethodConfig).where(PaymentMethodConfig.clinic_id == clinic_id)
    if not include_inactive:
        stmt = stmt.where(PaymentMethodConfig.is_active.is_(True))
    return list((await db.execute(stmt.order_by(PaymentMethodConfig.sort_order))).scalars())


async def set_payment_method_active(
    db: AsyncSession, clinic_id: str, actor_id: str | None, method_id: str, is_active: bool
) -> PaymentMethodConfig:
    row = (
        await db.execute(
            select(PaymentMethodConfig).where(
                PaymentMethodConfig.id == method_id, PaymentMethodConfig.clinic_id == clinic_id
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise NotFoundError("Payment method")
    if not is_active:
        await deactivate(db, row, clinic_id=clinic_id, actor_id=actor_id, resource_type="payment_method")
    else:
        row.is_active = True
        row.deactivated_at = None
        await db.flush()
        await _config_audit(
            db,
            clinic_id=clinic_id,
            actor_id=actor_id,
            action="activate",
            resource_type="payment_method",
            resource_id=row.id,
            after={"code": row.code},
        )
    return row


async def ensure_approval_chain(db: AsyncSession, clinic_id: str) -> None:
    existing = (
        await db.execute(select(ApprovalChain.id).where(ApprovalChain.clinic_id == clinic_id).limit(1))
    ).scalar_one_or_none()
    if existing:
        return
    db.add(
        ApprovalChain(
            clinic_id=clinic_id,
            name="Store issue — single level",
            min_amount=0,
            steps_json=json.dumps([{"order": 1, "role": "clinic_admin", "label": "Clinic admin"}]),
        )
    )
    db.add(
        ApprovalChain(
            clinic_id=clinic_id,
            name="Purchase over 500,000",
            min_amount=500000,
            category="purchase",
            steps_json=json.dumps(
                [
                    {"order": 1, "role": "clinic_admin", "label": "Clinic admin"},
                    {"order": 2, "role": "accountant", "label": "Finance"},
                ]
            ),
        )
    )
    await db.flush()


async def list_approval_chains(db: AsyncSession, clinic_id: str, *, include_inactive: bool = False) -> list[ApprovalChain]:
    await ensure_approval_chain(db, clinic_id)
    stmt = select(ApprovalChain).where(ApprovalChain.clinic_id == clinic_id)
    if not include_inactive:
        stmt = stmt.where(ApprovalChain.is_active.is_(True))
    return list((await db.execute(stmt.order_by(ApprovalChain.min_amount, ApprovalChain.name))).scalars())


async def upsert_approval_chain(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str | None,
    *,
    chain_id: str | None = None,
    name: str,
    department_id: str | None = None,
    category: str | None = None,
    min_amount: float = 0,
    steps: list[dict[str, Any]] | None = None,
    is_active: bool | None = None,
) -> ApprovalChain:
    if not name.strip():
        raise ValidationAppError("name is required")
    row = None
    if chain_id:
        row = (
            await db.execute(
                select(ApprovalChain).where(ApprovalChain.id == chain_id, ApprovalChain.clinic_id == clinic_id)
            )
        ).scalar_one_or_none()
        if not row:
            raise NotFoundError("Approval chain")
    payload = json.dumps(steps or [{"order": 1, "role": "clinic_admin", "label": "Clinic admin"}])
    if row is None:
        row = ApprovalChain(
            clinic_id=clinic_id,
            name=name.strip(),
            department_id=department_id,
            category=category,
            min_amount=min_amount,
            steps_json=payload,
        )
        db.add(row)
    else:
        row.name = name.strip()
        row.department_id = department_id
        row.category = category
        row.min_amount = min_amount
        row.steps_json = payload
        if is_active is False:
            await deactivate(db, row, clinic_id=clinic_id, actor_id=actor_id, resource_type="approval_chain")
            return row
        if is_active is True:
            row.is_active = True
            row.deactivated_at = None
    await db.flush()
    await _config_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="upsert",
        resource_type="approval_chain",
        resource_id=row.id,
        after={"name": row.name, "min_amount": row.min_amount},
    )
    return row


async def import_csv(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str | None,
    *,
    kind: str,
    csv_text: str,
    dry_run: bool = False,
) -> dict[str, Any]:
    reader = csv.DictReader(io.StringIO(csv_text.strip()))
    if not reader.fieldnames:
        raise ValidationAppError("CSV has no header row")
    headers = {h.strip().lower() for h in reader.fieldnames if h}
    rows = [{(k or "").strip().lower(): (v or "").strip() for k, v in row.items()} for row in reader]
    created = 0
    updated = 0
    errors: list[str] = []

    async def commit_row() -> None:
        if not dry_run:
            await db.flush()

    if kind == "procedures":
        if not {"code", "label"} <= headers:
            raise ValidationAppError("procedures CSV needs code,label[,category,unit_price]")
        default = await ensure_fee_schedules(db, clinic_id)
        for i, row in enumerate(rows, start=2):
            code = row.get("code", "").lower()
            label = row.get("label", "")
            if not code or not label:
                errors.append(f"row {i}: code and label required")
                continue
            try:
                price = float(row.get("unit_price") or 0)
            except ValueError:
                errors.append(f"row {i}: unit_price must be a number")
                continue
            existing = (
                await db.execute(
                    select(FeeScheduleItem).where(
                        FeeScheduleItem.clinic_id == clinic_id,
                        FeeScheduleItem.fee_schedule_id == default.id,
                        FeeScheduleItem.code == code,
                    )
                )
            ).scalar_one_or_none()
            if dry_run:
                if existing:
                    updated += 1
                else:
                    created += 1
                continue
            if existing:
                existing.label = label
                existing.category = row.get("category") or existing.category
                existing.unit_price = price
                updated += 1
            else:
                db.add(
                    FeeScheduleItem(
                        clinic_id=clinic_id,
                        fee_schedule_id=default.id,
                        code=code,
                        label=label,
                        category=row.get("category") or "general",
                        unit_price=price,
                        billable=True,
                        is_active=True,
                    )
                )
                created += 1
        await commit_row()
    elif kind in CATALOG_KINDS:
        if not {"code", "label"} <= headers:
            raise ValidationAppError("catalog CSV needs code,label")
        for i, row in enumerate(rows, start=2):
            try:
                if dry_run:
                    if not row.get("code") or not row.get("label"):
                        raise ValidationAppError("code and label required")
                    created += 1
                    continue
                await create_catalog_entry(
                    db,
                    clinic_id,
                    actor_id,
                    kind=kind,
                    code=row["code"],
                    label=row["label"],
                )
                created += 1
            except (ConflictError, ValidationAppError) as exc:
                errors.append(f"row {i}: {exc.message}")
    else:
        raise ValidationAppError("kind must be procedures or a catalog list kind")

    if not dry_run:
        await _config_audit(
            db,
            clinic_id=clinic_id,
            actor_id=actor_id,
            action="import",
            resource_type="csv_import",
            resource_id=kind,
            after={"kind": kind, "created": created, "updated": updated, "errors": len(errors)},
        )
    return {
        "kind": kind,
        "dry_run": dry_run,
        "created": created,
        "updated": updated,
        "errors": errors,
        "row_count": len(rows),
    }
