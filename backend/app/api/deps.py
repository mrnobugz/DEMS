from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError, UnauthorizedError, ValidationAppError
from app.core.rbac import Role, has_any_permission, has_permission
from app.core.security import safe_decode
from app.core.tenant import set_tenant
from app.db.session import apply_tenant_rls, get_db
from app.models import Clinic, User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


async def get_current_user(
    request: Request,
    token: Annotated[str | None, Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    if not token:
        raise UnauthorizedError()
    payload = safe_decode(token)
    if not payload or payload.get("type") != "access":
        raise UnauthorizedError("Invalid or expired token")
    user_id = payload.get("sub")
    clinic_claim = payload.get("clinic_id")
    if not user_id:
        raise UnauthorizedError()

    # Bind RLS before the user lookup when JWT already carries clinic_id
    if clinic_claim:
        await apply_tenant_rls(db, clinic_claim)
    else:
        # Platform owner — briefly bypass to load user with null clinic_id
        await apply_tenant_rls(db, None, bypass=True)

    result = await db.execute(select(User).where(User.id == user_id, User.is_active.is_(True)))
    user = result.scalar_one_or_none()
    if not user:
        raise UnauthorizedError("User not found or inactive")

    effective_clinic = user.clinic_id
    if user.role == Role.SUPER_ADMIN:
        header_clinic = request.headers.get("X-Clinic-Id")
        if header_clinic:
            clinic = (
                await db.execute(
                    select(Clinic).where(Clinic.id == header_clinic, Clinic.is_active.is_(True))
                )
            ).scalar_one_or_none()
            if not clinic:
                raise ValidationAppError("Invalid X-Clinic-Id")
            effective_clinic = clinic.id
        elif clinic_claim and not user.clinic_id:
            # JWT may carry last-selected clinic for platform owner
            effective_clinic = clinic_claim

    if effective_clinic:
        set_tenant(effective_clinic, user_id=user.id, role=user.role)
        await apply_tenant_rls(db, effective_clinic)
    else:
        # Platform routes without clinic context
        set_tenant("", user_id=user.id, role=user.role)
        await apply_tenant_rls(db, None, bypass=True)

    request.state.clinic_id = effective_clinic
    request.state.user_id = user.id
    # Request-scoped effective clinic for handlers still reading user.clinic_id patterns
    object.__setattr__(user, "_effective_clinic_id", effective_clinic)
    return user


def active_clinic_id(user: User) -> str | None:
    return getattr(user, "_effective_clinic_id", None) or user.clinic_id


async def require_clinic_context(
    request: Request,
    user: Annotated[User, Depends(get_current_user)],
) -> str:
    cid = request.state.clinic_id or user.clinic_id
    if not cid:
        raise ValidationAppError(
            "Clinic context required. Platform owners must send X-Clinic-Id."
        )
    return cid


def require_permission(permission: str) -> Callable:
    async def _checker(user: Annotated[User, Depends(get_current_user)]) -> User:
        if not has_permission(user.role, permission):
            raise ForbiddenError(f"Missing permission: {permission}")
        return user

    return _checker


def require_any_permission(*permissions: str) -> Callable:
    async def _checker(user: Annotated[User, Depends(get_current_user)]) -> User:
        if not has_any_permission(user.role, *permissions):
            raise ForbiddenError(f"Missing permission (need one of): {', '.join(permissions)}")
        return user

    return _checker


CurrentUser = Annotated[User, Depends(get_current_user)]
ClinicId = Annotated[str, Depends(require_clinic_context)]
DbSession = Annotated[AsyncSession, Depends(get_db)]
