import json
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
    extra_permissions: list[str] = []
    denied_permissions: list[str] = []
    effective_permissions: list[str] = []

    @model_validator(mode="before")
    @classmethod
    def _hydrate_permissions(cls, data):
        from app.core.rbac import user_access_payload

        if hasattr(data, "id") and hasattr(data, "role"):
            return {
                "id": data.id,
                "email": data.email,
                "full_name": data.full_name,
                "role": data.role,
                "clinic_id": data.clinic_id,
                "phone": data.phone,
                "specialty": data.specialty,
                "mfa_enabled": getattr(data, "mfa_enabled", False),
                "is_active": data.is_active,
                **user_access_payload(data),
            }
        return data


class ModuleOut(BaseModel):
    key: str
    name: str
    description: str
    icon: str
    route_path: str
    sort_order: int = 0


# ── Patients (Digital Clerkship + demographics) ───────
class PatientCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    first_name: str = Field(min_length=1, max_length=100)
    middle_name: Optional[str] = Field(default=None, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    hospital_reg_number: Optional[str] = Field(default=None, max_length=64)
    national_id: Optional[str] = Field(default=None, max_length=64)
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
    next_of_kin_relationship: Optional[str] = None
    next_of_kin_phone: Optional[str] = None
    guardian_name: Optional[str] = None
    guardian_relationship: Optional[str] = None
    guardian_phone: Optional[str] = None
    referral_source: Optional[str] = None
    insurance_number: Optional[str] = None
    chief_complaint: Optional[str] = None
    history_of_presenting_complaint: Optional[str] = None
    last_dental_visit: Optional[str] = None
    smoking_status: Optional[str] = None
    alcohol_use: Optional[str] = None
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
    guarantor_patient_id: Optional[str] = None


class PatientUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    first_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    middle_name: Optional[str] = Field(default=None, max_length=100)
    last_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    hospital_reg_number: Optional[str] = Field(default=None, max_length=64)
    national_id: Optional[str] = Field(default=None, max_length=64)
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
    next_of_kin_relationship: Optional[str] = None
    next_of_kin_phone: Optional[str] = None
    guardian_name: Optional[str] = None
    guardian_relationship: Optional[str] = None
    guardian_phone: Optional[str] = None
    referral_source: Optional[str] = None
    insurance_number: Optional[str] = None
    chief_complaint: Optional[str] = None
    history_of_presenting_complaint: Optional[str] = None
    last_dental_visit: Optional[str] = None
    smoking_status: Optional[str] = None
    alcohol_use: Optional[str] = None
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
    guarantor_patient_id: Optional[str] = None
    medical_history_reviewed_at: Optional[datetime] = None


class PatientOut(ORMModel):
    id: str
    patient_code: str
    hospital_reg_number: Optional[str] = None
    first_name: str
    middle_name: Optional[str] = None
    last_name: str
    national_id: Optional[str] = None
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
    next_of_kin_relationship: Optional[str] = None
    next_of_kin_phone: Optional[str] = None
    guardian_name: Optional[str] = None
    guardian_relationship: Optional[str] = None
    guardian_phone: Optional[str] = None
    referral_source: Optional[str] = None
    insurance_number: Optional[str] = None
    chief_complaint: Optional[str] = None
    history_of_presenting_complaint: Optional[str] = None
    last_dental_visit: Optional[str] = None
    smoking_status: Optional[str] = None
    alcohol_use: Optional[str] = None
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
    registration_status: str = "draft"
    destination_department: Optional[str] = None
    registration_finalized_at: Optional[datetime] = None
    has_outstanding: bool = False
    photo_storage_key: Optional[str] = Field(default=None, exclude=True)
    photo_content_type: Optional[str] = Field(default=None, exclude=True)
    created_at: datetime
    merged_into_id: Optional[str] = None
    guarantor_patient_id: Optional[str] = None
    medical_history_reviewed_at: Optional[datetime] = None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def has_photo(self) -> bool:
        return bool(self.photo_storage_key)

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


class PatientSafetyCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: str = Field(min_length=1, max_length=20)
    code: str = Field(min_length=1, max_length=80)
    label: str = Field(min_length=1, max_length=200)
    notes: Optional[str] = None


class PatientSafetyOut(ORMModel):
    id: str
    patient_id: str
    kind: str
    code: str
    label: str
    notes: Optional[str] = None
    is_active: bool


class PatientSafetySummaryOut(BaseModel):
    patient_id: str
    pregnancy_trimester: Optional[int] = None
    latex_allergy: bool = False
    history_reviewed_at: Optional[datetime] = None
    merged_into_id: Optional[str] = None
    items: list[PatientSafetyOut] = Field(default_factory=list)
    allergies_text: Optional[str] = None
    conditions_text: Optional[str] = None
    medications_text: Optional[str] = None


class PatientMergeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    drop_id: str


class VitalSignCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    bp_systolic: Optional[int] = Field(default=None, ge=50, le=300)
    bp_diastolic: Optional[int] = Field(default=None, ge=30, le=200)
    pulse: Optional[int] = Field(default=None, ge=20, le=250)
    temperature_c: Optional[float] = Field(default=None, ge=30, le=45)
    spo2: Optional[int] = Field(default=None, ge=50, le=100)
    respiratory_rate: Optional[int] = Field(default=None, ge=5, le=80)
    height_cm: Optional[float] = Field(default=None, ge=30, le=280)
    weight_kg: Optional[float] = Field(default=None, ge=1, le=400)
    posture: Optional[str] = None
    gait: Optional[str] = None
    appearance: Optional[str] = None
    notes: Optional[str] = Field(default=None, max_length=400)


class VitalSignOut(ORMModel):
    id: str
    patient_id: str
    recorded_by_id: Optional[str] = None
    recorded_by_name: Optional[str] = None
    recorded_at: datetime
    bp_systolic: Optional[int] = None
    bp_diastolic: Optional[int] = None
    pulse: Optional[int] = None
    temperature_c: Optional[float] = None
    spo2: Optional[int] = None
    respiratory_rate: Optional[int] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    posture: Optional[str] = None
    gait: Optional[str] = None
    appearance: Optional[str] = None
    notes: Optional[str] = None
    clinic_id: str
    created_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def bmi(self) -> Optional[float]:
        if not self.height_cm or not self.weight_kg or self.height_cm <= 0:
            return None
        metres = self.height_cm / 100.0
        return round(self.weight_kg / (metres * metres), 1)


class VitalsWorklistItemOut(BaseModel):
    patient: PatientOut
    has_vitals: bool
    last_recorded_at: Optional[datetime] = None


# ── Appointments ──────────────────────────────────────
class AppointmentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    patient_id: str
    dentist_id: str
    appointment_type_id: Optional[str] = None
    chair_number: Optional[int] = Field(default=None, ge=1, le=20)
    operatory_id: Optional[str] = None
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
    operatory_id: Optional[str] = None
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
    operatory_id: Optional[str] = None
    starts_at: datetime
    ends_at: datetime
    status: str
    reason: Optional[str] = None
    notes: Optional[str] = None
    color: Optional[str] = None
    waitlist: bool
    no_show: bool
    queue_number: Optional[int] = None
    service_name: Optional[str] = None
    department: Optional[str] = None
    is_appointment: bool = True
    clinic_id: str
    patient: Optional[PatientOut] = None


class AppointmentTypeOut(ORMModel):
    id: str
    name: str
    category: str
    duration_minutes: int
    color: str
    default_fee: float


class OrgDepartmentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=120)
    head_user_id: Optional[str] = None
    sort_order: int = 0
    notes: Optional[str] = None


class OrgDepartmentUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Optional[str] = None
    head_user_id: Optional[str] = None
    stock_location_id: Optional[str] = None
    sort_order: Optional[int] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class OrgDepartmentOut(ORMModel):
    id: str
    clinic_id: str
    code: str
    name: str
    head_user_id: Optional[str] = None
    stock_location_id: Optional[str] = None
    sort_order: int
    notes: Optional[str] = None
    is_active: bool


class OperatoryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=120)
    department_id: Optional[str] = None
    chair_number: Optional[int] = Field(default=None, ge=1, le=40)
    sort_order: int = 0
    notes: Optional[str] = None


class OperatoryUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Optional[str] = None
    department_id: Optional[str] = None
    chair_number: Optional[int] = None
    sort_order: Optional[int] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class OperatoryOut(ORMModel):
    id: str
    clinic_id: str
    department_id: Optional[str] = None
    code: str
    name: str
    chair_number: Optional[int] = None
    sort_order: int
    notes: Optional[str] = None
    is_active: bool


class WorkingHoursDayIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    day_of_week: int = Field(ge=0, le=6)
    starts_on: str
    ends_on: str


class WorkingHoursReplace(BaseModel):
    model_config = ConfigDict(extra="forbid")
    days: list[WorkingHoursDayIn]


class WorkingHoursOut(ORMModel):
    id: str
    clinic_id: str
    owner_type: str
    owner_id: Optional[str] = None
    day_of_week: int
    starts_on: str
    ends_on: str
    is_active: bool


class HolidayCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    holiday_date: date
    name: str = Field(min_length=1, max_length=160)
    notes: Optional[str] = None


class HolidayOut(ORMModel):
    id: str
    clinic_id: str
    holiday_date: date
    name: str
    notes: Optional[str] = None
    is_active: bool


class SystemSettingUpsert(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: str = Field(min_length=1, max_length=120)
    value: str
    scope: str = "clinic"
    user_id: Optional[str] = None


class SystemSettingOut(ORMModel):
    id: str
    clinic_id: Optional[str] = None
    user_id: Optional[str] = None
    scope: str
    key: str
    value: str


class NumberSequenceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    prefix: Optional[str] = None
    padding: Optional[int] = Field(default=None, ge=1, le=10)
    next_value: Optional[int] = Field(default=None, ge=1)
    year_reset: Optional[bool] = None


class NumberSequenceOut(ORMModel):
    id: str
    clinic_id: str
    document_type: str
    prefix: str
    padding: int
    next_value: int
    year_reset: bool
    current_year: int


class DomainEventOut(ORMModel):
    id: str
    clinic_id: str
    event_type: str
    aggregate_type: str
    aggregate_id: str
    payload_json: str
    occurred_at: datetime
    published_at: Optional[datetime] = None
    actor_id: Optional[str] = None


class RolePermissionSet(BaseModel):
    model_config = ConfigDict(extra="forbid")
    permission_id: str = Field(min_length=1, max_length=80)
    allowed: bool


class RolePermissionOut(ORMModel):
    id: str
    clinic_id: str
    role: str
    permission_id: str
    allowed: bool


class ConfigCatalogCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Optional[str] = Field(default=None, min_length=1, max_length=40)
    code: str = Field(min_length=1, max_length=80)
    label: str = Field(min_length=1, max_length=200)
    sort_order: int = 0
    extra_json: Optional[str] = None


class ConfigCatalogUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    label: Optional[str] = Field(default=None, min_length=1, max_length=200)
    sort_order: Optional[int] = None
    extra_json: Optional[str] = None
    is_active: Optional[bool] = None


class ConfigCatalogOut(ORMModel):
    id: str
    clinic_id: str
    kind: str
    code: str
    label: str
    extra_json: Optional[str] = None
    sort_order: int
    is_active: bool


class ConfigTemplateUpsert(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: str = Field(min_length=1, max_length=40)
    key: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=160)
    subject: Optional[str] = None
    body: str = ""
    is_active: Optional[bool] = None


class ConfigTemplateOut(ORMModel):
    id: str
    clinic_id: str
    kind: str
    key: str
    name: str
    subject: Optional[str] = None
    body: str
    is_active: bool


class FeeScheduleCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=120)
    payer_kind: str = "cash"
    currency: str = "TZS"
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    is_default: bool = False


class FeeScheduleUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    payer_kind: Optional[str] = None
    currency: Optional[str] = None
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    is_default: Optional[bool] = None
    is_active: Optional[bool] = None


class FeeScheduleOut(ORMModel):
    id: str
    clinic_id: str
    code: str
    name: str
    payer_kind: str
    currency: str
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    is_default: bool
    notes: Optional[str] = None
    is_active: bool


class TaxRateUpsert(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=120)
    rate_bps: int = Field(ge=0, le=10000)
    is_default: bool = False
    is_active: Optional[bool] = None


class TaxRateOut(ORMModel):
    id: str
    clinic_id: str
    code: str
    name: str
    rate_bps: int
    is_default: bool
    is_active: bool


class DiscountRuleUpsert(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=120)
    percent: float = Field(ge=0, le=100)
    max_amount: Optional[float] = Field(default=None, ge=0)
    requires_role: Optional[str] = None
    is_active: Optional[bool] = None


class DiscountRuleOut(ORMModel):
    id: str
    clinic_id: str
    code: str
    name: str
    percent: float
    max_amount: Optional[float] = None
    requires_role: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool


class PaymentMethodConfigOut(ORMModel):
    id: str
    clinic_id: str
    code: str
    label: str
    sort_order: int
    is_active: bool


class PaymentMethodToggle(BaseModel):
    model_config = ConfigDict(extra="forbid")
    is_active: bool


class ApprovalChainUpsert(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=160)
    department_id: Optional[str] = None
    category: Optional[str] = None
    min_amount: float = Field(default=0, ge=0)
    steps: list[dict] = Field(default_factory=list)
    is_active: Optional[bool] = None


class ApprovalChainOut(ORMModel):
    id: str
    clinic_id: str
    name: str
    department_id: Optional[str] = None
    category: Optional[str] = None
    min_amount: float
    steps_json: str
    steps: list[dict] = Field(default_factory=list)
    notes: Optional[str] = None
    is_active: bool


class ConfigImportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: str = Field(min_length=1, max_length=40)
    csv_text: str = Field(min_length=1)
    dry_run: bool = False


class ConfigImportOut(BaseModel):
    kind: str
    dry_run: bool
    created: int
    updated: int
    errors: list[str]
    row_count: int


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
    currency: str = "TZS"


class CashUpOut(BaseModel):
    date: str
    total: float
    by_method: dict[str, float]
    payment_count: int


class BillingInvoiceBrief(BaseModel):
    id: str
    invoice_number: str
    patient_id: str
    patient_name: str
    patient_code: str = ""
    status: str
    total: float
    amount_paid: float
    balance: float
    currency: str = "TZS"
    issued_at: Optional[datetime] = None
    is_overdue: bool = False


class BillingPaymentRow(BaseModel):
    id: str
    invoice_id: str
    invoice_number: str = ""
    patient_id: str = ""
    patient_name: str = ""
    patient_code: str = ""
    amount: float
    method: str
    payer_type: str = "self"
    insurer: Optional[str] = None
    paid_at: datetime
    reference: Optional[str] = None
    currency: str = "TZS"


class MonthRevenue(BaseModel):
    month: str
    amount: float


class PaymentMethodTotal(BaseModel):
    method: str
    amount: float
    count: int


class BillingSummaryOut(BaseModel):
    currency: str = "TZS"
    period_start: date
    period_end: date
    previous_period_start: date
    previous_period_end: date
    revenue_this_month: float
    revenue_last_month: float
    outstanding_count: int
    outstanding_amount: float
    overdue_count: int
    overdue_amount: float
    paid_this_month: float
    revenue_by_month: list[MonthRevenue]
    payment_methods: list[PaymentMethodTotal]
    recent_invoices: list[BillingInvoiceBrief]
    recent_payments: list[BillingPaymentRow]


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
    inventory_item_id: Optional[str] = None
    line_kind: Optional[str] = None


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
    payer_type: str = "self"
    insurer: Optional[str] = None
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
    inventory_item_id: Optional[str] = None
    line_kind: str = "procedure"
    fee_charged: float = 0.0
    estimated_insurance: float = 0.0
    estimated_patient: float = 0.0
    actual_insurance: float = 0.0
    actual_patient: float = 0.0
    charge_status: str = "posted"


class PaymentOut(ORMModel):
    id: str
    amount: float
    method: str
    payer_type: str = "self"
    insurer: Optional[str] = None
    paid_at: datetime
    reference: Optional[str] = None


class InvoiceClaimLink(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    claim_number: str
    status: str


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
    amount_adjusted: float = 0.0
    currency: str
    notes: Optional[str] = None
    issued_at: Optional[datetime] = None
    due_at: Optional[datetime] = None
    patient_name: Optional[str] = None
    patient_code: Optional[str] = None
    balance: float = 0.0
    is_overdue: bool = False
    line_items: list[InvoiceLineOut] = []
    payments: list[PaymentOut] = []
    claims: list[InvoiceClaimLink] = []

    @model_validator(mode="wrap")
    @classmethod
    def _ledger_view(cls, value, handler):
        result = handler(value)
        if isinstance(value, dict):
            if "balance" not in value:
                balance = max(
                    float(result.total) - float(result.amount_paid) - float(result.amount_adjusted or 0),
                    0.0,
                )
                result = result.model_copy(update={"balance": round(balance, 2)})
            return result
        from sqlalchemy import inspect as sa_inspect

        from app.services.billing_ledger import invoice_balance, is_overdue

        unloaded: set[str] = set()
        try:
            unloaded = set(sa_inspect(value).unloaded)
        except Exception:
            unloaded = set()
        patient = None if "patient" in unloaded else getattr(value, "patient", None)
        patient_name = None
        patient_code = None
        if patient is not None:
            patient_name = f"{patient.first_name} {patient.last_name}".strip()
            patient_code = patient.patient_code
        return result.model_copy(
            update={
                "patient_name": patient_name,
                "patient_code": patient_code,
                "balance": invoice_balance(value),
                "is_overdue": is_overdue(value),
            }
        )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def outstanding(self) -> bool:
        if self.status in ("void", "refunded", "paid"):
            return False
        return self.amount_paid + self.amount_adjusted + 0.001 < self.total


class AdjustmentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    amount: float = Field(gt=0)
    kind: str = "write_off"
    line_item_id: Optional[str] = None
    notes: Optional[str] = None


class ClaimCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    invoice_id: str
    line_item_ids: Optional[list[str]] = None
    notes: Optional[str] = None


class RemittanceCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    claim_line_id: str
    paid_amount: float = 0.0
    allowed_amount: Optional[float] = None
    denied: bool = False
    denial_reason: Optional[str] = None
    payer_name: Optional[str] = None
    reference: Optional[str] = None


class ClaimLineOut(ORMModel):
    id: str
    line_item_id: str
    billed_amount: float
    allowed_amount: Optional[float] = None
    paid_amount: float
    patient_responsibility: float
    status: str
    denial_reason: Optional[str] = None


class ClaimOut(ORMModel):
    id: str
    patient_id: str
    invoice_id: str
    plan_id: Optional[str] = None
    claim_number: str
    status: str
    submitted_at: Optional[datetime] = None
    adjudicated_at: Optional[datetime] = None
    scrub_notes: Optional[str] = None
    notes: Optional[str] = None
    lines: list[ClaimLineOut] = []


class DenialOut(BaseModel):
    claim_id: str
    claim_number: str
    claim_line_id: str
    invoice_id: str
    patient_id: str
    procedure: str
    procedure_code: Optional[str] = None
    billed_amount: float
    paid_amount: float
    status: str
    denial_reason: Optional[str] = None


class StatementCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    patient_id: str
    due_date: Optional[date] = None
    notes: Optional[str] = None


class StatementOut(ORMModel):
    id: str
    patient_id: str
    statement_number: str
    balance_due: float
    due_date: Optional[date] = None
    issued_at: datetime
    notes: Optional[str] = None
    invoice_ids: Optional[str] = None


class FeeScheduleItemCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(min_length=1, max_length=40)
    label: str = Field(min_length=1, max_length=200)
    category: str = "general"
    unit_price: float = Field(ge=0)
    currency: str = "TZS"
    is_active: bool = True
    billable: bool = True
    notes: Optional[str] = None
    fee_schedule_id: Optional[str] = None


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
    fee_schedule_id: Optional[str] = None
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    catalog_item_id: Optional[str] = None
    catalog_kind: Optional[str] = None
    inventory_item_id: Optional[str] = None
    quantity_on_hand: float = 0


class CatalogCategoryOut(ORMModel):
    id: str
    name: str
    slug: str
    parent_id: Optional[str] = None
    sort_order: int = 0


class CatalogFeeRateCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    payer_name: str = ""
    amount: float = Field(ge=0)
    effective_from: Optional[date] = None


class CatalogFeeRateOut(ORMModel):
    id: str
    catalog_item_id: str
    payer_name: str
    amount: float
    effective_from: date


class CatalogPriceHistoryOut(ORMModel):
    id: str
    catalog_item_id: str
    old_price: float
    new_price: float
    created_at: datetime
    notes: Optional[str] = None


class CatalogItemCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sku: str = Field(min_length=1, max_length=64)
    label: str = Field(min_length=1, max_length=200)
    kind: str = "procedure"
    list_price: float = Field(ge=0)
    currency: str = "TZS"
    is_active: bool = True
    billable: bool = True
    category: Optional[str] = None
    category_id: Optional[str] = None
    notes: Optional[str] = None
    cdt_code: Optional[str] = None
    tooth_required: bool = False
    ndc_code: Optional[str] = None
    drug_schedule: Optional[str] = None
    unit_of_measure: Optional[str] = None
    vendor_fee_basis: Optional[str] = None
    effective_from: Optional[date] = None
    inventory_item_id: Optional[str] = None


class CatalogItemUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    label: Optional[str] = Field(default=None, min_length=1, max_length=200)
    kind: Optional[str] = None
    list_price: Optional[float] = Field(default=None, ge=0)
    currency: Optional[str] = None
    is_active: Optional[bool] = None
    billable: Optional[bool] = None
    category: Optional[str] = None
    category_id: Optional[str] = None
    notes: Optional[str] = None
    cdt_code: Optional[str] = None
    tooth_required: Optional[bool] = None
    ndc_code: Optional[str] = None
    drug_schedule: Optional[str] = None
    unit_of_measure: Optional[str] = None
    vendor_fee_basis: Optional[str] = None
    inventory_item_id: Optional[str] = None


class CatalogItemOut(ORMModel):
    id: str
    sku: str
    label: str
    kind: str
    list_price: float
    currency: str
    is_active: bool
    billable: bool
    category_id: Optional[str] = None
    notes: Optional[str] = None
    cdt_code: Optional[str] = None
    tooth_required: bool = False
    ndc_code: Optional[str] = None
    drug_schedule: Optional[str] = None
    unit_of_measure: Optional[str] = None
    vendor_fee_basis: Optional[str] = None
    inventory_item_id: Optional[str] = None
    clinic_id: str
    fee_rates: list[CatalogFeeRateOut] = []


class ChartToCashRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    patient_id: str
    chart_entry_ids: Optional[list[str]] = None  # None = all unbilled billable
    tax: float = 0.0
    discount: float = 0.0
    notes: Optional[str] = None
    idempotency_key: Optional[str] = None


class ProcedureInvoiceLine(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fee_item_id: str
    quantity: int = Field(default=1, ge=1, le=20)
    tooth_number: Optional[str] = None


class InvoiceFromProceduresRequest(BaseModel):
    """Specialist invoice from admin-managed procedural items."""

    model_config = ConfigDict(extra="forbid")
    patient_id: str
    items: list[ProcedureInvoiceLine] = Field(min_length=1)
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


class ClinicalRecordRow(BaseModel):
    """One line in the clinic-wide register of patients already seen in a chair."""

    patient_id: str
    patient_code: str
    full_name: str
    sex: Optional[str] = None
    age_years: Optional[int] = None
    phone: Optional[str] = None
    town_city: Optional[str] = None
    department: Optional[str] = None
    primary_dentist_name: Optional[str] = None
    visit_count: int = 0
    first_visit_date: Optional[date] = None
    last_visit_date: Optional[date] = None
    last_visit_status: Optional[str] = None
    last_chief_complaint: Optional[str] = None
    last_examiner_name: Optional[str] = None
    has_outstanding: bool = False


class ClinicalRecordSummary(BaseModel):
    visit_count: int = 0
    note_count: int = 0
    treatment_plan_count: int = 0
    first_visit_date: Optional[date] = None
    last_visit_date: Optional[date] = None


class ClinicalRecordDetail(BaseModel):
    patient: PatientOut
    visits: list[ClinicalVisitOut] = Field(default_factory=list)
    examiner_names: dict[str, str] = Field(default_factory=dict)
    latest_vitals: Optional[VitalSignOut] = None
    summary: ClinicalRecordSummary


TokenResponse.model_rebuild()


# ── Department shell DTOs ─────────────────────────────
class ClinicCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=2, max_length=200)
    code: str = Field(min_length=2, max_length=32)
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    timezone: str = "Africa/Dar_es_Salaam"
    currency: str = "TZS"


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
    license_no: Optional[str] = None
    default_operatory_id: Optional[str] = None
    production_goal: Optional[float] = None
    commission_rate_bps: Optional[int] = Field(default=None, ge=0, le=10000)
    is_scheduling_provider: Optional[bool] = None
    cert_expires_at: Optional[date] = None
    extra_permissions: list[str] = Field(default_factory=list)
    denied_permissions: list[str] = Field(default_factory=list)


class StaffUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: Optional[EmailStr] = None
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=200)
    role: Optional[str] = None
    phone: Optional[str] = None
    specialty: Optional[str] = None
    title: Optional[str] = None
    department: Optional[str] = None
    notes: Optional[str] = None
    license_no: Optional[str] = None
    default_operatory_id: Optional[str] = None
    production_goal: Optional[float] = None
    commission_rate_bps: Optional[int] = Field(default=None, ge=0, le=10000)
    is_scheduling_provider: Optional[bool] = None
    cert_expires_at: Optional[date] = None
    is_active: Optional[bool] = None
    extra_permissions: Optional[list[str]] = None
    denied_permissions: Optional[list[str]] = None


class StaffPasswordReset(BaseModel):
    model_config = ConfigDict(extra="forbid")
    password: str = Field(min_length=8, max_length=128)


class StaffProfileOut(ORMModel):
    id: str
    user_id: str
    title: Optional[str] = None
    specialty: Optional[str] = None
    department: Optional[str] = None
    certifications_json: Optional[str] = None
    notes: Optional[str] = None
    license_no: Optional[str] = None
    default_operatory_id: Optional[str] = None
    production_goal: Optional[float] = None
    commission_rate_bps: int = 0
    is_scheduling_provider: bool = True
    cert_expires_at: Optional[date] = None


class StaffOut(ORMModel):
    id: str
    email: EmailStr
    full_name: str
    role: str
    clinic_id: Optional[str] = None
    phone: Optional[str] = None
    specialty: Optional[str] = None
    is_active: bool
    extra_permissions: list[str] = []
    denied_permissions: list[str] = []
    effective_permissions: list[str] = []
    profile: Optional[StaffProfileOut] = None


class RoleCatalogOut(BaseModel):
    id: str
    label: str
    assignable: bool
    permissions: list[str]


class PermissionCatalogOut(BaseModel):
    id: str
    resource: str
    action: str
    label: str
    description: str


class InventoryItemCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sku: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=200)
    category: str = "general"
    quantity: float = 0
    reorder_level: float = 0
    unit: str = "unit"
    unit_cost: float = 0
    sale_price: float = 0
    item_kind: str = "stock"
    billable_at_registration: bool = False
    target_department: Optional[str] = None
    notes: Optional[str] = None
    expiry_date: Optional[date] = None
    supplier_id: Optional[str] = None
    track_lots: bool = False
    requires_expiry: bool = True

    @field_validator("item_kind")
    @classmethod
    def _kind(cls, v: str) -> str:
        allowed = {"stock", "service"}
        if v not in allowed:
            raise ValueError("item_kind must be stock or service")
        return v


class InventoryImportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: list[InventoryItemCreate] = Field(min_length=1, max_length=300)


class InventoryImportError(BaseModel):
    row: int
    sku: str = ""
    message: str


class InventoryImportResult(BaseModel):
    created: int
    errors: list[InventoryImportError] = Field(default_factory=list)


class InventoryItemUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Optional[str] = None
    category: Optional[str] = None
    quantity: Optional[float] = None
    reorder_level: Optional[float] = None
    unit: Optional[str] = None
    unit_cost: Optional[float] = None
    sale_price: Optional[float] = None
    item_kind: Optional[str] = None
    billable_at_registration: Optional[bool] = None
    target_department: Optional[str] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None
    expiry_date: Optional[date] = None
    supplier_id: Optional[str] = None
    track_lots: Optional[bool] = None
    requires_expiry: Optional[bool] = None


class InventoryAdjust(BaseModel):
    model_config = ConfigDict(extra="forbid")
    delta: float
    reason: Optional[str] = None
    location_id: Optional[str] = None


class StockLocationOut(ORMModel):
    id: str
    code: str
    name: str
    kind: str
    is_active: bool


class StockReceiveLine(BaseModel):
    model_config = ConfigDict(extra="forbid")
    inventory_item_id: str
    quantity: float = Field(gt=0)
    unit_cost: float = 0
    lot_code: Optional[str] = None
    expiry_date: Optional[date] = None
    location_id: Optional[str] = None


class StockReceiveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    location_id: Optional[str] = None
    supplier_id: Optional[str] = None
    purchase_order_id: Optional[str] = None
    reason: Optional[str] = None
    lines: list[StockReceiveLine] = Field(min_length=1)


class StockIssueRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    inventory_item_id: str
    quantity: float = Field(gt=0)
    from_location_id: Optional[str] = None
    to_location_id: Optional[str] = None
    location_id: Optional[str] = None
    patient_id: Optional[str] = None
    bill: bool = False
    lot_code: Optional[str] = None
    reason: Optional[str] = None


class StockWriteoffRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    inventory_item_id: str
    quantity: float = Field(gt=0)
    location_id: Optional[str] = None
    lot_code: Optional[str] = None
    reason: Optional[str] = None


class StocktakeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    inventory_item_id: str
    counted: float = Field(ge=0)
    location_id: Optional[str] = None
    reason: Optional[str] = None


class StockMovementOut(ORMModel):
    id: str
    inventory_item_id: str
    lot_id: Optional[str] = None
    from_location_id: Optional[str] = None
    to_location_id: Optional[str] = None
    movement_type: str
    quantity: float
    unit_cost_snapshot: float = 0
    reason: Optional[str] = None
    supplier_id: Optional[str] = None
    purchase_order_id: Optional[str] = None
    invoice_id: Optional[str] = None
    invoice_line_id: Optional[str] = None
    prescription_id: Optional[str] = None
    recorded_by_id: Optional[str] = None
    created_at: datetime


class PurchaseOrderLineIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    inventory_item_id: Optional[str] = None
    sku: Optional[str] = None
    qty: Optional[float] = None
    quantity: Optional[float] = None
    quantity_ordered: Optional[float] = None
    unit_cost: float = 0
    lot_code: Optional[str] = None
    expiry_date: Optional[date] = None


class PurchaseOrderReceiveLine(BaseModel):
    model_config = ConfigDict(extra="forbid")
    line_id: str
    quantity: float = Field(gt=0)
    unit_cost: Optional[float] = None
    lot_code: Optional[str] = None
    expiry_date: Optional[date] = None


class PurchaseOrderReceiveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    location_id: Optional[str] = None
    lines: list[PurchaseOrderReceiveLine] = Field(default_factory=list)


class PurchaseOrderLineOut(ORMModel):
    id: str
    inventory_item_id: str
    quantity_ordered: float
    quantity_received: float
    unit_cost: float


class SupplierUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Optional[str] = None
    contact_email: Optional[EmailStr] = None
    contact_phone: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class InventoryItemOut(ORMModel):
    id: str
    sku: str
    name: str
    category: str
    quantity: float
    reorder_level: float
    unit: str
    unit_cost: float
    sale_price: float = 0
    item_kind: str = "stock"
    billable_at_registration: bool = False
    target_department: Optional[str] = None
    is_active: bool
    notes: Optional[str] = None
    expiry_date: Optional[date] = None
    supplier_id: Optional[str] = None
    track_lots: bool = False
    requires_expiry: bool = True
    store_on_hand: float = 0
    quantity_requested_open: float = 0
    quantity_issued_open: float = 0
    created_at: datetime


CLINICAL_DEPARTMENTS = ("restorative", "maxillofacial", "orthodontic", "paediatric")


class RegistrationLineItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    inventory_item_id: str
    quantity: int = Field(default=1, ge=1, le=20)


class RegistrationPayment(BaseModel):
    model_config = ConfigDict(extra="forbid")
    amount: float = Field(ge=0)
    payer_type: str = "self"
    method: str = "cash"
    insurer: Optional[str] = None
    insurer_name: Optional[str] = None
    reference: Optional[str] = None
    outstanding: bool = False

    @field_validator("payer_type")
    @classmethod
    def _payer(cls, v: str) -> str:
        if v not in ("self", "insurance", "other"):
            raise ValueError("payer_type must be self, insurance, or other")
        return v

    @model_validator(mode="after")
    def _payer_details(self):
        if self.payer_type == "insurance" and not (self.insurer or "").strip():
            raise ValueError("Select a health benefit / insurer (Jubilee, NHIF, or other)")
        if self.payer_type == "other" and not (self.insurer_name or self.reference or "").strip():
            raise ValueError("Describe the other payment type")
        if self.payer_type == "insurance" and (self.insurer or "").lower() == "other":
            if not (self.insurer_name or "").strip():
                raise ValueError("Name the other insurer / health benefit")
        return self


class RegistrationAppointment(BaseModel):
    model_config = ConfigDict(extra="forbid")
    service_name: str = Field(min_length=1, max_length=200)
    dentist_id: str = Field(min_length=1, description="Medical staff for this visit")
    is_appointment: bool = True
    starts_at: Optional[datetime] = None
    duration_minutes: int = Field(default=30, ge=15, le=180)

    @model_validator(mode="after")
    def _slot_when_booked(self):
        if self.is_appointment and self.starts_at is None:
            raise ValueError("Choose a time slot when this visit is an appointment")
        return self


class RegistrationSlotOut(BaseModel):
    starts_at: datetime
    ends_at: datetime
    available: bool


class RegistrationSlotsOut(BaseModel):
    slots: list[RegistrationSlotOut]
    next_queue_number: int
    date: date


class RegistrationConsent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    procedure_name: str = "Registration and examination consent"
    signature_data: str = Field(min_length=20)
    signed_by_name: str = Field(min_length=1, max_length=200)
    guardian: bool = False


class RegistrationDraftSave(BaseModel):
    """Whole wizard state, stored verbatim so the front desk can resume it later."""

    model_config = ConfigDict(extra="forbid")
    patient_id: Optional[str] = None
    display_name: Optional[str] = Field(default=None, max_length=200)
    summary: Optional[str] = Field(default=None, max_length=300)
    step: int = Field(default=0, ge=0, le=20)
    payload: dict = Field(default_factory=dict)


class RegistrationDraftCancel(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: Optional[str] = Field(default=None, max_length=300)


class RegistrationDraftOut(ORMModel):
    id: str
    patient_id: Optional[str] = None
    created_by_id: Optional[str] = None
    created_by_name: Optional[str] = None
    updated_by_id: Optional[str] = None
    status: str
    display_name: str
    summary: Optional[str] = None
    step: int = 0
    payload_json: Optional[str] = Field(default=None, exclude=True)
    cancel_reason: Optional[str] = None
    closed_at: Optional[datetime] = None
    clinic_id: str
    created_at: datetime
    updated_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def payload(self) -> dict:
        if not self.payload_json:
            return {}
        try:
            data = json.loads(self.payload_json)
        except json.JSONDecodeError:
            return {}
        return data if isinstance(data, dict) else {}


class PatientRegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    patient_id: Optional[str] = None
    patient: PatientCreate
    items: list[RegistrationLineItem] = Field(min_length=1)
    payment: RegistrationPayment
    appointment: RegistrationAppointment
    consent: RegistrationConsent
    destination_department: str
    draft_id: Optional[str] = None

    @field_validator("destination_department")
    @classmethod
    def _dept(cls, v: str) -> str:
        if v not in CLINICAL_DEPARTMENTS:
            raise ValueError(
                "destination_department must be restorative, maxillofacial, orthodontic, or paediatric"
            )
        return v


class PatientRegisterOut(BaseModel):
    patient: PatientOut
    invoice: InvoiceOut
    consent_id: str
    destination_department: str
    clinical_path: str
    outstanding: bool
    queue_number: Optional[int] = None
    appointment_id: Optional[str] = None
    service_name: Optional[str] = None
    slot_starts_at: Optional[datetime] = None
    is_appointment: bool = True
    medical_staff_id: Optional[str] = None
    medical_staff_name: Optional[str] = None


class ChairQueueItem(BaseModel):
    """Today's chair visit for a department or assigned clinician."""

    model_config = ConfigDict(from_attributes=True)
    id: str
    patient_id: str
    patient_code: Optional[str] = None
    patient_name: Optional[str] = None
    dentist_id: str
    dentist_name: Optional[str] = None
    queue_number: Optional[int] = None
    service_name: Optional[str] = None
    department: Optional[str] = None
    status: str
    starts_at: datetime
    is_appointment: bool = True
    reason: Optional[str] = None
    chair_number: Optional[int] = None


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
    patient_name: Optional[str] = None
    patient_code: Optional[str] = None
    dentist_name: Optional[str] = None
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
        updates: dict[str, Any] = {"is_overdue": overdue}
        if not isinstance(value, dict):
            from sqlalchemy import inspect as sa_inspect

            unloaded: set[str] = set()
            try:
                unloaded = set(sa_inspect(value).unloaded)
            except Exception:
                unloaded = set()
            patient = None if "patient" in unloaded else getattr(value, "patient", None)
            if patient is not None:
                updates["patient_name"] = f"{patient.first_name} {patient.last_name}".strip()
                updates["patient_code"] = patient.patient_code
            dentist = None if "dentist" in unloaded else getattr(value, "dentist", None)
            if dentist is not None:
                updates["dentist_name"] = dentist.full_name
        return result.model_copy(update=updates)


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
    form: str = "tablet"
    strength: Optional[str] = None
    route: str = "oral"
    inventory_item_id: Optional[str] = None
    reorder_level: float = 0
    is_controlled: bool = False


class DrugTemplateUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Optional[str] = None
    category: Optional[str] = None
    default_dose: Optional[str] = None
    default_quantity: Optional[str] = None
    instructions: Optional[str] = None
    form: Optional[str] = None
    strength: Optional[str] = None
    route: Optional[str] = None
    inventory_item_id: Optional[str] = None
    reorder_level: Optional[float] = None
    is_controlled: Optional[bool] = None
    is_active: Optional[bool] = None


class DrugTemplateOut(ORMModel):
    id: str
    name: str
    category: str
    default_dose: str
    default_quantity: str
    instructions: Optional[str] = None
    form: str = "tablet"
    strength: Optional[str] = None
    route: str = "oral"
    inventory_item_id: Optional[str] = None
    reorder_level: float = 0
    is_controlled: bool = False
    is_active: bool
    sale_price: Optional[float] = None


class PrescriptionItemIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    drug_name: str
    dose: str
    quantity: str = "1"
    frequency: Optional[str] = None
    days: Optional[int] = Field(default=None, ge=1, le=365)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    instructions: Optional[str] = None
    inventory_item_id: Optional[str] = None
    drug_template_id: Optional[str] = None


class PrescriptionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    patient_id: str
    notes: Optional[str] = None
    bill: bool = False
    items: list[PrescriptionItemIn] = Field(min_length=1)


class PrescriptionItemCourseUpdate(BaseModel):
    """Course fields a pharmacist may correct before the line is dispensed."""

    model_config = ConfigDict(extra="forbid")
    id: str
    drug_template_id: Optional[str] = None
    frequency: Optional[str] = None
    days: Optional[int] = Field(default=None, ge=1, le=365)
    quantity: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    instructions: Optional[str] = None


class PrescriptionCourseUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    notes: Optional[str] = None
    items: list[PrescriptionItemCourseUpdate] = Field(min_length=1)


class PrescriptionItemOut(ORMModel):
    id: str
    drug_name: str
    dose: str
    quantity: str
    frequency: Optional[str] = None
    days: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    instructions: Optional[str] = None
    inventory_item_id: Optional[str] = None
    drug_template_id: Optional[str] = None
    quantity_dispensed: float = 0
    line_status: str = "pending"
    shelf_on_hand: Optional[float] = None
    store_on_hand: Optional[float] = None


class DispenseEventOut(BaseModel):
    id: str
    prescription_item_id: str
    inventory_item_id: Optional[str] = None
    drug_name: Optional[str] = None
    quantity: float
    quantity_returned: float = 0
    lot_code: Optional[str] = None
    expiry_date: Optional[date] = None
    unit_price: float = 0
    label_text: Optional[str] = None
    invoice_id: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime


class PrescriptionOut(ORMModel):
    id: str
    patient_id: str
    patient_name: Optional[str] = None
    patient_code: Optional[str] = None
    prescribed_by_id: Optional[str] = None
    prescriber_name: Optional[str] = None
    status: str
    notes: Optional[str] = None
    prescribed_at: datetime
    rx_number: Optional[str] = None
    verified_at: Optional[datetime] = None
    dispensed_at: Optional[datetime] = None
    invoice_id: Optional[str] = None
    order_billed: bool = False
    cancel_reason: Optional[str] = None
    items: list[PrescriptionItemOut] = []
    dispenses: list[DispenseEventOut] = []
    created_at: datetime


class PrescriptionStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: str
    bill: bool = False


class DispenseLineIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    prescription_item_id: str
    quantity: float = Field(gt=0)


class DispenseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lines: list[DispenseLineIn] = Field(min_length=1)
    bill: bool = True
    collect_payment: bool = False
    payment_method: str = "cash"
    payment_reference: Optional[str] = Field(default=None, max_length=80)
    acknowledge_warnings: bool = False
    notes: Optional[str] = Field(default=None, max_length=300)


class CancelPrescription(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: str = Field(min_length=3, max_length=300)


class ExternalRelease(BaseModel):
    model_config = ConfigDict(extra="forbid")
    item_ids: list[str] = Field(min_length=1)


class ReturnDispense(BaseModel):
    model_config = ConfigDict(extra="forbid")
    quantity: float = Field(gt=0)
    reason: str = Field(min_length=3, max_length=200)


class PharmacyExpiryOut(BaseModel):
    sku: str
    name: str
    lot_code: str
    expiry_date: date
    quantity: float


class PharmacyBoardOut(BaseModel):
    waiting: int
    partial: int
    dispensed_today: int
    sales_today: int = 0
    shelf_short: int
    expiring: list[PharmacyExpiryOut] = []


class CounterSaleLineIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    inventory_item_id: str
    quantity: int = Field(ge=1)


class CounterSaleCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    patient_id: str
    lines: list[CounterSaleLineIn] = Field(min_length=1)
    payment_method: str = "cash"
    payment_reference: Optional[str] = Field(default=None, max_length=80)
    amount_tendered: Optional[float] = Field(default=None, ge=0)
    notes: Optional[str] = Field(default=None, max_length=300)
    acknowledge_warnings: bool = False


class CounterSaleLineOut(BaseModel):
    id: str
    inventory_item_id: Optional[str] = None
    sku: Optional[str] = None
    description: str
    quantity: int
    unit_price: float
    line_total: float


class CounterSaleOut(BaseModel):
    id: str
    sale_number: str
    patient_id: str
    patient_name: Optional[str] = None
    patient_code: Optional[str] = None
    invoice_id: Optional[str] = None
    invoice_number: Optional[str] = None
    status: str
    subtotal: float
    total: float
    amount_paid: float
    amount_tendered: float
    change_due: float
    payment_method: str
    payment_reference: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    lines: list[CounterSaleLineOut] = []


class PharmacyShelfRow(BaseModel):
    template_id: str
    name: str
    category: str
    form: str = "tablet"
    strength: Optional[str] = None
    dose: str
    inventory_item_id: Optional[str] = None
    sku: Optional[str] = None
    unit: Optional[str] = None
    sale_price: Optional[float] = None
    reorder_level: float = 0
    shelf_on_hand: float = 0
    store_on_hand: float = 0
    is_controlled: bool = False
    is_active: bool = True


class ShelfRequestLine(BaseModel):
    model_config = ConfigDict(extra="forbid")
    inventory_item_id: str
    quantity: float = Field(gt=0)


class ShelfRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lines: list[ShelfRequestLine] = Field(default_factory=list)
    notes: Optional[str] = None


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
    patient_name: Optional[str] = None
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
    patient_name: Optional[str] = None
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
    supplier_name: Optional[str] = None
    status: str
    ordered_at: Optional[datetime] = None
    expected_at: Optional[date] = None
    notes: Optional[str] = None
    lines_json: Optional[str] = None
    lines: list[PurchaseOrderLineOut] = []
    created_at: datetime


class RequisitionLineIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    inventory_item_id: str
    quantity: float = Field(gt=0)
    notes: Optional[str] = Field(default=None, max_length=200)


class RequisitionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    department: str
    notes: Optional[str] = None
    destination_location_id: Optional[str] = None
    submit: bool = True
    lines: list[RequisitionLineIn] = Field(min_length=1)


class RequisitionDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: Optional[str] = Field(default=None, max_length=300)


class RequisitionFulfillLine(BaseModel):
    model_config = ConfigDict(extra="forbid")
    line_id: str
    quantity: float = Field(gt=0)


class RequisitionFulfill(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lines: list[RequisitionFulfillLine] = Field(default_factory=list)


class RequisitionLineOut(ORMModel):
    id: str
    inventory_item_id: str
    quantity_requested: float
    quantity_issued: float = 0
    quantity_outstanding: float = 0
    notes: Optional[str] = None
    sku: Optional[str] = None
    item_name: Optional[str] = None
    unit: Optional[str] = None
    on_hand: Optional[float] = None
    store_on_hand: Optional[float] = None
    shortfall: float = 0
    reorder_level: Optional[float] = None


class RequisitionOut(ORMModel):
    id: str
    req_number: str
    status: str
    department: str
    destination_location_id: Optional[str] = None
    destination_location_name: Optional[str] = None
    requested_by_id: Optional[str] = None
    requested_by_name: Optional[str] = None
    approved_by_id: Optional[str] = None
    approved_by_name: Optional[str] = None
    fulfilled_by_id: Optional[str] = None
    notes: Optional[str] = None
    reject_reason: Optional[str] = None
    submitted_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None
    fulfilled_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    clinic_id: str
    created_at: datetime
    lines: list[RequisitionLineOut] = []


class SupplierHistoryOut(BaseModel):
    supplier: SupplierOut
    purchase_orders: list[PurchaseOrderOut] = Field(default_factory=list)
    receives: list[StockMovementOut] = Field(default_factory=list)


class StockAlertItem(BaseModel):
    id: str
    sku: str
    name: str
    quantity: float
    reorder_level: float
    expiry_date: Optional[date] = None
    kind: str


class WarehouseAlertsOut(BaseModel):
    low_stock: list[StockAlertItem] = Field(default_factory=list)
    expiring: list[dict] = Field(default_factory=list)
    expired: list[dict] = Field(default_factory=list)
    open_requisitions: int = 0


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


# ── Specialty clinic departments ──────────────────────
class SurgicalCaseCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    patient_id: str
    procedure_type: str = "extraction"
    site: Optional[str] = None
    diagnosis: Optional[str] = None
    anaesthesia: str = "local"
    asa_class: Optional[str] = None
    status: str = "planned"
    scheduled_at: Optional[datetime] = None
    surgeon_id: Optional[str] = None
    notes: Optional[str] = None


class SurgicalCaseUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    procedure_type: Optional[str] = None
    site: Optional[str] = None
    diagnosis: Optional[str] = None
    anaesthesia: Optional[str] = None
    asa_class: Optional[str] = None
    status: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    performed_at: Optional[datetime] = None
    surgeon_id: Optional[str] = None
    operative_notes: Optional[str] = None
    complications: Optional[str] = None
    histopathology: Optional[str] = None
    notes: Optional[str] = None


class SurgicalFollowUpIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    visit_date: Optional[date] = None
    pain_score: Optional[int] = Field(None, ge=0, le=10)
    swelling: Optional[str] = None
    healing: str = "normal"
    sutures_removed: bool = False
    notes: Optional[str] = None


class SurgicalFollowUpOut(ORMModel):
    id: str
    visit_date: date
    pain_score: Optional[int] = None
    swelling: Optional[str] = None
    healing: str
    sutures_removed: bool
    notes: Optional[str] = None


class SurgicalCaseOut(ORMModel):
    id: str
    patient_id: str
    patient_name: Optional[str] = None
    surgeon_id: Optional[str] = None
    procedure_type: str
    site: Optional[str] = None
    diagnosis: Optional[str] = None
    anaesthesia: str
    asa_class: Optional[str] = None
    status: str
    scheduled_at: Optional[datetime] = None
    performed_at: Optional[datetime] = None
    operative_notes: Optional[str] = None
    complications: Optional[str] = None
    histopathology: Optional[str] = None
    notes: Optional[str] = None
    follow_ups: list[SurgicalFollowUpOut] = []
    created_at: datetime


class OrthoCaseCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    patient_id: str
    angle_class: Optional[str] = None
    malocclusion_summary: Optional[str] = None
    appliance_type: str = "fixed_metal"
    arch: str = "both"
    bracket_system: Optional[str] = None
    oral_hygiene: Optional[str] = None
    status: str = "assessment"
    started_on: Optional[date] = None
    planned_months: int = Field(18, ge=1, le=72)
    next_review_due: Optional[date] = None
    clinician_id: Optional[str] = None
    notes: Optional[str] = None


class OrthoCaseUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    angle_class: Optional[str] = None
    malocclusion_summary: Optional[str] = None
    appliance_type: Optional[str] = None
    arch: Optional[str] = None
    bracket_system: Optional[str] = None
    oral_hygiene: Optional[str] = None
    status: Optional[str] = None
    started_on: Optional[date] = None
    debonded_on: Optional[date] = None
    planned_months: Optional[int] = Field(None, ge=1, le=72)
    next_review_due: Optional[date] = None
    clinician_id: Optional[str] = None
    notes: Optional[str] = None


class OrthoAdjustmentIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    visit_date: Optional[date] = None
    archwire: Optional[str] = None
    procedures: Optional[str] = None
    elastics: Optional[str] = None
    next_visit_weeks: int = Field(4, ge=1, le=26)
    notes: Optional[str] = None


class OrthoAdjustmentOut(ORMModel):
    id: str
    visit_date: date
    archwire: Optional[str] = None
    procedures: Optional[str] = None
    elastics: Optional[str] = None
    next_visit_weeks: int
    notes: Optional[str] = None


class OrthoCaseOut(ORMModel):
    id: str
    patient_id: str
    patient_name: Optional[str] = None
    clinician_id: Optional[str] = None
    angle_class: Optional[str] = None
    malocclusion_summary: Optional[str] = None
    appliance_type: str
    arch: str
    bracket_system: Optional[str] = None
    oral_hygiene: Optional[str] = None
    status: str
    started_on: Optional[date] = None
    debonded_on: Optional[date] = None
    planned_months: int
    next_review_due: Optional[date] = None
    notes: Optional[str] = None
    adjustments: list[OrthoAdjustmentOut] = []
    created_at: datetime


class PaediatricProfileIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    guardian_name: Optional[str] = None
    guardian_phone: Optional[str] = None
    guardian_relation: Optional[str] = None
    behaviour_rating: Optional[int] = Field(None, ge=1, le=4)  # Frankl scale
    dentition_stage: str = "primary"
    caries_risk: str = "moderate"
    oral_habits: Optional[str] = None
    medical_alerts: Optional[str] = None
    fluoride_last: Optional[date] = None
    fluoride_next: Optional[date] = None
    notes: Optional[str] = None


class PaediatricTreatmentIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    treatment_type: str = "fluoride_varnish"
    tooth: Optional[str] = None
    performed_on: Optional[date] = None
    notes: Optional[str] = None


class PaediatricTreatmentOut(ORMModel):
    id: str
    treatment_type: str
    tooth: Optional[str] = None
    performed_on: date
    performed_by_id: Optional[str] = None
    notes: Optional[str] = None


class PaediatricProfileOut(ORMModel):
    id: str
    patient_id: str
    patient_name: Optional[str] = None
    patient_age: Optional[int] = None
    guardian_name: Optional[str] = None
    guardian_phone: Optional[str] = None
    guardian_relation: Optional[str] = None
    behaviour_rating: Optional[int] = None
    dentition_stage: str
    caries_risk: str
    oral_habits: Optional[str] = None
    medical_alerts: Optional[str] = None
    fluoride_last: Optional[date] = None
    fluoride_next: Optional[date] = None
    notes: Optional[str] = None
    treatments: list[PaediatricTreatmentOut] = []
    created_at: datetime


class DepartmentOverviewOut(BaseModel):
    """Counts backing the Clinic dropdown landing cards."""

    restorative_open_cases: int = 0
    restorative_planned: int = 0
    endo_in_progress: int = 0
    surgical_open: int = 0
    surgical_scheduled_week: int = 0
    ortho_active: int = 0
    ortho_reviews_due: int = 0
    paediatric_profiles: int = 0
    paediatric_fluoride_due: int = 0
