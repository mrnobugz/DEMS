from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Patient
from app.repositories.base import TenantRepository


class PatientRepository(TenantRepository[Patient]):
    def __init__(self, db: AsyncSession, clinic_id: str):
        super().__init__(db, Patient, clinic_id)

    async def search(
        self,
        *,
        q: str | None = None,
        active_only: bool = True,
        assigned_dentist_id: str | None = None,
        include_unassigned: bool = True,
        limit: int = 25,
        offset: int = 0,
    ) -> tuple[list[Patient], int]:
        stmt = select(Patient).options(selectinload(Patient.primary_dentist))
        if active_only:
            stmt = stmt.where(Patient.is_active.is_(True))
        if assigned_dentist_id is not None:
            if include_unassigned:
                stmt = stmt.where(
                    or_(
                        Patient.primary_dentist_id == assigned_dentist_id,
                        Patient.primary_dentist_id.is_(None),
                    )
                )
            else:
                stmt = stmt.where(Patient.primary_dentist_id == assigned_dentist_id)
        if q:
            like = f"%{q.strip()}%"
            stmt = stmt.where(
                or_(
                    Patient.first_name.ilike(like),
                    Patient.last_name.ilike(like),
                    Patient.patient_code.ilike(like),
                    Patient.hospital_reg_number.ilike(like),
                    Patient.phone.ilike(like),
                    Patient.insurance_number.ilike(like),
                    Patient.email.ilike(like),
                    Patient.town_city.ilike(like),
                )
            )
        total = await self.count(stmt)
        items = await self.list(
            where=stmt,
            order_by=Patient.created_at.desc(),
            limit=limit,
            offset=offset,
        )
        return items, total

    async def get_with_dentist(self, patient_id: str) -> Patient | None:
        stmt = (
            self.scoped(select(Patient).options(selectinload(Patient.primary_dentist)))
            .where(Patient.id == patient_id)
        )
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def find_duplicate(self, *, phone: str | None, email: str | None) -> Patient | None:
        if not phone and not email:
            return None
        clauses = []
        if phone:
            clauses.append(Patient.phone == phone)
        if email:
            clauses.append(Patient.email == email)
        stmt = self.scoped(select(Patient).where(or_(*clauses))).limit(1)
        return (await self.db.execute(stmt)).scalar_one_or_none()
