export type MedicalHistoryFlags = {
  diabetes: boolean;
  hypertension: boolean;
  asthma: boolean;
  heart_disease: boolean;
  bleeding_disorder: boolean;
  epilepsy: boolean;
  hepatitis: boolean;
  thyroid: boolean;
  kidney_disease: boolean;
  anaemia: boolean;
  cancer_radiation: boolean;
  major_surgery: boolean;
  hiv_aids: boolean;
  allergies_flag: boolean;
  latex_allergy: boolean;
};

export type PainAssessment = {
  site?: string | null;
  onset?: string | null;
  severity?: string | null;
  character?: string | null;
  quality?: string | null;
  duration?: string | null;
  radiation?: string | null;
  aggravating_factors?: string | null;
  relieving_factors?: string | null;
};

export type ReportedSymptoms = {
  toothache: boolean;
  cavities: boolean;
  swelling: boolean;
  pus_discharge_fistula: boolean;
  halitosis: boolean;
  bleeding_gums: boolean;
  tooth_mobility: boolean;
  sensitivity: boolean;
  tmj_click: boolean;
  dry_mouth: boolean;
  loose_dentures: boolean;
  ulceration: boolean;
};

export type VisitVitals = {
  bp_systolic?: number | null;
  bp_diastolic?: number | null;
  pulse?: number | null;
  temperature_c?: number | null;
  spo2?: number | null;
  respiratory_rate?: number | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  posture?: string | null;
  gait?: string | null;
  appearance?: string | null;
};

export type PatientVitalSign = VisitVitals & {
  id: string;
  patient_id: string;
  recorded_by_id?: string | null;
  recorded_by_name?: string | null;
  recorded_at: string;
  notes?: string | null;
  bmi?: number | null;
  clinic_id: string;
  created_at: string;
};

export type ExtraOralExam = {
  head_shape?: string | null;
  facial_form?: string | null;
  symmetry?: string | null;
  proportions?: string | null;
  profile?: string | null;
  skeletal_anterior?: string | null;
  skeletal_posterior?: string | null;
  skeletal_vertical?: string | null;
  smile_line?: string | null;
  smile_corridor_mm?: number | null;
  nasolabial_angle?: string | null;
  chin?: string | null;
  mentolabial_sulcus?: string | null;
  lip_competence?: string | null;
  tmj_tenderness?: boolean | null;
  tmj_sounds?: boolean | null;
  jaw_deviation?: boolean | null;
  restricted_movement?: boolean | null;
  lymph_nodes_palpable?: boolean | null;
  notes?: string | null;
};

export type IntraOralExam = {
  tongue?: string | null;
  palate?: string | null;
  gingiva_mucosa?: string | null;
  periodontium?: string | null;
  hard_tissue_notes?: string | null;
  unerupted_teeth?: string | null;
  missing_teeth?: string | null;
  decayed_teeth?: string | null;
  filled_teeth?: string | null;
  defective_teeth?: string | null;
  worn_teeth?: string | null;
  discolored_teeth?: string | null;
  plaque_by_sextant?: string | null;
  calculus_by_sextant?: string | null;
  occlusion?: string | null;
  prosthesis_status?: string | null;
  oral_habits?: string | null;
  notes?: string | null;
};

export type RadiologyInvestigationItem = {
  fee_item_id: string;
  type_label: string;
  type_code?: string | null;
  unit_price?: number | null;
  region?: string | null;
  quantity: number;
  comment?: string | null;
  study_id?: string | null;
  invoice_id?: string | null;
  overview?: string | null;
  photo_url?: string | null;
  captured_at?: string | null;
};

export type VisitInvestigations = {
  pulp_percussion?: string | null;
  pulp_cold?: string | null;
  pulp_heat?: string | null;
  pulp_test_cavity?: string | null;
  radiograph_notes?: string | null;
  photography_notes?: string | null;
  study_models_notes?: string | null;
  pulp_percussion_result?: string | null;
  pulp_cold_result?: string | null;
  pulp_heat_result?: string | null;
  pulp_test_cavity_result?: string | null;
  photography_type?: string | null;
  photography_date?: string | null;
  photography_tooth?: string | null;
  photography_storage_key?: string | null;
  photography_url?: string | null;
  photography_study_id?: string | null;
  study_models_date?: string | null;
  study_models_photo_key?: string | null;
  radiograph_lucency?: string | null;
  radiograph_root_involved?: boolean | null;
  radiograph_furcation?: boolean | null;
  radiograph_tooth?: string | null;
  radiology_items?: RadiologyInvestigationItem[];
};

export type VisitDiagnosis = {
  problem_list?: string | null;
  working_diagnosis?: string | null;
  final_impression?: string | null;
  referrals?: string | null;
  general_treatment_plan_notes?: string | null;
  icd10_codes?: Icd10CodeRef[];
};

export type Icd10CodeRef = {
  code: string;
  description: string;
};

export type Icd10Code = {
  code: string;
  code_compact: string;
  description: string;
  category: string;
  category_label: string;
  billable: boolean;
};

export type ClinicalVisit = {
  id: string;
  patient_id: string;
  appointment_id?: string | null;
  examiner_id?: string | null;
  visit_date: string;
  status: string;
  chief_complaint?: string | null;
  vitals?: VisitVitals;
  extra_oral?: ExtraOralExam;
  intra_oral?: IntraOralExam;
  investigations?: VisitInvestigations;
  diagnosis?: VisitDiagnosis;
  notes?: string | null;
  clinic_id: string;
  created_at: string;
};

export const emptyMedicalHistory = (): MedicalHistoryFlags => ({
  diabetes: false,
  hypertension: false,
  asthma: false,
  heart_disease: false,
  bleeding_disorder: false,
  epilepsy: false,
  hepatitis: false,
  thyroid: false,
  kidney_disease: false,
  anaemia: false,
  cancer_radiation: false,
  major_surgery: false,
  hiv_aids: false,
  allergies_flag: false,
  latex_allergy: false,
});

export const emptyPain = (): PainAssessment => ({
  site: "",
  onset: "",
  severity: "",
  character: "",
  quality: "",
  duration: "",
  radiation: "",
  aggravating_factors: "",
  relieving_factors: "",
});

export const emptySymptoms = (): ReportedSymptoms => ({
  toothache: false,
  cavities: false,
  swelling: false,
  pus_discharge_fistula: false,
  halitosis: false,
  bleeding_gums: false,
  tooth_mobility: false,
  sensitivity: false,
  tmj_click: false,
  dry_mouth: false,
  loose_dentures: false,
  ulceration: false,
});

export type User = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  clinic_id?: string | null;
  phone?: string | null;
  specialty?: string | null;
  mfa_enabled: boolean;
  is_active: boolean;
  extra_permissions?: string[];
  denied_permissions?: string[];
  effective_permissions?: string[];
};

export type StaffMember = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  clinic_id?: string | null;
  phone?: string | null;
  specialty?: string | null;
  is_active: boolean;
  extra_permissions: string[];
  denied_permissions: string[];
  effective_permissions: string[];
  profile?: {
    department?: string | null;
    title?: string | null;
    notes?: string | null;
    license_no?: string | null;
    default_operatory_id?: string | null;
    production_goal?: number | null;
    commission_rate_bps?: number;
    is_scheduling_provider?: boolean;
    cert_expires_at?: string | null;
  } | null;
};

export type RoleCatalogItem = {
  id: string;
  label: string;
  assignable: boolean;
  permissions: string[];
};

export type PermissionCatalogItem = {
  id: string;
  resource: string;
  action: string;
  label: string;
  description: string;
};

export type Patient = {
  id: string;
  patient_code: string;
  hospital_reg_number?: string | null;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  national_id?: string | null;
  date_of_birth?: string | null;
  sex?: string | null;
  marital_status?: string | null;
  occupation?: string | null;
  tribe_nation?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  po_box?: string | null;
  street?: string | null;
  house_number?: string | null;
  area_ward?: string | null;
  town_city?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  next_of_kin?: string | null;
  next_of_kin_relationship?: string | null;
  next_of_kin_phone?: string | null;
  guardian_name?: string | null;
  guardian_relationship?: string | null;
  guardian_phone?: string | null;
  referral_source?: string | null;
  insurance_number?: string | null;
  chief_complaint?: string | null;
  history_of_presenting_complaint?: string | null;
  last_dental_visit?: string | null;
  smoking_status?: string | null;
  alcohol_use?: string | null;
  allergies?: string | null;
  chronic_conditions?: string | null;
  current_medications?: string | null;
  dental_history?: string | null;
  family_social_history?: string | null;
  developmental_history?: string | null;
  pregnancy_trimester?: number | null;
  medical_history?: MedicalHistoryFlags;
  pain_assessment?: PainAssessment;
  reported_symptoms?: ReportedSymptoms;
  caries_risk_score?: number | null;
  hygiene_recall_due?: string | null;
  perio_risk_band?: string | null;
  notes?: string | null;
  is_active: boolean;
  clinic_id: string;
  primary_dentist_id?: string | null;
  primary_dentist_name?: string | null;
  registration_status?: string;
  destination_department?: string | null;
  registration_finalized_at?: string | null;
  has_outstanding?: boolean;
  has_photo?: boolean;
  created_at: string;
  merged_into_id?: string | null;
  guarantor_patient_id?: string | null;
  medical_history_reviewed_at?: string | null;
};

export type InventoryItem = {
  id: string;
  sku: string;
  name: string;
  category: string;
  quantity: number;
  reorder_level: number;
  unit: string;
  unit_cost: number;
  sale_price: number;
  item_kind: "stock" | "service" | string;
  billable_at_registration: boolean;
  target_department?: string | null;
  is_active: boolean;
  notes?: string | null;
  expiry_date?: string | null;
  supplier_id?: string | null;
  track_lots?: boolean;
};

export type StockLocation = {
  id: string;
  code: string;
  name: string;
  kind: string;
  is_active: boolean;
};

export type StockMovement = {
  id: string;
  inventory_item_id: string;
  lot_id?: string | null;
  from_location_id?: string | null;
  to_location_id?: string | null;
  movement_type: string;
  quantity: number;
  unit_cost_snapshot: number;
  reason?: string | null;
  recorded_by_id?: string | null;
  created_at: string;
};

export type WarehouseSupplier = {
  id: string;
  name: string;
  contact_email?: string | null;
  contact_phone?: string | null;
  notes?: string | null;
  is_active: boolean;
};

export type PurchaseOrderLine = {
  id: string;
  inventory_item_id: string;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost: number;
};

export type PurchaseOrder = {
  id: string;
  supplier_id: string;
  status: string;
  ordered_at?: string | null;
  expected_at?: string | null;
  notes?: string | null;
  lines: PurchaseOrderLine[];
  created_at: string;
};

export type WarehouseAnalysis = {
  sku_count: number;
  on_hand_value: number;
  low_stock_count: number;
  low_stock: { id: string; sku: string; name: string; quantity: number; reorder_level: number }[];
  expiring_count: number;
  expiring: {
    lot_id: string;
    inventory_item_id: string;
    sku: string;
    name: string;
    location: string;
    lot_code: string;
    expiry_date: string | null;
    quantity: number;
  }[];
  open_pos: number;
  cogs_90d: number;
  billed_supply_revenue: number;
  usage_by_type: Record<string, number>;
  usage_by_department: Record<string, number>;
  dead_stock: { id: string; sku: string; name: string; quantity: number }[];
};

export type Appointment = {
  id: string;
  patient_id: string;
  dentist_id: string;
  appointment_type_id?: string | null;
  chair_number?: number | null;
  operatory_id?: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  reason?: string | null;
  notes?: string | null;
  color?: string | null;
  waitlist: boolean;
  no_show: boolean;
  queue_number?: number | null;
  service_name?: string | null;
  department?: string | null;
  is_appointment?: boolean;
  clinic_id: string;
  patient?: Patient | null;
};

export type AppointmentType = {
  id: string;
  name: string;
  category: string;
  duration_minutes: number;
  color: string;
  default_fee: number;
};

export type ChartEntry = {
  id: string;
  patient_id: string;
  tooth_number: string;
  surfaces?: string | null;
  notation: string;
  dentition: string;
  condition_code: string;
  condition_label: string;
  entry_kind: string;
  status: string;
  material?: string | null;
  shade?: string | null;
  notes?: string | null;
  visit_date?: string | null;
  billed_invoice_id?: string | null;
  created_at: string;
};

export type FeeScheduleItem = {
  id: string;
  code: string;
  label: string;
  category: string;
  unit_price: number;
  currency: string;
  is_active: boolean;
  billable: boolean;
  notes?: string | null;
  clinic_id: string;
  fee_schedule_id?: string | null;
  catalog_item_id?: string | null;
  catalog_kind?: string | null;
  inventory_item_id?: string | null;
  quantity_on_hand?: number;
};

export type CatalogFeeRate = {
  id: string;
  catalog_item_id: string;
  payer_name: string;
  amount: number;
  effective_from: string;
};

export type CatalogItem = {
  id: string;
  sku: string;
  kind: string;
  label: string;
  list_price: number;
  currency: string;
  is_active: boolean;
  billable: boolean;
  category_id?: string | null;
  notes?: string | null;
  cdt_code?: string | null;
  tooth_required: boolean;
  ndc_code?: string | null;
  drug_schedule?: string | null;
  unit_of_measure?: string | null;
  vendor_fee_basis?: string | null;
  inventory_item_id?: string | null;
  clinic_id: string;
  fee_rates: CatalogFeeRate[];
};

export type ClinicalNote = {
  id: string;
  patient_id: string;
  author_id: string;
  note_type: string;
  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
  procedure_codes?: string | null;
  is_finalized: boolean;
  ai_draft: boolean;
  created_at: string;
};

export type TreatmentPlanItem = {
  id: string;
  phase_name: string;
  phase_order: number;
  procedure_name: string;
  procedure_code?: string | null;
  icd10_code?: string | null;
  icd10_description?: string | null;
  tooth_number?: string | null;
  dependency_ref?: string | null;
  description?: string | null;
  estimated_fee: number;
  insurance_coverage_pct: number;
  insurance_estimate_amount: number;
  patient_estimate_amount: number;
  target_date?: string | null;
  status: string;
  notes?: string | null;
};

export type TreatmentPlan = {
  id: string;
  patient_id: string;
  title: string;
  status: string;
  target_start_date?: string | null;
  target_end_date?: string | null;
  accepted_at?: string | null;
  accepted_by_name?: string | null;
  approval_notes?: string | null;
  created_at: string;
  items: TreatmentPlanItem[];
};

export type PerioSite = {
  id: string;
  tooth_number: string;
  site_code: string;
  pocket_depth_mm?: number | null;
  bleeding_on_probing: boolean;
  recession_mm?: number | null;
  plaque_index?: number | null;
  gingival_index?: number | null;
  mobility_grade?: number | null;
  furcation_grade?: number | null;
  notes?: string | null;
};

export type PerioExam = {
  id: string;
  patient_id: string;
  examiner_id?: string | null;
  exam_date: string;
  notes?: string | null;
  risk_band: string;
  suggested_recall_months: number;
  mean_pocket_depth?: number | null;
  bleeding_pct?: number | null;
  created_at: string;
  sites: PerioSite[];
};

export type Invoice = {
  id: string;
  patient_id: string;
  invoice_number: string;
  status: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  amount_paid: number;
  amount_adjusted?: number;
  outstanding?: boolean;
  currency: string;
  notes?: string | null;
  issued_at?: string | null;
  line_items: Array<{
    id: string;
    description: string;
    tooth_number?: string | null;
    quantity: number;
    unit_price: number;
    total: number;
    procedure_code?: string | null;
    chart_entry_id?: string | null;
    inventory_item_id?: string | null;
    line_kind?: string;
    fee_charged?: number;
    estimated_insurance?: number;
    estimated_patient?: number;
    actual_insurance?: number;
    actual_patient?: number;
    charge_status?: string;
  }>;
  payments: Array<{
    id: string;
    amount: number;
    method: string;
    paid_at: string;
  }>;
};

export type InsuranceClaim = {
  id: string;
  patient_id: string;
  invoice_id: string;
  plan_id?: string | null;
  claim_number: string;
  status: string;
  submitted_at?: string | null;
  adjudicated_at?: string | null;
  scrub_notes?: string | null;
  notes?: string | null;
  lines: Array<{
    id: string;
    line_item_id: string;
    billed_amount: number;
    allowed_amount?: number | null;
    paid_amount: number;
    patient_responsibility: number;
    status: string;
    denial_reason?: string | null;
  }>;
};

export type ClaimDenial = {
  claim_id: string;
  claim_number: string;
  claim_line_id: string;
  invoice_id: string;
  patient_id: string;
  procedure: string;
  procedure_code?: string | null;
  billed_amount: number;
  paid_amount: number;
  status: string;
  denial_reason?: string | null;
};

export type PatientStatement = {
  id: string;
  patient_id: string;
  statement_number: string;
  balance_due: number;
  due_date?: string | null;
  issued_at: string;
  notes?: string | null;
  invoice_ids?: string | null;
};

export type PatientRegisterResult = {
  patient: Patient;
  invoice: Invoice;
  consent_id: string;
  destination_department: string;
  clinical_path: string;
  outstanding: boolean;
  queue_number?: number | null;
  appointment_id?: string | null;
  service_name?: string | null;
  slot_starts_at?: string | null;
  is_appointment?: boolean;
  medical_staff_id?: string | null;
  medical_staff_name?: string | null;
};

export type RegistrationDraftStatus = "open" | "cancelled" | "completed";

export type RegistrationDraft = {
  id: string;
  patient_id?: string | null;
  created_by_id?: string | null;
  created_by_name?: string | null;
  updated_by_id?: string | null;
  status: RegistrationDraftStatus;
  display_name: string;
  summary?: string | null;
  step: number;
  payload: Record<string, unknown>;
  cancel_reason?: string | null;
  closed_at?: string | null;
  clinic_id: string;
  created_at: string;
  updated_at: string;
};

export type ChairQueueItem = {
  id: string;
  patient_id: string;
  patient_code?: string | null;
  patient_name?: string | null;
  dentist_id: string;
  dentist_name?: string | null;
  queue_number?: number | null;
  service_name?: string | null;
  department?: string | null;
  status: string;
  starts_at: string;
  is_appointment?: boolean;
  reason?: string | null;
  chair_number?: number | null;
};

export type RegistrationSlot = {
  starts_at: string;
  ends_at: string;
  available: boolean;
};

export type DashboardStats = {
  patients_total: number;
  appointments_today: number;
  revenue_month: number;
  no_shows_week: number;
  open_invoices: number;
  caries_high_risk: number;
};

export type Page<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};
