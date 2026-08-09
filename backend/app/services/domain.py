import hashlib
import json
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.exceptions import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    UnauthorizedError,
    ValidationAppError,
)
from app.core.rbac import Role, has_permission, is_assignment_scoped_role
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    safe_decode,
    verify_password,
)
from app.models import (
    Appointment,
    AppointmentStatus,
    AppointmentType,
    AuditLog,
    Clinic,
    ClinicalNote,
    ClinicalVisit,
    ConsentRecord,
    DentalChartEntry,
    EndoCase,
    FeeScheduleItem,
    Invoice,
    InvoiceLineItem,
    InvoiceStatus,
    Patient,
    Payment,
    PerioExam,
    PerioSite,
    RefreshToken,
    Restoration,
    TreatmentPlan,
    TreatmentPlanItem,
    User,
)
from app.schemas import (
    AppointmentCreate,
    AppointmentUpdate,
    ChartEntryCreate,
    ChartToCashRequest,
    ClinicalNoteCreate,
    ClinicalVisitCreate,
    ClinicalVisitUpdate,
    ConsentCreate,
    FeeScheduleItemCreate,
    FeeScheduleItemUpdate,
    InvoiceCreate,
    PatientCreate,
    PatientUpdate,
    PaymentCreate,
    PerioExamCreate,
    TreatmentPlanCreate,
    TreatmentPlanItemCreate,
    TreatmentPlanUpdate,
)

settings = get_settings()


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def write_audit(
    db: AsyncSession,
    *,
    clinic_id: str | None,
    actor_id: str | None,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    before: dict | None = None,
    after: dict | None = None,
    ip: str | None = None,
) -> None:
    db.add(
        AuditLog(
            clinic_id=clinic_id,
            actor_id=actor_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            before_data=json.dumps(before) if before else None,
            after_data=json.dumps(after) if after else None,
            ip_address=ip,
        )
    )


# ── Auth ──────────────────────────────────────────────
PLATFORM_CLINIC_CODE = "PLATFORM"


async def authenticate_user(
    db: AsyncSession,
    email: str,
    password: str,
    clinic_code: str,
    *,
    ip: str | None = None,
    user_agent: str | None = None,
) -> tuple[User, str, str]:
    from app.core.rbac import Role
    from app.db.session import apply_tenant_rls

    code = (clinic_code or "MAIN").strip().upper()
    user: User | None = None
    clinic: Clinic | None = None

    if code == PLATFORM_CLINIC_CODE:
        await apply_tenant_rls(db, None, bypass=True)
        user = (
            await db.execute(
                select(User).where(
                    User.email == email.lower(),
                    User.clinic_id.is_(None),
                    User.role == Role.SUPER_ADMIN,
                )
            )
        ).scalar_one_or_none()
    else:
        clinic = (
            await db.execute(
                select(Clinic).where(Clinic.code == code, Clinic.is_active.is_(True))
            )
        ).scalar_one_or_none()
        if not clinic:
            raise UnauthorizedError("Invalid clinic code")

        await apply_tenant_rls(db, clinic.id)
        user = (
            await db.execute(
                select(User).where(User.email == email.lower(), User.clinic_id == clinic.id)
            )
        ).scalar_one_or_none()

    if not user:
        raise UnauthorizedError("Invalid credentials")

    if user.locked_until and user.locked_until > datetime.now(UTC):
        raise UnauthorizedError("Account temporarily locked. Try again later.")

    if not verify_password(password, user.hashed_password):
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= 5:
            user.locked_until = datetime.now(UTC) + timedelta(minutes=15)
        await db.flush()
        raise UnauthorizedError("Invalid credentials")

    user.failed_login_attempts = 0
    user.locked_until = None

    token_clinic = user.clinic_id
    access = create_access_token(
        user.id,
        {"role": user.role, "clinic_id": token_clinic, "name": user.full_name},
    )
    refresh, jti = create_refresh_token(user.id)
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=_hash_token(refresh),
            expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days),
            user_agent=user_agent,
            ip_address=ip,
        )
    )
    await write_audit(
        db,
        clinic_id=user.clinic_id,
        actor_id=user.id,
        action="login",
        resource_type="user",
        resource_id=user.id,
        ip=ip,
    )
    await db.flush()
    return user, access, refresh


async def refresh_tokens(db: AsyncSession, refresh_token: str) -> tuple[User, str, str]:
    from app.db.session import apply_tenant_rls

    payload = safe_decode(refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise UnauthorizedError("Invalid refresh token")
    token_hash = _hash_token(refresh_token)
    stored = (
        await db.execute(
            select(RefreshToken).where(
                RefreshToken.token_hash == token_hash,
                RefreshToken.revoked.is_(False),
            )
        )
    ).scalar_one_or_none()
    if not stored or stored.expires_at < datetime.now(UTC):
        raise UnauthorizedError("Refresh token revoked or expired")

    stored.revoked = True
    # Refresh tokens are not clinic-scoped; briefly bypass RLS to resolve the user
    await apply_tenant_rls(db, None, bypass=True)
    user = (await db.execute(select(User).where(User.id == stored.user_id))).scalar_one()
    await apply_tenant_rls(db, user.clinic_id)
    access = create_access_token(
        user.id,
        {"role": user.role, "clinic_id": user.clinic_id, "name": user.full_name},
    )
    new_refresh, _ = create_refresh_token(user.id)
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=_hash_token(new_refresh),
            expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days),
        )
    )
    await db.flush()
    return user, access, new_refresh


# ── Patients ──────────────────────────────────────────
async def next_patient_code(db: AsyncSession, clinic_id: str) -> str:
    from app.repositories.patients import PatientRepository

    year = datetime.now(UTC).year
    repo = PatientRepository(db, clinic_id)
    count = await repo.count()
    return f"P{year}{count + 1:05d}"


async def create_patient(db: AsyncSession, clinic_id: str, actor_id: str, data: PatientCreate) -> Patient:
    from app.repositories.patients import PatientRepository
    from app.schemas.clerkship import compose_address, dumps_block, flags_to_chronic_summary

    repo = PatientRepository(db, clinic_id)
    if data.phone or data.email:
        dup = await repo.find_duplicate(phone=data.phone, email=data.email)
        if dup:
            raise ConflictError(
                "Possible duplicate patient found",
                details=[{"patient_code": dup.patient_code, "id": dup.id}],
            )

    payload = data.model_dump(
        exclude={"medical_history", "pain_assessment", "reported_symptoms"},
    )
    payload["medical_history_json"] = dumps_block(data.medical_history)
    payload["pain_assessment_json"] = dumps_block(data.pain_assessment)
    payload["reported_symptoms_json"] = dumps_block(data.reported_symptoms)
    if not payload.get("chronic_conditions"):
        payload["chronic_conditions"] = flags_to_chronic_summary(data.medical_history)
    composed = compose_address(
        po_box=payload.get("po_box"),
        street=payload.get("street"),
        house_number=payload.get("house_number"),
        area_ward=payload.get("area_ward"),
        town_city=payload.get("town_city"),
        legacy=payload.get("address"),
    )
    if composed:
        payload["address"] = composed

    patient = repo.new(
        patient_code=await next_patient_code(db, clinic_id),
        **payload,
    )
    patient.caries_risk_score = _estimate_caries_risk(patient, data.medical_history)

    await db.flush()
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="create",
        resource_type="patient",
        resource_id=patient.id,
        after={"patient_code": patient.patient_code},
    )
    return patient


def _estimate_caries_risk(patient: Patient, medical_history=None) -> float:
    risk = 0.2
    if patient.allergies or (medical_history and getattr(medical_history, "allergies_flag", False)):
        risk += 0.05
    chronic = (patient.chronic_conditions or "").lower()
    if "diabet" in chronic or (medical_history and getattr(medical_history, "diabetes", False)):
        risk += 0.25
    if medical_history and getattr(medical_history, "hypertension", False):
        risk += 0.05
    if patient.dental_history and any(
        x in patient.dental_history.lower() for x in ("caries", "decay", "filling")
    ):
        risk += 0.2
    if patient.reported_symptoms_json and "cavities" in patient.reported_symptoms_json.lower():
        # crude boost when cavities symptom checked in JSON
        if '"cavities":true' in patient.reported_symptoms_json.replace(" ", "").lower():
            risk += 0.15
    return round(min(risk, 0.95), 2)


async def list_patients(
    db: AsyncSession,
    clinic_id: str,
    *,
    q: str | None = None,
    limit: int = 25,
    offset: int = 0,
    actor: User | None = None,
) -> tuple[list[Patient], int]:
    from app.repositories.patients import PatientRepository

    assigned_to: str | None = None
    if actor is not None and is_assignment_scoped_role(actor.role):
        assigned_to = actor.id
    return await PatientRepository(db, clinic_id).search(
        q=q,
        limit=limit,
        offset=offset,
        assigned_dentist_id=assigned_to,
        include_unassigned=True,
    )


async def get_patient(
    db: AsyncSession,
    clinic_id: str,
    patient_id: str,
    *,
    actor: User | None = None,
) -> Patient:
    from app.repositories.patients import PatientRepository

    repo = PatientRepository(db, clinic_id)
    patient = await repo.get_with_dentist(patient_id)
    if not patient:
        raise NotFoundError("Patient")
    if actor is not None:
        enforce_patient_assignment(actor, patient)
    return patient


def enforce_patient_assignment(actor: User, patient: Patient) -> None:
    """Dentists/hygienists may access assigned patients or the unassigned pool."""
    if not is_assignment_scoped_role(actor.role):
        return
    if patient.primary_dentist_id in (None, actor.id):
        return
    raise ForbiddenError("Patient is assigned to another clinician")


async def assign_primary_dentist(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    patient_id: str,
    dentist_id: str | None,
) -> Patient:
    patient = await get_patient(db, clinic_id, patient_id)
    before = {"primary_dentist_id": patient.primary_dentist_id}
    if dentist_id:
        dentist = (
            await db.execute(
                select(User).where(
                    User.id == dentist_id,
                    User.clinic_id == clinic_id,
                    User.is_active.is_(True),
                    User.role.in_([Role.DENTIST, Role.HYGIENIST, Role.CLINIC_ADMIN]),
                )
            )
        ).scalar_one_or_none()
        if not dentist:
            raise ValidationAppError("Dentist not found in this clinic")
        patient.primary_dentist_id = dentist.id
    else:
        patient.primary_dentist_id = None
    await db.flush()
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="assign",
        resource_type="patient",
        resource_id=patient.id,
        before=before,
        after={"primary_dentist_id": patient.primary_dentist_id},
    )
    return await get_patient(db, clinic_id, patient_id)


async def update_patient(
    db: AsyncSession, clinic_id: str, actor_id: str, patient_id: str, data: PatientUpdate
) -> Patient:
    from app.schemas.clerkship import compose_address, dumps_block, flags_to_chronic_summary

    patient = await get_patient(db, clinic_id, patient_id)
    before = {"first_name": patient.first_name, "last_name": patient.last_name}
    raw = data.model_dump(exclude_unset=True)
    medical_history = raw.pop("medical_history", None)
    pain_assessment = raw.pop("pain_assessment", None)
    reported_symptoms = raw.pop("reported_symptoms", None)

    for k, v in raw.items():
        setattr(patient, k, v)

    if medical_history is not None:
        from app.schemas.clerkship import MedicalHistoryFlags

        flags = MedicalHistoryFlags.model_validate(medical_history)
        patient.medical_history_json = dumps_block(flags)
        if "chronic_conditions" not in raw or raw.get("chronic_conditions") is None:
            summary = flags_to_chronic_summary(flags)
            if summary:
                patient.chronic_conditions = summary
    if pain_assessment is not None:
        from app.schemas.clerkship import PainAssessment

        patient.pain_assessment_json = dumps_block(PainAssessment.model_validate(pain_assessment))
    if reported_symptoms is not None:
        from app.schemas.clerkship import ReportedSymptoms

        patient.reported_symptoms_json = dumps_block(
            ReportedSymptoms.model_validate(reported_symptoms)
        )

    # Refresh composed address when structured parts change
    addr_keys = {"po_box", "street", "house_number", "area_ward", "town_city"}
    if addr_keys & set(raw.keys()):
        patient.address = compose_address(
            po_box=patient.po_box,
            street=patient.street,
            house_number=patient.house_number,
            area_ward=patient.area_ward,
            town_city=patient.town_city,
            legacy=patient.address,
        )

    if medical_history is not None or any(
        k in raw for k in ("allergies", "chronic_conditions", "dental_history", "reported_symptoms")
    ):
        from app.schemas.clerkship import MedicalHistoryFlags, loads_block

        flags = (
            MedicalHistoryFlags.model_validate(medical_history)
            if medical_history is not None
            else loads_block(patient.medical_history_json, MedicalHistoryFlags)
        )
        patient.caries_risk_score = _estimate_caries_risk(patient, flags)

    await db.flush()
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="update",
        resource_type="patient",
        resource_id=patient.id,
        before=before,
        after=data.model_dump(exclude_unset=True, mode="json"),
    )
    return patient


# ── Appointments ──────────────────────────────────────
async def check_conflicts(
    db: AsyncSession,
    clinic_id: str,
    dentist_id: str,
    starts_at: datetime,
    ends_at: datetime,
    *,
    exclude_id: str | None = None,
    chair_number: int | None = None,
) -> None:
    if ends_at <= starts_at:
        raise ValidationAppError("ends_at must be after starts_at")

    base = and_(
        Appointment.clinic_id == clinic_id,
        Appointment.status.notin_([AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW]),
        Appointment.waitlist.is_(False),
        Appointment.starts_at < ends_at,
        Appointment.ends_at > starts_at,
    )
    dentist_conflict = await db.execute(
        select(Appointment).where(base, Appointment.dentist_id == dentist_id).limit(1)
    )
    row = dentist_conflict.scalar_one_or_none()
    if row and row.id != exclude_id:
        raise ConflictError(
            "Dentist already booked for this time window",
            details=[{"appointment_id": row.id, "starts_at": row.starts_at.isoformat()}],
        )

    if chair_number is not None:
        chair_conflict = await db.execute(
            select(Appointment).where(base, Appointment.chair_number == chair_number).limit(1)
        )
        crow = chair_conflict.scalar_one_or_none()
        if crow and crow.id != exclude_id:
            raise ConflictError(
                "Chair already booked for this time window",
                details=[{"appointment_id": crow.id, "chair": chair_number}],
            )


async def create_appointment(
    db: AsyncSession, clinic_id: str, actor_id: str, data: AppointmentCreate
) -> Appointment:
    await get_patient(db, clinic_id, data.patient_id)
    color = data.color
    if data.appointment_type_id and not color:
        atype = (
            await db.execute(
                select(AppointmentType).where(
                    AppointmentType.id == data.appointment_type_id,
                    AppointmentType.clinic_id == clinic_id,
                )
            )
        ).scalar_one_or_none()
        if atype:
            color = atype.color

    if not data.waitlist:
        await check_conflicts(
            db,
            clinic_id,
            data.dentist_id,
            data.starts_at,
            data.ends_at,
            chair_number=data.chair_number,
        )
    appt = Appointment(clinic_id=clinic_id, color=color, **data.model_dump(exclude={"color"}))
    if color:
        appt.color = color
    db.add(appt)
    await db.flush()
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="create",
        resource_type="appointment",
        resource_id=appt.id,
    )
    return appt


async def list_appointments(
    db: AsyncSession,
    clinic_id: str,
    *,
    start: datetime | None = None,
    end: datetime | None = None,
    dentist_id: str | None = None,
    waitlist: bool | None = None,
) -> list[Appointment]:
    stmt = (
        select(Appointment)
        .options(selectinload(Appointment.patient))
        .where(Appointment.clinic_id == clinic_id)
    )
    if start:
        stmt = stmt.where(Appointment.ends_at >= start)
    if end:
        stmt = stmt.where(Appointment.starts_at <= end)
    if dentist_id:
        stmt = stmt.where(Appointment.dentist_id == dentist_id)
    if waitlist is not None:
        stmt = stmt.where(Appointment.waitlist.is_(waitlist))
    rows = (await db.execute(stmt.order_by(Appointment.starts_at))).scalars().all()
    return list(rows)


async def update_appointment(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    appt_id: str,
    data: AppointmentUpdate,
    *,
    actor: User | None = None,
) -> Appointment:
    appt = (
        await db.execute(
            select(Appointment)
            .options(selectinload(Appointment.patient))
            .where(Appointment.id == appt_id, Appointment.clinic_id == clinic_id)
        )
    ).scalar_one_or_none()
    if not appt:
        raise NotFoundError("Appointment")

    if actor is not None and not has_permission(actor.role, "appointments:*"):
        if not has_permission(actor.role, "appointments:update_own"):
            raise ForbiddenError("Missing permission: appointments:update_own")
        if appt.dentist_id != actor.id:
            raise ForbiddenError("You can only update your own appointments")

    payload = data.model_dump(exclude_unset=True)
    starts = payload.get("starts_at", appt.starts_at)
    ends = payload.get("ends_at", appt.ends_at)
    dentist = payload.get("dentist_id", appt.dentist_id)
    chair = payload.get("chair_number", appt.chair_number)
    will_waitlist = payload.get("waitlist", appt.waitlist)
    if (
        not will_waitlist
        and (
            "starts_at" in payload
            or "ends_at" in payload
            or "dentist_id" in payload
            or "chair_number" in payload
            or ("waitlist" in payload and not will_waitlist)
        )
    ):
        await check_conflicts(
            db, clinic_id, dentist, starts, ends, exclude_id=appt.id, chair_number=chair
        )

    if payload.get("status") == AppointmentStatus.NO_SHOW:
        appt.no_show = True

    for k, v in payload.items():
        setattr(appt, k, v)
    await db.flush()
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="update",
        resource_type="appointment",
        resource_id=appt.id,
        after=payload,
    )
    return appt


# ── Clinical ──────────────────────────────────────────
async def add_chart_entry(
    db: AsyncSession, clinic_id: str, actor_id: str, patient_id: str, data: ChartEntryCreate
) -> DentalChartEntry:
    await get_patient(db, clinic_id, patient_id)
    entry = DentalChartEntry(
        clinic_id=clinic_id,
        patient_id=patient_id,
        recorded_by_id=actor_id,
        **data.model_dump(),
    )
    db.add(entry)
    await db.flush()
    return entry


async def list_chart_entries(db: AsyncSession, clinic_id: str, patient_id: str) -> list[DentalChartEntry]:
    await get_patient(db, clinic_id, patient_id)
    rows = (
        await db.execute(
            select(DentalChartEntry)
            .where(
                DentalChartEntry.clinic_id == clinic_id,
                DentalChartEntry.patient_id == patient_id,
            )
            .order_by(DentalChartEntry.tooth_number, DentalChartEntry.created_at)
        )
    ).scalars().all()
    return list(rows)


async def create_clinical_note(
    db: AsyncSession, clinic_id: str, actor_id: str, patient_id: str, data: ClinicalNoteCreate
) -> ClinicalNote:
    await get_patient(db, clinic_id, patient_id)
    note = ClinicalNote(
        clinic_id=clinic_id,
        patient_id=patient_id,
        author_id=actor_id,
        **data.model_dump(),
    )
    db.add(note)
    await db.flush()
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="create",
        resource_type="clinical_note",
        resource_id=note.id,
    )
    return note


async def list_clinical_notes(db: AsyncSession, clinic_id: str, patient_id: str) -> list[ClinicalNote]:
    await get_patient(db, clinic_id, patient_id)
    rows = (
        await db.execute(
            select(ClinicalNote)
            .where(ClinicalNote.clinic_id == clinic_id, ClinicalNote.patient_id == patient_id)
            .order_by(ClinicalNote.created_at.desc())
        )
    ).scalars().all()
    return list(rows)


async def create_consent(
    db: AsyncSession, clinic_id: str, actor_id: str, patient_id: str, data: ConsentCreate
) -> ConsentRecord:
    await get_patient(db, clinic_id, patient_id)
    consent = ConsentRecord(
        clinic_id=clinic_id,
        patient_id=patient_id,
        procedure_name=data.procedure_name,
        signature_data=data.signature_data,
        signed_by_name=data.signed_by_name,
        guardian=data.guardian,
        signed_at=datetime.now(UTC) if data.signature_data else None,
        document_hash=_hash_token(f"{patient_id}:{data.procedure_name}:{data.signature_data or ''}"),
    )
    db.add(consent)
    await db.flush()
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="create",
        resource_type="consent",
        resource_id=consent.id,
        after={
            "procedure_name": data.procedure_name,
            "signed_by_name": data.signed_by_name,
            "guardian": data.guardian,
            "has_signature": bool(data.signature_data),
            "document_hash": consent.document_hash,
        },
    )
    return consent


async def list_consents(db: AsyncSession, clinic_id: str, patient_id: str) -> list[ConsentRecord]:
    await get_patient(db, clinic_id, patient_id)
    rows = (
        await db.execute(
            select(ConsentRecord)
            .where(
                ConsentRecord.clinic_id == clinic_id,
                ConsentRecord.patient_id == patient_id,
            )
            .order_by(ConsentRecord.created_at.desc())
        )
    ).scalars().all()
    return list(rows)


async def create_treatment_plan(
    db: AsyncSession, clinic_id: str, actor_id: str, patient_id: str, data: TreatmentPlanCreate
) -> TreatmentPlan:
    await get_patient(db, clinic_id, patient_id)
    plan = TreatmentPlan(
        clinic_id=clinic_id,
        patient_id=patient_id,
        title=data.title,
        status="proposed",
        target_start_date=data.target_start_date,
        target_end_date=data.target_end_date,
        approval_notes=data.approval_notes,
    )
    db.add(plan)
    await db.flush()

    for item in data.items:
        icd10_code, icd10_description = _resolve_icd10(item.icd10_code, item.icd10_description)
        estimated_fee = round(item.estimated_fee, 2)
        insurance_estimate_amount = round(estimated_fee * (item.insurance_coverage_pct / 100), 2)
        patient_estimate_amount = round(max(estimated_fee - insurance_estimate_amount, 0), 2)
        db.add(
            TreatmentPlanItem(
                treatment_plan_id=plan.id,
                phase_name=item.phase_name,
                phase_order=item.phase_order,
                procedure_name=item.procedure_name,
                procedure_code=item.procedure_code,
                icd10_code=icd10_code,
                icd10_description=icd10_description,
                tooth_number=item.tooth_number,
                dependency_ref=item.dependency_ref,
                description=item.description,
                estimated_fee=estimated_fee,
                insurance_coverage_pct=item.insurance_coverage_pct,
                insurance_estimate_amount=insurance_estimate_amount,
                patient_estimate_amount=patient_estimate_amount,
                target_date=item.target_date,
                status=item.status,
                notes=item.notes,
            )
        )
    await db.flush()
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="create",
        resource_type="treatment_plan",
        resource_id=plan.id,
        after={"title": plan.title, "items": len(data.items)},
    )
    return await get_treatment_plan(db, clinic_id, plan.id)


async def list_treatment_plans(db: AsyncSession, clinic_id: str, patient_id: str) -> list[TreatmentPlan]:
    await get_patient(db, clinic_id, patient_id)
    rows = (
        await db.execute(
            select(TreatmentPlan)
            .options(selectinload(TreatmentPlan.items))
            .where(TreatmentPlan.clinic_id == clinic_id, TreatmentPlan.patient_id == patient_id)
            .order_by(TreatmentPlan.created_at.desc())
        )
    ).scalars().all()
    return list(rows)


async def get_treatment_plan(db: AsyncSession, clinic_id: str, plan_id: str) -> TreatmentPlan:
    plan = (
        await db.execute(
            select(TreatmentPlan)
            .options(selectinload(TreatmentPlan.items))
            .where(TreatmentPlan.id == plan_id, TreatmentPlan.clinic_id == clinic_id)
        )
    ).scalar_one_or_none()
    if not plan:
        raise NotFoundError("Treatment plan")
    return plan


async def update_treatment_plan(
    db: AsyncSession, clinic_id: str, actor_id: str, plan_id: str, data: TreatmentPlanUpdate
) -> TreatmentPlan:
    plan = await get_treatment_plan(db, clinic_id, plan_id)
    payload = data.model_dump(exclude_unset=True)

    if payload.get("status") == "accepted":
        plan.accepted_at = datetime.now(UTC)
    elif "status" in payload and payload["status"] != "accepted":
        plan.accepted_at = None
        plan.accepted_by_name = None

    for key, value in payload.items():
        setattr(plan, key, value)

    await db.flush()
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="update",
        resource_type="treatment_plan",
        resource_id=plan.id,
        after=payload,
    )
    return await get_treatment_plan(db, clinic_id, plan.id)


_VALID_PERIO_SITES = {"mb", "b", "db", "ml", "l", "dl"}


def _score_perio_exam(sites: list) -> tuple[str, int, float | None, float | None]:
    depths = [s.pocket_depth_mm for s in sites if s.pocket_depth_mm is not None]
    mean_pd = round(sum(depths) / len(depths), 2) if depths else None
    bleeding_pct = (
        round(100.0 * sum(1 for s in sites if s.bleeding_on_probing) / len(sites), 1) if sites else None
    )
    max_pd = max(depths) if depths else 0
    bop = bleeding_pct or 0.0
    avg = mean_pd or 0.0

    if max_pd >= 7 or avg >= 5 or bop >= 30:
        return "high", 3, mean_pd, bleeding_pct
    if max_pd >= 5 or avg >= 4 or bop >= 15:
        return "moderate", 4, mean_pd, bleeding_pct
    return "low", 6, mean_pd, bleeding_pct


async def create_perio_exam(
    db: AsyncSession, clinic_id: str, actor_id: str, patient_id: str, data: PerioExamCreate
) -> PerioExam:
    await get_patient(db, clinic_id, patient_id)
    seen: set[tuple[str, str]] = set()
    for site in data.sites:
        code = site.site_code.lower()
        if code not in _VALID_PERIO_SITES:
            raise ValidationAppError(f"Invalid perio site_code '{site.site_code}'")
        key = (site.tooth_number, code)
        if key in seen:
            raise ValidationAppError(f"Duplicate site {site.tooth_number}/{code}")
        seen.add(key)

    risk_band, recall, mean_pd, bleeding_pct = _score_perio_exam(data.sites)
    exam = PerioExam(
        clinic_id=clinic_id,
        patient_id=patient_id,
        examiner_id=actor_id,
        exam_date=data.exam_date or date.today(),
        notes=data.notes,
        risk_band=risk_band,
        suggested_recall_months=recall,
        mean_pocket_depth=mean_pd,
        bleeding_pct=bleeding_pct,
    )
    db.add(exam)
    await db.flush()

    for site in data.sites:
        db.add(
            PerioSite(
                exam_id=exam.id,
                tooth_number=site.tooth_number,
                site_code=site.site_code.lower(),
                pocket_depth_mm=site.pocket_depth_mm,
                bleeding_on_probing=site.bleeding_on_probing,
                recession_mm=site.recession_mm,
                plaque_index=site.plaque_index,
                gingival_index=site.gingival_index,
                mobility_grade=site.mobility_grade,
                furcation_grade=site.furcation_grade,
                notes=site.notes,
            )
        )
    await db.flush()

    # High/moderate risk → shorter hygiene recall due date on patient
    from datetime import timedelta as _td

    patient = await get_patient(db, clinic_id, patient_id)
    patient.perio_risk_band = risk_band
    patient.hygiene_recall_due = (data.exam_date or date.today()) + _td(days=30 * recall)

    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="create",
        resource_type="perio_exam",
        resource_id=exam.id,
        after={
            "risk_band": risk_band,
            "sites": len(data.sites),
            "suggested_recall_months": recall,
        },
    )
    return await get_perio_exam(db, clinic_id, exam.id)


async def list_perio_exams(db: AsyncSession, clinic_id: str, patient_id: str) -> list[PerioExam]:
    await get_patient(db, clinic_id, patient_id)
    rows = (
        await db.execute(
            select(PerioExam)
            .options(selectinload(PerioExam.sites))
            .where(PerioExam.clinic_id == clinic_id, PerioExam.patient_id == patient_id)
            .order_by(PerioExam.exam_date.desc(), PerioExam.created_at.desc())
        )
    ).scalars().all()
    return list(rows)


async def get_perio_exam(db: AsyncSession, clinic_id: str, exam_id: str) -> PerioExam:
    exam = (
        await db.execute(
            select(PerioExam)
            .options(selectinload(PerioExam.sites))
            .where(PerioExam.id == exam_id, PerioExam.clinic_id == clinic_id)
        )
    ).scalar_one_or_none()
    if not exam:
        raise NotFoundError("Perio exam")
    return exam


async def perio_exam_to_treatment_plan(
    db: AsyncSession, clinic_id: str, actor_id: str, exam_id: str
) -> TreatmentPlan:
    exam = await get_perio_exam(db, clinic_id, exam_id)
    elevated: dict[str, int] = {}
    for site in exam.sites:
        pd = site.pocket_depth_mm or 0
        if pd >= 5 or site.bleeding_on_probing:
            elevated[site.tooth_number] = max(elevated.get(site.tooth_number, 0), pd)

    if not elevated:
        raise ValidationAppError("No elevated perio sites to convert (PD≥5 or bleeding)")

    items = [
        TreatmentPlanItemCreate(
            phase_name="Periodontal therapy",
            phase_order=1,
            procedure_name=f"Scaling & root planing — tooth {tooth}",
            procedure_code="D4341",
            tooth_number=tooth,
            description=f"Deep pockets up to {max_pd} mm from perio exam {exam.exam_date.isoformat()}",
            estimated_fee=185.0,
            insurance_coverage_pct=50.0,
            status="proposed",
            notes=f"Auto-generated from perio exam {exam.id[:8]}",
        )
        for tooth, max_pd in sorted(elevated.items())
    ]
    if exam.risk_band == "high":
        items.insert(
            0,
            TreatmentPlanItemCreate(
                phase_name="Periodontal therapy",
                phase_order=1,
                procedure_name="Periodontal maintenance / hygiene recall",
                procedure_code="D4910",
                description=f"Suggested {exam.suggested_recall_months}-month recall (risk: {exam.risk_band})",
                estimated_fee=120.0,
                insurance_coverage_pct=60.0,
                status="proposed",
            ),
        )

    plan = await create_treatment_plan(
        db,
        clinic_id,
        actor_id,
        exam.patient_id,
        TreatmentPlanCreate(
            title=f"Perio therapy — {exam.exam_date.isoformat()}",
            approval_notes=f"Generated from perio exam (risk {exam.risk_band}, BOP {exam.bleeding_pct or 0}%)",
            items=items,
        ),
    )
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="convert",
        resource_type="perio_exam",
        resource_id=exam.id,
        after={"treatment_plan_id": plan.id, "teeth": list(elevated.keys())},
    )
    return plan


# ── Clinical visits / examination ─────────────────────
def _resolve_icd10(
    code: str | None, description: str | None = None
) -> tuple[str | None, str | None]:
    """Validate ICD-10 against dental K00–K14 catalog; fill description when missing."""
    if not code or not str(code).strip():
        return None, None
    from app.clinical.icd10 import get_code, is_dental_oral_code, normalize_code

    normalized = normalize_code(code)
    if not is_dental_oral_code(normalized):
        raise ValidationAppError(
            f"ICD-10 code {code} is outside dental block K00–K14",
            details=[{"field": "icd10_code", "message": "Must be K00–K14"}],
        )
    row = get_code(normalized)
    if not row:
        raise ValidationAppError(
            f"Unknown ICD-10 dental code: {code}",
            details=[{"field": "icd10_code", "message": "Not found in K00–K14 catalog"}],
        )
    return row["code"], description or row["description"]


def _normalize_visit_diagnosis(diagnosis) -> None:
    if diagnosis is None or not getattr(diagnosis, "icd10_codes", None):
        return
    from app.schemas.exam import Icd10CodeRef

    resolved: list[Icd10CodeRef] = []
    for ref in diagnosis.icd10_codes:
        code, desc = _resolve_icd10(ref.code, ref.description)
        if code and desc:
            resolved.append(Icd10CodeRef(code=code, description=desc))
    diagnosis.icd10_codes = resolved


async def create_clinical_visit(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    patient_id: str,
    data: ClinicalVisitCreate,
) -> ClinicalVisit:
    from app.schemas.clerkship import dumps_block

    patient = await get_patient(db, clinic_id, patient_id)
    _normalize_visit_diagnosis(data.diagnosis)
    visit = ClinicalVisit(
        clinic_id=clinic_id,
        patient_id=patient_id,
        appointment_id=data.appointment_id,
        examiner_id=actor_id,
        visit_date=data.visit_date or date.today(),
        status=data.status or "in_progress",
        chief_complaint=data.chief_complaint or patient.chief_complaint,
        vitals_json=dumps_block(data.vitals),
        extra_oral_json=dumps_block(data.extra_oral),
        intra_oral_json=dumps_block(data.intra_oral),
        investigations_json=dumps_block(data.investigations),
        diagnosis_json=dumps_block(data.diagnosis),
        notes=data.notes,
    )
    db.add(visit)
    await db.flush()
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="create",
        resource_type="clinical_visit",
        resource_id=visit.id,
        after={"visit_date": visit.visit_date.isoformat(), "status": visit.status},
    )
    return visit


async def list_clinical_visits(
    db: AsyncSession, clinic_id: str, patient_id: str
) -> list[ClinicalVisit]:
    await get_patient(db, clinic_id, patient_id)
    return list(
        (
            await db.execute(
                select(ClinicalVisit)
                .where(
                    ClinicalVisit.clinic_id == clinic_id,
                    ClinicalVisit.patient_id == patient_id,
                )
                .order_by(ClinicalVisit.visit_date.desc(), ClinicalVisit.created_at.desc())
            )
        )
        .scalars()
        .all()
    )


async def get_clinical_visit(db: AsyncSession, clinic_id: str, visit_id: str) -> ClinicalVisit:
    visit = (
        await db.execute(
            select(ClinicalVisit).where(
                ClinicalVisit.id == visit_id,
                ClinicalVisit.clinic_id == clinic_id,
            )
        )
    ).scalar_one_or_none()
    if not visit:
        raise NotFoundError("Clinical visit")
    return visit


async def update_clinical_visit(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    visit_id: str,
    data: ClinicalVisitUpdate,
) -> ClinicalVisit:
    from app.schemas.clerkship import dumps_block

    visit = await get_clinical_visit(db, clinic_id, visit_id)
    if data.diagnosis is not None:
        _normalize_visit_diagnosis(data.diagnosis)
    raw = data.model_dump(exclude_unset=True)
    for block_key, json_attr in (
        ("vitals", "vitals_json"),
        ("extra_oral", "extra_oral_json"),
        ("intra_oral", "intra_oral_json"),
        ("investigations", "investigations_json"),
        ("diagnosis", "diagnosis_json"),
    ):
        if block_key in raw:
            block = raw.pop(block_key)
            setattr(visit, json_attr, dumps_block(block))

    for k, v in raw.items():
        setattr(visit, k, v)

    await db.flush()
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="update",
        resource_type="clinical_visit",
        resource_id=visit.id,
        after=data.model_dump(exclude_unset=True, mode="json"),
    )
    return visit


DEFAULT_FEE_SCHEDULE: list[tuple[str, str, str, float, bool]] = [
    ("consultation", "Consultation", "general", 45.0, True),
    ("cleaning", "Prophylaxis / cleaning", "hygiene", 90.0, True),
    ("filling", "Filling (composite/amalgam)", "restorative", 120.0, True),
    ("crown", "Crown", "restorative", 800.0, True),
    ("rct", "Root canal treatment", "endodontic", 450.0, True),
    ("extraction", "Simple extraction", "surgery", 180.0, True),
    ("caries", "Caries (charting only)", "diagnostic", 0.0, False),
    ("missing", "Missing tooth (charting)", "diagnostic", 0.0, False),
    ("sound", "Sound tooth", "diagnostic", 0.0, False),
    ("planned", "Planned treatment", "diagnostic", 0.0, False),
]


async def ensure_fee_schedule(db: AsyncSession, clinic_id: str) -> None:
    count = (
        await db.execute(
            select(func.count())
            .select_from(FeeScheduleItem)
            .where(FeeScheduleItem.clinic_id == clinic_id)
        )
    ).scalar_one()
    if count:
        return
    for code, label, category, price, billable in DEFAULT_FEE_SCHEDULE:
        db.add(
            FeeScheduleItem(
                clinic_id=clinic_id,
                code=code,
                label=label,
                category=category,
                unit_price=price,
                billable=billable,
                is_active=True,
            )
        )
    await db.flush()


async def list_fee_schedule(db: AsyncSession, clinic_id: str) -> list[FeeScheduleItem]:
    await ensure_fee_schedule(db, clinic_id)
    return list(
        (
            await db.execute(
                select(FeeScheduleItem)
                .where(FeeScheduleItem.clinic_id == clinic_id)
                .order_by(FeeScheduleItem.category, FeeScheduleItem.code)
            )
        )
        .scalars()
        .all()
    )


async def upsert_fee_item(
    db: AsyncSession, clinic_id: str, actor_id: str, data: FeeScheduleItemCreate
) -> FeeScheduleItem:
    existing = (
        await db.execute(
            select(FeeScheduleItem).where(
                FeeScheduleItem.clinic_id == clinic_id,
                FeeScheduleItem.code == data.code.strip().lower(),
            )
        )
    ).scalar_one_or_none()
    if existing:
        existing.label = data.label
        existing.category = data.category
        existing.unit_price = data.unit_price
        existing.currency = data.currency
        existing.is_active = data.is_active
        existing.billable = data.billable
        existing.notes = data.notes
        item = existing
        action = "update"
    else:
        item = FeeScheduleItem(
            clinic_id=clinic_id,
            code=data.code.strip().lower(),
            label=data.label,
            category=data.category,
            unit_price=data.unit_price,
            currency=data.currency,
            is_active=data.is_active,
            billable=data.billable,
            notes=data.notes,
        )
        db.add(item)
        action = "create"
    await db.flush()
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action=action,
        resource_type="fee_schedule_item",
        resource_id=item.id,
        after={"code": item.code, "unit_price": item.unit_price},
    )
    return item


async def update_fee_item(
    db: AsyncSession,
    clinic_id: str,
    actor_id: str,
    item_id: str,
    data: FeeScheduleItemUpdate,
) -> FeeScheduleItem:
    item = (
        await db.execute(
            select(FeeScheduleItem).where(
                FeeScheduleItem.id == item_id,
                FeeScheduleItem.clinic_id == clinic_id,
            )
        )
    ).scalar_one_or_none()
    if not item:
        raise NotFoundError("Fee schedule item")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(item, k, v)
    await db.flush()
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="update",
        resource_type="fee_schedule_item",
        resource_id=item.id,
        after=data.model_dump(exclude_unset=True),
    )
    return item


async def _fee_map(db: AsyncSession, clinic_id: str) -> dict[str, FeeScheduleItem]:
    items = await list_fee_schedule(db, clinic_id)
    return {i.code.lower(): i for i in items if i.is_active}


async def list_billable_chart_entries(
    db: AsyncSession, clinic_id: str, patient_id: str
) -> list[dict]:
    """Unbilled chart work that maps to a billable fee schedule code."""
    await get_patient(db, clinic_id, patient_id)
    fees = await _fee_map(db, clinic_id)
    rows = (
        await db.execute(
            select(DentalChartEntry)
            .where(
                DentalChartEntry.clinic_id == clinic_id,
                DentalChartEntry.patient_id == patient_id,
                DentalChartEntry.billed_invoice_id.is_(None),
                DentalChartEntry.entry_kind == "existing",
            )
            .order_by(DentalChartEntry.created_at.desc())
        )
    ).scalars().all()

    out: list[dict] = []
    for entry in rows:
        fee = fees.get(entry.condition_code.lower())
        if not fee or not fee.billable or fee.unit_price <= 0:
            continue
        out.append(
            {
                "id": entry.id,
                "patient_id": entry.patient_id,
                "tooth_number": entry.tooth_number,
                "surfaces": entry.surfaces,
                "condition_code": entry.condition_code,
                "condition_label": entry.condition_label,
                "entry_kind": entry.entry_kind,
                "status": entry.status,
                "material": entry.material,
                "unit_price": fee.unit_price,
                "fee_label": fee.label,
                "billed_invoice_id": entry.billed_invoice_id,
                "created_at": entry.created_at,
            }
        )
    return out


async def chart_to_cash(
    db: AsyncSession, clinic_id: str, actor_id: str, data: ChartToCashRequest
) -> Invoice:
    """Create an invoice from unbilled odontogram chart entries (no re-entry)."""
    await get_patient(db, clinic_id, data.patient_id)
    if data.idempotency_key:
        existing = (
            await db.execute(select(Invoice).where(Invoice.idempotency_key == data.idempotency_key))
        ).scalar_one_or_none()
        if existing:
            return existing

    billable = await list_billable_chart_entries(db, clinic_id, data.patient_id)
    if data.chart_entry_ids is not None:
        wanted = set(data.chart_entry_ids)
        billable = [b for b in billable if b["id"] in wanted]
        missing = wanted - {b["id"] for b in billable}
        if missing:
            raise ValidationAppError(
                "Some chart entries are not billable or already billed",
                details=[{"chart_entry_ids": sorted(missing)}],
            )
    if not billable:
        raise ValidationAppError("No unbilled chart procedures to invoice")

    from app.schemas import InvoiceLineCreate as ILC

    line_items = [
        ILC(
            description=f"{b['fee_label'] or b['condition_label']} — tooth {b['tooth_number']}"
            + (f" ({b['surfaces']})" if b.get("surfaces") else ""),
            tooth_number=b["tooth_number"],
            quantity=1,
            unit_price=float(b["unit_price"]),
            procedure_code=b["condition_code"],
            chart_entry_id=b["id"],
        )
        for b in billable
    ]

    invoice = await create_invoice(
        db,
        clinic_id,
        actor_id,
        InvoiceCreate(
            patient_id=data.patient_id,
            line_items=line_items,
            tax=data.tax,
            discount=data.discount,
            notes=data.notes or "Chart-to-Cash from odontogram",
            idempotency_key=data.idempotency_key,
        ),
    )

    for b in billable:
        entry = (
            await db.execute(
                select(DentalChartEntry).where(
                    DentalChartEntry.id == b["id"],
                    DentalChartEntry.clinic_id == clinic_id,
                )
            )
        ).scalar_one()
        entry.billed_invoice_id = invoice.id
        entry.status = "billed"
    await db.flush()
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="chart_to_cash",
        resource_type="invoice",
        resource_id=invoice.id,
        after={"entries": [b["id"] for b in billable], "total": invoice.total},
    )
    return await get_invoice(db, clinic_id, invoice.id)


# ── Billing ───────────────────────────────────────────
async def next_invoice_number(db: AsyncSession, clinic_id: str) -> str:
    count = (
        await db.execute(select(func.count()).select_from(Invoice).where(Invoice.clinic_id == clinic_id))
    ).scalar_one()
    return f"INV-{datetime.now(UTC).year}-{count + 1:05d}"


async def create_invoice(db: AsyncSession, clinic_id: str, actor_id: str, data: InvoiceCreate) -> Invoice:
    await get_patient(db, clinic_id, data.patient_id)
    if data.idempotency_key:
        existing = (
            await db.execute(select(Invoice).where(Invoice.idempotency_key == data.idempotency_key))
        ).scalar_one_or_none()
        if existing:
            return existing

    subtotal = sum(li.quantity * li.unit_price for li in data.line_items)
    total = max(subtotal + data.tax - data.discount, 0)
    invoice = Invoice(
        clinic_id=clinic_id,
        patient_id=data.patient_id,
        invoice_number=await next_invoice_number(db, clinic_id),
        status=InvoiceStatus.ISSUED,
        issued_at=datetime.now(UTC),
        subtotal=subtotal,
        tax=data.tax,
        discount=data.discount,
        total=total,
        notes=data.notes,
        idempotency_key=data.idempotency_key,
    )
    db.add(invoice)
    await db.flush()
    for li in data.line_items:
        db.add(
            InvoiceLineItem(
                invoice_id=invoice.id,
                description=li.description,
                tooth_number=li.tooth_number,
                quantity=li.quantity,
                unit_price=li.unit_price,
                total=li.quantity * li.unit_price,
                procedure_code=li.procedure_code,
                chart_entry_id=getattr(li, "chart_entry_id", None),
            )
        )
    await db.flush()
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=actor_id,
        action="create",
        resource_type="invoice",
        resource_id=invoice.id,
        after={"total": total},
    )
    return await get_invoice(db, clinic_id, invoice.id)


async def get_invoice(db: AsyncSession, clinic_id: str, invoice_id: str) -> Invoice:
    inv = (
        await db.execute(
            select(Invoice)
            .options(selectinload(Invoice.line_items), selectinload(Invoice.payments))
            .where(Invoice.id == invoice_id, Invoice.clinic_id == clinic_id)
        )
    ).scalar_one_or_none()
    if not inv:
        raise NotFoundError("Invoice")
    return inv


async def list_invoices(
    db: AsyncSession,
    clinic_id: str,
    patient_id: str | None = None,
    *,
    outstanding_only: bool = False,
) -> list[Invoice]:
    stmt = (
        select(Invoice)
        .options(
            selectinload(Invoice.line_items),
            selectinload(Invoice.payments),
            selectinload(Invoice.patient),
        )
        .where(Invoice.clinic_id == clinic_id)
    )
    if patient_id:
        stmt = stmt.where(Invoice.patient_id == patient_id)
    if outstanding_only:
        stmt = stmt.where(
            Invoice.status.in_([InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID])
        )
    rows = (await db.execute(stmt.order_by(Invoice.created_at.desc()))).scalars().all()
    return list(rows)


def aging_bucket(days: int) -> str:
    if days <= 30:
        return "0_30"
    if days <= 60:
        return "31_60"
    if days <= 90:
        return "61_90"
    return "90_plus"


async def list_outstanding_invoices(db: AsyncSession, clinic_id: str) -> list[dict]:
    rows = await list_invoices(db, clinic_id, outstanding_only=True)
    now = datetime.now(UTC)
    out: list[dict] = []
    for inv in rows:
        balance = float(inv.total) - float(inv.amount_paid)
        if balance <= 0.001:
            continue
        issued = inv.issued_at or inv.created_at
        days = (now - issued).days if issued else 0
        patient = inv.patient
        out.append(
            {
                "id": inv.id,
                "invoice_number": inv.invoice_number,
                "patient_id": inv.patient_id,
                "patient_name": (
                    f"{patient.first_name} {patient.last_name}" if patient else "Patient"
                ),
                "patient_code": patient.patient_code if patient else "",
                "total": float(inv.total),
                "amount_paid": float(inv.amount_paid),
                "balance": balance,
                "status": inv.status,
                "issued_at": issued,
                "days_outstanding": days,
                "aging_bucket": aging_bucket(days),
                "currency": inv.currency,
            }
        )
    out.sort(key=lambda r: (-r["days_outstanding"], -r["balance"]))
    return out


async def daily_cash_up(db: AsyncSession, clinic_id: str, on_date: date | None = None) -> dict:
    day = on_date or datetime.now(UTC).date()
    day_start = datetime(day.year, day.month, day.day, tzinfo=UTC)
    day_end = day_start + timedelta(days=1)
    rows = (
        await db.execute(
            select(Payment).where(
                Payment.clinic_id == clinic_id,
                Payment.paid_at >= day_start,
                Payment.paid_at < day_end,
            )
        )
    ).scalars().all()
    by_method: dict[str, float] = {}
    total = 0.0
    for p in rows:
        method = p.method or "other"
        by_method[method] = by_method.get(method, 0.0) + float(p.amount)
        total += float(p.amount)
    return {
        "date": day.isoformat(),
        "total": total,
        "by_method": by_method,
        "payment_count": len(rows),
    }


async def tooth_history(
    db: AsyncSession, clinic_id: str, patient_id: str, tooth_number: str
) -> dict:
    await get_patient(db, clinic_id, patient_id)
    tooth = tooth_number.strip()
    events: list[dict] = []

    chart_rows = (
        await db.execute(
            select(DentalChartEntry).where(
                DentalChartEntry.clinic_id == clinic_id,
                DentalChartEntry.patient_id == patient_id,
                DentalChartEntry.tooth_number == tooth,
            )
        )
    ).scalars().all()
    for c in chart_rows:
        when = datetime.combine(c.visit_date, datetime.min.time(), tzinfo=UTC) if c.visit_date else c.created_at
        events.append(
            {
                "kind": "chart",
                "id": c.id,
                "occurred_at": when,
                "summary": f"{c.condition_label}"
                + (f" ({c.surfaces})" if c.surfaces else "")
                + f" · {c.entry_kind}",
                "status": c.status,
                "details": {
                    "condition_code": c.condition_code,
                    "material": c.material,
                    "shade": c.shade,
                    "surfaces": c.surfaces,
                },
            }
        )

    resto_rows = (
        await db.execute(
            select(Restoration).where(
                Restoration.clinic_id == clinic_id,
                Restoration.patient_id == patient_id,
                Restoration.tooth_number == tooth,
            )
        )
    ).scalars().all()
    for r in resto_rows:
        events.append(
            {
                "kind": "restoration",
                "id": r.id,
                "occurred_at": r.created_at,
                "summary": f"{r.restoration_type}"
                + (f" · {r.surfaces}" if r.surfaces else "")
                + (f" · {r.material}" if r.material else ""),
                "status": r.status,
                "details": {
                    "cavity_size": r.cavity_size,
                    "blacks_class": r.blacks_class,
                    "shade": r.shade,
                },
            }
        )

    endo_rows = (
        await db.execute(
            select(EndoCase).where(
                EndoCase.clinic_id == clinic_id,
                EndoCase.patient_id == patient_id,
                EndoCase.tooth_number == tooth,
            )
        )
    ).scalars().all()
    for e in endo_rows:
        events.append(
            {
                "kind": "endo",
                "id": e.id,
                "occurred_at": e.created_at,
                "summary": f"{e.procedure_type}"
                + (f" · WL {e.working_length_mm}mm" if e.working_length_mm else ""),
                "status": e.status,
                "details": {
                    "canal_count": e.canal_count,
                    "prep_method": e.prep_method,
                },
            }
        )

    events.sort(key=lambda ev: ev["occurred_at"] or datetime.min.replace(tzinfo=UTC), reverse=True)
    return {"tooth_number": tooth, "events": events}


async def add_payment(
    db: AsyncSession, clinic_id: str, actor_id: str, invoice_id: str, data: PaymentCreate
) -> Invoice:
    invoice = await get_invoice(db, clinic_id, invoice_id)
    if data.idempotency_key:
        existing = (
            await db.execute(select(Payment).where(Payment.idempotency_key == data.idempotency_key))
        ).scalar_one_or_none()
        if existing:
            return await get_invoice(db, clinic_id, invoice_id)

    remaining = invoice.total - invoice.amount_paid
    if data.amount > remaining + 0.001:
        raise ValidationAppError("Payment exceeds outstanding balance")

    payment = Payment(
        clinic_id=clinic_id,
        invoice_id=invoice.id,
        amount=data.amount,
        method=data.method,
        reference=data.reference,
        received_by_id=actor_id,
        idempotency_key=data.idempotency_key,
    )
    db.add(payment)
    invoice.amount_paid += data.amount
    if invoice.amount_paid >= invoice.total:
        invoice.status = InvoiceStatus.PAID
    elif invoice.amount_paid > 0:
        invoice.status = InvoiceStatus.PARTIALLY_PAID
    await db.flush()
    return await get_invoice(db, clinic_id, invoice_id)


# ── Dashboard ─────────────────────────────────────────
async def dashboard_stats(db: AsyncSession, clinic_id: str) -> dict:
    today = datetime.now(UTC).date()
    day_start = datetime.combine(today, datetime.min.time(), tzinfo=UTC)
    day_end = day_start + timedelta(days=1)
    month_start = day_start.replace(day=1)
    week_start = day_start - timedelta(days=7)

    patients_total = (
        await db.execute(
            select(func.count()).select_from(Patient).where(
                Patient.clinic_id == clinic_id, Patient.is_active.is_(True)
            )
        )
    ).scalar_one()

    appointments_today = (
        await db.execute(
            select(func.count()).select_from(Appointment).where(
                Appointment.clinic_id == clinic_id,
                Appointment.starts_at >= day_start,
                Appointment.starts_at < day_end,
                Appointment.status != AppointmentStatus.CANCELLED,
            )
        )
    ).scalar_one()

    revenue_month = (
        await db.execute(
            select(func.coalesce(func.sum(Payment.amount), 0.0)).where(
                Payment.clinic_id == clinic_id,
                Payment.paid_at >= month_start,
            )
        )
    ).scalar_one()

    no_shows_week = (
        await db.execute(
            select(func.count()).select_from(Appointment).where(
                Appointment.clinic_id == clinic_id,
                Appointment.no_show.is_(True),
                Appointment.starts_at >= week_start,
            )
        )
    ).scalar_one()

    open_invoices = (
        await db.execute(
            select(func.count()).select_from(Invoice).where(
                Invoice.clinic_id == clinic_id,
                Invoice.status.in_([InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID]),
            )
        )
    ).scalar_one()

    caries_high_risk = (
        await db.execute(
            select(func.count()).select_from(Patient).where(
                Patient.clinic_id == clinic_id,
                Patient.caries_risk_score >= 0.6,
            )
        )
    ).scalar_one()

    return {
        "patients_total": patients_total,
        "appointments_today": appointments_today,
        "revenue_month": float(revenue_month or 0),
        "no_shows_week": no_shows_week,
        "open_invoices": open_invoices,
        "caries_high_risk": caries_high_risk,
    }


def create_user(
    clinic_id: str | None,
    *,
    email: str,
    password: str,
    full_name: str,
    role: str,
    phone: str | None = None,
    specialty: str | None = None,
) -> User:
    role_value = role.value if hasattr(role, "value") else str(role)
    return User(
        clinic_id=clinic_id,
        email=email.lower(),
        hashed_password=hash_password(password),
        full_name=full_name,
        role=role_value,
        phone=phone,
        specialty=specialty,
    )
