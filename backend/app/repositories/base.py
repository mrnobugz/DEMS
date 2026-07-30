"""Tenant-aware repository base — injects clinic_id so callers cannot forget scoping."""

from __future__ import annotations

from typing import Any, Generic, TypeVar

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant import require_clinic_id
from app.db.session import TenantMixin

ModelT = TypeVar("ModelT", bound=TenantMixin)


class TenantRepository(Generic[ModelT]):
    """CRUD helpers that always filter (and stamp) clinic_id."""

    def __init__(self, db: AsyncSession, model: type[ModelT], clinic_id: str | None = None):
        self.db = db
        self.model = model
        self.clinic_id = clinic_id or require_clinic_id()

    def scoped(self, stmt: Select[Any] | None = None) -> Select[Any]:
        base = stmt if stmt is not None else select(self.model)
        return base.where(self.model.clinic_id == self.clinic_id)

    async def get(self, entity_id: str) -> ModelT | None:
        result = await self.db.execute(self.scoped().where(self.model.id == entity_id))
        return result.scalar_one_or_none()

    async def get_or_raise(self, entity_id: str, *, resource: str = "Resource") -> ModelT:
        from app.core.exceptions import NotFoundError

        entity = await self.get(entity_id)
        if entity is None:
            raise NotFoundError(resource)
        return entity

    async def count(self, stmt: Select[Any] | None = None) -> int:
        if stmt is None:
            q = select(func.count()).select_from(self.model).where(self.model.clinic_id == self.clinic_id)
        else:
            sub = self.scoped(stmt).subquery()
            q = select(func.count()).select_from(sub)
        return int((await self.db.execute(q)).scalar_one())

    async def list(
        self,
        *,
        where: Select[Any] | None = None,
        order_by: Any = None,
        limit: int = 25,
        offset: int = 0,
    ) -> list[ModelT]:
        stmt = self.scoped(where)
        if order_by is not None:
            stmt = stmt.order_by(order_by)
        stmt = stmt.limit(limit).offset(offset)
        return list((await self.db.execute(stmt)).scalars().all())

    def new(self, **kwargs: Any) -> ModelT:
        if "clinic_id" in kwargs and kwargs["clinic_id"] != self.clinic_id:
            raise ValueError("Cannot create entity for a different clinic_id")
        kwargs["clinic_id"] = self.clinic_id
        entity = self.model(**kwargs)
        self.db.add(entity)
        return entity

    def delete(self, entity: ModelT) -> None:
        if getattr(entity, "clinic_id", None) != self.clinic_id:
            from app.core.exceptions import ForbiddenError

            raise ForbiddenError("Cross-tenant delete blocked")
        self.db.delete(entity)  # SQLAlchemy 2 async API
