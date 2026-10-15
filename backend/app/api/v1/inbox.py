"""Staff in-app inbox + Server-Sent Events push."""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from typing import Annotated, AsyncIterator, Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ClinicId, DbSession, require_permission
from app.db.session import AsyncSessionLocal, apply_tenant_rls
from app.services import staff_inbox as inbox_svc

router = APIRouter(prefix="/inbox", tags=["inbox"])


class MarkReadIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ids: list[str] = Field(default_factory=list)
    all: bool = False


@router.get("")
async def list_inbox(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[object, Depends(require_permission("inbox:read"))],
    category: Optional[str] = Query(None),
    unread_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
):
    rows = await inbox_svc.list_inbox(
        db,
        clinic_id,
        user.id,
        category=category,
        unread_only=unread_only,
        limit=limit,
    )
    return [inbox_svc.serialize(r) for r in rows]


@router.get("/unread-count")
async def get_unread_count(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[object, Depends(require_permission("inbox:read"))],
    category: Optional[str] = Query(None),
):
    count = await inbox_svc.unread_count(db, clinic_id, user.id, category=category)
    return {"count": count}


@router.post("/read")
async def mark_read(
    body: MarkReadIn,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[object, Depends(require_permission("inbox:read"))],
):
    updated = await inbox_svc.mark_read(
        db,
        clinic_id,
        user.id,
        notification_ids=body.ids or None,
        all_unread=body.all,
    )
    return {"updated": updated}


@router.get("/stream")
async def stream_inbox(
    clinic_id: ClinicId,
    user: Annotated[object, Depends(require_permission("inbox:read"))],
    last_id: Optional[str] = Query(None),
):
    """SSE stream of staff notifications. Auth via Bearer or ?access_token=."""

    @asynccontextmanager
    async def session_ctx() -> AsyncIterator[AsyncSession]:
        async with AsyncSessionLocal() as session:
            await apply_tenant_rls(session, clinic_id)
            yield session

    async def event_gen():
        async for item in inbox_svc.stream_events(
            session_ctx,
            clinic_id=clinic_id,
            user_id=user.id,
            last_id=last_id,
        ):
            if item.get("type") == "ping":
                yield "event: ping\ndata: {}\n\n"
                continue
            yield f"event: notification\ndata: {json.dumps(item)}\n\n"

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
