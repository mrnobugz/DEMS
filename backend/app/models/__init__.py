from datetime import UTC, date, datetime
from enum import StrEnum
from typing import Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import ActivatableMixin, Base, TenantMixin, TimestampMixin, UUIDPrimaryKeyMixin


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
    OTHER = "other"


class PayerType(StrEnum):
    SELF = "self"
    INSURANCE = "insurance"
    OTHER = "other"


class ChargeStatus(StrEnum):
    POSTED = "posted"
    PENDING_INSURANCE = "pending_insurance"
    PARTIAL = "partial"
    PAID = "paid"
    CLOSED = "closed"
    VOID = "void"


class ClaimStatus(StrEnum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    ADJUDICATED = "adjudicated"
    DENIED = "denied"
    VOID = "void"


class ClaimLineStatus(StrEnum):
    PENDING = "pending"
    PAID = "paid"
    PARTIAL = "partial"
    DENIED = "denied"


class AdjustmentKind(StrEnum):
    WRITE_OFF = "write_off"
    CONTRACTUAL = "contractual"
    CORRECTION = "correction"
    VOID_OFFSET = "void_offset"


class CatalogItemKind(StrEnum):
    PROCEDURE = "procedure"
    DRUG = "drug"
    SUPPLY = "supply"
    LAB = "lab"


class InventoryItemKind(StrEnum):
    STOCK = "stock"
    SERVICE = "service"


class StockLocationKind(StrEnum):
    STORE = "store"
    DEPARTMENT = "department"
    PHARMACY = "pharmacy"


class StockMovementType(StrEnum):
    RECEIVE = "receive"
    ISSUE_DEPARTMENT = "issue_department"
    ISSUE_PATIENT = "issue_patient"
    RETURN = "return"
    WRITEOFF = "writeoff"
    STOCKTAKE = "stocktake"
    ADJUST = "adjust"
    TRANSFER = "transfer"


class PurchaseOrderStatus(StrEnum):
    DRAFT = "draft"
    ORDERED = "ordered"
    PARTIAL = "partial"
    RECEIVED = "received"
    CANCELLED = "cancelled"


class RequisitionStatus(StrEnum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    APPROVED = "approved"
    REJECTED = "rejected"
    FULFILLED = "fulfilled"
    CANCELLED = "cancelled"


class InvoiceLineKind(StrEnum):
    PROCEDURE = "procedure"
    SUPPLY = "supply"
    DRUG = "drug"
    SERVICE = "service"
    CONSULTATION = "consultation"
    LAB = "lab"
    IMAGING = "imaging"


class RegistrationStatus(StrEnum):
    DRAFT = "draft"
    PENDING_PAYMENT = "pending_payment"
    FINALIZED = "finalized"


class RegistrationDraftStatus(StrEnum):
    OPEN = "open"
    CANCELLED = "cancelled"
    COMPLETED = "completed"


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
    PARTIAL = "partial"
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
    currency: Mapped[str] = mapped_column(String(8), default="TZS")
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
    extra_permissions: Mapped[Optional[str]] = mapped_column(Text)
    denied_permissions: Mapped[Optional[str]] = mapped_column(Text)

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
    __table_args__ = (
        UniqueConstraint("clinic_id", "patient_code", name="uq_patients_clinic_code"),
        Index("ix_patients_clinic_name", "clinic_id", "last_name", "first_name"),
    )

    patient_code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    hospital_reg_number: Mapped[Optional[str]] = mapped_column(String(64), index=True)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    middle_name: Mapped[Optional[str]] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    national_id: Mapped[Optional[str]] = mapped_column(String(64), index=True)
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
    next_of_kin_relationship: Mapped[Optional[str]] = mapped_column(String(80))
    next_of_kin_phone: Mapped[Optional[str]] = mapped_column(String(40))
    guardian_name: Mapped[Optional[str]] = mapped_column(String(200))
    guardian_relationship: Mapped[Optional[str]] = mapped_column(String(80))
    guardian_phone: Mapped[Optional[str]] = mapped_column(String(40))
    history_of_presenting_complaint: Mapped[Optional[str]] = mapped_column(Text)
    last_dental_visit: Mapped[Optional[str]] = mapped_column(String(120))
    smoking_status: Mapped[Optional[str]] = mapped_column(String(40))
    alcohol_use: Mapped[Optional[str]] = mapped_column(String(40))
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
    primary_dentist_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True
    )
    portal_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    portal_pin_hash: Mapped[Optional[str]] = mapped_column(String(255))
    registration_status: Mapped[str] = mapped_column(
        String(24), default=RegistrationStatus.DRAFT, index=True
    )
    destination_department: Mapped[Optional[str]] = mapped_column(String(32))
    registration_finalized_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    has_outstanding: Mapped[bool] = mapped_column(Boolean, default=False)
    photo_storage_key: Mapped[Optional[str]] = mapped_column(String(500))
    photo_content_type: Mapped[Optional[str]] = mapped_column(String(80))
    merged_into_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("patients.id", ondelete="SET NULL"), index=True, nullable=True
    )
    guarantor_patient_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("patients.id", ondelete="SET NULL"), index=True, nullable=True
    )
    medical_history_reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    clinic: Mapped["Clinic"] = relationship(back_populates="patients")
    primary_dentist: Mapped[Optional["User"]] = relationship(foreign_keys=[primary_dentist_id])
    appointments: Mapped[list["Appointment"]] = relationship(back_populates="patient")
    chart_entries: Mapped[list["DentalChartEntry"]] = relationship(back_populates="patient")
    clinical_notes: Mapped[list["ClinicalNote"]] = relationship(back_populates="patient")
    treatment_plans: Mapped[list["TreatmentPlan"]] = relationship(back_populates="patient")
    perio_exams: Mapped[list["PerioExam"]] = relationship(back_populates="patient")
    invoices: Mapped[list["Invoice"]] = relationship(back_populates="patient")
    consents: Mapped[list["ConsentRecord"]] = relationship(back_populates="patient")
    visits: Mapped[list["ClinicalVisit"]] = relationship(back_populates="patient")
    notifications: Mapped[list["NotificationOutbox"]] = relationship(back_populates="patient")


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
    __table_args__ = (Index("ix_appointments_clinic_starts", "clinic_id", "starts_at"),)

    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), index=True)
    dentist_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    appointment_type_id: Mapped[Optional[str]] = mapped_column(ForeignKey("appointment_types.id"))
    chair_number: Mapped[Optional[int]] = mapped_column(Integer)
    operatory_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("operatories.id", ondelete="SET NULL"), index=True, nullable=True
    )
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
    queue_number: Mapped[Optional[int]] = mapped_column(Integer, index=True)
    service_name: Mapped[Optional[str]] = mapped_column(String(200))
    department: Mapped[Optional[str]] = mapped_column(String(32), index=True)
    is_appointment: Mapped[bool] = mapped_column(Boolean, default=True)

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
    __table_args__ = (Index("ix_invoices_clinic_status", "clinic_id", "status"),)

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
    currency: Mapped[str] = mapped_column(String(8), default="TZS")
    notes: Mapped[Optional[str]] = mapped_column(Text)
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(64), unique=True)
    amount_adjusted: Mapped[float] = mapped_column(Float, default=0.0)

    patient: Mapped["Patient"] = relationship(back_populates="invoices")
    line_items: Mapped[list["InvoiceLineItem"]] = relationship(back_populates="invoice", cascade="all, delete-orphan")
    payments: Mapped[list["Payment"]] = relationship(back_populates="invoice", cascade="all, delete-orphan")
    claims: Mapped[list["InsuranceClaim"]] = relationship(back_populates="invoice")
    adjustments: Mapped[list["LedgerAdjustment"]] = relationship(back_populates="invoice")


class InvoiceLineItem(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "invoice_line_items"

    invoice_id: Mapped[str] = mapped_column(ForeignKey("invoices.id", ondelete="CASCADE"), index=True)
    description: Mapped[str] = mapped_column(String(300), nullable=False)
    tooth_number: Mapped[Optional[str]] = mapped_column(String(8))
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    unit_price: Mapped[float] = mapped_column(Float, default=0.0)
    total: Mapped[float] = mapped_column(Float, default=0.0)
    procedure_code: Mapped[Optional[str]] = mapped_column(String(40))
    inventory_item_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("inventory_items.id"), index=True, nullable=True
    )
    line_kind: Mapped[str] = mapped_column(String(20), default=InvoiceLineKind.PROCEDURE)
    chart_entry_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("dental_chart_entries.id"), index=True, nullable=True
    )
    provider_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"), index=True)
    fee_charged: Mapped[float] = mapped_column(Float, default=0.0)
    estimated_insurance: Mapped[float] = mapped_column(Float, default=0.0)
    estimated_patient: Mapped[float] = mapped_column(Float, default=0.0)
    actual_insurance: Mapped[float] = mapped_column(Float, default=0.0)
    actual_patient: Mapped[float] = mapped_column(Float, default=0.0)
    charge_status: Mapped[str] = mapped_column(String(32), default=ChargeStatus.POSTED, index=True)

    invoice: Mapped["Invoice"] = relationship(back_populates="line_items")
    claim_lines: Mapped[list["ClaimLineItem"]] = relationship(back_populates="charge")


class Payment(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "payments"

    invoice_id: Mapped[str] = mapped_column(ForeignKey("invoices.id"), index=True)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    method: Mapped[str] = mapped_column(String(32), default=PaymentMethod.CASH)
    payer_type: Mapped[str] = mapped_column(String(24), default=PayerType.SELF)
    insurer: Mapped[Optional[str]] = mapped_column(String(80))
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    reference: Mapped[Optional[str]] = mapped_column(String(120))
    received_by_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"))
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(64), unique=True)

    invoice: Mapped["Invoice"] = relationship(back_populates="payments")


class AuditLog(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_logs_clinic_created", "clinic_id", "created_at"),)

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
        UniqueConstraint("clinic_id", "fee_schedule_id", "code", name="uq_fee_schedule_items_clinic_sched_code"),
    )

    code: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(40), default="general")
    unit_price: Mapped[float] = mapped_column(Float, default=0.0)
    currency: Mapped[str] = mapped_column(String(8), default="TZS")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    billable: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    effective_from: Mapped[Optional[date]] = mapped_column(Date)
    effective_to: Mapped[Optional[date]] = mapped_column(Date)
    fee_schedule_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("fee_schedules.id", ondelete="SET NULL"), index=True, nullable=True
    )
    catalog_item_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("catalog_items.id"), index=True
    )

    catalog_item: Mapped[Optional["CatalogItem"]] = relationship()


class CatalogCategory(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    """Tree of catalog groupings."""

    __tablename__ = "catalog_categories"
    __table_args__ = (UniqueConstraint("clinic_id", "slug", name="uq_catalog_category_clinic_slug"),)

    name: Mapped[str] = mapped_column(String(80), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    parent_id: Mapped[Optional[str]] = mapped_column(ForeignKey("catalog_categories.id"), index=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    parent: Mapped[Optional["CatalogCategory"]] = relationship(remote_side="CatalogCategory.id")


class CatalogItem(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    """Billable SKU. Warehouse stock stays on inventory_items."""

    __tablename__ = "catalog_items"
    __table_args__ = (UniqueConstraint("clinic_id", "sku", name="uq_catalog_item_clinic_sku"),)

    sku: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), default=CatalogItemKind.PROCEDURE, index=True)
    list_price: Mapped[float] = mapped_column(Float, default=0.0)
    currency: Mapped[str] = mapped_column(String(8), default="TZS")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    billable: Mapped[bool] = mapped_column(Boolean, default=True)
    category_id: Mapped[Optional[str]] = mapped_column(ForeignKey("catalog_categories.id"), index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    cdt_code: Mapped[Optional[str]] = mapped_column(String(40))
    tooth_required: Mapped[bool] = mapped_column(Boolean, default=False)
    ndc_code: Mapped[Optional[str]] = mapped_column(String(40))
    drug_schedule: Mapped[Optional[str]] = mapped_column(String(20))
    unit_of_measure: Mapped[Optional[str]] = mapped_column(String(40))
    vendor_fee_basis: Mapped[Optional[str]] = mapped_column(String(80))
    inventory_item_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("inventory_items.id"), index=True, nullable=True
    )

    category: Mapped[Optional["CatalogCategory"]] = relationship()
    price_history: Mapped[list["CatalogPriceHistory"]] = relationship(
        back_populates="item", cascade="all, delete-orphan"
    )
    fee_rates: Mapped[list["CatalogFeeRate"]] = relationship(
        back_populates="item", cascade="all, delete-orphan"
    )


class CatalogPriceHistory(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    """Audit of catalog list-price changes."""

    __tablename__ = "catalog_price_history"

    catalog_item_id: Mapped[str] = mapped_column(
        ForeignKey("catalog_items.id", ondelete="CASCADE"), index=True
    )
    old_price: Mapped[float] = mapped_column(Float, nullable=False)
    new_price: Mapped[float] = mapped_column(Float, nullable=False)
    changed_by_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"))
    notes: Mapped[Optional[str]] = mapped_column(String(200))

    item: Mapped["CatalogItem"] = relationship(back_populates="price_history")


class CatalogFeeRate(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    """Payer (or office) price for a catalog item, versioned by effective date."""

    __tablename__ = "catalog_fee_rates"
    __table_args__ = (
        UniqueConstraint(
            "clinic_id",
            "catalog_item_id",
            "payer_name",
            "effective_from",
            name="uq_catalog_fee_rate_payer_date",
        ),
        Index("ix_catalog_fee_rates_item_payer", "catalog_item_id", "payer_name"),
    )

    catalog_item_id: Mapped[str] = mapped_column(
        ForeignKey("catalog_items.id", ondelete="CASCADE"), index=True
    )
    payer_name: Mapped[str] = mapped_column(String(200), default="", index=True)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)

    item: Mapped["CatalogItem"] = relationship(back_populates="fee_rates")


class ClinicalVisit(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    """Visit container: vitals → extra/intra-oral exam → investigations → diagnosis."""

    __tablename__ = "clinical_visits"
    __table_args__ = (Index("ix_clinical_visits_clinic_date", "clinic_id", "visit_date"),)

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
    sale_price: Mapped[float] = mapped_column(Float, default=0.0)
    item_kind: Mapped[str] = mapped_column(String(20), default=InventoryItemKind.STOCK, index=True)
    billable_at_registration: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    target_department: Mapped[Optional[str]] = mapped_column(String(32))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    expiry_date: Mapped[Optional[date]] = mapped_column(Date)
    supplier_id: Mapped[Optional[str]] = mapped_column(ForeignKey("suppliers.id"), index=True)
    track_lots: Mapped[bool] = mapped_column(Boolean, default=False)
    requires_expiry: Mapped[bool] = mapped_column(Boolean, default=True)


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
    restoration_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("restorations.id", ondelete="SET NULL"), index=True
    )
    restoration_case_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("restoration_cases.id", ondelete="SET NULL"), index=True
    )

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
    content_type: Mapped[Optional[str]] = mapped_column(String(120))
    byte_size: Mapped[Optional[int]] = mapped_column(Integer)
    checksum_sha256: Mapped[Optional[str]] = mapped_column(String(64))
    is_encrypted: Mapped[bool] = mapped_column(Boolean, default=False)
    original_filename: Mapped[Optional[str]] = mapped_column(String(255))
    notes: Mapped[Optional[str]] = mapped_column(Text)

    patient: Mapped["Patient"] = relationship()
    captured_by: Mapped[Optional["User"]] = relationship()


class PatientInsurancePlan(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    """Patient-level insurance plan driving co-pay estimates (pre-EDI claims)."""

    __tablename__ = "patient_insurance_plans"

    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), index=True)
    payer_name: Mapped[str] = mapped_column(String(200), nullable=False)
    plan_name: Mapped[Optional[str]] = mapped_column(String(200))
    member_id: Mapped[Optional[str]] = mapped_column(String(80))
    group_number: Mapped[Optional[str]] = mapped_column(String(80))
    coverage_pct: Mapped[float] = mapped_column(Float, default=80.0)
    annual_max: Mapped[Optional[float]] = mapped_column(Float)
    lifetime_max: Mapped[Optional[float]] = mapped_column(Float)
    amount_used_ytd: Mapped[float] = mapped_column(Float, default=0.0)
    deductible: Mapped[float] = mapped_column(Float, default=0.0)
    deductible_met: Mapped[float] = mapped_column(Float, default=0.0)
    effective_from: Mapped[Optional[date]] = mapped_column(Date)
    effective_to: Mapped[Optional[date]] = mapped_column(Date)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    patient: Mapped["Patient"] = relationship()


class LedgerAdjustment(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    """Credits/write-offs. Never edits a posted charge fee."""

    __tablename__ = "ledger_adjustments"

    invoice_id: Mapped[str] = mapped_column(ForeignKey("invoices.id"), index=True)
    line_item_id: Mapped[Optional[str]] = mapped_column(ForeignKey("invoice_line_items.id"), index=True)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    kind: Mapped[str] = mapped_column(String(32), default=AdjustmentKind.WRITE_OFF)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_by_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"))

    invoice: Mapped["Invoice"] = relationship(back_populates="adjustments")


class InsuranceClaim(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "insurance_claims"
    __table_args__ = (Index("ix_insurance_claims_clinic_status", "clinic_id", "status"),)

    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), index=True)
    invoice_id: Mapped[str] = mapped_column(ForeignKey("invoices.id"), index=True)
    plan_id: Mapped[Optional[str]] = mapped_column(ForeignKey("patient_insurance_plans.id"), index=True)
    claim_number: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), default=ClaimStatus.DRAFT, index=True)
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    adjudicated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    scrub_notes: Mapped[Optional[str]] = mapped_column(Text)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    invoice: Mapped["Invoice"] = relationship(back_populates="claims")
    lines: Mapped[list["ClaimLineItem"]] = relationship(back_populates="claim", cascade="all, delete-orphan")


class ClaimLineItem(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "claim_line_items"
    __table_args__ = (UniqueConstraint("line_item_id", name="uq_claim_line_charge"),)

    claim_id: Mapped[str] = mapped_column(ForeignKey("insurance_claims.id", ondelete="CASCADE"), index=True)
    line_item_id: Mapped[str] = mapped_column(ForeignKey("invoice_line_items.id"), index=True)
    billed_amount: Mapped[float] = mapped_column(Float, default=0.0)
    allowed_amount: Mapped[Optional[float]] = mapped_column(Float)
    paid_amount: Mapped[float] = mapped_column(Float, default=0.0)
    patient_responsibility: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(String(32), default=ClaimLineStatus.PENDING, index=True)
    denial_reason: Mapped[Optional[str]] = mapped_column(String(300))

    claim: Mapped["InsuranceClaim"] = relationship(back_populates="lines")
    charge: Mapped["InvoiceLineItem"] = relationship(back_populates="claim_lines")


class PatientStatement(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "patient_statements"

    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), index=True)
    statement_number: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    balance_due: Mapped[float] = mapped_column(Float, default=0.0)
    due_date: Mapped[Optional[date]] = mapped_column(Date)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    invoice_ids: Mapped[Optional[str]] = mapped_column(Text)

    patient: Mapped["Patient"] = relationship()


class DrugTemplate(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "drug_templates"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(80), default="general")  # antibiotic, analgesic, mouthwash
    default_dose: Mapped[str] = mapped_column(String(120), nullable=False)
    default_quantity: Mapped[str] = mapped_column(String(80), default="1")
    instructions: Mapped[Optional[str]] = mapped_column(Text)
    form: Mapped[str] = mapped_column(String(40), default="tablet", server_default="tablet", nullable=False)
    strength: Mapped[Optional[str]] = mapped_column(String(80))
    route: Mapped[str] = mapped_column(String(40), default="oral", server_default="oral", nullable=False)
    inventory_item_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("inventory_items.id", ondelete="SET NULL"), index=True, nullable=True
    )
    reorder_level: Mapped[float] = mapped_column(Float, default=0.0, server_default="0", nullable=False)
    is_controlled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0", nullable=False)
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
    rx_number: Mapped[Optional[str]] = mapped_column(String(40), index=True)
    verified_by_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    dispensed_by_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    dispensed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    invoice_id: Mapped[Optional[str]] = mapped_column(ForeignKey("invoices.id", ondelete="SET NULL"), index=True)
    cancel_reason: Mapped[Optional[str]] = mapped_column(String(300))

    patient: Mapped["Patient"] = relationship()
    prescribed_by: Mapped[Optional["User"]] = relationship(foreign_keys="Prescription.prescribed_by_id")
    items: Mapped[list["PrescriptionItem"]] = relationship(
        back_populates="prescription", cascade="all, delete-orphan"
    )
    dispenses: Mapped[list["DispenseEvent"]] = relationship(
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
    frequency: Mapped[Optional[str]] = mapped_column(String(80))
    days: Mapped[Optional[int]] = mapped_column(Integer)
    start_date: Mapped[Optional[date]] = mapped_column(Date)
    end_date: Mapped[Optional[date]] = mapped_column(Date)
    instructions: Mapped[Optional[str]] = mapped_column(Text)
    inventory_item_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("inventory_items.id"), index=True, nullable=True
    )
    drug_template_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("drug_templates.id", ondelete="SET NULL"), index=True, nullable=True
    )
    quantity_dispensed: Mapped[float] = mapped_column(Float, default=0.0, server_default="0", nullable=False)
    line_status: Mapped[str] = mapped_column(String(24), default="pending", server_default="pending", nullable=False)

    prescription: Mapped["Prescription"] = relationship(back_populates="items")


class DispenseEvent(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    """One fill (or part of a fill) taken from the pharmacy shelf."""

    __tablename__ = "dispense_events"

    prescription_id: Mapped[str] = mapped_column(
        ForeignKey("prescriptions.id", ondelete="CASCADE"), index=True
    )
    prescription_item_id: Mapped[str] = mapped_column(
        ForeignKey("prescription_items.id", ondelete="CASCADE"), index=True
    )
    inventory_item_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("inventory_items.id", ondelete="SET NULL"), index=True, nullable=True
    )
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    quantity_returned: Mapped[float] = mapped_column(Float, default=0.0, server_default="0", nullable=False)
    lot_code: Mapped[Optional[str]] = mapped_column(String(64))
    expiry_date: Mapped[Optional[date]] = mapped_column(Date)
    unit_price: Mapped[float] = mapped_column(Float, default=0.0, server_default="0", nullable=False)
    label_text: Mapped[Optional[str]] = mapped_column(Text)
    invoice_id: Mapped[Optional[str]] = mapped_column(ForeignKey("invoices.id", ondelete="SET NULL"), index=True)
    dispensed_by_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    notes: Mapped[Optional[str]] = mapped_column(String(300))

    prescription: Mapped["Prescription"] = relationship(back_populates="dispenses")
    item: Mapped["PrescriptionItem"] = relationship()


class PharmacySale(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    """Walk-in counter sale. Stock leaves the pharmacy shelf and the invoice is paid."""

    __tablename__ = "pharmacy_sales"

    sale_number: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), index=True)
    invoice_id: Mapped[Optional[str]] = mapped_column(ForeignKey("invoices.id", ondelete="SET NULL"), index=True)
    sold_by_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String(32), default="completed", index=True)
    subtotal: Mapped[float] = mapped_column(Float, default=0.0)
    total: Mapped[float] = mapped_column(Float, default=0.0)
    amount_paid: Mapped[float] = mapped_column(Float, default=0.0)
    amount_tendered: Mapped[float] = mapped_column(Float, default=0.0)
    change_due: Mapped[float] = mapped_column(Float, default=0.0)
    payment_method: Mapped[str] = mapped_column(String(40), default=PaymentMethod.CASH)
    payment_reference: Mapped[Optional[str]] = mapped_column(String(80))
    notes: Mapped[Optional[str]] = mapped_column(Text)

    patient: Mapped["Patient"] = relationship()
    invoice: Mapped[Optional["Invoice"]] = relationship()
    lines: Mapped[list["PharmacySaleLine"]] = relationship(
        back_populates="sale", cascade="all, delete-orphan"
    )


class PharmacySaleLine(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "pharmacy_sale_lines"

    sale_id: Mapped[str] = mapped_column(ForeignKey("pharmacy_sales.id", ondelete="CASCADE"), index=True)
    inventory_item_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("inventory_items.id", ondelete="SET NULL"), index=True, nullable=True
    )
    description: Mapped[str] = mapped_column(String(200), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[float] = mapped_column(Float, default=0.0)
    line_total: Mapped[float] = mapped_column(Float, default=0.0)

    sale: Mapped["PharmacySale"] = relationship(back_populates="lines")
    inventory_item: Mapped[Optional["InventoryItem"]] = relationship()


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
    license_no: Mapped[Optional[str]] = mapped_column(String(80))
    is_scheduling_provider: Mapped[bool] = mapped_column(Boolean, default=True)
    default_operatory_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("operatories.id", ondelete="SET NULL"), nullable=True
    )
    production_goal: Mapped[Optional[float]] = mapped_column(Float)
    commission_rate_bps: Mapped[int] = mapped_column(Integer, default=0)
    schedule_json: Mapped[Optional[str]] = mapped_column(Text)

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

    lines: Mapped[list["PurchaseOrderLine"]] = relationship(
        back_populates="purchase_order", cascade="all, delete-orphan"
    )
    supplier: Mapped["Supplier"] = relationship()

    @property
    def supplier_name(self) -> str | None:
        return self.supplier.name if self.supplier else None


class Requisition(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    """Internal supply request from a clinical department to the store."""

    __tablename__ = "requisitions"
    __table_args__ = (Index("ix_requisitions_clinic_status", "clinic_id", "status"),)

    req_number: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    status: Mapped[str] = mapped_column(
        String(24), default=RequisitionStatus.DRAFT, nullable=False, index=True
    )
    department: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    destination_location_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("stock_locations.id", ondelete="SET NULL")
    )
    requested_by_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    approved_by_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    fulfilled_by_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    notes: Mapped[Optional[str]] = mapped_column(Text)
    reject_reason: Mapped[Optional[str]] = mapped_column(String(300))
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    fulfilled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    lines: Mapped[list["RequisitionLine"]] = relationship(
        back_populates="requisition", cascade="all, delete-orphan"
    )


class RequisitionLine(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "requisition_lines"

    requisition_id: Mapped[str] = mapped_column(
        ForeignKey("requisitions.id", ondelete="CASCADE"), index=True
    )
    inventory_item_id: Mapped[str] = mapped_column(ForeignKey("inventory_items.id"), index=True)
    quantity_requested: Mapped[float] = mapped_column(Float, nullable=False)
    quantity_issued: Mapped[float] = mapped_column(Float, default=0.0)
    notes: Mapped[Optional[str]] = mapped_column(String(200))

    requisition: Mapped["Requisition"] = relationship(back_populates="lines")
    inventory_item: Mapped["InventoryItem"] = relationship()


class PurchaseOrderLine(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "purchase_order_lines"

    purchase_order_id: Mapped[str] = mapped_column(
        ForeignKey("purchase_orders.id", ondelete="CASCADE"), index=True
    )
    inventory_item_id: Mapped[str] = mapped_column(ForeignKey("inventory_items.id"), index=True)
    quantity_ordered: Mapped[float] = mapped_column(Float, nullable=False)
    quantity_received: Mapped[float] = mapped_column(Float, default=0.0)
    unit_cost: Mapped[float] = mapped_column(Float, default=0.0)

    purchase_order: Mapped["PurchaseOrder"] = relationship(back_populates="lines")
    inventory_item: Mapped["InventoryItem"] = relationship()


class StockLocation(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "stock_locations"
    __table_args__ = (UniqueConstraint("clinic_id", "code", name="uq_stock_location_clinic_code"),)

    code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), default=StockLocationKind.STORE, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class StockLot(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "stock_lots"
    __table_args__ = (
        UniqueConstraint(
            "clinic_id",
            "inventory_item_id",
            "location_id",
            "lot_code",
            name="uq_stock_lot_item_loc_code",
        ),
    )

    inventory_item_id: Mapped[str] = mapped_column(ForeignKey("inventory_items.id"), index=True)
    location_id: Mapped[str] = mapped_column(ForeignKey("stock_locations.id"), index=True)
    lot_code: Mapped[str] = mapped_column(String(64), default="DEFAULT")
    expiry_date: Mapped[Optional[date]] = mapped_column(Date)
    quantity: Mapped[float] = mapped_column(Float, default=0.0)
    unit_cost: Mapped[float] = mapped_column(Float, default=0.0)

    inventory_item: Mapped["InventoryItem"] = relationship()
    location: Mapped["StockLocation"] = relationship()


class StockMovement(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "stock_movements"

    inventory_item_id: Mapped[str] = mapped_column(ForeignKey("inventory_items.id"), index=True)
    lot_id: Mapped[Optional[str]] = mapped_column(ForeignKey("stock_lots.id"), index=True)
    from_location_id: Mapped[Optional[str]] = mapped_column(ForeignKey("stock_locations.id"))
    to_location_id: Mapped[Optional[str]] = mapped_column(ForeignKey("stock_locations.id"))
    movement_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    unit_cost_snapshot: Mapped[float] = mapped_column(Float, default=0.0)
    reason: Mapped[Optional[str]] = mapped_column(String(200))
    supplier_id: Mapped[Optional[str]] = mapped_column(ForeignKey("suppliers.id"))
    purchase_order_id: Mapped[Optional[str]] = mapped_column(ForeignKey("purchase_orders.id"), index=True)
    invoice_id: Mapped[Optional[str]] = mapped_column(ForeignKey("invoices.id"), index=True)
    invoice_line_id: Mapped[Optional[str]] = mapped_column(ForeignKey("invoice_line_items.id"))
    prescription_id: Mapped[Optional[str]] = mapped_column(ForeignKey("prescriptions.id"), index=True)
    requisition_id: Mapped[Optional[str]] = mapped_column(ForeignKey("requisitions.id"), index=True)
    recorded_by_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"))

    inventory_item: Mapped["InventoryItem"] = relationship()
    lot: Mapped[Optional["StockLot"]] = relationship()


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


class NotificationChannel(StrEnum):
    LOG = "log"
    EMAIL = "email"
    SMS = "sms"
    WHATSAPP = "whatsapp"
    PUSH = "push"


class NotificationStatus(StrEnum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"
    CANCELLED = "cancelled"


# ── Specialty clinic departments ──────────────────────────────────────────────


class ClinicDepartment(StrEnum):
    """The four specialty departments surfaced under Clinic in navigation."""

    RESTORATIVE = "restorative"
    MAXILLOFACIAL = "maxillofacial"
    ORTHODONTIC = "orthodontic"
    PAEDIATRIC = "paediatric"


class SurgicalCaseStatus(StrEnum):
    PLANNED = "planned"
    SCHEDULED = "scheduled"
    COMPLETED = "completed"
    FOLLOW_UP = "follow_up"
    CLOSED = "closed"
    CANCELLED = "cancelled"


class SurgicalCase(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    """Oral & maxillofacial surgery case: extraction → orthognathic, with follow-up."""

    __tablename__ = "surgical_cases"

    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), index=True)
    surgeon_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"), index=True)
    # extraction | surgical_extraction | impacted_third_molar | biopsy | cyst_enucleation
    # | fracture_reduction | implant_placement | orthognathic | other
    procedure_type: Mapped[str] = mapped_column(String(80), default="extraction")
    site: Mapped[Optional[str]] = mapped_column(String(80))  # tooth number or region
    diagnosis: Mapped[Optional[str]] = mapped_column(Text)
    anaesthesia: Mapped[str] = mapped_column(String(32), default="local")  # local|sedation|general
    asa_class: Mapped[Optional[str]] = mapped_column(String(8))  # ASA I-IV
    status: Mapped[str] = mapped_column(String(32), default=SurgicalCaseStatus.PLANNED, index=True)
    scheduled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    performed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    operative_notes: Mapped[Optional[str]] = mapped_column(Text)
    complications: Mapped[Optional[str]] = mapped_column(Text)
    histopathology: Mapped[Optional[str]] = mapped_column(Text)  # biopsy result
    notes: Mapped[Optional[str]] = mapped_column(Text)

    patient: Mapped["Patient"] = relationship()
    surgeon: Mapped[Optional["User"]] = relationship()
    follow_ups: Mapped[list["SurgicalFollowUp"]] = relationship(
        back_populates="surgical_case", cascade="all, delete-orphan"
    )


class SurgicalFollowUp(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "surgical_follow_ups"

    surgical_case_id: Mapped[str] = mapped_column(
        ForeignKey("surgical_cases.id", ondelete="CASCADE"), index=True
    )
    visit_date: Mapped[date] = mapped_column(Date, nullable=False)
    pain_score: Mapped[Optional[int]] = mapped_column(Integer)  # 0-10
    swelling: Mapped[Optional[str]] = mapped_column(String(32))  # none|mild|moderate|severe
    healing: Mapped[str] = mapped_column(String(32), default="normal")  # normal|delayed|infected|dry_socket
    sutures_removed: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    surgical_case: Mapped["SurgicalCase"] = relationship(back_populates="follow_ups")


class OrthoCaseStatus(StrEnum):
    ASSESSMENT = "assessment"
    ACTIVE = "active"
    RETENTION = "retention"
    COMPLETED = "completed"
    DISCONTINUED = "discontinued"


class OrthoCase(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    """Orthodontic case: Angle classification, appliance, adjustment cadence."""

    __tablename__ = "ortho_cases"

    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), index=True)
    clinician_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"), index=True)
    angle_class: Mapped[Optional[str]] = mapped_column(String(16))  # I | II_div1 | II_div2 | III
    malocclusion_summary: Mapped[Optional[str]] = mapped_column(Text)
    # fixed_metal | fixed_ceramic | removable | functional | clear_aligner
    appliance_type: Mapped[str] = mapped_column(String(40), default="fixed_metal")
    arch: Mapped[str] = mapped_column(String(16), default="both")  # upper|lower|both
    bracket_system: Mapped[Optional[str]] = mapped_column(String(80))
    oral_hygiene: Mapped[Optional[str]] = mapped_column(String(16))  # good|fair|poor
    status: Mapped[str] = mapped_column(String(32), default=OrthoCaseStatus.ASSESSMENT, index=True)
    started_on: Mapped[Optional[date]] = mapped_column(Date)
    debonded_on: Mapped[Optional[date]] = mapped_column(Date)
    planned_months: Mapped[int] = mapped_column(Integer, default=18)
    next_review_due: Mapped[Optional[date]] = mapped_column(Date, index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    patient: Mapped["Patient"] = relationship()
    clinician: Mapped[Optional["User"]] = relationship()
    adjustments: Mapped[list["OrthoAdjustment"]] = relationship(
        back_populates="ortho_case", cascade="all, delete-orphan"
    )


class OrthoAdjustment(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "ortho_adjustments"

    ortho_case_id: Mapped[str] = mapped_column(
        ForeignKey("ortho_cases.id", ondelete="CASCADE"), index=True
    )
    visit_date: Mapped[date] = mapped_column(Date, nullable=False)
    archwire: Mapped[Optional[str]] = mapped_column(String(80))  # wire or aligner stage
    procedures: Mapped[Optional[str]] = mapped_column(Text)
    elastics: Mapped[Optional[str]] = mapped_column(String(80))
    next_visit_weeks: Mapped[int] = mapped_column(Integer, default=4)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    ortho_case: Mapped["OrthoCase"] = relationship(back_populates="adjustments")


class PaediatricProfile(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    """Paediatric dentistry profile: behaviour, dentition stage, caries risk, guardian."""

    __tablename__ = "paediatric_profiles"
    __table_args__ = (UniqueConstraint("patient_id", name="uq_paediatric_profiles_patient"),)

    patient_id: Mapped[str] = mapped_column(
        ForeignKey("patients.id", ondelete="CASCADE"), index=True
    )
    guardian_name: Mapped[Optional[str]] = mapped_column(String(200))
    guardian_phone: Mapped[Optional[str]] = mapped_column(String(40))
    guardian_relation: Mapped[Optional[str]] = mapped_column(String(40))
    behaviour_rating: Mapped[Optional[int]] = mapped_column(Integer)  # Frankl scale 1-4
    dentition_stage: Mapped[str] = mapped_column(String(16), default="primary")  # primary|mixed|permanent
    caries_risk: Mapped[str] = mapped_column(String(16), default="moderate", index=True)  # low|moderate|high
    oral_habits: Mapped[Optional[str]] = mapped_column(Text)  # thumb sucking, bruxism, ...
    medical_alerts: Mapped[Optional[str]] = mapped_column(Text)
    fluoride_last: Mapped[Optional[date]] = mapped_column(Date)
    fluoride_next: Mapped[Optional[date]] = mapped_column(Date, index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    patient: Mapped["Patient"] = relationship()
    treatments: Mapped[list["PaediatricTreatment"]] = relationship(
        back_populates="profile", cascade="all, delete-orphan"
    )


class PaediatricTreatment(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "paediatric_treatments"

    profile_id: Mapped[str] = mapped_column(
        ForeignKey("paediatric_profiles.id", ondelete="CASCADE"), index=True
    )
    # fluoride_varnish | fissure_sealant | pulpotomy | pulpectomy | stainless_steel_crown
    # | restoration | extraction | space_maintainer | other
    treatment_type: Mapped[str] = mapped_column(String(40), default="fluoride_varnish")
    tooth: Mapped[Optional[str]] = mapped_column(String(8))
    performed_on: Mapped[date] = mapped_column(Date, nullable=False)
    performed_by_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"))
    notes: Mapped[Optional[str]] = mapped_column(Text)

    profile: Mapped["PaediatricProfile"] = relationship(back_populates="treatments")


class NotificationOutbox(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    """Unified Recall & Reach outbox — providers swap without touching domain logic."""

    __tablename__ = "notification_outbox"

    patient_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("patients.id", ondelete="SET NULL"), index=True, nullable=True
    )
    channel: Mapped[str] = mapped_column(String(32), default=NotificationChannel.LOG, index=True)
    template_key: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    subject: Mapped[Optional[str]] = mapped_column(String(300))
    body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default=NotificationStatus.PENDING, index=True)
    to_address: Mapped[Optional[str]] = mapped_column(String(200))
    scheduled_for: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), index=True)
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    error: Mapped[Optional[str]] = mapped_column(Text)
    meta_json: Mapped[Optional[str]] = mapped_column(Text)
    created_by_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"), nullable=True)

    patient: Mapped[Optional["Patient"]] = relationship(back_populates="notifications")


# ── Configurations (Wave 0 + C1) ─────────────────────────────────────────────


class DomainEvent(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    """Append-only outbox. Consumers must be idempotent on id."""

    __tablename__ = "domain_events"
    __table_args__ = (Index("ix_domain_events_clinic_type_occurred", "clinic_id", "event_type", "occurred_at"),)

    event_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    aggregate_type: Mapped[str] = mapped_column(String(80), nullable=False)
    aggregate_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False, index=True
    )
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    actor_id: Mapped[Optional[str]] = mapped_column(String(36), index=True)


class SystemSetting(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Scoped settings: platform → clinic → user. clinic_id null = platform."""

    __tablename__ = "system_settings"
    __table_args__ = (
        UniqueConstraint("scope", "clinic_id", "user_id", "key", name="uq_system_settings_scope_owner_key"),
        Index("ix_system_settings_clinic_key", "clinic_id", "key"),
    )

    clinic_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("clinics.id", ondelete="CASCADE"), index=True, nullable=True
    )
    user_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=True
    )
    scope: Mapped[str] = mapped_column(String(16), nullable=False, default="clinic")
    key: Mapped[str] = mapped_column(String(120), nullable=False)
    value: Mapped[str] = mapped_column(Text, nullable=False, default="")


class NumberSequence(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "number_sequences"
    __table_args__ = (UniqueConstraint("clinic_id", "document_type", name="uq_number_sequences_clinic_type"),)

    document_type: Mapped[str] = mapped_column(String(40), nullable=False)
    prefix: Mapped[str] = mapped_column(String(16), nullable=False, default="")
    padding: Mapped[int] = mapped_column(Integer, default=5)
    next_value: Mapped[int] = mapped_column(Integer, default=1)
    year_reset: Mapped[bool] = mapped_column(Boolean, default=True)
    current_year: Mapped[int] = mapped_column(Integer, default=lambda: datetime.now(UTC).year)


class OrgDepartment(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, ActivatableMixin):
    """Clinic organization unit (not the specialty navigation enum)."""

    __tablename__ = "org_departments"
    __table_args__ = (UniqueConstraint("clinic_id", "code", name="uq_org_departments_clinic_code"),)

    code: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    head_user_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    stock_location_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("stock_locations.id", ondelete="SET NULL"), nullable=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[Optional[str]] = mapped_column(String(400))

    operatories: Mapped[list["Operatory"]] = relationship(back_populates="department")


class Operatory(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, ActivatableMixin):
    __tablename__ = "operatories"
    __table_args__ = (UniqueConstraint("clinic_id", "code", name="uq_operatories_clinic_code"),)

    department_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("org_departments.id", ondelete="SET NULL"), index=True, nullable=True
    )
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    chair_number: Mapped[Optional[int]] = mapped_column(Integer)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[Optional[str]] = mapped_column(String(400))

    department: Mapped[Optional["OrgDepartment"]] = relationship(back_populates="operatories")


class WorkingHours(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, ActivatableMixin):
    """owner_type: clinic | department | provider. owner_id null for clinic-wide."""

    __tablename__ = "working_hours"

    owner_type: Mapped[str] = mapped_column(String(20), nullable=False, default="clinic")
    owner_id: Mapped[Optional[str]] = mapped_column(String(36), index=True)
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False)  # 0=Mon … 6=Sun
    starts_on: Mapped[str] = mapped_column(String(5), nullable=False, default="08:00")
    ends_on: Mapped[str] = mapped_column(String(5), nullable=False, default="17:00")


class Holiday(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, ActivatableMixin):
    __tablename__ = "holidays"
    __table_args__ = (UniqueConstraint("clinic_id", "holiday_date", name="uq_holidays_clinic_date"),)

    holiday_date: Mapped[date] = mapped_column(Date, nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(String(400))


class RolePermission(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    """Clinic-editable role × permission matrix. Seeded from code defaults."""

    __tablename__ = "role_permissions"
    __table_args__ = (
        UniqueConstraint("clinic_id", "role", "permission_id", name="uq_role_permissions_clinic_role_perm"),
    )

    role: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    permission_id: Mapped[str] = mapped_column(String(80), nullable=False)
    allowed: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class FeeSchedule(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, ActivatableMixin):
    __tablename__ = "fee_schedules"
    __table_args__ = (UniqueConstraint("clinic_id", "code", name="uq_fee_schedules_clinic_code"),)

    code: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    payer_kind: Mapped[str] = mapped_column(String(32), default="cash")  # cash | corporate | insurance
    currency: Mapped[str] = mapped_column(String(8), default="TZS")
    effective_from: Mapped[Optional[date]] = mapped_column(Date)
    effective_to: Mapped[Optional[date]] = mapped_column(Date)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[Optional[str]] = mapped_column(String(400))


class TaxRate(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, ActivatableMixin):
    __tablename__ = "tax_rates"
    __table_args__ = (UniqueConstraint("clinic_id", "code", name="uq_tax_rates_clinic_code"),)

    code: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    rate_bps: Mapped[int] = mapped_column(Integer, default=0)  # 1800 = 18%
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)


class DiscountRule(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, ActivatableMixin):
    __tablename__ = "discount_rules"
    __table_args__ = (UniqueConstraint("clinic_id", "code", name="uq_discount_rules_clinic_code"),)

    code: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    percent: Mapped[float] = mapped_column(Float, default=0.0)
    max_amount: Mapped[Optional[float]] = mapped_column(Float)
    requires_role: Mapped[Optional[str]] = mapped_column(String(40))
    notes: Mapped[Optional[str]] = mapped_column(String(400))


class PaymentMethodConfig(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, ActivatableMixin):
    __tablename__ = "payment_method_configs"
    __table_args__ = (UniqueConstraint("clinic_id", "code", name="uq_payment_method_configs_clinic_code"),)

    code: Mapped[str] = mapped_column(String(40), nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class ConfigCatalogEntry(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, ActivatableMixin):
    """Coded lists: diagnosis extras, allergies, alerts, UoM, item categories, surfaces."""

    __tablename__ = "config_catalog_entries"
    __table_args__ = (
        UniqueConstraint("clinic_id", "kind", "code", name="uq_config_catalog_clinic_kind_code"),
        Index("ix_config_catalog_entries_clinic_kind", "clinic_id", "kind"),
    )

    kind: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(80), nullable=False)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    extra_json: Mapped[Optional[str]] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class ConfigTemplate(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, ActivatableMixin):
    __tablename__ = "config_templates"
    __table_args__ = (UniqueConstraint("clinic_id", "kind", "key", name="uq_config_templates_clinic_kind_key"),)

    kind: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    key: Mapped[str] = mapped_column(String(80), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    subject: Mapped[Optional[str]] = mapped_column(String(300))
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")


class ApprovalChain(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, ActivatableMixin):
    __tablename__ = "approval_chains"

    name: Mapped[str] = mapped_column(String(160), nullable=False)
    department_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("org_departments.id", ondelete="SET NULL"), nullable=True
    )
    category: Mapped[Optional[str]] = mapped_column(String(80))
    min_amount: Mapped[float] = mapped_column(Float, default=0.0)
    steps_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    notes: Mapped[Optional[str]] = mapped_column(String(400))


class PatientSafetyItem(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, ActivatableMixin):
    """Coded allergy / condition / medication / alert. Free-text patient fields stay as fallback."""

    __tablename__ = "patient_safety_items"
    __table_args__ = (
        UniqueConstraint(
            "clinic_id",
            "patient_id",
            "kind",
            "code",
            name="uq_patient_safety_clinic_patient_kind_code",
        ),
    )

    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    code: Mapped[str] = mapped_column(String(80), nullable=False)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(String(400))


class RegistrationDraft(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    """Unfinished front-desk registration. Resume later or cancel; rows are kept for audit."""

    __tablename__ = "registration_drafts"
    __table_args__ = (Index("ix_registration_drafts_clinic_status", "clinic_id", "status"),)

    patient_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("patients.id", ondelete="SET NULL"), index=True, nullable=True
    )
    created_by_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True
    )
    updated_by_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(16), default=RegistrationDraftStatus.OPEN, nullable=False, index=True
    )
    display_name: Mapped[str] = mapped_column(String(200), nullable=False, default="Unnamed patient")
    summary: Mapped[Optional[str]] = mapped_column(String(300))
    step: Mapped[int] = mapped_column(Integer, default=0)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    cancel_reason: Mapped[Optional[str]] = mapped_column(String(300))
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class PatientVitalSign(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    """Nurse-recorded vitals for a registered patient. Latest reading feeds clerkship and exam."""

    __tablename__ = "patient_vital_signs"
    __table_args__ = (Index("ix_patient_vitals_clinic_patient_at", "clinic_id", "patient_id", "recorded_at"),)

    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), index=True)
    recorded_by_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True
    )
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    bp_systolic: Mapped[Optional[int]] = mapped_column(Integer)
    bp_diastolic: Mapped[Optional[int]] = mapped_column(Integer)
    pulse: Mapped[Optional[int]] = mapped_column(Integer)
    temperature_c: Mapped[Optional[float]] = mapped_column(Float)
    spo2: Mapped[Optional[int]] = mapped_column(Integer)
    respiratory_rate: Mapped[Optional[int]] = mapped_column(Integer)
    height_cm: Mapped[Optional[float]] = mapped_column(Float)
    weight_kg: Mapped[Optional[float]] = mapped_column(Float)
    posture: Mapped[Optional[str]] = mapped_column(String(80))
    gait: Mapped[Optional[str]] = mapped_column(String(80))
    appearance: Mapped[Optional[str]] = mapped_column(String(80))
    notes: Mapped[Optional[str]] = mapped_column(String(400))
