"""Unfinished registrations can be saved, resumed, cancelled, or completed."""

from __future__ import annotations

import unittest

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.exceptions import NotFoundError, ValidationAppError
from app.core.rbac import Role
from app.core.security import hash_password
from app.db.session import Base
from app.models import Clinic, User
from app.schemas import RegistrationDraftSave
from app.services import registration_drafts as drafts


class RegistrationDraftTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.engine = create_async_engine(
            "sqlite+aiosqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        self.Session = async_sessionmaker(self.engine, class_=AsyncSession, expire_on_commit=False)
        async with self.Session() as db:
            clinic = Clinic(name="Draft Clinic", code="DRF", currency="TZS")
            db.add(clinic)
            await db.flush()
            clerk = User(
                email="reception@drf.test",
                hashed_password=hash_password("Demsta!Front1"),
                full_name="Neema Front",
                role=Role.RECEPTIONIST,
                clinic_id=clinic.id,
            )
            db.add(clerk)
            await db.commit()
            self.clinic_id = clinic.id
            self.actor_id = clerk.id

    async def asyncTearDown(self) -> None:
        await self.engine.dispose()

    def _payload(self, step: int = 1) -> RegistrationDraftSave:
        return RegistrationDraftSave(
            display_name="Ada Lovelace",
            summary="Step 2 of 6 · toothache",
            step=step,
            payload={"form": {"first_name": "Ada", "last_name": "Lovelace"}, "step": step},
        )

    async def test_save_resume_round_trip(self) -> None:
        async with self.Session() as db:
            saved = await drafts.save_draft(db, self.clinic_id, self.actor_id, self._payload())
            self.assertEqual(saved.status, "open")
            self.assertEqual(saved.created_by_name, "Neema Front")

            resumed = await drafts.get_draft(db, self.clinic_id, saved.id)
            self.assertEqual(resumed.payload["form"]["first_name"], "Ada")
            self.assertEqual(resumed.step, 1)

            updated = await drafts.save_draft(
                db, self.clinic_id, self.actor_id, self._payload(step=3), draft_id=saved.id
            )
            self.assertEqual(updated.id, saved.id)
            self.assertEqual(updated.step, 3)

            open_rows = await drafts.list_drafts(db, self.clinic_id)
            self.assertEqual([row.id for row in open_rows], [saved.id])

    async def test_cancel_removes_from_open_list(self) -> None:
        async with self.Session() as db:
            saved = await drafts.save_draft(db, self.clinic_id, self.actor_id, self._payload())
            cancelled = await drafts.cancel_draft(
                db, self.clinic_id, self.actor_id, saved.id, reason="Patient left"
            )
            self.assertEqual(cancelled.status, "cancelled")
            self.assertEqual(cancelled.cancel_reason, "Patient left")
            self.assertIsNotNone(cancelled.closed_at)
            self.assertEqual(await drafts.list_drafts(db, self.clinic_id), [])
            self.assertEqual(
                [row.id for row in await drafts.list_drafts(db, self.clinic_id, status="cancelled")],
                [saved.id],
            )

    async def test_cancelled_draft_cannot_be_saved_again(self) -> None:
        async with self.Session() as db:
            saved = await drafts.save_draft(db, self.clinic_id, self.actor_id, self._payload())
            await drafts.cancel_draft(db, self.clinic_id, self.actor_id, saved.id)
            with self.assertRaises(ValidationAppError):
                await drafts.save_draft(
                    db, self.clinic_id, self.actor_id, self._payload(step=2), draft_id=saved.id
                )

    async def test_complete_closes_draft(self) -> None:
        async with self.Session() as db:
            saved = await drafts.save_draft(db, self.clinic_id, self.actor_id, self._payload())
            await drafts.complete_draft(db, self.clinic_id, self.actor_id, saved.id)
            closed = await drafts.get_draft(db, self.clinic_id, saved.id)
            self.assertEqual(closed.status, "completed")
            self.assertEqual(await drafts.list_drafts(db, self.clinic_id), [])
            with self.assertRaises(ValidationAppError):
                await drafts.cancel_draft(db, self.clinic_id, self.actor_id, saved.id)

    async def test_complete_ignores_unknown_draft(self) -> None:
        async with self.Session() as db:
            await drafts.complete_draft(db, self.clinic_id, self.actor_id, "missing-id")

    async def test_unknown_draft_not_found(self) -> None:
        async with self.Session() as db:
            with self.assertRaises(NotFoundError):
                await drafts.get_draft(db, self.clinic_id, "missing-id")

    async def test_oversized_payload_rejected(self) -> None:
        async with self.Session() as db:
            with self.assertRaises(ValidationAppError):
                await drafts.save_draft(
                    db,
                    self.clinic_id,
                    self.actor_id,
                    RegistrationDraftSave(payload={"photo": "x" * 500_000}),
                )


if __name__ == "__main__":
    unittest.main()
