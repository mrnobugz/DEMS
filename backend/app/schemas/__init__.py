from datetime import UTC, date, datetime
from typing import Generic, Optional, TypeVar

from pydantic import BaseModel, ConfigDict, EmailStr, Field, computed_field, field_validator, model_validator

from app.schemas.clerkship import (
    MedicalHistoryFlags,
    PainAssessment,
    ReportedSymptoms,
    loads_block,
)
from app.schemas.exam import (
    ExtraOralExam,
    IntraOralExam,
    VisitDiagnosis,
    VisitInvestigations,
    VisitVitals,
)

T = TypeVar("T")
_UNSET = object()


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")


class ErrorDetail(BaseModel):
    field: Optional[str] = None
    message: str


class ErrorEnvelope(BaseModel):
    error: dict


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int


# ── Auth ──────────────────────────────────────────────
class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    clinic_code: Optional[str] = "MAIN"


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: "UserOut"


class RefreshRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    refresh_token: str


class UserOut(ORMModel):
    id: str
    email: EmailStr
    full_name: str
    role: str
    clinic_id: Optional[str] = None
    phone: Optional[str] = None
    specialty: Optional[str] = None
    mfa_enabled: bool = False
    is_active: bool = True


# ── Patients (Digital Clerkship + demographics) ───────
class PatientCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    hospital_reg_number: Optional[str] = Field(default=None, max_length=64)
    date_of_birth: Optional[date] = None
    sex: Optional[str] = None
    marital_status: Optional[str] = None
    occupation: Optional[str] = None
    tribe_nation: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    address: Optional[str] = None
    po_box: Optional[str] = None
    street: Optional[str] = None
    house_number: Optional[str] = None
    area_ward: Optional[str] = None
    town_city: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    next_of_kin: Optional[str] = None
    referral_source: Optional[str] = None
    insurance_number: Optional[str] = None
    chief_complaint: Optional[str] = None
    allergies: Optional[str] = None
    chronic_conditions: Optional[str] = None
    current_medications: Optional[str] = None
    dental_history: Optional[str] = None
    family_social_history: Optional[str] = None
    developmental_history: Optional[str] = None
    pregnancy_trimester: Optional[int] = Field(default=None, ge=1, le=3)
    medical_history: Optional[MedicalHistoryFlags] = None
    pain_assessment: Optional[PainAssessment] = None
    reported_symptoms: Optional[ReportedSymptoms] = None
    notes: Optional[str] = None


class PatientUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    first_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    hospital_reg_number: Optional[str] = Field(default=None, max_length=64)
    date_of_birth: Optional[date] = None
    sex: Optional[str] = None
    marital_status: Optional[str] = None
    occupation: Optional[str] = None
    tribe_nation: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    address: Optional[str] = None
    po_box: Optional[str] = None
    street: Optional[str] = None
    house_number: Optional[str] = None
    area_ward: Optional[str] = None
    town_city: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    next_of_kin: Optional[str] = None
    referral_source: Optional[str] = None
    insurance_number: Optional[str] = None
    chief_complaint: Optional[str] = None
    allergies: Optional[str] = None
    chronic_conditions: Optional[str] = None
    current_medications: Optional[str] = None
    dental_history: Optional[str] = None
    family_social_history: Optional[str] = None
    developmental_history: Optional[str] = None
    pregnancy_trimester: Optional[int] = Field(default=None, ge=1, le=3)
    medical_history: Optional[MedicalHistoryFlags] = None
    pain_assessment: Optional[PainAssessment] = None
    reported_symptoms: Optional[ReportedSymptoms] = None
    notes: Optional[str] = None
    caries_risk_score: Optional[float] = None
    is_active: Optional[bool] = None


class PatientOut(ORMModel):
    id: str
    patient_code: str
    hospital_reg_number: Optional[str] = None
    first_name: str
    last_name: str
    date_of_birth: Optional[date] = None
    sex: Optional[str] = None
    marital_status: Optional[str] = None
    occupation: Optional[str] = None
    tribe_nation: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    po_box: Optional[str] = None
    street: Optional[str] = None
    house_number: Optional[str] = None
    area_ward: Optional[str] = None
    town_city: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    next_of_kin: Optional[str] = None
    referral_source: Optional[str] = None
    insurance_number: Optional[str] = None
    chief_complaint: Optional[str] = None
    allergies: Optional[str] = None
    chronic_conditions: Optional[str] = None
    current_medications: Optional[str] = None
    dental_history: Optional[str] = None
    family_social_history: Optional[str] = None
    developmental_history: Optional[str] = None
    pregnancy_trimester: Optional[int] = None
    medical_history_json: Optional[str] = Field(default=None, exclude=True)
    pain_assessment_json: Optional[str] = Field(default=None, exclude=True)
    reported_symptoms_json: Optional[str] = Field(default=None, exclude=True)
    caries_risk_score: Optional[float] = None
    hygiene_recall_due: Optional[date] = None
    perio_risk_band: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool
    clinic_id: str
    primary_dentist_id: Optional[str] = None
    primary_dentist_name: Optional[str] = None
    created_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def medical_history(self) -> MedicalHistoryFlags:
        return loads_block(self.medical_history_json, MedicalHistoryFlags)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def pain_assessment(self) -> PainAssessment:
        return loads_block(self.pain_assessment_json, PainAssessment)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def reported_symptoms(self) -> ReportedSymptoms:
        return loads_block(self.reported_symptoms_json, ReportedSymptoms)

    @field_validator("pregnancy_trimester")
    @classmethod
    def _trimester(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v not in (1, 2, 3):
            raise ValueError("pregnancy_trimester must be 1, 2, or 3")
        return v

    @model_validator(mode="wrap")
    @classmethod
    def _attach_dentist_name(cls, value, handler):
        result = handler(value)
        if isinstance(value, dict) or not hasattr(value, "__dict__"):
            return result
        # Avoid async lazy-load: only use dentist if already loaded on the instance
        loaded = value.__dict__.get("primary_dentist", _UNSET)
        if loaded is _UNSET:
            return result
        return result.model_copy(
            update={"primary_dentist_name": loaded.full_name if loaded else None}
        )


class PatientAssignDentist(BaseModel):
    model_config = ConfigDict(extra="forbid")
    dentist_id: Optional[str] = None  # null clears assignment


# ── Appointments ──────────────────────────────────────
class AppointmentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    patient_id: str
    dentist_id: str
    appointment_type_id: Optional[str] = None
    chair_number: Optional[int] = Field(default=None, ge=1, le=20)
    starts_at: datetime
    ends_at: datetime
    reason: Optional[str] = None
    notes: Optional[str] = None
    color: Optional[str] = None
    waitlist: bool = False


class AppointmentUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    dentist_id: Optional[str] = None
    appointment_type_id: Optional[str] = None
    chair_number: Optional[int] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    status: Optional[str] = None
    reason: Optional[str] = None
    notes: Optional[str] = None
    color: Optional[str] = None
    waitlist: Optional[bool] = None


class AppointmentOut(ORMModel):
    id: str
    patient_id: str
    dentist_id: str
    appointment_type_id: Optional[str] = None
    chair_number: Optional[int] = None
    starts_at: datetime
    ends_at: datetime
    status: str
    reason: Optional[str] = None
    notes: Optional[str] = None
    color: Optional[str] = None
    waitlist: bool
    no_show: bool
    clinic_id: str
    patient: Optional[PatientOut] = None


class AppointmentTypeOut(ORMModel):
    id: str
    name: str
    category: str
    duration_minutes: int
    color: str
    default_fee: float


# ── Clinical ──────────────────────────────────────────
class ChartEntryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tooth_number: str = Field(min_length=1, max_length=8)
    surfaces: Optional[str] = None
    notation: str = "FDI"
    dentition: str = "permanent"
    condition_code: str
    condition_label: str
    entry_kind: str = "existing"
    status: str = "recorded"
    material: Optional[str] = None
    shade: Optional[str] = None
    notes: Optional[str] = None
    visit_date: Optional[date] = None


class ChartEntryOut(ORMModel):
    id: str
    patient_id: str
    tooth_number: str
    surfaces: Optional[str] = None
    notation: str
    dentition: str
    condition_code: str
    condition_label: str
    entry_kind: str
    status: str
    material: Optional[str] = None
    shade: Optional[str] = None
    notes: Optional[str] = None
    visit_date: Optional[date] = None
    billed_invoice_id: Optional[str] = None
    created_at: datetime


class ClinicalNoteCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    appointment_id: Optional[str] = None
    note_type: str = "soap"
    subjective: Optional[str] = None
    objective: Optional[str] = None
    assessment: Optional[str] = None
    plan: Optional[str] = None
    procedure_codes: Optional[str] = None
    is_finalized: bool = False
    ai_draft: bool = False


class ClinicalNoteOut(ORMModel):
    id: str
    patient_id: str
    author_id: str
    appointment_id: Optional[str] = None
    note_type: str
    subjective: Optional[str] = None
    objective: Optional[str] = None
    assessment: Optional[str] = None
    plan: Optional[str] = None
    procedure_codes: Optional[str] = None
    is_finalized: bool
    ai_draft: bool
    created_at: datetime


class ConsentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    procedure_name: str
    signature_data: Optional[str] = None
    signed_by_name: Optional[str] = None
    guardian: bool = False


class ConsentOut(ORMModel):
    id: str
    patient_id: str
    procedure_name: str
    version: int
    signed_at: Optional[datetime] = None
    signed_by_name: Optional[str] = None
    guardian: bool
    document_hash: Optional[str] = None
    created_at: Optional[datetime] = None
    signature_data: Optional[str] = Field(default=None, exclude=True)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def has_signature(self) -> bool:
        return bool(self.signature_data)


class OutstandingInvoiceOut(BaseModel):
    id: str
    invoice_number: str
    patient_id: str
    patient_name: str
    patient_code: str
    total: float
    amount_paid: float
    balance: float
    status: str
    issued_at: Optional[datetime] = None
    days_outstanding: int
    aging_bucket: str
    currency: str = "USD"


class CashUpOut(BaseModel):
    date: str
    total: float
    by_method: dict[str, float]
    payment_count: int


class ToothHistoryEventOut(BaseModel):
    kind: str
    id: str
    occurred_at: Optional[datetime] = None
    summary: str
    status: Optional[str] = None
    details: dict = Field(default_factory=dict)


class ToothHistoryOut(BaseModel):
    tooth_number: str
    events: list[ToothHistoryEventOut]


class TreatmentPlanItemCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    phase_name: str = Field(min_length=1, max_length=120)
    phase_order: int = Field(default=1, ge=1, le=20)
    procedure_name: str = Field(min_length=1, max_length=200)
    procedure_code: Optional[str] = None
    icd10_code: Optional[str] = Field(default=None, max_length=16)
    icd10_description: Optional[str] = Field(default=None, max_length=400)
    tooth_number: Optional[str] = None
    dependency_ref: Optional[str] = None
    description: Optional[str] = None
    estimated_fee: float = Field(default=0.0, ge=0)
    insurance_coverage_pct: float = Field(default=0.0, ge=0, le=100)
    target_date: Optional[date] = None
    status: str = "proposed"
    notes: Optional[str] = None


class TreatmentPlanCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=200)
    target_start_date: Optional[date] = None
    target_end_date: Optional[date] = None
    approval_notes: Optional[str] = None
    items: list[TreatmentPlanItemCreate] = Field(min_length=1)


class TreatmentPlanUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    status: Optional[str] = None
    target_start_date: Optional[date] = None
    target_end_date: Optional[date] = None
    accepted_by_name: Optional[str] = None
    approval_notes: Optional[str] = None


class TreatmentPlanItemOut(ORMModel):
    id: str
    phase_name: str
    phase_order: int
    procedure_name: str
    procedure_code: Optional[str] = None
    icd10_code: Optional[str] = None
    icd10_description: Optional[str] = None
    tooth_number: Optional[str] = None
    dependency_ref: Optional[str] = None
    description: Optional[str] = None
    estimated_fee: float
    insurance_coverage_pct: float
    insurance_estimate_amount: float
    patient_estimate_amount: float
    target_date: Optional[date] = None
    status: str
    notes: Optional[str] = None


class TreatmentPlanOut(ORMModel):
    id: str
    patient_id: str
    title: str
    status: str
    target_start_date: Optional[date] = None
    target_end_date: Optional[date] = None
    accepted_at: Optional[datetime] = None
    accepted_by_name: Optional[str] = None
    approval_notes: Optional[str] = None
    created_at: datetime
    items: list[TreatmentPlanItemOut] = []


PERIO_SITE_CODES = ("mb", "b", "db", "ml", "l", "dl")


class PerioSiteCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tooth_number: str = Field(min_length=1, max_length=8)
    site_code: str = Field(min_length=1, max_length=8)
    pocket_depth_mm: Optional[int] = Field(default=None, ge=0, le=15)
    bleeding_on_probing: bool = False
    recession_mm: Optional[int] = Field(default=None, ge=0, le=15)
    plaque_index: Optional[float] = Field(default=None, ge=0, le=3)
    gingival_index: Optional[float] = Field(default=None, ge=0, le=3)
    mobility_grade: Optional[int] = Field(default=None, ge=0, le=3)
    furcation_grade: Optional[int] = Field(default=None, ge=0, le=3)
    notes: Optional[str] = None


class PerioExamCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    exam_date: Optional[date] = None
    notes: Optional[str] = None
    sites: list[PerioSiteCreate] = Field(min_length=1)


class PerioSiteOut(ORMModel):
    id: str
    tooth_number: str
    site_code: str
    pocket_depth_mm: Optional[int] = None
    bleeding_on_probing: bool
    recession_mm: Optional[int] = None
    plaque_index: Optional[float] = None
    gingival_index: Optional[float] = None
    mobility_grade: Optional[int] = None
    furcation_grade: Optional[int] = None
    notes: Optional[str] = None


class PerioExamOut(ORMModel):
    id: str
    patient_id: str
    examiner_id: Optional[str] = None
    exam_date: date
    notes: Optional[str] = None
    risk_band: str
    suggested_recall_months: int
    mean_pocket_depth: Optional[float] = None
    bleeding_pct: Optional[float] = None
    created_at: datetime
    sites: list[PerioSiteOut] = []


# ── Billing ───────────────────────────────────────────
class InvoiceLineCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    description: str
    tooth_number: Optional[str] = None
    quantity: int = 1
    unit_price: float
    procedure_code: Optional[str] = None
    chart_entry_id: Optional[str] = None


class InvoiceCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    patient_id: str
    line_items: list[InvoiceLineCreate]
    tax: float = 0.0
    discount: float = 0.0
    notes: Optional[str] = None
    idempotency_key: Optional[str] = None


class PaymentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    amount: float = Field(gt=0)
    method: str = "cash"
    reference: Optional[str] = None
    idempotency_key: Optional[str] = None


class InvoiceLineOut(ORMModel):
    id: str
    description: str
    tooth_number: Optional[str] = None
    quantity: int
    unit_price: float
    total: float
    procedure_code: Optional[str] = None
    chart_entry_id: Optional[str] = None


class PaymentOut(ORMModel):
    id: str
    amount: float
    method: str
    paid_at: datetime
    reference: Optional[str] = None


class InvoiceOut(ORMModel):
    id: str
    patient_id: str
    invoice_number: str
    status: str
    subtotal: float
    tax: float
    discount: float
    total: float
    amount_paid: float
    currency: str
    notes: Optional[str] = None
    issued_at: Optional[datetime] = None
    line_items: list[InvoiceLineOut] = []
    payments: list[PaymentOut] = []


class FeeScheduleItemCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(min_length=1, max_length=40)
    label: str = Field(min_length=1, max_length=200)
    category: str = "general"
    unit_price: float = Field(ge=0)
    currency: str = "USD"
    is_active: bool = True
    billable: bool = True
    notes: Optional[str] = None


class FeeScheduleItemUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    label: Optional[str] = Field(default=None, min_length=1, max_length=200)
    category: Optional[str] = None
    unit_price: Optional[float] = Field(default=None, ge=0)
    currency: Optional[str] = None
    is_active: Optional[bool] = None
    billable: Optional[bool] = None
    notes: Optional[str] = None


class FeeScheduleItemOut(ORMModel):
    id: str
    code: str
    label: str
    category: str
    unit_price: float
    currency: str
    is_active: bool
    billable: bool
    notes: Optional[str] = None
    clinic_id: str


class ChartToCashRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    patient_id: str
    chart_entry_ids: Optional[list[str]] = None  # None = all unbilled billable
    tax: float = 0.0
    discount: float = 0.0
    notes: Optional[str] = None
    idempotency_key: Optional[str] = None


class BillableChartEntryOut(ORMModel):
    id: str
    patient_id: str
    tooth_number: str
    surfaces: Optional[str] = None
    condition_code: str
    condition_label: str
    entry_kind: str
    status: str
    material: Optional[str] = None
    unit_price: float
    fee_label: Optional[str] = None
    billed_invoice_id: Optional[str] = None
    created_at: datetime


# ── AI ────────────────────────────────────────────────
class CariesRiskRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    patient_id: str


class SmartSlotRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    dentist_id: str
    duration_minutes: int = 30
    preferred_date: Optional[date] = None


class AiSuggestionOut(BaseModel):
    is_ai_suggested: bool = True
    suggestion_type: str
    summary: str
    details: dict
    confidence: float


class DashboardStats(BaseModel):
    patients_total: int
    appointments_today: int
    revenue_month: float
    no_shows_week: int
    open_invoices: int
    caries_high_risk: int


# ── Clinical visits / examination ─────────────────────
class ClinicalVisitCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    visit_date: Optional[date] = None
    appointment_id: Optional[str] = None
    chief_complaint: Optional[str] = None
    status: str = "in_progress"
    vitals: Optional[VisitVitals] = None
    extra_oral: Optional[ExtraOralExam] = None
    intra_oral: Optional[IntraOralExam] = None
    investigations: Optional[VisitInvestigations] = None
    diagnosis: Optional[VisitDiagnosis] = None
    notes: Optional[str] = None


class ClinicalVisitUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    visit_date: Optional[date] = None
    appointment_id: Optional[str] = None
    chief_complaint: Optional[str] = None
    status: Optional[str] = None
    vitals: Optional[VisitVitals] = None
    extra_oral: Optional[ExtraOralExam] = None
    intra_oral: Optional[IntraOralExam] = None
    investigations: Optional[VisitInvestigations] = None
    diagnosis: Optional[VisitDiagnosis] = None
    notes: Optional[str] = None


class ClinicalVisitOut(ORMModel):
    id: str
    patient_id: str
    appointment_id: Optional[str] = None
    examiner_id: Optional[str] = None
    visit_date: date
    status: str
    chief_complaint: Optional[str] = None
    vitals_json: Optional[str] = Field(default=None, exclude=True)
    extra_oral_json: Optional[str] = Field(default=None, exclude=True)
    intra_oral_json: Optional[str] = Field(default=None, exclude=True)
    investigations_json: Optional[str] = Field(default=None, exclude=True)
    diagnosis_json: Optional[str] = Field(default=None, exclude=True)
    notes: Optional[str] = None
    clinic_id: str
    created_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def vitals(self) -> VisitVitals:
        return loads_block(self.vitals_json, VisitVitals)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def extra_oral(self) -> ExtraOralExam:
        return loads_block(self.extra_oral_json, ExtraOralExam)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def intra_oral(self) -> IntraOralExam:
        return loads_block(self.intra_oral_json, IntraOralExam)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def investigations(self) -> VisitInvestigations:
        return loads_block(self.investigations_json, VisitInvestigations)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def diagnosis(self) -> VisitDiagnosis:
        return loads_block(self.diagnosis_json, VisitDiagnosis)


TokenResponse.model_rebuild()


# ── Department shell DTOs ─────────────────────────────
class ClinicCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=2, max_length=200)
    code: str = Field(min_length=2, max_length=32)
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    timezone: str = "UTC"
    currency: str = "USD"


class ClinicUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Optional[str] = Field(default=None, min_length=2, max_length=200)
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    timezone: Optional[str] = None
    currency: Optional[str] = None
    is_active: Optional[bool] = None


class ClinicOut(ORMModel):
    id: str
    name: str
    code: str
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    timezone: str
    currency: str
    is_active: bool
    created_at: datetime


class StaffCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=2, max_length=200)
    role: str
    phone: Optional[str] = None
    specialty: Optional[str] = None
    title: Optional[str] = None
    department: Optional[str] = None


class StaffProfileOut(ORMModel):
    id: str
    user_id: str
    title: Optional[str] = None
    specialty: Optional[str] = None
    department: Optional[str] = None
    certifications_json: Optional[str] = None
    notes: Optional[str] = None


class StaffOut(ORMModel):
    id: str
    email: EmailStr
    full_name: str
    role: str
    clinic_id: Optional[str] = None
    phone: Optional[str] = None
    specialty: Optional[str] = None
    is_active: bool
    profile: Optional[StaffProfileOut] = None


class InventoryItemCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sku: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=200)
    category: str = "general"
    quantity: float = 0
    reorder_level: float = 0
    unit: str = "unit"
    unit_cost: float = 0
    notes: Optional[str] = None
    expiry_date: Optional[date] = None


class InventoryItemUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Optional[str] = None
    category: Optional[str] = None
    quantity: Optional[float] = None
    reorder_level: Optional[float] = None
    unit: Optional[str] = None
    unit_cost: Optional[float] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class InventoryAdjust(BaseModel):
    model_config = ConfigDict(extra="forbid")
    delta: float
    reason: Optional[str] = None


class InventoryItemOut(ORMModel):
    id: str
    sku: str
    name: str
    category: str
    quantity: float
    reorder_level: float
    unit: str
    unit_cost: float
    is_active: bool
    notes: Optional[str] = None
    expiry_date: Optional[date] = None
    supplier_id: Optional[str] = None
    created_at: datetime


class LabCaseCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    patient_id: str
    tooth: Optional[str] = None
    shade: Optional[str] = None
    case_type: str = "crown"
    status: str = "draft"
    lab_name: Optional[str] = None
    due_at: Optional[datetime] = None
    lab_cost: float = 0
    notes: Optional[str] = None
    restoration_id: Optional[str] = None
    restoration_case_id: Optional[str] = None


class LabCaseUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tooth: Optional[str] = None
    shade: Optional[str] = None
    case_type: Optional[str] = None
    status: Optional[str] = None
    lab_name: Optional[str] = None
    due_at: Optional[datetime] = None
    lab_cost: Optional[float] = None
    notes: Optional[str] = None
    restoration_id: Optional[str] = None
    restoration_case_id: Optional[str] = None


class LabCaseOut(ORMModel):
    id: str
    patient_id: str
    dentist_id: Optional[str] = None
    tooth: Optional[str] = None
    shade: Optional[str] = None
    case_type: str
    status: str
    lab_name: Optional[str] = None
    sent_at: Optional[datetime] = None
    due_at: Optional[datetime] = None
    received_at: Optional[datetime] = None
    fitted_at: Optional[datetime] = None
    lab_cost: float
    notes: Optional[str] = None
    restoration_id: Optional[str] = None
    restoration_case_id: Optional[str] = None
    is_overdue: bool = False
    created_at: datetime

    @model_validator(mode="wrap")
    @classmethod
    def _compute_overdue(cls, value, handler):
        result = handler(value)
        due = getattr(value, "due_at", None) if not isinstance(value, dict) else value.get("due_at")
        status = getattr(value, "status", None) if not isinstance(value, dict) else value.get("status")
        overdue = False
        if due and status not in ("fitted", "cancelled", "draft"):
            now = datetime.now(due.tzinfo) if getattr(due, "tzinfo", None) else datetime.now(UTC)
            try:
                overdue = due < now
            except TypeError:
                overdue = False
        return result.model_copy(update={"is_overdue": overdue})


class ImagingStudyCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    patient_id: str
    study_type: str = Field(min_length=1, max_length=80)
    tooth: Optional[str] = None
    visit_id: Optional[str] = None
    storage_key: Optional[str] = None
    notes: Optional[str] = None
    captured_at: Optional[datetime] = None


class ImagingStudyOut(ORMModel):
    id: str
    patient_id: str
    captured_by_id: Optional[str] = None
    visit_id: Optional[str] = None
    study_type: str
    tooth: Optional[str] = None
    captured_at: datetime
    storage_key: Optional[str] = None
    content_type: Optional[str] = None
    byte_size: Optional[int] = None
    checksum_sha256: Optional[str] = None
    is_encrypted: bool = False
    original_filename: Optional[str] = None
    notes: Optional[str] = None
    has_content: bool = False
    created_at: datetime

    @model_validator(mode="wrap")
    @classmethod
    def _has_content_flag(cls, value, handler):
        result = handler(value)
        key = getattr(value, "storage_key", None) if not isinstance(value, dict) else value.get("storage_key")
        return result.model_copy(
            update={"has_content": bool(key and str(key).startswith("localenc://"))}
        )


class PatientInsurancePlanCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    payer_name: str = Field(min_length=1, max_length=200)
    plan_name: Optional[str] = None
    member_id: Optional[str] = None
    group_number: Optional[str] = None
    coverage_pct: float = Field(default=80.0, ge=0, le=100)
    annual_max: Optional[float] = Field(default=None, ge=0)
    lifetime_max: Optional[float] = Field(default=None, ge=0)
    amount_used_ytd: float = Field(default=0.0, ge=0)
    deductible: float = Field(default=0.0, ge=0)
    deductible_met: float = Field(default=0.0, ge=0)
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    is_primary: bool = True
    notes: Optional[str] = None


class PatientInsurancePlanUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    payer_name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    plan_name: Optional[str] = None
    member_id: Optional[str] = None
    group_number: Optional[str] = None
    coverage_pct: Optional[float] = Field(default=None, ge=0, le=100)
    annual_max: Optional[float] = Field(default=None, ge=0)
    lifetime_max: Optional[float] = Field(default=None, ge=0)
    amount_used_ytd: Optional[float] = Field(default=None, ge=0)
    deductible: Optional[float] = Field(default=None, ge=0)
    deductible_met: Optional[float] = Field(default=None, ge=0)
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    is_primary: Optional[bool] = None
    notes: Optional[str] = None


class PatientInsurancePlanOut(ORMModel):
    id: str
    patient_id: str
    payer_name: str
    plan_name: Optional[str] = None
    member_id: Optional[str] = None
    group_number: Optional[str] = None
    coverage_pct: float
    annual_max: Optional[float] = None
    lifetime_max: Optional[float] = None
    amount_used_ytd: float
    deductible: float
    deductible_met: float
    remaining_annual: Optional[float] = None
    remaining_deductible: float = 0
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    is_primary: bool
    notes: Optional[str] = None
    clinic_id: str
    created_at: datetime

    @model_validator(mode="wrap")
    @classmethod
    def _remaining(cls, value, handler):
        result = handler(value)
        annual = result.annual_max
        remaining_annual = None if annual is None else max(annual - result.amount_used_ytd, 0.0)
        remaining_deductible = max(result.deductible - result.deductible_met, 0.0)
        return result.model_copy(
            update={
                "remaining_annual": remaining_annual,
                "remaining_deductible": remaining_deductible,
            }
        )


class InsuranceEstimateOut(BaseModel):
    patient_id: str
    subtotal: float
    coverage_pct: float
    deductible_remaining: float
    insurance_estimate: float
    patient_estimate: float
    plan_id: Optional[str] = None
    payer_name: Optional[str] = None
    notes: str = ""


class DrugTemplateCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    category: str = "general"
    default_dose: str
    default_quantity: str = "1"
    instructions: Optional[str] = None


class DrugTemplateOut(ORMModel):
    id: str
    name: str
    category: str
    default_dose: str
    default_quantity: str
    instructions: Optional[str] = None
    is_active: bool


class PrescriptionItemIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    drug_name: str
    dose: str
    quantity: str = "1"
    instructions: Optional[str] = None


class PrescriptionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    patient_id: str
    notes: Optional[str] = None
    items: list[PrescriptionItemIn] = Field(min_length=1)


class PrescriptionItemOut(ORMModel):
    id: str
    drug_name: str
    dose: str
    quantity: str
    instructions: Optional[str] = None


class PrescriptionOut(ORMModel):
    id: str
    patient_id: str
    prescribed_by_id: Optional[str] = None
    status: str
    notes: Optional[str] = None
    prescribed_at: datetime
    items: list[PrescriptionItemOut] = []
    created_at: datetime


class PrescriptionStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: str


class DepartmentHomeOut(BaseModel):
    role: str
    today_appointments: int = 0
    checked_in: int = 0
    waitlist: int = 0
    open_lab_cases: int = 0
    overdue_lab_cases: int = 0
    low_stock_items: int = 0
    open_prescriptions: int = 0
    outstanding_balance: float = 0
    imaging_today: int = 0
    patients_total: int = 0


class ChainStatsOut(BaseModel):
    clinics: int
    active_clinics: int
    staff_total: int
    patients_total: int
    appointments_today: int
    revenue_open: float


# ── Phase 2 clinical depth ────────────────────────────
class RestorationCaseCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    primary_tooth: str
    case_type: str = "restorative"
    warranty_months: int = 12
    lab_case_id: Optional[str] = None
    fee_code: Optional[str] = None
    notes: Optional[str] = None


class RestorationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tooth_number: str
    surfaces: str = ""
    restoration_type: str
    cavity_size: Optional[str] = None
    blacks_class: Optional[str] = None
    material: Optional[str] = None
    shade: Optional[str] = None
    status: str = "planned"
    case_id: Optional[str] = None
    notes: Optional[str] = None


class RestorationStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: str
    inventory_item_id: Optional[str] = None
    inventory_qty: float = 1.0


class RestorationQualityIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    marginal_adaptation: Optional[int] = Field(default=None, ge=1, le=5)
    contacts: Optional[int] = Field(default=None, ge=1, le=5)
    wear: Optional[int] = Field(default=None, ge=1, le=5)
    postop_sensitivity: Optional[int] = Field(default=None, ge=1, le=5)
    pulp_status: Optional[str] = None
    color_match: Optional[int] = Field(default=None, ge=1, le=5)
    finishing: Optional[int] = Field(default=None, ge=1, le=5)
    notes: Optional[str] = None


class RestorationQualityOut(ORMModel):
    id: str
    restoration_id: str
    marginal_adaptation: Optional[int] = None
    contacts: Optional[int] = None
    wear: Optional[int] = None
    postop_sensitivity: Optional[int] = None
    pulp_status: Optional[str] = None
    color_match: Optional[int] = None
    finishing: Optional[int] = None
    notes: Optional[str] = None


class RestorationOut(ORMModel):
    id: str
    case_id: Optional[str] = None
    patient_id: str
    tooth_number: str
    surfaces: str
    restoration_type: str
    cavity_size: Optional[str] = None
    blacks_class: Optional[str] = None
    material: Optional[str] = None
    shade: Optional[str] = None
    status: str
    chart_entry_id: Optional[str] = None
    notes: Optional[str] = None
    quality: Optional[RestorationQualityOut] = None
    created_at: datetime


class RestorationCaseOut(ORMModel):
    id: str
    patient_id: str
    primary_tooth: str
    case_type: str
    status: str
    warranty_months: int
    recall_due_at: Optional[date] = None
    lab_case_id: Optional[str] = None
    fee_code: Optional[str] = None
    notes: Optional[str] = None
    restorations: list[RestorationOut] = []
    created_at: datetime


class EndoCaseCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tooth_number: str
    procedure_type: str = "rct"
    tooth_length_mm: Optional[float] = None
    canal_count: Optional[int] = None
    working_length_mm: Optional[float] = None
    prep_method: Optional[str] = None
    irrigants: list[str] = Field(default_factory=list)
    dressings: list[str] = Field(default_factory=list)
    status: str = "in_progress"
    notes: Optional[str] = None


class EndoCaseUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    procedure_type: Optional[str] = None
    tooth_length_mm: Optional[float] = None
    canal_count: Optional[int] = None
    working_length_mm: Optional[float] = None
    prep_method: Optional[str] = None
    irrigants: Optional[list[str]] = None
    dressings: Optional[list[str]] = None
    status: Optional[str] = None
    final_restoration_id: Optional[str] = None
    notes: Optional[str] = None


class EndoObturationIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    visit_date: Optional[date] = None
    canals_filled: Optional[str] = None
    material: Optional[str] = None
    notes: Optional[str] = None


class EndoObturationOut(ORMModel):
    id: str
    visit_date: date
    canals_filled: Optional[str] = None
    material: Optional[str] = None
    notes: Optional[str] = None


class EndoCaseOut(ORMModel):
    id: str
    patient_id: str
    tooth_number: str
    procedure_type: str
    tooth_length_mm: Optional[float] = None
    canal_count: Optional[int] = None
    working_length_mm: Optional[float] = None
    prep_method: Optional[str] = None
    irrigants_json: Optional[str] = None
    dressings_json: Optional[str] = None
    status: str
    final_restoration_id: Optional[str] = None
    notes: Optional[str] = None
    obturations: list[EndoObturationOut] = []
    created_at: datetime


class SupplierCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    contact_email: Optional[EmailStr] = None
    contact_phone: Optional[str] = None
    notes: Optional[str] = None


class SupplierOut(ORMModel):
    id: str
    name: str
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool


class PurchaseOrderCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    supplier_id: str
    expected_at: Optional[date] = None
    notes: Optional[str] = None
    lines: list[dict] = Field(default_factory=list)


class PurchaseOrderOut(ORMModel):
    id: str
    supplier_id: str
    status: str
    ordered_at: Optional[datetime] = None
    expected_at: Optional[date] = None
    notes: Optional[str] = None
    lines_json: Optional[str] = None
    created_at: datetime


class StaffShiftCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: str
    starts_at: datetime
    ends_at: datetime
    role_label: Optional[str] = None
    notes: Optional[str] = None


class StaffShiftOut(ORMModel):
    id: str
    user_id: str
    starts_at: datetime
    ends_at: datetime
    role_label: Optional[str] = None
    notes: Optional[str] = None


class StaffLeaveCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: str
    starts_on: date
    ends_on: date
    leave_type: str = "annual"
    status: str = "approved"
    notes: Optional[str] = None


class StaffLeaveOut(ORMModel):
    id: str
    user_id: str
    starts_on: date
    ends_on: date
    leave_type: str
    status: str
    notes: Optional[str] = None


class RxWarnRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    patient_id: str
    drug_name: str


class RxWarnOut(BaseModel):
    warnings: list[str]
    severity: str = "advisory"
