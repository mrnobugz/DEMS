from enum import StrEnum


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
    PATIENT = "patient"


# Resource actions used by dependency checks
PERMISSIONS: dict[Role, set[str]] = {
    Role.SUPER_ADMIN: {"*"},
    Role.CLINIC_ADMIN: {
        "patients:*",
        "patients:assign",
        "appointments:*",
        "clinical:read",
        "billing:*",
        "inventory:*",
        "lab:read",
        "pharmacy:read",
        "imaging:read",
        "staff:*",
        "reports:*",
        "config:clinic",
        "ai:*",
        "departments:read",
        "notifications:send",
        "notifications:read",
    },
    Role.DENTIST: {
        "patients:read",
        "patients:update",
        "patients:own",  # scoped to assigned (+ unassigned pool)
        "appointments:read",
        "appointments:update_own",
        "clinical:*",
        "billing:read",
        "inventory:read",
        "lab:*",
        "pharmacy:*",
        "imaging:*",
        "reports:own",
        "ai:suggest",
        "departments:read",
    },
    Role.HYGIENIST: {
        "patients:read",
        "patients:own",
        "appointments:read",
        "appointments:update_own",
        "clinical:read",
        "clinical:limited",
        "inventory:read",
        "departments:read",
    },
    Role.RECEPTIONIST: {
        "patients:*",
        "patients:assign",
        "appointments:*",
        "billing:create",
        "billing:read",
        "inventory:read",
        "ai:suggest",
        "departments:read",
        "notifications:send",
        "notifications:read",
    },
    Role.ACCOUNTANT: {
        "billing:*",
        "reports:financial",
        "reports:*",
        "patients:read",
        "departments:read",
    },
    Role.LAB_TECH: {
        "lab:*",
        "patients:read",
        "clinical:read",
        "departments:read",
    },
    Role.PHARMACY: {
        "pharmacy:*",
        "patients:read",
        "clinical:read",
        "departments:read",
    },
    Role.IMAGING_TECH: {
        "imaging:*",
        "patients:read",
        "clinical:read",
        "departments:read",
    },
    Role.PATIENT: {
        "patients:own",
        "appointments:own",
        "clinical:own_read",
        "billing:own_read",
        "portal:read",
    },
}


def has_permission(role: Role | str, permission: str) -> bool:
    try:
        role_enum = Role(role) if isinstance(role, str) else role
    except ValueError:
        return False
    granted = PERMISSIONS.get(role_enum, set())
    if "*" in granted:
        return True
    if permission in granted:
        return True
    resource = permission.split(":")[0]
    if f"{resource}:*" in granted:
        return True
    return False


def has_any_permission(role: Role | str, *permissions: str) -> bool:
    return any(has_permission(role, p) for p in permissions)


def is_assignment_scoped_role(role: Role | str) -> bool:
    """Dentists/hygienists only see assigned patients (plus unassigned pool)."""
    try:
        role_enum = Role(role) if isinstance(role, str) else role
    except ValueError:
        return False
    return role_enum in {Role.DENTIST, Role.HYGIENIST}
