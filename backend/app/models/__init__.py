from datetime import UTC, date, datetime
from enum import StrEnum
from typing import Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base, TenantMixin, TimestampMixin, UUIDPrimaryKeyMixin


class AppointmentStatus(StrEnum):
    SCHEDULED = "scheduled"
    CONFIRMED = "confirmed"
    CHECKED_IN = "checked_in"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    NO_SHOW = "no_show"


class ProcedureCategory(StrEnum):
    CONSULTATION = "consultation"
    CLEANING = "cleaning"
    FILLING = "filling"
    EXTRACTION = "extraction"
    ROOT_CANAL = "root_canal"
    CROWN = "crown"
    IMPLANT = "implant"
    ORTHODONTICS = "orthodontics"
    PERIODONTAL = "periodontal"
    SURGERY = "surgery"
    OTHER = "other"


class InvoiceStatus(StrEnum):
    DRAFT = "draft"
    ISSUED = "issued"
    PARTIALLY_PAID = "partially_paid"
    PAID = "paid"
    VOID = "void"
    REFUNDED = "refunded"


class PaymentMethod(StrEnum):
    CASH = "cash"
    CARD = "card"
    MOBILE_MONEY = "mobile_money"
    BANK_TRANSFER = "bank_transfer"
    INSURANCE = "insurance"


class LabCaseStatus(StrEnum):
    DRAFT = "draft"
    SENT = "sent"
    IN_PROGRESS = "in_progress"
    RECEIVED = "received"
    FITTED = "fitted"
    CANCELLED = "cancelled"


class PrescriptionStatus(StrEnum):
    DRAFT = "draft"
    ACTIVE = "active"
    DISPENSED = "dispensed"
    CANCELLED = "cancelled"


class Clinic(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "clinics"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    address: Mapped[Optional[str]] = mapped_column(String(500))
    phone: Mapped[Optional[str]] = mapped_column(String(40))
    email: Mapped[Optional[str]] = mapped_column(String(200))
    timezone: Mapped[str] = mapped_column(String(64), default="UTC")
    currency: Mapped[str] = mapped_column(String(8), default="USD")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    users: Mapped[list["User"]] = relationship(back_populates="clinic")
    patients: Mapped[list["Patient"]] = relationship(back_populates="clinic")


class User(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Staff user. Platform super_admin may have clinic_id=NULL."""

    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("clinic_id", "email", name="uq_users_clinic_email"),)

    clinic_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("clinics.id", ondelete="CASCADE"),
        index=True,
        nullable=True,
    )
    email: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    phone: Mapped[Optional[str]] = mapped_column(String(40))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    mfa_secret: Mapped[Optional[str]] = mapped_column(String(64))
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    specialty: Mapped[Optional[str]] = mapped_column(String(120))
    license_number: Mapped[Optional[str]] = mapped_column(String(80))

    clinic: Mapped[Optional["Clinic"]] = relationship(back_populates="users")
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(back_populates="user")
    staff_profile: Mapped[Optional["StaffProfile"]] = relationship(
        back_populates="user", uselist=False
    )


class RefreshToken(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "refresh_tokens"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    user_agent: Mapped[Optional[str]] = mapped_column(String(400))
    ip_address: Mapped[Optional[str]] = mapped_column(String(64))

    user: Mapped["User"] = relationship(back_populates="refresh_tokens")


class Patient(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "patients"
    __table_args__ = (UniqueConstraint("clinic_id", "patient_code", name="uq_patients_clinic_code"),)

    patient_code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    hospital_reg_number: Mapped[Optional[str]] = mapped_column(String(64), index=True)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    date_of_birth: Mapped[Optional[date]] = mapped_column(Date)
    sex: Mapped[Optional[str]] = mapped_column(String(20))
    marital_status: Mapped[Optional[str]] = mapped_column(String(32))
    occupation: Mapped[Optional[str]] = mapped_column(String(120))
    tribe_nation: Mapped[Optional[str]] = mapped_column(String(120))
    phone: Mapped[Optional[str]] = mapped_column(String(40), index=True)
    email: Mapped[Optional[str]] = mapped_column(String(200))
    # Legacy free-text address kept; structured clerkship address below
    address: Mapped[Optional[str]] = mapped_column(String(500))
    po_box: Mapped[Optional[str]] = mapped_column(String(80))
    street: Mapped[Optional[str]] = mapped_column(String(200))
    house_number: Mapped[Optional[str]] = mapped_column(String(40))
    area_ward: Mapped[Optional[str]] = mapped_column(String(120))
    town_city: Mapped[Optional[str]] = mapped_column(String(120))
    emergency_contact_name: Mapped[Optional[str]] = mapped_column(String(200))
    emergency_contact_phone: Mapped[Optional[str]] = mapped_column(String(40))
    next_of_kin: Mapped[Optional[str]] = mapped_column(String(200))
    referral_source: Mapped[Optional[str]] = mapped_column(String(200))
    insurance_number: Mapped[Optional[str]] = mapped_column(String(80), index=True)
    chief_complaint: Mapped[Optional[str]] = mapped_column(Text)
    allergies: Mapped[Optional[str]] = mapped_column(Text)
    chronic_conditions: Mapped[Optional[str]] = mapped_column(Text)
    current_medications: Mapped[Optional[str]] = mapped_column(Text)
    dental_history: Mapped[Optional[str]] = mapped_column(Text)
    family_social_history: Mapped[Optional[str]] = mapped_column(Text)
    developmental_history: Mapped[Optional[str]] = mapped_column(Text)
    pregnancy_trimester: Mapped[Optional[int]] = mapped_column(Integer)  # 1 | 2 | 3
    medical_history_json: Mapped[Optional[str]] = mapped_column(Text)  # checkbox flags
    pain_assessment_json: Mapped[Optional[str]] = mapped_column(Text)
    reported_symptoms_json: Mapped[Optional[str]] = mapped_column(Text)
    caries_risk_score: Mapped[Optional[float]] = mapped_column(Float)
    hygiene_recall_due: Mapped[Optional[date]] = mapped_column(Date)
    perio_risk_band: Mapped[Optional[str]] = mapped_column(String(32))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    clinic: Mapped["Clinic"] = relationship(back_populates="patients")
    appointments: Mapped[list["Appointment"]] = relationship(back_populates="patient")
    chart_entries: Mapped[list["DentalChartEntry"]] = relationship(back_populates="patient")
    clinical_notes: Mapped[list["ClinicalNote"]] = relationship(back_populates="patient")
    treatment_plans: Mapped[list["TreatmentPlan"]] = relationship(back_populates="patient")
    perio_exams: Mapped[list["PerioExam"]] = relationship(back_populates="patient")
    invoices: Mapped[list["Invoice"]] = relationship(back_populates="patient")
    consents: Mapped[list["ConsentRecord"]] = relationship(back_populates="patient")
    visits: Mapped[list["ClinicalVisit"]] = relationship(back_populates="patient")


class AppointmentType(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "appointment_types"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    category: Mapped[str] = mapped_column(String(40), default=ProcedureCategory.CONSULTATION)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=30)
    color: Mapped[str] = mapped_column(String(16), default="#1E6BFF")
    default_fee: Mapped[float] = mapped_column(Float, default=0.0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Appointment(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "appointments"

    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), index=True)
    dentist_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    appointment_type_id: Mapped[Optional[str]] = mapped_column(ForeignKey("appointment_types.id"))
    chair_number: Mapped[Optional[int]] = mapped_column(Integer)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default=AppointmentStatus.SCHEDULED, index=True)
    reason: Mapped[Optional[str]] = mapped_column(String(400))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    is_recurring: Mapped[bool] = mapped_column(Boolean, default=False)
    recurrence_rule: Mapped[Optional[str]] = mapped_column(String(120))
    waitlist: Mapped[bool] = mapped_column(Boolean, default=False)
    no_show: Mapped[bool] = mapped_column(Boolean, default=False)
    color: Mapped[Optional[str]] = mapped_column(String(16))

    patient: Mapped["Patient"] = relationship(back_populates="appointments")
    dentist: Mapped["User"] = relationship(foreign_keys=[dentist_id])
    appointment_type: Mapped[Optional["AppointmentType"]] = relationship()


class DentalChartEntry(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    """Per-tooth / per-surface odontogram entry (existing vs planned)."""

    __tablename__ = "dental_chart_entries"

    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), index=True)
    tooth_number: Mapped[str] = mapped_column(String(8), nullable=False)  # FDI e.g. 36
    surfaces: Mapped[Optional[str]] = mapped_column(String(16))  # e.g. MOD
    notation: Mapped[str] = mapped_column(String(20), default="FDI")  # FDI | Universal
    dentition: Mapped[str] = mapped_column(String(20), default="permanent")  # permanent | primary
    condition_code: Mapped[str] = mapped_column(String(40), nullable=False)
    condition_label: Mapped[str] = mapped_column(String(120), nullable=False)
    entry_kind: Mapped[str] = mapped_column(String(20), default="existing")  # existing | planned
    status: Mapped[str] = mapped_column(String(32), default="recorded")
    material: Mapped[Optional[str]] = mapped_column(String(80))
    shade: Mapped[Optional[str]] = mapped_column(String(40))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    recorded_by_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"))
    visit_date: Mapped[Optional[date]] = mapped_column(Date)
    billed_invoice_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("invoices.id"), index=True, nullable=True
    )

    patient: Mapped["Patient"] = relationship(back_populates="chart_entries")


class ClinicalNote(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "clinical_notes"

    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), index=True)
    author_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    appointment_id: Mapped[Optional[str]] = mapped_column(ForeignKey("appointments.id"))
    note_type: Mapped[str] = mapped_column(String(40), default="progress")  # soap | progress | progress
    subjective: Mapped[Optional[str]] = mapped_column(Text)
    objective: Mapped[Optional[str]] = mapped_column(Text)
    assessment: Mapped[Optional[str]] = mapped_column(Text)
    plan: Mapped[Optional[str]] = mapped_column(Text)
    procedure_codes: Mapped[Optional[str]] = mapped_column(String(200))
    is_finalized: Mapped[bool] = mapped_column(Boolean, default=False)
    ai_draft: Mapped[bool] = mapped_column(Boolean, default=False)

    patient: Mapped["Patient"] = relationship(back_populates="clinical_notes")
    author: Mapped["User"] = relationship()


class ConsentRecord(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "consent_records"

    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), index=True)
    procedure_name: Mapped[str] = mapped_column(String(200), nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1)
    signature_data: Mapped[Optional[str]] = mapped_column(Text)  # base64 or hash ref
    signed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    signed_by_name: Mapped[Optional[str]] = mapped_column(String(200))
    guardian: Mapped[bool] = mapped_column(Boolean, default=False)
    document_hash: Mapped[Optional[str]] = mapped_column(String(128))

    patient: Mapped["Patient"] = relationship(back_populates="consents")


class PerioExam(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    """Periodontal exam session with nested 6-site readings per tooth."""

    __tablename__ = "perio_exams"

    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), index=True)
    examiner_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"), index=True)
    exam_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    risk_band: Mapped[str] = mapped_column(String(20), default="low")  # low | moderate | high
    suggested_recall_months: Mapped[int] = mapped_column(Integer, default=6)
    mean_pocket_depth: Mapped[Optional[float]] = mapped_column(Float)
    bleeding_pct: Mapped[Optional[float]] = mapped_column(Float)

    patient: Mapped["Patient"] = relationship(back_populates="perio_exams")
    examiner: Mapped[Optional["User"]] = relationship()
    sites: Mapped[list["PerioSite"]] = relationship(
        back_populates="exam",
        cascade="all, delete-orphan",
        order_by="PerioSite.tooth_number, PerioSite.site_code",
    )


class PerioSite(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Per-tooth / per-site periodontal measurements (6 sites typical)."""

    __tablename__ = "perio_sites"
    __table_args__ = (
        UniqueConstraint("exam_id", "tooth_number", "site_code", name="uq_perio_exam_tooth_site"),
    )

    exam_id: Mapped[str] = mapped_column(ForeignKey("perio_exams.id", ondelete="CASCADE"), index=True)
    tooth_number: Mapped[str] = mapped_column(String(8), nullable=False, index=True)
    site_code: Mapped[str] = mapped_column(String(8), nullable=False)  # mb|b|db|ml|l|dl
    pocket_depth_mm: Mapped[Optional[int]] = mapped_column(Integer)
    bleeding_on_probing: Mapped[bool] = mapped_column(Boolean, default=False)
    recession_mm: Mapped[Optional[int]] = mapped_column(Integer)
    plaque_index: Mapped[Optional[float]] = mapped_column(Float)  # 0–3
    gingival_index: Mapped[Optional[float]] = mapped_column(Float)  # 0–3
    mobility_grade: Mapped[Optional[int]] = mapped_column(Integer)  # 0–3 (tooth-level)
    furcation_grade: Mapped[Optional[int]] = mapped_column(Integer)  # 0–3 (molars)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    exam: Mapped["PerioExam"] = relationship(back_populates="sites")


class TreatmentPlan(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "treatment_plans"

    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="proposed", index=True)
    target_start_date: Mapped[Optional[date]] = mapped_column(Date)
    target_end_date: Mapped[Optional[date]] = mapped_column(Date)
    accepted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    accepted_by_name: Mapped[Optional[str]] = mapped_column(String(200))
    approval_notes: Mapped[Optional[str]] = mapped_column(Text)

    patient: Mapped["Patient"] = relationship(back_populates="treatment_plans")
    items: Mapped[list["TreatmentPlanItem"]] = relationship(
        back_populates="treatment_plan",
        cascade="all, delete-orphan",
        order_by="TreatmentPlanItem.phase_order, TreatmentPlanItem.target_date, TreatmentPlanItem.created_at",
    )


class TreatmentPlanItem(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "treatment_plan_items"

    treatment_plan_id: Mapped[str] = mapped_column(
        ForeignKey("treatment_plans.id", ondelete="CASCADE"), index=True
    )
    phase_name: Mapped[str] = mapped_column(String(120), nullable=False)
    phase_order: Mapped[int] = mapped_column(Integer, default=1)
    procedure_name: Mapped[str] = mapped_column(String(200), nullable=False)
    procedure_code: Mapped[Optional[str]] = mapped_column(String(40))
    icd10_code: Mapped[Optional[str]] = mapped_column(String(16), index=True)
    icd10_description: Mapped[Optional[str]] = mapped_column(String(400))
    tooth_number: Mapped[Optional[str]] = mapped_column(String(8))
    dependency_ref: Mapped[Optional[str]] = mapped_column(String(120))
    description: Mapped[Optional[str]] = mapped_column(Text)
    estimated_fee: Mapped[float] = mapped_column(Float, default=0.0)
    insurance_coverage_pct: Mapped[float] = mapped_column(Float, default=0.0)
    insurance_estimate_amount: Mapped[float] = mapped_column(Float, default=0.0)
    patient_estimate_amount: Mapped[float] = mapped_column(Float, default=0.0)
    target_date: Mapped[Optional[date]] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(32), default="proposed")
    notes: Mapped[Optional[str]] = mapped_column(Text)

    treatment_plan: Mapped["TreatmentPlan"] = relationship(back_populates="items")


class Invoice(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "invoices"

    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), index=True)
    invoice_number: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), default=InvoiceStatus.DRAFT)
    issued_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    due_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    subtotal: Mapped[float] = mapped_column(Float, default=0.0)
    tax: Mapped[float] = mapped_column(Float, default=0.0)
    discount: Mapped[float] = mapped_column(Float, default=0.0)
    total: Mapped[float] = mapped_column(Float, default=0.0)
    amount_paid: Mapped[float] = mapped_column(Float, default=0.0)
    currency: Mapped[str] = mapped_column(String(8), default="USD")
    notes: Mapped[Optional[str]] = mapped_column(Text)
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(64), unique=True)

    patient: Mapped["Patient"] = relationship(back_populates="invoices")
    line_items: Mapped[list["InvoiceLineItem"]] = relationship(back_populates="invoice", cascade="all, delete-orphan")
    payments: Mapped[list["Payment"]] = relationship(back_populates="invoice", cascade="all, delete-orphan")


class InvoiceLineItem(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "invoice_line_items"

    invoice_id: Mapped[str] = mapped_column(ForeignKey("invoices.id", ondelete="CASCADE"), index=True)
    description: Mapped[str] = mapped_column(String(300), nullable=False)
    tooth_number: Mapped[Optional[str]] = mapped_column(String(8))
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    unit_price: Mapped[float] = mapped_column(Float, default=0.0)
    total: Mapped[float] = mapped_column(Float, default=0.0)
    procedure_code: Mapped[Optional[str]] = mapped_column(String(40))
    chart_entry_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("dental_chart_entries.id"), index=True, nullable=True
    )

    invoice: Mapped["Invoice"] = relationship(back_populates="line_items")


class Payment(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "payments"

    invoice_id: Mapped[str] = mapped_column(ForeignKey("invoices.id"), index=True)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    method: Mapped[str] = mapped_column(String(32), default=PaymentMethod.CASH)
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    reference: Mapped[Optional[str]] = mapped_column(String(120))
    received_by_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"))
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(64), unique=True)

    invoice: Mapped["Invoice"] = relationship(back_populates="payments")


class AuditLog(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "audit_logs"

    clinic_id: Mapped[Optional[str]] = mapped_column(String(36), index=True)
    actor_id: Mapped[Optional[str]] = mapped_column(String(36), index=True)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(80), nullable=False)
    resource_id: Mapped[Optional[str]] = mapped_column(String(36))
    before_data: Mapped[Optional[str]] = mapped_column(Text)
    after_data: Mapped[Optional[str]] = mapped_column(Text)
    ip_address: Mapped[Optional[str]] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False, index=True
    )


class AiSuggestion(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    """Advisory AI outputs — never auto-clinical truth."""

    __tablename__ = "ai_suggestions"

    patient_id: Mapped[Optional[str]] = mapped_column(ForeignKey("patients.id"), index=True)
    suggestion_type: Mapped[str] = mapped_column(String(60), nullable=False)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    is_ai_suggested: Mapped[bool] = mapped_column(Boolean, default=True)
    reviewed: Mapped[bool] = mapped_column(Boolean, default=False)
    reviewer_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"))
    review_decision: Mapped[Optional[str]] = mapped_column(String(40))  # confirmed | overridden | dismissed


class FeeScheduleItem(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    """Clinic fee master — maps chart/procedure codes to prices (Chart-to-Cash)."""

    __tablename__ = "fee_schedule_items"
    __table_args__ = (
        UniqueConstraint("clinic_id", "code", name="uq_fee_schedule_clinic_code"),
    )

    code: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(40), default="general")
    unit_price: Mapped[float] = mapped_column(Float, default=0.0)
    currency: Mapped[str] = mapped_column(String(8), default="USD")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    billable: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[Optional[str]] = mapped_column(Text)


class ClinicalVisit(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    """Visit container: vitals → extra/intra-oral exam → investigations → diagnosis."""

    __tablename__ = "clinical_visits"

    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), index=True)
    appointment_id: Mapped[Optional[str]] = mapped_column(ForeignKey("appointments.id"), index=True)
    examiner_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"), index=True)
    visit_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), default="in_progress", index=True)
    chief_complaint: Mapped[Optional[str]] = mapped_column(Text)
    vitals_json: Mapped[Optional[str]] = mapped_column(Text)
    extra_oral_json: Mapped[Optional[str]] = mapped_column(Text)
    intra_oral_json: Mapped[Optional[str]] = mapped_column(Text)
    investigations_json: Mapped[Optional[str]] = mapped_column(Text)
    diagnosis_json: Mapped[Optional[str]] = mapped_column(Text)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    patient: Mapped["Patient"] = relationship(back_populates="visits")
    examiner: Mapped[Optional["User"]] = relationship()


class InventoryItem(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "inventory_items"
    __table_args__ = (UniqueConstraint("clinic_id", "sku", name="uq_inventory_clinic_sku"),)

    sku: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(80), default="general")
    quantity: Mapped[float] = mapped_column(Float, default=0.0)
    reorder_level: Mapped[float] = mapped_column(Float, default=0.0)
    unit: Mapped[str] = mapped_column(String(40), default="unit")
    unit_cost: Mapped[float] = mapped_column(Float, default=0.0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    expiry_date: Mapped[Optional[date]] = mapped_column(Date)
    supplier_id: Mapped[Optional[str]] = mapped_column(ForeignKey("suppliers.id"), index=True)


class LabCase(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "lab_cases"

    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), index=True)
    dentist_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"), index=True)
    tooth: Mapped[Optional[str]] = mapped_column(String(16))
    shade: Mapped[Optional[str]] = mapped_column(String(40))
    case_type: Mapped[str] = mapped_column(String(80), default="crown")
    status: Mapped[str] = mapped_column(String(32), default=LabCaseStatus.DRAFT, index=True)
    lab_name: Mapped[Optional[str]] = mapped_column(String(200))
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    due_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    received_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    fitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    lab_cost: Mapped[float] = mapped_column(Float, default=0.0)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    patient: Mapped["Patient"] = relationship()
    dentist: Mapped[Optional["User"]] = relationship()


class ImagingStudy(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "imaging_studies"

    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), index=True)
    captured_by_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"), index=True)
    visit_id: Mapped[Optional[str]] = mapped_column(ForeignKey("clinical_visits.id"), index=True)
    study_type: Mapped[str] = mapped_column(String(80), nullable=False)  # PA, BW, OPG, CBCT, photo
    tooth: Mapped[Optional[str]] = mapped_column(String(16))
    captured_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    storage_key: Mapped[Optional[str]] = mapped_column(String(500))  # stub path / URI
    notes: Mapped[Optional[str]] = mapped_column(Text)

    patient: Mapped["Patient"] = relationship()
    captured_by: Mapped[Optional["User"]] = relationship()


class DrugTemplate(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "drug_templates"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(80), default="general")  # antibiotic, analgesic, mouthwash
    default_dose: Mapped[str] = mapped_column(String(120), nullable=False)
    default_quantity: Mapped[str] = mapped_column(String(80), default="1")
    instructions: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Prescription(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "prescriptions"

    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), index=True)
    prescribed_by_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"), index=True)
    status: Mapped[str] = mapped_column(String(32), default=PrescriptionStatus.ACTIVE, index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    prescribed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    patient: Mapped["Patient"] = relationship()
    prescribed_by: Mapped[Optional["User"]] = relationship()
    items: Mapped[list["PrescriptionItem"]] = relationship(
        back_populates="prescription", cascade="all, delete-orphan"
    )


class PrescriptionItem(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "prescription_items"

    prescription_id: Mapped[str] = mapped_column(
        ForeignKey("prescriptions.id", ondelete="CASCADE"), index=True
    )
    drug_name: Mapped[str] = mapped_column(String(200), nullable=False)
    dose: Mapped[str] = mapped_column(String(120), nullable=False)
    quantity: Mapped[str] = mapped_column(String(80), default="1")
    instructions: Mapped[Optional[str]] = mapped_column(Text)

    prescription: Mapped["Prescription"] = relationship(back_populates="items")


class StaffProfile(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "staff_profiles"
    __table_args__ = (UniqueConstraint("user_id", name="uq_staff_profiles_user"),)

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[Optional[str]] = mapped_column(String(120))
    specialty: Mapped[Optional[str]] = mapped_column(String(120))
    certifications_json: Mapped[Optional[str]] = mapped_column(Text)
    department: Mapped[Optional[str]] = mapped_column(String(80))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    cert_expires_at: Mapped[Optional[date]] = mapped_column(Date)

    user: Mapped["User"] = relationship(back_populates="staff_profile")


class RestorationCase(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    """Multi-visit restorative case spanning appointments."""

    __tablename__ = "restoration_cases"

    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), index=True)
    primary_tooth: Mapped[str] = mapped_column(String(8), nullable=False)
    case_type: Mapped[str] = mapped_column(String(80), default="restorative")
    status: Mapped[str] = mapped_column(String(32), default="planned", index=True)
    warranty_months: Mapped[int] = mapped_column(Integer, default=12)
    recall_due_at: Mapped[Optional[date]] = mapped_column(Date)
    lab_case_id: Mapped[Optional[str]] = mapped_column(ForeignKey("lab_cases.id"), index=True)
    fee_code: Mapped[Optional[str]] = mapped_column(String(40))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_by_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"))

    restorations: Mapped[list["Restoration"]] = relationship(
        back_populates="case", cascade="all, delete-orphan"
    )


class Restoration(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    """Surface-true restoration record (MODBLFIP + lifecycle)."""

    __tablename__ = "restorations"

    case_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("restoration_cases.id", ondelete="SET NULL"), index=True
    )
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), index=True)
    tooth_number: Mapped[str] = mapped_column(String(8), nullable=False, index=True)
    surfaces: Mapped[str] = mapped_column(String(16), default="")  # MODBLFIP
    restoration_type: Mapped[str] = mapped_column(String(80), nullable=False)
    cavity_size: Mapped[Optional[str]] = mapped_column(String(8))  # S M L
    blacks_class: Mapped[Optional[str]] = mapped_column(String(8))  # I-V
    material: Mapped[Optional[str]] = mapped_column(String(80))
    shade: Mapped[Optional[str]] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(32), default="planned", index=True)
    chart_entry_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("dental_chart_entries.id"), index=True
    )
    notes: Mapped[Optional[str]] = mapped_column(Text)
    recorded_by_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"))

    case: Mapped[Optional["RestorationCase"]] = relationship(back_populates="restorations")
    quality: Mapped[Optional["RestorationQuality"]] = relationship(
        back_populates="restoration", uselist=False, cascade="all, delete-orphan"
    )


class RestorationQuality(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "restoration_qualities"

    restoration_id: Mapped[str] = mapped_column(
        ForeignKey("restorations.id", ondelete="CASCADE"), unique=True, index=True
    )
    marginal_adaptation: Mapped[Optional[int]] = mapped_column(Integer)  # 1-5
    contacts: Mapped[Optional[int]] = mapped_column(Integer)
    wear: Mapped[Optional[int]] = mapped_column(Integer)
    postop_sensitivity: Mapped[Optional[int]] = mapped_column(Integer)
    pulp_status: Mapped[Optional[str]] = mapped_column(String(40))
    color_match: Mapped[Optional[int]] = mapped_column(Integer)
    finishing: Mapped[Optional[int]] = mapped_column(Integer)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    restoration: Mapped["Restoration"] = relationship(back_populates="quality")


class InventoryUsage(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "inventory_usages"

    inventory_item_id: Mapped[str] = mapped_column(ForeignKey("inventory_items.id"), index=True)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    restoration_id: Mapped[Optional[str]] = mapped_column(ForeignKey("restorations.id"), index=True)
    chart_entry_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("dental_chart_entries.id"), index=True
    )
    recorded_by_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"))
    reason: Mapped[Optional[str]] = mapped_column(String(200))


class EndoCase(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "endo_cases"

    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), index=True)
    tooth_number: Mapped[str] = mapped_column(String(8), nullable=False, index=True)
    procedure_type: Mapped[str] = mapped_column(String(40), default="rct")  # pulpotomy|pulpectomy|rct
    tooth_length_mm: Mapped[Optional[float]] = mapped_column(Float)
    canal_count: Mapped[Optional[int]] = mapped_column(Integer)
    working_length_mm: Mapped[Optional[float]] = mapped_column(Float)
    prep_method: Mapped[Optional[str]] = mapped_column(String(40))
    irrigants_json: Mapped[Optional[str]] = mapped_column(Text)
    dressings_json: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="in_progress", index=True)
    final_restoration_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("restorations.id"), index=True
    )
    notes: Mapped[Optional[str]] = mapped_column(Text)
    recorded_by_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"))

    obturations: Mapped[list["EndoObturation"]] = relationship(
        back_populates="endo_case", cascade="all, delete-orphan"
    )


class EndoObturation(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "endo_obturations"

    endo_case_id: Mapped[str] = mapped_column(
        ForeignKey("endo_cases.id", ondelete="CASCADE"), index=True
    )
    visit_date: Mapped[date] = mapped_column(Date, nullable=False)
    canals_filled: Mapped[Optional[str]] = mapped_column(String(120))
    material: Mapped[Optional[str]] = mapped_column(String(120))
    notes: Mapped[Optional[str]] = mapped_column(Text)

    endo_case: Mapped["EndoCase"] = relationship(back_populates="obturations")


class Supplier(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "suppliers"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    contact_email: Mapped[Optional[str]] = mapped_column(String(200))
    contact_phone: Mapped[Optional[str]] = mapped_column(String(40))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class PurchaseOrder(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "purchase_orders"

    supplier_id: Mapped[str] = mapped_column(ForeignKey("suppliers.id"), index=True)
    status: Mapped[str] = mapped_column(String(32), default="draft", index=True)
    ordered_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    expected_at: Mapped[Optional[date]] = mapped_column(Date)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    lines_json: Mapped[Optional[str]] = mapped_column(Text)  # [{sku, qty, unit_cost}]


class StaffShift(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "staff_shifts"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    role_label: Mapped[Optional[str]] = mapped_column(String(80))
    notes: Mapped[Optional[str]] = mapped_column(Text)


class StaffLeave(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "staff_leaves"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    starts_on: Mapped[date] = mapped_column(Date, nullable=False)
    ends_on: Mapped[date] = mapped_column(Date, nullable=False)
    leave_type: Mapped[str] = mapped_column(String(40), default="annual")
    status: Mapped[str] = mapped_column(String(32), default="approved")
    notes: Mapped[Optional[str]] = mapped_column(Text)
