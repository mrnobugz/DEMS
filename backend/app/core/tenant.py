"""Request-scoped multi-clinic tenant context (ContextVar).

Used by repositories and Postgres RLS (`set_config('app.clinic_id', ...)`)
so queries cannot silently cross clinic boundaries.
"""

from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass

_clinic_id: ContextVar[str | None] = ContextVar("demsta_clinic_id", default=None)
_user_id: ContextVar[str | None] = ContextVar("demsta_user_id", default=None)
_role: ContextVar[str | None] = ContextVar("demsta_role", default=None)


@dataclass(frozen=True, slots=True)
class TenantContext:
    clinic_id: str
    user_id: str | None = None
    role: str | None = None


def set_tenant(clinic_id: str, *, user_id: str | None = None, role: str | None = None) -> None:
    _clinic_id.set(clinic_id)
    if user_id is not None:
        _user_id.set(user_id)
    if role is not None:
        _role.set(role)


def clear_tenant() -> None:
    _clinic_id.set(None)
    _user_id.set(None)
    _role.set(None)


def get_clinic_id() -> str | None:
    return _clinic_id.get()


def require_clinic_id() -> str:
    clinic_id = _clinic_id.get()
    if not clinic_id:
        raise RuntimeError("Tenant clinic_id is not set on this request")
    return clinic_id


def get_tenant() -> TenantContext | None:
    clinic_id = _clinic_id.get()
    if not clinic_id:
        return None
    return TenantContext(clinic_id=clinic_id, user_id=_user_id.get(), role=_role.get())
