import type {
  MedicalHistoryFlags,
  PainAssessment,
  Patient,
  ReportedSymptoms,
} from "@/lib/types";
import { emptyMedicalHistory, emptyPain, emptySymptoms } from "@/lib/types";

export type ClerkshipFormState = {
  first_name: string;
  last_name: string;
  hospital_reg_number: string;
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
  referral_source: string;
  insurance_number: string;
  chief_complaint: string;
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
    last_name: "",
    hospital_reg_number: "",
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
    referral_source: "",
    insurance_number: "",
    chief_complaint: "",
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

export function formFromPatient(p: Patient): ClerkshipFormState {
  return {
    ...emptyClerkshipForm(),
    first_name: p.first_name,
    last_name: p.last_name,
    hospital_reg_number: p.hospital_reg_number || "",
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
    referral_source: p.referral_source || "",
    insurance_number: p.insurance_number || "",
    chief_complaint: p.chief_complaint || "",
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

/** Build API payload; omit empty strings as null for optional fields. */
export function clerkshipPayload(form: ClerkshipFormState) {
  const blankToNull = (v: string) => (v.trim() ? v.trim() : null);
  return {
    first_name: form.first_name.trim(),
    last_name: form.last_name.trim(),
    hospital_reg_number: blankToNull(form.hospital_reg_number),
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
    referral_source: blankToNull(form.referral_source),
    insurance_number: blankToNull(form.insurance_number),
    chief_complaint: blankToNull(form.chief_complaint),
    allergies: blankToNull(form.allergies),
    current_medications: blankToNull(form.current_medications),
    dental_history: blankToNull(form.dental_history),
    family_social_history: blankToNull(form.family_social_history),
    developmental_history: blankToNull(form.developmental_history),
    pregnancy_trimester: form.pregnancy_trimester ? Number(form.pregnancy_trimester) : null,
    medical_history: form.medical_history,
    pain_assessment: {
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
  { key: "hypertension", label: "Blood pressure / hypertension" },
  { key: "asthma", label: "Asthma" },
  { key: "heart_disease", label: "Heart conditions" },
  { key: "major_surgery", label: "Major surgeries" },
  { key: "hiv_aids", label: "HIV/AIDS" },
  { key: "allergies_flag", label: "Known allergies" },
];

const SYMPTOM_LABELS: { key: keyof ReportedSymptoms; label: string }[] = [
  { key: "cavities", label: "Cavities" },
  { key: "swelling", label: "Swelling" },
  { key: "pus_discharge_fistula", label: "Pus / fistula" },
  { key: "halitosis", label: "Halitosis" },
  { key: "bleeding_gums", label: "Bleeding gums" },
  { key: "loose_dentures", label: "Loose dentures" },
  { key: "ulceration", label: "Ulceration" },
];

type Props = {
  form: ClerkshipFormState;
  onChange: (next: ClerkshipFormState) => void;
  mode?: "create" | "edit";
};

export function ClerkshipIntakeFields({ form, onChange }: Props) {
  function set<K extends keyof ClerkshipFormState>(key: K, value: ClerkshipFormState[K]) {
    onChange({ ...form, [key]: value });
  }

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h4 className="font-display text-sm font-bold uppercase tracking-wide text-brand-700">
          Demographics
        </h4>
        <div className="grid gap-3 md:grid-cols-2">
          {(
            [
              ["first_name", "First name", true],
              ["last_name", "Last name", true],
              ["hospital_reg_number", "Hospital / clinic reg. no.", false],
              ["date_of_birth", "Date of birth", false],
              ["phone", "Telephone", false],
              ["email", "Email", false],
              ["occupation", "Occupation", false],
              ["tribe_nation", "Tribe / nation", false],
            ] as const
          ).map(([key, label, required]) => (
            <div key={key}>
              <label className="label">{label}</label>
              <input
                className="input"
                type={key === "date_of_birth" ? "date" : "text"}
                required={required}
                value={form[key]}
                onChange={(e) => set(key, e.target.value)}
              />
            </div>
          ))}
          <div>
            <label className="label">Sex</label>
            <select className="input" value={form.sex} onChange={(e) => set("sex", e.target.value)}>
              <option value="">—</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
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
            </select>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="font-display text-sm font-bold uppercase tracking-wide text-brand-700">
          Address
        </h4>
        <div className="grid gap-3 md:grid-cols-2">
          {(
            [
              ["house_number", "House number"],
              ["street", "Street"],
              ["area_ward", "Area / ward"],
              ["town_city", "Town / city"],
              ["po_box", "P.O. Box"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <label className="label">{label}</label>
              <input
                className="input"
                value={form[key]}
                onChange={(e) => set(key, e.target.value)}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="font-display text-sm font-bold uppercase tracking-wide text-brand-700">
          Clinical history
        </h4>
        <div>
          <label className="label">Chief complaint</label>
          <textarea
            className="input min-h-16"
            value={form.chief_complaint}
            onChange={(e) => set("chief_complaint", e.target.value)}
          />
        </div>
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
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label">Allergy details</label>
            <input
              className="input"
              value={form.allergies}
              onChange={(e) => set("allergies", e.target.value)}
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
          <div>
            <label className="label">Pregnancy trimester</label>
            <select
              className="input"
              value={form.pregnancy_trimester}
              onChange={(e) => set("pregnancy_trimester", e.target.value)}
            >
              <option value="">N/A</option>
              <option value="1">1st</option>
              <option value="2">2nd</option>
              <option value="3">3rd</option>
            </select>
          </div>
          <div>
            <label className="label">Insurance number</label>
            <input
              className="input"
              value={form.insurance_number}
              onChange={(e) => set("insurance_number", e.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label">Past dental history</label>
            <textarea
              className="input min-h-16"
              value={form.dental_history}
              onChange={(e) => set("dental_history", e.target.value)}
            />
          </div>
          <div>
            <label className="label">Family / social history</label>
            <textarea
              className="input min-h-16"
              value={form.family_social_history}
              onChange={(e) => set("family_social_history", e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <label className="label">Developmental history (prenatal / postnatal)</label>
            <textarea
              className="input min-h-16"
              value={form.developmental_history}
              onChange={(e) => set("developmental_history", e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="font-display text-sm font-bold uppercase tracking-wide text-brand-700">
          Pain assessment
        </h4>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label">Onset</label>
            <select
              className="input"
              value={form.pain_assessment.onset || ""}
              onChange={(e) =>
                set("pain_assessment", { ...form.pain_assessment, onset: e.target.value })
              }
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
                onChange={(e) =>
                  set("pain_assessment", { ...form.pain_assessment, [key]: e.target.value })
                }
              />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="font-display text-sm font-bold uppercase tracking-wide text-brand-700">
          Reported symptoms
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

      <section className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="label">Emergency contact</label>
          <input
            className="input"
            value={form.emergency_contact_name}
            onChange={(e) => set("emergency_contact_name", e.target.value)}
          />
        </div>
        <div>
          <label className="label">Emergency phone</label>
          <input
            className="input"
            value={form.emergency_contact_phone}
            onChange={(e) => set("emergency_contact_phone", e.target.value)}
          />
        </div>
        <div>
          <label className="label">Next of kin</label>
          <input
            className="input"
            value={form.next_of_kin}
            onChange={(e) => set("next_of_kin", e.target.value)}
          />
        </div>
        <div>
          <label className="label">Referral source</label>
          <input
            className="input"
            value={form.referral_source}
            onChange={(e) => set("referral_source", e.target.value)}
          />
        </div>
      </section>
    </div>
  );
}
