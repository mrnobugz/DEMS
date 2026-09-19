"""Staff module catalog for the post-login dashboard.

Metadata lives in code (same pattern as PERMISSION_CATALOG). Access is decided
by the existing RBAC helpers — this does not invent a second permission model.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.core.rbac import user_has_any_permission


@dataclass(frozen=True)
class ModuleDef:
    key: str
    name: str
    description: str
    icon: str
    route_path: str
    sort_order: int
    any_permission: tuple[str, ...] = ()
    roles: tuple[str, ...] = ()


# Top-level workspaces only — registration wizard steps stay in Front desk.
MODULE_CATALOG: tuple[ModuleDef, ...] = (
    ModuleDef(
        "owner",
        "System owner",
        "Clinics, platform users, and deployment health for the whole network.",
        "building-2",
        "/owner",
        10,
        roles=("super_admin",),
    ),
    ModuleDef(
        "admin",
        "Configurations",
        "Organization, staff, roles, and the procedure catalog for this clinic.",
        "settings-2",
        "/admin",
        20,
        any_permission=("staff:*", "config:clinic", "config:*"),
        roles=("clinic_admin", "super_admin"),
    ),
    ModuleDef(
        "front_desk",
        "Front desk",
        "Today's queue, file opening, and walk-in registration.",
        "clipboard-plus",
        "/front-desk",
        30,
        any_permission=("patients:read", "appointments:read"),
        roles=("receptionist", "clinic_admin", "super_admin"),
    ),
    ModuleDef(
        "restorative",
        "Restorative",
        "Clerkship, odontogram, and restorative chair work.",
        "smile",
        "/clinical/restorative",
        40,
        any_permission=("clinical:read", "clinical:*"),
        roles=("dentist", "hygienist", "clinic_admin", "super_admin"),
    ),
    ModuleDef(
        "maxillofacial",
        "Maxillofacial",
        "Oral surgery clerkship, extractions, and maxillofacial notes.",
        "slice",
        "/clinical/maxillofacial",
        50,
        any_permission=("clinical:read", "clinical:*"),
        roles=("dentist", "hygienist", "clinic_admin", "super_admin"),
    ),
    ModuleDef(
        "orthodontic",
        "Orthodontic",
        "Orthodontic clerkship, alignment plans, and appliance notes.",
        "braces",
        "/clinical/orthodontic",
        60,
        any_permission=("clinical:read", "clinical:*"),
        roles=("dentist", "hygienist", "clinic_admin", "super_admin"),
    ),
    ModuleDef(
        "paediatric",
        "Paediatric",
        "Children's clerkship, behaviour notes, and paediatric treatments.",
        "baby",
        "/clinical/paediatric",
        70,
        any_permission=("clinical:read", "clinical:*"),
        roles=("dentist", "hygienist", "clinic_admin", "super_admin"),
    ),
    ModuleDef(
        "hygiene",
        "Hygiene",
        "Hygiene bay, perio charting, and recall work.",
        "user-round-cog",
        "/hygiene",
        80,
        any_permission=("clinical:read", "clinical:limited"),
        roles=("hygienist", "dentist", "clinic_admin", "super_admin"),
    ),
    ModuleDef(
        "vitals",
        "Vital signs",
        "Record BP, pulse, temperature, and related vitals for registered patients.",
        "activity",
        "/vitals",
        75,
        any_permission=("clinical:vitals", "clinical:*"),
        roles=("nurse", "dentist", "clinic_admin", "super_admin"),
    ),
    ModuleDef(
        "imaging",
        "Imaging",
        "Capture and review intraoral, OPG, and photo studies.",
        "scan",
        "/imaging",
        90,
        any_permission=("imaging:read", "imaging:*"),
        roles=("imaging_tech", "dentist", "clinic_admin", "super_admin"),
    ),
    ModuleDef(
        "lab",
        "Lab",
        "Track lab cases from send-out through fit.",
        "flask-conical",
        "/lab",
        100,
        any_permission=("lab:read", "lab:*"),
        roles=("lab_tech", "dentist", "clinic_admin", "super_admin"),
    ),
    ModuleDef(
        "pharmacy",
        "Pharmacy",
        "Prescriptions, templates, and dispense warnings.",
        "pill",
        "/pharmacy",
        110,
        any_permission=("pharmacy:read", "pharmacy:*"),
        roles=("pharmacy", "dentist", "clinic_admin", "super_admin"),
    ),
    ModuleDef(
        "inventory",
        "Warehouse",
        "Stock, registration fees, and warehouse adjustments.",
        "package",
        "/inventory",
        120,
        any_permission=("inventory:read", "inventory:issue", "inventory:*"),
        roles=("clinic_admin", "dentist", "super_admin", "pharmacy", "accountant"),
    ),
    ModuleDef(
        "patients",
        "Patients",
        "Search the roster and open a patient record.",
        "users",
        "/patients",
        130,
        any_permission=("patients:read", "patients:*"),
    ),
    ModuleDef(
        "schedule",
        "Schedule",
        "Book, reschedule, and manage the appointment book.",
        "calendar-days",
        "/schedule",
        140,
        any_permission=("appointments:read", "appointments:*"),
    ),
    ModuleDef(
        "billing",
        "Billing",
        "Charges, claims, statements, and the fee catalog.",
        "receipt",
        "/billing",
        150,
        any_permission=("billing:read", "billing:create", "billing:*"),
        roles=("accountant", "receptionist", "dentist", "clinic_admin", "super_admin"),
    ),
    ModuleDef(
        "ai",
        "AI Assist",
        "Advisory drafts for notes, risk, and scheduling — never auto-diagnosed.",
        "sparkles",
        "/ai",
        160,
        any_permission=("ai:suggest", "ai:*"),
    ),
    ModuleDef(
        "reports",
        "Reports",
        "Production, aging, and collections views from the ledger.",
        "bar-chart-3",
        "/reports",
        170,
        any_permission=("reports:own", "reports:financial", "reports:*"),
        roles=("accountant", "dentist", "clinic_admin", "super_admin"),
    ),
)


def user_can_access_module(user: object, module: ModuleDef) -> bool:
    """Match the frontend nav rule: permissions win when both are present."""
    if module.any_permission:
        return user_has_any_permission(user, *module.any_permission)
    if module.roles:
        return getattr(user, "role", None) in module.roles
    return True


def modules_for_user(user: object) -> list[dict[str, str]]:
    rows = [module for module in MODULE_CATALOG if user_can_access_module(user, module)]
    rows.sort(key=lambda item: item.sort_order)
    return [
        {
            "key": item.key,
            "name": item.name,
            "description": item.description,
            "icon": item.icon,
            "route_path": item.route_path,
            "sort_order": item.sort_order,
        }
        for item in rows
    ]
