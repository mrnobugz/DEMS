from __future__ import annotations

import json
from enum import StrEnum
from typing import Any


class Role(StrEnum):
    SUPER_ADMIN = "super_admin"
    CLINIC_ADMIN = "clinic_admin"
    DENTIST = "dentist"
    HYGIENIST = "hygienist"
    RECEPTIONIST = "receptionist"
    ACCOUNTANT = "accountant"
    LAB_TECH = "lab_tech"
    PHARMACY = "pharmacy"
    IMAGING_TECH = "imaging_tech"
    NURSE = "nurse"
    PATIENT = "patient"


ROLE_LABELS: dict[Role, str] = {
    Role.SUPER_ADMIN: "System owner",
    Role.CLINIC_ADMIN: "Clinic admin",
    Role.DENTIST: "Dentist",
    Role.HYGIENIST: "Hygienist",
    Role.RECEPTIONIST: "Receptionist",
    Role.ACCOUNTANT: "Accountant",
    Role.LAB_TECH: "Lab technician",
    Role.PHARMACY: "Pharmacy",
    Role.IMAGING_TECH: "Imaging technician",
    Role.NURSE: "Nurse",
    Role.PATIENT: "Patient portal",
}


class PermissionDef:
    __slots__ = ("id", "resource", "action", "label", "description")

    def __init__(self, id: str, label: str, description: str) -> None:
        resource, _, action = id.partition(":")
        self.id = id
        self.resource = resource
        self.action = action or "*"
        self.label = label
        self.description = description


PERMISSION_CATALOG: tuple[PermissionDef, ...] = (
    PermissionDef("patients:read", "Read patients", "View the patient list and records"),
    PermissionDef("patients:update", "Update patients", "Edit demographics and clerkship particulars"),
    PermissionDef("patients:*", "Full patients", "Create, update, and manage all patient records"),
    PermissionDef("patients:assign", "Assign clinician", "Set a patient's primary dentist"),
    PermissionDef("patients:own", "Own caseload", "See assigned patients plus the unassigned pool"),
    PermissionDef("appointments:read", "Read schedule", "View the appointment book"),
    PermissionDef("appointments:*", "Full schedule", "Book, move, and cancel any appointment"),
    PermissionDef("appointments:update_own", "Own appointments", "Update appointments assigned to you"),
    PermissionDef("appointments:own", "Own bookings", "See your own booked visits (portal)"),
    PermissionDef("clinical:read", "Read clinical", "View charts, notes, and specialty work"),
    PermissionDef("clinical:*", "Full clinical", "Chart, diagnose, and complete clinical work"),
    PermissionDef("clinical:limited", "Limited clinical", "Hygiene-scoped charting only"),
    PermissionDef("clinical:vitals", "Record vital signs", "Capture BP, pulse, temperature, and related vitals"),
    PermissionDef("clinical:own_read", "Own clinical read", "Portal view of own chart"),
    PermissionDef("billing:read", "Read billing", "View invoices, aging, and the fee catalog"),
    PermissionDef("billing:create", "Create invoices", "Generate invoices and record payments"),
    PermissionDef("billing:*", "Full billing", "Catalog, invoices, payments, and write-offs"),
    PermissionDef("billing:own_read", "Own bills", "Portal view of own invoices"),
    PermissionDef("inventory:read", "Read warehouse", "View stock, movements, and registration fees"),
    PermissionDef("inventory:issue", "Issue stock", "Receive, issue, and dispense warehouse stock"),
    PermissionDef("inventory:*", "Full warehouse", "Create items, purchase orders, write-offs, and stocktake"),
    PermissionDef("lab:read", "Read lab", "View lab cases"),
    PermissionDef("lab:*", "Full lab", "Create and progress lab cases"),
    PermissionDef("pharmacy:read", "Read pharmacy", "View prescriptions"),
    PermissionDef("pharmacy:*", "Full pharmacy", "Dispense and warn on prescriptions"),
    PermissionDef("imaging:read", "Read imaging", "View imaging studies"),
    PermissionDef("imaging:*", "Full imaging", "Capture and attach imaging"),
    PermissionDef("staff:*", "Manage staff", "Invite, edit, deactivate users and permissions"),
    PermissionDef("reports:own", "Own reports", "Clinical productivity for your own work"),
    PermissionDef("reports:financial", "Financial reports", "Aging, cash-up, and revenue"),
    PermissionDef("reports:*", "Full reports", "Clinic-wide operational and financial reports"),
    PermissionDef("config:clinic", "Clinic settings", "Clinic-level configuration"),
    PermissionDef("config:*", "Full configuration", "Organization, settings, sequences, and catalogs"),
    PermissionDef("patients:merge", "Merge patients", "Merge duplicate patient records"),
    PermissionDef("clinical:notes_read", "Read clinical notes", "View SOAP and progress notes"),
    PermissionDef("clinical:notes_write", "Write clinical notes", "Create and amend clinical notes"),
    PermissionDef("requisition:create", "Create requisitions", "Draft and submit store or purchase requisitions"),
    PermissionDef("requisition:approve", "Approve requisitions", "Approve or reject requisitions"),
    PermissionDef("requisition:fulfill", "Fulfill requisitions", "Issue stock against approved requisitions"),
    PermissionDef("requisition:*", "Full requisition", "Requisition, approval, and fulfillment"),
    PermissionDef("reports:patient_drilldown", "Patient-level reports", "Drill from aggregates to a named patient (audited)"),
    PermissionDef("ai:suggest", "AI suggestions", "Use assistive drafts and suggestions"),
    PermissionDef("ai:*", "Full AI", "Configure and use all AI assist features"),
    PermissionDef("departments:read", "Read departments", "See department queues and overviews"),
    PermissionDef("notifications:send", "Send notifications", "Queue patient or staff messages"),
    PermissionDef("notifications:read", "Read notifications", "View outbound notification history"),
    PermissionDef("inbox:read", "Staff inbox", "Receive and read in-app staff notifications"),
    PermissionDef("portal:read", "Patient portal", "Sign in to the patient portal"),
)

KNOWN_PERMISSIONS: frozenset[str] = frozenset(p.id for p in PERMISSION_CATALOG)

# Patient-portal grants stay on the patient role. Clinic admin covers every other clinic permission.
PORTAL_ONLY_PERMISSIONS: frozenset[str] = frozenset(
    {
        "portal:read",
        "appointments:own",
        "clinical:own_read",
        "billing:own_read",
    }
)


# Resource actions used by dependency checks
PERMISSIONS: dict[Role, set[str]] = {
    Role.SUPER_ADMIN: {"*"},
    Role.CLINIC_ADMIN: set(),
    Role.DENTIST: {
        "patients:read",
        "patients:update",
        "patients:own",
        "appointments:read",
        "appointments:update_own",
        "clinical:*",
        "billing:read",
        "billing:create",
        "inventory:read",
        "inventory:issue",
        "requisition:create",
        "clinical:notes_read",
        "clinical:notes_write",
        "lab:*",
        "pharmacy:*",
        "imaging:*",
        "reports:own",
        "ai:suggest",
        "departments:read",
        "inbox:read",
    },
    Role.HYGIENIST: {
        "patients:read",
        "patients:own",
        "appointments:read",
        "appointments:update_own",
        "clinical:read",
        "clinical:limited",
        "inventory:read",
        "inventory:issue",
        "requisition:create",
        "departments:read",
        "inbox:read",
    },
    Role.RECEPTIONIST: {
        "patients:*",
        "patients:assign",
        "appointments:*",
        "billing:create",
        "billing:read",
        "inventory:read",
        "ai:suggest",
        "requisition:create",
        "departments:read",
        "notifications:send",
        "notifications:read",
        "inbox:read",
    },
    Role.ACCOUNTANT: {
        "billing:*",
        "reports:financial",
        "reports:*",
        "patients:read",
        "departments:read",
        "inventory:read",
        "inbox:read",
    },
    Role.LAB_TECH: {
        "lab:*",
        "patients:read",
        "clinical:read",
        "departments:read",
        "requisition:create",
        "inbox:read",
    },
    Role.PHARMACY: {
        "pharmacy:*",
        "patients:read",
        "clinical:read",
        "departments:read",
        "inventory:read",
        "inventory:issue",
        "requisition:create",
        "requisition:approve",
        "requisition:fulfill",
        "inbox:read",
    },
    Role.IMAGING_TECH: {
        "imaging:*",
        "patients:read",
        "clinical:read",
        "departments:read",
        "inbox:read",
    },
    Role.NURSE: {
        "patients:read",
        "appointments:read",
        "clinical:vitals",
        "departments:read",
        "requisition:create",
        "inbox:read",
    },
    Role.PATIENT: {
        "patients:own",
        "appointments:own",
        "clinical:own_read",
        "billing:own_read",
        "portal:read",
    },
}

PERMISSIONS[Role.CLINIC_ADMIN] = {
    item.id for item in PERMISSION_CATALOG if item.id not in PORTAL_ONLY_PERMISSIONS
}


def parse_role(role: Role | str) -> Role | None:
    try:
        return Role(role) if isinstance(role, str) else role
    except ValueError:
        return None


def parse_perm_list(raw: Any) -> list[str]:
    if raw is None or raw == "":
        return []
    if isinstance(raw, (list, tuple, set)):
        return [str(item) for item in raw if item]
    if not isinstance(raw, str):
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return [part.strip() for part in raw.split(",") if part.strip()]
    if isinstance(data, list):
        return [str(item) for item in data if item]
    return []


def dump_perm_list(items: list[str] | None) -> str | None:
    cleaned = sorted({item for item in (items or []) if item})
    return json.dumps(cleaned) if cleaned else None


def grants_cover(granted: set[str] | list[str], permission: str) -> bool:
    bag = set(granted)
    if "*" in bag or permission in bag:
        return True
    resource = permission.split(":")[0]
    return f"{resource}:*" in bag


def has_permission(role: Role | str, permission: str) -> bool:
    role_enum = parse_role(role)
    if role_enum is None:
        return False
    return grants_cover(PERMISSIONS.get(role_enum, set()), permission)


def has_any_permission(role: Role | str, *permissions: str) -> bool:
    return any(has_permission(role, p) for p in permissions)


def permission_allowed(
    role: Role | str,
    extra: list[str] | None,
    denied: list[str] | None,
    permission: str,
    *,
    role_grants: set[str] | None = None,
) -> bool:
    role_enum = parse_role(role)
    if role_enum is None:
        return False
    if role_enum == Role.SUPER_ADMIN:
        return True
    if grants_cover(denied or [], permission):
        return False
    bag = role_grants if role_grants is not None else PERMISSIONS.get(role_enum, set())
    if grants_cover(bag, permission):
        return True
    return grants_cover(extra or [], permission)


def user_has_permission(user: Any, permission: str) -> bool:
    return permission_allowed(
        getattr(user, "role", ""),
        parse_perm_list(getattr(user, "extra_permissions", None)),
        parse_perm_list(getattr(user, "denied_permissions", None)),
        permission,
        role_grants=getattr(user, "_role_grants", None),
    )


def user_has_any_permission(user: Any, *permissions: str) -> bool:
    return any(user_has_permission(user, p) for p in permissions)


def effective_permissions(
    role: Role | str,
    extra: list[str] | None,
    denied: list[str] | None,
    *,
    role_grants: set[str] | None = None,
) -> list[str]:
    role_enum = parse_role(role)
    if role_enum == Role.SUPER_ADMIN:
        return ["*"]
    return [
        item.id
        for item in PERMISSION_CATALOG
        if permission_allowed(role_enum or "", extra, denied, item.id, role_grants=role_grants)
    ]


def user_access_payload(user: Any) -> dict[str, list[str]]:
    extras = parse_perm_list(getattr(user, "extra_permissions", None))
    denies = parse_perm_list(getattr(user, "denied_permissions", None))
    grants = getattr(user, "_role_grants", None)
    return {
        "extra_permissions": extras,
        "denied_permissions": denies,
        "effective_permissions": effective_permissions(
            getattr(user, "role", ""), extras, denies, role_grants=grants
        ),
    }


def assignable_roles(actor_role: Role | str) -> list[Role]:
    actor = parse_role(actor_role)
    roles = [role for role in Role if role not in {Role.PATIENT}]
    if actor != Role.SUPER_ADMIN:
        roles = [role for role in roles if role != Role.SUPER_ADMIN]
    return roles


def is_assignment_scoped_role(role: Role | str) -> bool:
    """Dentists/hygienists only see assigned patients (plus unassigned pool)."""
    role_enum = parse_role(role)
    return role_enum in {Role.DENTIST, Role.HYGIENIST}


def normalize_overrides(items: list[str] | None, field: str) -> list[str]:
    from app.core.exceptions import ValidationAppError

    if not items:
        return []
    cleaned: list[str] = []
    for item in items:
        if item == "*":
            raise ValidationAppError(f"{field} cannot include the platform-owner wildcard")
        if item not in KNOWN_PERMISSIONS:
            raise ValidationAppError(f"Unknown permission in {field}: {item}")
        cleaned.append(item)
    return sorted(set(cleaned))


def catalog_payload() -> list[dict[str, str]]:
    return [
        {
            "id": item.id,
            "resource": item.resource,
            "action": item.action,
            "label": item.label,
            "description": item.description,
        }
        for item in PERMISSION_CATALOG
    ]


def roles_payload(actor_role: Role | str) -> list[dict[str, object]]:
    allowed = set(assignable_roles(actor_role))
    rows = []
    for role in Role:
        if role == Role.PATIENT:
            continue
        rows.append(
            {
                "id": role.value,
                "label": ROLE_LABELS[role],
                "assignable": role in allowed,
                "permissions": sorted(PERMISSIONS.get(role, set())),
            }
        )
    return rows
