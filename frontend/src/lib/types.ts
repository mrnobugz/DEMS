export type MedicalHistoryFlags = {
  diabetes: boolean;
  hypertension: boolean;
  asthma: boolean;
  heart_disease: boolean;
  major_surgery: boolean;
  hiv_aids: boolean;
  allergies_flag: boolean;
};

export type PainAssessment = {
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
  cavities: boolean;
  swelling: boolean;
  pus_discharge_fistula: boolean;
  halitosis: boolean;
  bleeding_gums: boolean;
  loose_dentures: boolean;
  ulceration: boolean;
};

export type VisitVitals = {
  bp_systolic?: number | null;
  bp_diastolic?: number | null;
  pulse?: number | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  posture?: string | null;
  gait?: string | null;
  appearance?: string | null;
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
  study_models_date?: string | null;
  study_models_photo_key?: string | null;
  radiograph_lucency?: string | null;
  radiograph_root_involved?: boolean | null;
  radiograph_furcation?: boolean | null;
  radiograph_tooth?: string | null;
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
  major_surgery: false,
  hiv_aids: false,
  allergies_flag: false,
});

export const emptyPain = (): PainAssessment => ({
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
  cavities: false,
  swelling: false,
  pus_discharge_fistula: false,
  halitosis: false,
  bleeding_gums: false,
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
};

export type Patient = {
  id: string;
  patient_code: string;
  hospital_reg_number?: string | null;
  first_name: string;
  last_name: string;
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
  referral_source?: string | null;
  insurance_number?: string | null;
  chief_complaint?: string | null;
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
  created_at: string;
};

export type Appointment = {
  id: string;
  patient_id: string;
  dentist_id: string;
  appointment_type_id?: string | null;
  chair_number?: number | null;
  starts_at: string;
  ends_at: string;
  status: string;
  reason?: string | null;
  notes?: string | null;
  color?: string | null;
  waitlist: boolean;
  no_show: boolean;
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
  }>;
  payments: Array<{
    id: string;
    amount: number;
    method: string;
    paid_at: string;
  }>;
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
