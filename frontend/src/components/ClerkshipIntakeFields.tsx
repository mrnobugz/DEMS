import type {
  MedicalHistoryFlags,
  PainAssessment,
  Patient,
  ReportedSymptoms,
} from "@/lib/types";
import { emptyMedicalHistory, emptyPain, emptySymptoms } from "@/lib/types";

export type ClerkshipFormState = {
  first_name: string;
  middle_name: string;
  last_name: string;
  hospital_reg_number: string;
  national_id: string;
  date_of_birth: string;
  sex: string;
  marital_status: string;
  occupation: string;
  tribe_nation: string;
  phone: string;
  email: string;
  po_box: string;
  street: string;
  house_number: string;
  area_ward: string;
  town_city: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  next_of_kin: string;
  next_of_kin_relationship: string;
  next_of_kin_phone: string;
  guardian_name: string;
  guardian_relationship: string;
  guardian_phone: string;
  referral_source: string;
  insurance_number: string;
  chief_complaint: string;
  history_of_presenting_complaint: string;
  last_dental_visit: string;
  smoking_status: string;
  alcohol_use: string;
  allergies: string;
  current_medications: string;
  dental_history: string;
  family_social_history: string;
  developmental_history: string;
  pregnancy_trimester: string;
  medical_history: MedicalHistoryFlags;
  pain_assessment: PainAssessment;
  reported_symptoms: ReportedSymptoms;
  notes: string;
};

export function emptyClerkshipForm(): ClerkshipFormState {
  return {
    first_name: "",
    middle_name: "",
    last_name: "",
    hospital_reg_number: "",
    national_id: "",
    date_of_birth: "",
    sex: "",
    marital_status: "",
    occupation: "",
    tribe_nation: "",
    phone: "",
    email: "",
    po_box: "",
    street: "",
    house_number: "",
    area_ward: "",
    town_city: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    next_of_kin: "",
    next_of_kin_relationship: "",
    next_of_kin_phone: "",
    guardian_name: "",
    guardian_relationship: "",
    guardian_phone: "",
    referral_source: "",
    insurance_number: "",
    chief_complaint: "",
    history_of_presenting_complaint: "",
    last_dental_visit: "",
    smoking_status: "",
    alcohol_use: "",
    allergies: "",
    current_medications: "",
    dental_history: "",
    family_social_history: "",
    developmental_history: "",
    pregnancy_trimester: "",
    medical_history: emptyMedicalHistory(),
    pain_assessment: emptyPain(),
    reported_symptoms: emptySymptoms(),
    notes: "",
  };
}

export function ageFromDob(dob: string): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  const md = now.getMonth() - d.getMonth();
  if (md < 0 || (md === 0 && now.getDate() < d.getDate())) years -= 1;
  return Math.max(years, 0);
}

export function isMinor(form: ClerkshipFormState) {
  const age = ageFromDob(form.date_of_birth);
  return age != null && age < 18;
}

/** Front-desk file opening only — clinical history is taken by the dentist. */
export function clerkshipGaps(form: ClerkshipFormState): string[] {
  const gaps: string[] = [];
  if (!form.first_name.trim()) gaps.push("First name");
  if (!form.last_name.trim()) gaps.push("Surname");
  if (!form.date_of_birth) gaps.push("Date of birth");
  if (!form.sex) gaps.push("Sex");
  if (!form.phone.trim()) gaps.push("Telephone");
  if (!form.town_city.trim()) gaps.push("Town / city");
  if (!form.next_of_kin.trim() && !form.emergency_contact_name.trim()) {
    gaps.push("Next of kin or emergency contact");
  }
  if (isMinor(form)) {
    if (!form.guardian_name.trim()) gaps.push("Guardian name");
    if (!form.guardian_relationship.trim()) gaps.push("Guardian relationship");
    if (!form.guardian_phone.trim()) gaps.push("Guardian telephone");
  }
  return gaps;
}

/** True when the dentist has not yet filled anamnesis / pain / symptoms. */
export function clinicalClerkshipIncomplete(form: ClerkshipFormState): boolean {
  const hasMed = Object.values(form.medical_history).some(Boolean);
  const hasSym = Object.values(form.reported_symptoms).some(Boolean);
  const pain = form.pain_assessment;
  const hasPain = Boolean(
    pain.site || pain.onset || pain.severity || pain.character || pain.quality,
  );
  return !(
    form.history_of_presenting_complaint.trim() ||
    form.allergies.trim() ||
    form.current_medications.trim() ||
    form.dental_history.trim() ||
    form.notes.trim() ||
    form.smoking_status ||
    form.alcohol_use ||
    hasMed ||
    hasSym ||
    hasPain
  );
}

export function formFromPatient(p: Patient): ClerkshipFormState {
  return {
    ...emptyClerkshipForm(),
    first_name: p.first_name,
    middle_name: p.middle_name || "",
    last_name: p.last_name,
    hospital_reg_number: p.hospital_reg_number || "",
    national_id: p.national_id || "",
    date_of_birth: p.date_of_birth || "",
    sex: p.sex || "",
    marital_status: p.marital_status || "",
    occupation: p.occupation || "",
    tribe_nation: p.tribe_nation || "",
    phone: p.phone || "",
    email: p.email || "",
    po_box: p.po_box || "",
    street: p.street || "",
    house_number: p.house_number || "",
    area_ward: p.area_ward || "",
    town_city: p.town_city || "",
    emergency_contact_name: p.emergency_contact_name || "",
    emergency_contact_phone: p.emergency_contact_phone || "",
    next_of_kin: p.next_of_kin || "",
    next_of_kin_relationship: p.next_of_kin_relationship || "",
    next_of_kin_phone: p.next_of_kin_phone || "",
    guardian_name: p.guardian_name || "",
    guardian_relationship: p.guardian_relationship || "",
    guardian_phone: p.guardian_phone || "",
    referral_source: p.referral_source || "",
    insurance_number: p.insurance_number || "",
    chief_complaint: p.chief_complaint || "",
    history_of_presenting_complaint: p.history_of_presenting_complaint || "",
    last_dental_visit: p.last_dental_visit || "",
    smoking_status: p.smoking_status || "",
    alcohol_use: p.alcohol_use || "",
    allergies: p.allergies || "",
    current_medications: p.current_medications || "",
    dental_history: p.dental_history || "",
    family_social_history: p.family_social_history || "",
    developmental_history: p.developmental_history || "",
    pregnancy_trimester: p.pregnancy_trimester != null ? String(p.pregnancy_trimester) : "",
    medical_history: { ...emptyMedicalHistory(), ...(p.medical_history || {}) },
    pain_assessment: { ...emptyPain(), ...(p.pain_assessment || {}) },
    reported_symptoms: { ...emptySymptoms(), ...(p.reported_symptoms || {}) },
    notes: p.notes || "",
  };
}

export function clerkshipPayload(form: ClerkshipFormState) {
  const blankToNull = (v: string) => (v.trim() ? v.trim() : null);
  return {
    first_name: form.first_name.trim(),
    middle_name: blankToNull(form.middle_name),
    last_name: form.last_name.trim(),
    hospital_reg_number: blankToNull(form.hospital_reg_number),
    national_id: blankToNull(form.national_id),
    date_of_birth: blankToNull(form.date_of_birth),
    sex: blankToNull(form.sex),
    marital_status: blankToNull(form.marital_status),
    occupation: blankToNull(form.occupation),
    tribe_nation: blankToNull(form.tribe_nation),
    phone: blankToNull(form.phone),
    email: blankToNull(form.email),
    po_box: blankToNull(form.po_box),
    street: blankToNull(form.street),
    house_number: blankToNull(form.house_number),
    area_ward: blankToNull(form.area_ward),
    town_city: blankToNull(form.town_city),
    emergency_contact_name: blankToNull(form.emergency_contact_name),
    emergency_contact_phone: blankToNull(form.emergency_contact_phone),
    next_of_kin: blankToNull(form.next_of_kin),
    next_of_kin_relationship: blankToNull(form.next_of_kin_relationship),
    next_of_kin_phone: blankToNull(form.next_of_kin_phone),
    guardian_name: blankToNull(form.guardian_name),
    guardian_relationship: blankToNull(form.guardian_relationship),
    guardian_phone: blankToNull(form.guardian_phone),
    referral_source: blankToNull(form.referral_source),
    insurance_number: blankToNull(form.insurance_number),
    chief_complaint: blankToNull(form.chief_complaint),
    history_of_presenting_complaint: blankToNull(form.history_of_presenting_complaint),
    last_dental_visit: blankToNull(form.last_dental_visit),
    smoking_status: blankToNull(form.smoking_status),
    alcohol_use: blankToNull(form.alcohol_use),
    allergies: blankToNull(form.allergies),
    current_medications: blankToNull(form.current_medications),
    dental_history: blankToNull(form.dental_history),
    family_social_history: blankToNull(form.family_social_history),
    developmental_history: blankToNull(form.developmental_history),
    pregnancy_trimester: form.pregnancy_trimester ? Number(form.pregnancy_trimester) : null,
    medical_history: form.medical_history,
    pain_assessment: {
      site: blankToNull(form.pain_assessment.site || ""),
      onset: blankToNull(form.pain_assessment.onset || ""),
      severity: blankToNull(form.pain_assessment.severity || ""),
      character: blankToNull(form.pain_assessment.character || ""),
      quality: blankToNull(form.pain_assessment.quality || ""),
      duration: blankToNull(form.pain_assessment.duration || ""),
      radiation: blankToNull(form.pain_assessment.radiation || ""),
      aggravating_factors: blankToNull(form.pain_assessment.aggravating_factors || ""),
      relieving_factors: blankToNull(form.pain_assessment.relieving_factors || ""),
    },
    reported_symptoms: form.reported_symptoms,
    notes: blankToNull(form.notes),
  };
}

const MEDICAL_LABELS: { key: keyof MedicalHistoryFlags; label: string }[] = [
  { key: "diabetes", label: "Diabetes" },
  { key: "hypertension", label: "Hypertension / BP" },
  { key: "asthma", label: "Asthma" },
  { key: "heart_disease", label: "Heart disease" },
  { key: "bleeding_disorder", label: "Bleeding disorder" },
  { key: "epilepsy", label: "Epilepsy" },
  { key: "hepatitis", label: "Hepatitis" },
  { key: "thyroid", label: "Thyroid disease" },
  { key: "kidney_disease", label: "Kidney disease" },
  { key: "anaemia", label: "Anaemia" },
  { key: "cancer_radiation", label: "Cancer / radiation" },
  { key: "major_surgery", label: "Major surgery" },
  { key: "hiv_aids", label: "HIV / AIDS" },
  { key: "allergies_flag", label: "Known allergies" },
  { key: "latex_allergy", label: "Latex allergy" },
];

const SYMPTOM_LABELS: { key: keyof ReportedSymptoms; label: string }[] = [
  { key: "toothache", label: "Toothache" },
  { key: "cavities", label: "Cavities" },
  { key: "swelling", label: "Swelling" },
  { key: "pus_discharge_fistula", label: "Pus / fistula" },
  { key: "halitosis", label: "Halitosis" },
  { key: "bleeding_gums", label: "Bleeding gums" },
  { key: "tooth_mobility", label: "Mobile teeth" },
  { key: "sensitivity", label: "Sensitivity" },
  { key: "tmj_click", label: "TMJ click / pain" },
  { key: "dry_mouth", label: "Dry mouth" },
  { key: "loose_dentures", label: "Loose dentures" },
  { key: "ulceration", label: "Ulceration" },
];

export type ClerkshipVariant = "reception" | "clinical" | "all";

type Props = {
  form: ClerkshipFormState;
  onChange: (next: ClerkshipFormState) => void;
  mode?: "create" | "edit";
  /** reception = front desk file opening; clinical = dentist after consult fee */
  variant?: ClerkshipVariant;
};

function Req({ show }: { show?: boolean }) {
  return show ? <span className="text-red-600"> *</span> : null;
}

export function ClerkshipIntakeFields({
  form,
  onChange,
  mode = "create",
  variant = "all",
}: Props) {
  const required = mode === "create" && variant !== "clinical";
  const showReception = variant !== "clinical";
  const showClinical = variant !== "reception";
  const age = ageFromDob(form.date_of_birth);
  const minor = isMinor(form);
  const gaps = required ? clerkshipGaps(form) : [];

  function set<K extends keyof ClerkshipFormState>(key: K, value: ClerkshipFormState[K]) {
    onChange({ ...form, [key]: value });
  }

  const sectionClass = "reg-section";
  const titleClass = "reg-section__title";
  const fieldGrid = "reg-fields";

  return (
    <div className="space-y-2.5">
      {variant === "clinical" && (
        <div className="rounded-2xl bg-brand-50 px-3 py-2 text-sm">
          <span className="font-semibold">
            {form.first_name} {form.middle_name} {form.last_name}
          </span>
          {age != null && <span className="text-muted"> · {age} yrs</span>}
          {form.sex && <span className="text-muted"> · {form.sex}</span>}
          {form.phone && <span className="text-muted"> · {form.phone}</span>}
          {form.chief_complaint && (
            <div className="mt-1 text-muted">Visit reason: {form.chief_complaint}</div>
          )}
          {form.insurance_number && (
            <div className="text-muted">Insurance / NHIF: {form.insurance_number}</div>
          )}
        </div>
      )}

      {showReception && (
      <>
      <section className={sectionClass}>
        <h4 className={titleClass}>
          Patient particulars
        </h4>
        <div className={fieldGrid}>
          <div>
            <label className="label">
              First name
              <Req show={required} />
            </label>
            <input
              className="input"
              required={required}
              value={form.first_name}
              onChange={(e) => set("first_name", e.target.value)}
            />
          </div>
          <div>
            <label className="label">Middle name</label>
            <input className="input" value={form.middle_name} onChange={(e) => set("middle_name", e.target.value)} />
          </div>
          <div>
            <label className="label">
              Surname
              <Req show={required} />
            </label>
            <input
              className="input"
              required={required}
              value={form.last_name}
              onChange={(e) => set("last_name", e.target.value)}
            />
          </div>
          <div>
            <label className="label">Hospital / clinic file no.</label>
            <input
              className="input"
              value={form.hospital_reg_number}
              onChange={(e) => set("hospital_reg_number", e.target.value)}
            />
          </div>
          <div>
            <label className="label">National ID / NIDA</label>
            <input className="input" value={form.national_id} onChange={(e) => set("national_id", e.target.value)} />
          </div>
          <div>
            <label className="label">
              Date of birth
              <Req show={required} />
            </label>
            <input
              className="input"
              type="date"
              required={required}
              value={form.date_of_birth}
              onChange={(e) => set("date_of_birth", e.target.value)}
            />
            {age != null && (
              <p className="mt-1 text-xs text-muted">
                Age: {age} year{age === 1 ? "" : "s"}
                {minor ? " · minor — guardian required" : ""}
              </p>
            )}
          </div>
          <div>
            <label className="label">
              Sex
              <Req show={required} />
            </label>
            <select className="input" required={required} value={form.sex} onChange={(e) => set("sex", e.target.value)}>
              <option value="">—</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="label">Marital status</label>
            <select
              className="input"
              value={form.marital_status}
              onChange={(e) => set("marital_status", e.target.value)}
            >
              <option value="">—</option>
              <option value="single">Single</option>
              <option value="married">Married</option>
              <option value="divorced">Divorced</option>
              <option value="widowed">Widowed</option>
              <option value="separated">Separated</option>
            </select>
          </div>
          <div>
            <label className="label">
              Telephone
              <Req show={required} />
            </label>
            <input
              className="input"
              required={required}
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div>
            <label className="label">Occupation</label>
            <input className="input" value={form.occupation} onChange={(e) => set("occupation", e.target.value)} />
          </div>
          <div>
            <label className="label">Tribe / nationality</label>
            <input className="input" value={form.tribe_nation} onChange={(e) => set("tribe_nation", e.target.value)} />
          </div>
        </div>
      </section>

      <section className={sectionClass}>
        <h4 className={titleClass}>
          Residence
        </h4>
        <div className={fieldGrid}>
          {(
            [
              ["house_number", "House number", false],
              ["street", "Street", false],
              ["area_ward", "Area / ward", false],
              ["town_city", "Town / city", true],
              ["po_box", "P.O. Box", false],
            ] as const
          ).map(([key, label, req]) => (
            <div key={key}>
              <label className="label">
                {label}
                <Req show={required && req} />
              </label>
              <input
                className="input"
                required={required && req}
                value={form[key]}
                onChange={(e) => set(key, e.target.value)}
              />
            </div>
          ))}
        </div>
      </section>

      <section className={sectionClass}>
        <h4 className={titleClass}>
          Next of kin / emergency / referral
        </h4>
        <div className={fieldGrid}>
          <div>
            <label className="label">
              Next of kin
              <Req show={required} />
            </label>
            <input className="input" value={form.next_of_kin} onChange={(e) => set("next_of_kin", e.target.value)} />
          </div>
          <div>
            <label className="label">Relationship</label>
            <input
              className="input"
              value={form.next_of_kin_relationship}
              onChange={(e) => set("next_of_kin_relationship", e.target.value)}
              placeholder="Parent, spouse, sibling…"
            />
          </div>
          <div>
            <label className="label">Next of kin telephone</label>
            <input
              className="input"
              value={form.next_of_kin_phone}
              onChange={(e) => set("next_of_kin_phone", e.target.value)}
            />
          </div>
          <div>
            <label className="label">Emergency contact</label>
            <input
              className="input"
              value={form.emergency_contact_name}
              onChange={(e) => set("emergency_contact_name", e.target.value)}
            />
          </div>
          <div>
            <label className="label">Emergency telephone</label>
            <input
              className="input"
              value={form.emergency_contact_phone}
              onChange={(e) => set("emergency_contact_phone", e.target.value)}
            />
          </div>
          <div>
            <label className="label">Insurance / NHIF number</label>
            <input
              className="input"
              value={form.insurance_number}
              onChange={(e) => set("insurance_number", e.target.value)}
            />
          </div>
          <div>
            <label className="label">Referred from</label>
            <input
              className="input"
              list="referral-sources"
              value={form.referral_source}
              onChange={(e) => set("referral_source", e.target.value)}
              placeholder="Self, hospital, dentist, walk-in…"
            />
            <datalist id="referral-sources">
              <option value="Self / walk-in" />
              <option value="Hospital" />
              <option value="Referring dentist" />
              <option value="Insurance / NHIF" />
              <option value="School / workplace" />
            </datalist>
          </div>
        </div>
      </section>

      {minor && (
        <section className="reg-section border-amber-200 bg-amber-50/70">
          <h4 className="reg-section__title text-amber-800">
            Guardian (patient under 18)
          </h4>
          <div className={fieldGrid}>
            <div>
              <label className="label">
                Guardian name
                <Req show />
              </label>
              <input
                className="input"
                required
                value={form.guardian_name}
                onChange={(e) => set("guardian_name", e.target.value)}
              />
            </div>
            <div>
              <label className="label">
                Relationship
                <Req show />
              </label>
              <input
                className="input"
                required
                value={form.guardian_relationship}
                onChange={(e) => set("guardian_relationship", e.target.value)}
                placeholder="Mother, father, aunt…"
              />
            </div>
            <div>
              <label className="label">
                Telephone
                <Req show />
              </label>
              <input
                className="input"
                required
                value={form.guardian_phone}
                onChange={(e) => set("guardian_phone", e.target.value)}
              />
            </div>
          </div>
        </section>
      )}

        <div className={sectionClass}>
          <label className="label">Reason for visit (patient&apos;s words)</label>
          <textarea
            className="input"
            rows={2}
            value={form.chief_complaint}
            onChange={(e) => set("chief_complaint", e.target.value)}
            placeholder="Optional — toothache, cleaning, swelling…"
          />
        </div>
      </>
      )}

      {showClinical && (
      <>
      <section className={sectionClass}>
        <h4 className={titleClass}>
          Clinical anamnesis (dentist)
        </h4>
        <div className={fieldGrid}>
          <div>
            <label className="label">
              Chief complaint
              <Req show={required} />
            </label>
            <textarea
              className="input"
              rows={2}
              required={required}
              value={form.chief_complaint}
              onChange={(e) => set("chief_complaint", e.target.value)}
              placeholder="In the patient's words — why they came today"
            />
          </div>
          <div>
            <label className="label">History of presenting complaint</label>
            <textarea
              className="input"
              rows={2}
              value={form.history_of_presenting_complaint}
              onChange={(e) => set("history_of_presenting_complaint", e.target.value)}
              placeholder="Onset, course, previous treatment"
            />
          </div>
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Past medical history
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {MEDICAL_LABELS.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 text-sm text-brand-900">
              <input
                type="checkbox"
                checked={form.medical_history[key]}
                onChange={(e) =>
                  set("medical_history", { ...form.medical_history, [key]: e.target.checked })
                }
              />
              {label}
            </label>
          ))}
        </div>
        <div className={fieldGrid}>
          <div>
            <label className="label">
              Allergy details
              <Req show={required && form.medical_history.allergies_flag} />
            </label>
            <input
              className="input"
              value={form.allergies}
              onChange={(e) => set("allergies", e.target.value)}
              placeholder="Drugs, foods, local anaesthetic…"
            />
          </div>
          <div>
            <label className="label">Current medication (type & dosage)</label>
            <input
              className="input"
              value={form.current_medications}
              onChange={(e) => set("current_medications", e.target.value)}
            />
          </div>
          {form.sex === "female" && (
            <div>
              <label className="label">Pregnancy trimester</label>
              <select
                className="input"
                value={form.pregnancy_trimester}
                onChange={(e) => set("pregnancy_trimester", e.target.value)}
              >
                <option value="">Not pregnant / N/A</option>
                <option value="1">1st</option>
                <option value="2">2nd</option>
                <option value="3">3rd</option>
              </select>
            </div>
          )}
          <div>
            <label className="label">Last dental visit</label>
            <input
              className="input"
              value={form.last_dental_visit}
              onChange={(e) => set("last_dental_visit", e.target.value)}
              placeholder="e.g. never, 6 months ago"
            />
          </div>
          <div>
            <label className="label">Smoking</label>
            <select
              className="input"
              value={form.smoking_status}
              onChange={(e) => set("smoking_status", e.target.value)}
            >
              <option value="">—</option>
              <option value="never">Never</option>
              <option value="former">Former</option>
              <option value="current">Current</option>
            </select>
          </div>
          <div>
            <label className="label">Alcohol</label>
            <select
              className="input"
              value={form.alcohol_use}
              onChange={(e) => set("alcohol_use", e.target.value)}
            >
              <option value="">—</option>
              <option value="none">None</option>
              <option value="occasional">Occasional</option>
              <option value="regular">Regular</option>
            </select>
          </div>
        </div>
        <div className={fieldGrid}>
          <div>
            <label className="label">Past dental history</label>
            <textarea
              className="input"
              rows={2}
              value={form.dental_history}
              onChange={(e) => set("dental_history", e.target.value)}
              placeholder="Extractions, fillings, dentures, ortho…"
            />
          </div>
          <div>
            <label className="label">Family / social history</label>
            <textarea
              className="input"
              rows={2}
              value={form.family_social_history}
              onChange={(e) => set("family_social_history", e.target.value)}
            />
          </div>
          {(minor || form.developmental_history) && (
            <div>
              <label className="label">Developmental history</label>
              <textarea
                className="input"
                rows={2}
                value={form.developmental_history}
                onChange={(e) => set("developmental_history", e.target.value)}
              />
            </div>
          )}
        </div>
      </section>

      <section className={sectionClass}>
        <h4 className={titleClass}>
          C. Pain assessment (SOCRATES)
        </h4>
        <div className={fieldGrid}>
          <div>
            <label className="label">Site (tooth / region)</label>
            <input
              className="input"
              value={form.pain_assessment.site || ""}
              onChange={(e) => set("pain_assessment", { ...form.pain_assessment, site: e.target.value })}
              placeholder="e.g. lower left 36, maxillary anterior"
            />
          </div>
          <div>
            <label className="label">Onset</label>
            <select
              className="input"
              value={form.pain_assessment.onset || ""}
              onChange={(e) => set("pain_assessment", { ...form.pain_assessment, onset: e.target.value })}
            >
              <option value="">—</option>
              <option value="spontaneous">Spontaneous</option>
              <option value="non_spontaneous">Non-spontaneous</option>
            </select>
          </div>
          <div>
            <label className="label">Severity</label>
            <select
              className="input"
              value={form.pain_assessment.severity || ""}
              onChange={(e) =>
                set("pain_assessment", { ...form.pain_assessment, severity: e.target.value })
              }
            >
              <option value="">—</option>
              <option value="mild">Mild</option>
              <option value="moderate">Moderate</option>
              <option value="severe">Severe</option>
            </select>
          </div>
          <div>
            <label className="label">Character</label>
            <select
              className="input"
              value={form.pain_assessment.character || ""}
              onChange={(e) =>
                set("pain_assessment", { ...form.pain_assessment, character: e.target.value })
              }
            >
              <option value="">—</option>
              <option value="localized">Localized</option>
              <option value="not_localized">Not localized</option>
            </select>
          </div>
          <div>
            <label className="label">Quality</label>
            <select
              className="input"
              value={form.pain_assessment.quality || ""}
              onChange={(e) =>
                set("pain_assessment", { ...form.pain_assessment, quality: e.target.value })
              }
            >
              <option value="">—</option>
              <option value="dull">Dull</option>
              <option value="burning">Burning</option>
              <option value="sharp">Sharp</option>
              <option value="throbbing">Throbbing</option>
            </select>
          </div>
          {(
            [
              ["duration", "Duration"],
              ["radiation", "Radiation"],
              ["aggravating_factors", "Aggravating factors"],
              ["relieving_factors", "Relieving factors"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <label className="label">{label}</label>
              <input
                className="input"
                value={form.pain_assessment[key] || ""}
                onChange={(e) => set("pain_assessment", { ...form.pain_assessment, [key]: e.target.value })}
              />
            </div>
          ))}
        </div>
      </section>

      <section className={sectionClass}>
        <h4 className={titleClass}>
          D. Reported symptoms
        </h4>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SYMPTOM_LABELS.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 text-sm text-brand-900">
              <input
                type="checkbox"
                checked={form.reported_symptoms[key]}
                onChange={(e) =>
                  set("reported_symptoms", {
                    ...form.reported_symptoms,
                    [key]: e.target.checked,
                  })
                }
              />
              {label}
            </label>
          ))}
        </div>
      </section>

      <section className={sectionClass}>
        <label className="label">Clinical clerkship notes</label>
        <textarea
          className="input"
          rows={2}
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
      </section>
      </>
      )}

      {required && gaps.length > 0 && (
        <div className="reg-gaps">
          Complete before continuing: {gaps.join(" · ")}
        </div>
      )}
    </div>
  );
}
