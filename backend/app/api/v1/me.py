from fastapi import APIRouter

from app.api.deps import CurrentUser
from app.schemas import ModuleOut
from app.services.modules import modules_for_user

router = APIRouter(prefix="/me", tags=["me"])


@router.get("/modules", response_model=list[ModuleOut])
async def my_modules(user: CurrentUser):
    """Modules the current user's existing role/permissions already grant."""
    return modules_for_user(user)
