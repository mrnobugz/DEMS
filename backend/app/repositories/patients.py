from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

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
        limit: int = 25,
        offset: int = 0,
    ) -> tuple[list[Patient], int]:
        stmt = select(Patient)
        if active_only:
            stmt = stmt.where(Patient.is_active.is_(True))
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
