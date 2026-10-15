"""In-app staff notifications with live push (SSE + in-process hub)."""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import UTC, datetime
from typing import Any, AsyncIterator

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rbac import Role, has_any_permission, parse_perm_list
from app.models import StaffNotification, User

logger = logging.getLogger("demsta.staff_inbox")

# category → permissions that qualify a user as a recipient
AUDIENCE_PERMISSIONS: dict[str, tuple[str, ...]] = {
    "billing": ("billing:read", "billing:*"),
    "inventory": ("inventory:read", "inventory:*", "pharmacy:*"),
    "requisition": ("requisition:fulfill", "requisition:*", "inventory:*"),
    "appointments": ("appointments:*", "appointments:read"),
    "clinical": ("clinical:read", "clinical:*", "lab:*", "appointments:*"),
    "system": ("config:clinic", "config:*", "staff:*"),
}

# event type constants (also published on domain_events where useful)
INVOICE_CREATED = "invoice.created"
CLAIM_DENIED = "claim.denied"
STOCK_BELOW_PAR = "stock.below_par"
REQUISITION_APPROVED = "requisition.approved"
REQUISITION_SUBMITTED = "requisition.submitted"
LAB_CASE_RECEIVED = "lab.case_received"


class _Hub:
    """Per-user fan-out for same-process SSE subscribers."""

    def __init__(self) -> None:
        self._subs: dict[str, set[asyncio.Queue[dict[str, Any]]]] = {}
        self._lock = asyncio.Lock()

    async def subscribe(self, user_id: str) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=64)
        async with self._lock:
            self._subs.setdefault(user_id, set()).add(queue)
        return queue

    async def unsubscribe(self, user_id: str, queue: asyncio.Queue[dict[str, Any]]) -> None:
        async with self._lock:
            bags = self._subs.get(user_id)
            if not bags:
                return
            bags.discard(queue)
            if not bags:
                self._subs.pop(user_id, None)

    def publish(self, user_id: str, payload: dict[str, Any]) -> None:
        for queue in list(self._subs.get(user_id, ())):
            try:
                queue.put_nowait(payload)
            except asyncio.QueueFull:
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
                try:
                    queue.put_nowait(payload)
                except asyncio.QueueFull:
                    pass


hub = _Hub()


def serialize(row: StaffNotification) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    if row.payload_json:
        try:
            payload = json.loads(row.payload_json)
        except json.JSONDecodeError:
            payload = {}
    return {
        "id": row.id,
        "clinic_id": row.clinic_id,
        "user_id": row.user_id,
        "category": row.category,
        "event_type": row.event_type,
        "title": row.title,
        "body": row.body,
        "link_path": row.link_path,
        "payload": payload,
        "actor_id": row.actor_id,
        "read_at": row.read_at.isoformat() if row.read_at else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


async def _audience_user_ids(
    db: AsyncSession,
    clinic_id: str,
    *,
    permissions: tuple[str, ...],
    user_ids: list[str] | None = None,
    exclude_user_id: str | None = None,
) -> list[str]:
    if user_ids:
        ids = [uid for uid in user_ids if uid and uid != exclude_user_id]
        if not ids:
            return []
        rows = list(
            (
                await db.execute(
                    select(User.id).where(
                        User.clinic_id == clinic_id,
                        User.is_active.is_(True),
                        User.id.in_(ids),
                        User.role != Role.PATIENT,
                    )
                )
            )
            .scalars()
            .all()
        )
        return list(rows)

    users = list(
        (
            await db.execute(
                select(User).where(
                    User.clinic_id == clinic_id,
                    User.is_active.is_(True),
                    User.role != Role.PATIENT,
                )
            )
        )
        .scalars()
        .all()
    )
    out: list[str] = []
    for user in users:
        if exclude_user_id and user.id == exclude_user_id:
            continue
        if user.role == Role.SUPER_ADMIN or user.role == Role.CLINIC_ADMIN:
            out.append(user.id)
            continue
        extra = parse_perm_list(getattr(user, "extra_permissions", None))
        denied = parse_perm_list(getattr(user, "denied_permissions", None))
        if any(p in denied or p.split(":")[0] + ":*" in denied for p in permissions):
            # still allow if extra grants cover — keep simple: skip hard deny of exact perm
            if any(p in denied for p in permissions):
                continue
        if has_any_permission(user.role, *permissions) or any(
            p in extra or f"{p.split(':')[0]}:*" in extra for p in permissions
        ):
            out.append(user.id)
    return out


async def notify_staff(
    db: AsyncSession,
    *,
    clinic_id: str,
    category: str,
    event_type: str,
    title: str,
    body: str,
    link_path: str | None = None,
    payload: dict[str, Any] | None = None,
    actor_id: str | None = None,
    audience_permissions: tuple[str, ...] | None = None,
    user_ids: list[str] | None = None,
    exclude_actor: bool = True,
) -> list[StaffNotification]:
    """Fan-out one notification per recipient and wake SSE subscribers."""
    perms = audience_permissions or AUDIENCE_PERMISSIONS.get(category, ())
    if not perms and not user_ids:
        logger.warning("staff_inbox.notify skipped — no audience for category=%s", category)
        return []

    recipient_ids = await _audience_user_ids(
        db,
        clinic_id,
        permissions=perms,
        user_ids=user_ids,
        exclude_user_id=actor_id if exclude_actor else None,
    )
    if not recipient_ids:
        return []

    meta = json.dumps(payload or {}, default=str)
    rows: list[StaffNotification] = []
    for uid in recipient_ids:
        row = StaffNotification(
            clinic_id=clinic_id,
            user_id=uid,
            category=category,
            event_type=event_type,
            title=title[:200],
            body=body,
            link_path=link_path,
            payload_json=meta,
            actor_id=actor_id,
        )
        db.add(row)
        rows.append(row)
    await db.flush()

    for row in rows:
        hub.publish(row.user_id, serialize(row))
    return rows


async def list_inbox(
    db: AsyncSession,
    clinic_id: str,
    user_id: str,
    *,
    category: str | None = None,
    unread_only: bool = False,
    limit: int = 50,
    after_id: str | None = None,
) -> list[StaffNotification]:
    stmt = select(StaffNotification).where(
        StaffNotification.clinic_id == clinic_id,
        StaffNotification.user_id == user_id,
    )
    if category:
        stmt = stmt.where(StaffNotification.category == category)
    if unread_only:
        stmt = stmt.where(StaffNotification.read_at.is_(None))
    if after_id:
        anchor = (
            await db.execute(
                select(StaffNotification.created_at).where(StaffNotification.id == after_id)
            )
        ).scalar_one_or_none()
        if anchor:
            stmt = stmt.where(StaffNotification.created_at > anchor)
    stmt = stmt.order_by(StaffNotification.created_at.desc()).limit(min(limit, 200))
    return list((await db.execute(stmt)).scalars().all())


async def unread_count(db: AsyncSession, clinic_id: str, user_id: str, *, category: str | None = None) -> int:
    stmt = select(func.count()).select_from(StaffNotification).where(
        StaffNotification.clinic_id == clinic_id,
        StaffNotification.user_id == user_id,
        StaffNotification.read_at.is_(None),
    )
    if category:
        stmt = stmt.where(StaffNotification.category == category)
    return int((await db.execute(stmt)).scalar_one() or 0)


async def mark_read(
    db: AsyncSession,
    clinic_id: str,
    user_id: str,
    *,
    notification_ids: list[str] | None = None,
    all_unread: bool = False,
) -> int:
    now = datetime.now(UTC)
    stmt = (
        update(StaffNotification)
        .where(
            StaffNotification.clinic_id == clinic_id,
            StaffNotification.user_id == user_id,
            StaffNotification.read_at.is_(None),
        )
        .values(read_at=now, updated_at=now)
    )
    if notification_ids:
        stmt = stmt.where(StaffNotification.id.in_(notification_ids))
    elif not all_unread:
        return 0
    result = await db.execute(stmt)
    await db.flush()
    return int(result.rowcount or 0)


async def stream_events(
    db_factory,
    *,
    clinic_id: str,
    user_id: str,
    last_id: str | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """Yield serialized notifications for SSE. Combines hub + DB poll."""
    queue = await hub.subscribe(user_id)
    cursor = last_id
    try:
        # Catch up any rows created while connecting
        async with db_factory() as db:
            pending = await list_inbox(
                db, clinic_id, user_id, unread_only=False, limit=20, after_id=cursor
            )
            for row in reversed(pending):
                cursor = row.id
                yield serialize(row)

        while True:
            try:
                item = await asyncio.wait_for(queue.get(), timeout=2.5)
                cursor = item.get("id") or cursor
                yield item
            except TimeoutError:
                # Heartbeat + poll for multi-worker deliveries
                async with db_factory() as db:
                    fresh = await list_inbox(
                        db, clinic_id, user_id, unread_only=False, limit=10, after_id=cursor
                    )
                    for row in reversed(fresh):
                        cursor = row.id
                        yield serialize(row)
                yield {"type": "ping"}
    finally:
        await hub.unsubscribe(user_id, queue)


def invoice_source_label(notes: str | None, line_kinds: set[str], idempotency_key: str | None) -> str:
    key = (idempotency_key or "").lower()
    if key.startswith("lab-case:"):
        return "Lab"
    kinds = {k.lower() for k in line_kinds if k}
    if "drug" in kinds:
        return "Pharmacy"
    if "lab" in kinds:
        return "Lab"
    if "imaging" in kinds:
        return "Imaging"
    if "supply" in kinds:
        return "Warehouse"
    text = (notes or "").lower()
    if "radiology" in text or "imaging" in text:
        return "Imaging"
    if "registration" in text:
        return "Registration"
    if "pharmacy" in text or "dispense" in text:
        return "Pharmacy"
    if "lab" in text:
        return "Lab"
    if "chart" in text or "procedure" in text:
        return "Chairside"
    return "Clinical"


async def notify_invoice_created(
    db: AsyncSession,
    *,
    clinic_id: str,
    actor_id: str,
    invoice_id: str,
    invoice_number: str,
    patient_name: str,
    total: float,
    currency: str,
    notes: str | None,
    line_kinds: set[str],
    idempotency_key: str | None,
) -> list[StaffNotification]:
    source = invoice_source_label(notes, line_kinds, idempotency_key)
    amount = f"{currency} {total:,.0f}" if currency == "TZS" else f"{total:,.2f} {currency}"
    return await notify_staff(
        db,
        clinic_id=clinic_id,
        category="billing",
        event_type=INVOICE_CREATED,
        title=f"Invoice {invoice_number} from {source}",
        body=f"{patient_name} · {amount} posted to the ledger.",
        link_path=f"/billing/invoices/{invoice_id}",
        payload={
            "invoice_id": invoice_id,
            "invoice_number": invoice_number,
            "source": source,
            "total": total,
            "currency": currency,
        },
        actor_id=actor_id,
        audience_permissions=AUDIENCE_PERMISSIONS["billing"],
    )


async def notify_lab_case_received(
    db: AsyncSession,
    *,
    clinic_id: str,
    actor_id: str | None,
    case_id: str,
    patient_id: str,
    patient_name: str,
    case_type: str,
    tooth: str | None,
    lab_name: str | None,
    dentist_id: str | None = None,
) -> list[StaffNotification]:
    tooth_label = f"Tooth {tooth} · " if tooth else ""
    lab_label = f" from {lab_name}" if lab_name else ""
    return await notify_staff(
        db,
        clinic_id=clinic_id,
        category="clinical",
        event_type=LAB_CASE_RECEIVED,
        title=f"Lab case received: {case_type.capitalize()}{lab_label}",
        body=f"{patient_name} · {tooth_label}Prosthetic ready for patient seating.",
        link_path=f"/patients/{patient_id}",
        payload={
            "case_id": case_id,
            "patient_id": patient_id,
            "patient_name": patient_name,
            "case_type": case_type,
            "tooth": tooth,
            "lab_name": lab_name,
        },
        actor_id=actor_id,
        audience_permissions=AUDIENCE_PERMISSIONS["clinical"],
        user_ids=(dentist_id,) if dentist_id else None,
        exclude_actor=False,
    )
