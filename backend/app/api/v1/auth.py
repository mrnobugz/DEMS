from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.security import OAuth2PasswordRequestForm

from app.api.deps import CurrentUser, DbSession
from app.core.config import get_settings
from app.schemas import LoginRequest, RefreshRequest, TokenResponse, UserOut
from app.services import domain as svc

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


@router.post("/login", response_model=TokenResponse)
async def login_json(body: LoginRequest, request: Request, db: DbSession):
    user, access, refresh = await svc.authenticate_user(
        db,
        body.email,
        body.password,
        body.clinic_code or "MAIN",
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        expires_in=settings.access_token_expire_minutes * 60,
        user=UserOut.model_validate(user),
    )


@router.post("/token", response_model=TokenResponse, include_in_schema=False)
async def login_form(
    request: Request,
    db: DbSession,
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
):
    # clinic code can be passed via client_id for swagger compatibility
    clinic_code = form.client_id or "MAIN"
    user, access, refresh = await svc.authenticate_user(
        db,
        form.username,
        form.password,
        clinic_code,
        ip=request.client.host if request.client else None,
    )
    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        expires_in=settings.access_token_expire_minutes * 60,
        user=UserOut.model_validate(user),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: DbSession):
    user, access, refresh_tok = await svc.refresh_tokens(db, body.refresh_token)
    return TokenResponse(
        access_token=access,
        refresh_token=refresh_tok,
        expires_in=settings.access_token_expire_minutes * 60,
        user=UserOut.model_validate(user),
    )


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser):
    return UserOut.model_validate(user)
