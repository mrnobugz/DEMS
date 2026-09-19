import type { PatientVitalSign, VisitVitals } from "@/lib/types";

export type VitalSignsDraft = {
  bp_systolic: string;
  bp_diastolic: string;
  pulse: string;
  temperature_c: string;
  spo2: string;
  respiratory_rate: string;
  height_cm: string;
  weight_kg: string;
  appearance: string;
  posture: string;
  gait: string;
  notes: string;
};

export function emptyVitalsDraft(): VitalSignsDraft {
  return {
    bp_systolic: "",
    bp_diastolic: "",
    pulse: "",
    temperature_c: "",
    spo2: "",
    respiratory_rate: "",
    height_cm: "",
    weight_kg: "",
    appearance: "",
    posture: "",
    gait: "",
    notes: "",
  };
}

function num(v: string): number | null {
  if (!v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function draftToPayload(draft: VitalSignsDraft): VisitVitals & { notes?: string | null } {
  return {
    bp_systolic: num(draft.bp_systolic),
    bp_diastolic: num(draft.bp_diastolic),
    pulse: num(draft.pulse),
    temperature_c: num(draft.temperature_c),
    spo2: num(draft.spo2),
    respiratory_rate: num(draft.respiratory_rate),
    height_cm: num(draft.height_cm),
    weight_kg: num(draft.weight_kg),
    appearance: draft.appearance.trim() || null,
    posture: draft.posture.trim() || null,
    gait: draft.gait.trim() || null,
    notes: draft.notes.trim() || null,
  };
}

export function readingToVisitVitals(row: PatientVitalSign | VisitVitals | null | undefined): VisitVitals {
  if (!row) {
    return {
      bp_systolic: null,
      bp_diastolic: null,
      pulse: null,
      temperature_c: null,
      spo2: null,
      respiratory_rate: null,
      height_cm: null,
      weight_kg: null,
      posture: "",
      gait: "",
      appearance: "",
    };
  }
  return {
    bp_systolic: row.bp_systolic ?? null,
    bp_diastolic: row.bp_diastolic ?? null,
    pulse: row.pulse ?? null,
    temperature_c: row.temperature_c ?? null,
    spo2: row.spo2 ?? null,
    respiratory_rate: row.respiratory_rate ?? null,
    height_cm: row.height_cm ?? null,
    weight_kg: row.weight_kg ?? null,
    posture: row.posture || "",
    gait: row.gait || "",
    appearance: row.appearance || "",
  };
}

export function hasVitalsValues(row: VisitVitals | PatientVitalSign | null | undefined): boolean {
  if (!row) return false;
  return [
    row.bp_systolic,
    row.bp_diastolic,
    row.pulse,
    row.temperature_c,
    row.spo2,
    row.respiratory_rate,
    row.height_cm,
    row.weight_kg,
    row.posture,
    row.gait,
    row.appearance,
  ].some((v) => v != null && v !== "");
}

function line(label: string, value: string | number | null | undefined, unit = "") {
  if (value == null || value === "") return null;
  return `${label} ${value}${unit}`;
}

export function vitalsSummary(row: VisitVitals | PatientVitalSign | null | undefined): string {
  if (!row) return "No vital signs recorded yet.";
  const bits = [
    row.bp_systolic != null && row.bp_diastolic != null ? `BP ${row.bp_systolic}/${row.bp_diastolic}` : null,
    line("Pulse", row.pulse, " bpm"),
    line("Temp", row.temperature_c, " °C"),
    line("SpO₂", row.spo2, "%"),
    line("RR", row.respiratory_rate),
    line("Ht", row.height_cm, " cm"),
    line("Wt", row.weight_kg, " kg"),
    "bmi" in (row as PatientVitalSign) && (row as PatientVitalSign).bmi != null
      ? `BMI ${(row as PatientVitalSign).bmi}`
      : null,
    row.appearance,
  ].filter(Boolean);
  return bits.length ? bits.join(" · ") : "No vital signs recorded yet.";
}

export function VitalSignsDetails({
  reading,
  hint = "Recorded by the nurse. Used in clerkship details and the clinical exam.",
}: {
  reading: PatientVitalSign | null;
  hint?: string;
}) {
  if (!reading) {
    return (
      <section className="reg-section">
        <h4 className="reg-section__title">Vital signs</h4>
        <p className="text-sm text-muted">No vital signs yet. The nurse records them in the Vital signs module after registration.</p>
      </section>
    );
  }
  const when = new Date(reading.recorded_at);
  return (
    <section className="reg-section">
      <h4 className="reg-section__title">Vital signs</h4>
      <p className="text-sm font-semibold text-brand-900">{vitalsSummary(reading)}</p>
      <p className="text-xs text-muted">
        {when.toLocaleString()}
        {reading.recorded_by_name ? ` · ${reading.recorded_by_name}` : ""}
      </p>
      {reading.notes && <p className="mt-1 text-sm text-muted">{reading.notes}</p>}
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </section>
  );
}

export function VitalSignsForm({
  draft,
  onChange,
}: {
  draft: VitalSignsDraft;
  onChange: (next: VitalSignsDraft) => void;
}) {
  function set<K extends keyof VitalSignsDraft>(key: K, value: string) {
    onChange({ ...draft, [key]: value });
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">
          <span className="label">BP systolic</span>
          <input className="input" type="number" min={50} max={300} value={draft.bp_systolic} onChange={(e) => set("bp_systolic", e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="label">BP diastolic</span>
          <input className="input" type="number" min={30} max={200} value={draft.bp_diastolic} onChange={(e) => set("bp_diastolic", e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="label">Pulse (bpm)</span>
          <input className="input" type="number" min={20} max={250} value={draft.pulse} onChange={(e) => set("pulse", e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="label">Temperature (°C)</span>
          <input className="input" type="number" step="0.1" min={30} max={45} value={draft.temperature_c} onChange={(e) => set("temperature_c", e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="label">SpO₂ (%)</span>
          <input className="input" type="number" min={50} max={100} value={draft.spo2} onChange={(e) => set("spo2", e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="label">Respiratory rate</span>
          <input className="input" type="number" min={5} max={80} value={draft.respiratory_rate} onChange={(e) => set("respiratory_rate", e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="label">Height (cm)</span>
          <input className="input" type="number" step="0.1" min={30} max={280} value={draft.height_cm} onChange={(e) => set("height_cm", e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="label">Weight (kg)</span>
          <input className="input" type="number" step="0.1" min={1} max={400} value={draft.weight_kg} onChange={(e) => set("weight_kg", e.target.value)} />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          <span className="label">Appearance</span>
          <input className="input" value={draft.appearance} onChange={(e) => set("appearance", e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="label">Posture</span>
          <input className="input" value={draft.posture} onChange={(e) => set("posture", e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="label">Gait</span>
          <input className="input" value={draft.gait} onChange={(e) => set("gait", e.target.value)} />
        </label>
      </div>
      <label className="text-sm">
        <span className="label">Notes</span>
        <textarea className="input" rows={2} value={draft.notes} onChange={(e) => set("notes", e.target.value)} />
      </label>
    </div>
  );
}
