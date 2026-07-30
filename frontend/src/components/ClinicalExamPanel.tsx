import { FormEvent, useEffect, useState } from "react";
import { Icd10Picker } from "@/components/Icd10Picker";
import { api, ApiError } from "@/lib/api";
import type {
  ClinicalVisit,
  ExtraOralExam,
  Icd10CodeRef,
  IntraOralExam,
  VisitDiagnosis,
  VisitInvestigations,
  VisitVitals,
} from "@/lib/types";

type Props = {
  patientId: string;
  chiefComplaint?: string | null;
  onMessage: (msg: string) => void;
};

const emptyVitals = (): VisitVitals => ({
  bp_systolic: null,
  bp_diastolic: null,
  pulse: null,
  height_cm: null,
  weight_kg: null,
  posture: "",
  gait: "",
  appearance: "",
});

const emptyExtra = (): ExtraOralExam => ({
  head_shape: "",
  facial_form: "",
  symmetry: "",
  proportions: "",
  profile: "",
  skeletal_anterior: "",
  skeletal_posterior: "",
  skeletal_vertical: "",
  smile_line: "",
  smile_corridor_mm: null,
  nasolabial_angle: "",
  chin: "",
  mentolabial_sulcus: "",
  lip_competence: "",
  tmj_tenderness: false,
  tmj_sounds: false,
  jaw_deviation: false,
  restricted_movement: false,
  lymph_nodes_palpable: false,
  notes: "",
});

const emptyIntra = (): IntraOralExam => ({
  tongue: "",
  palate: "",
  gingiva_mucosa: "",
  periodontium: "",
  hard_tissue_notes: "",
  unerupted_teeth: "",
  missing_teeth: "",
  decayed_teeth: "",
  filled_teeth: "",
  defective_teeth: "",
  worn_teeth: "",
  discolored_teeth: "",
  plaque_by_sextant: "",
  calculus_by_sextant: "",
  occlusion: "",
  prosthesis_status: "",
  oral_habits: "",
  notes: "",
});

const emptyIx = (): VisitInvestigations => ({
  pulp_percussion: "",
  pulp_cold: "",
  pulp_heat: "",
  pulp_test_cavity: "",
  radiograph_notes: "",
  photography_notes: "",
  study_models_notes: "",
  pulp_percussion_result: "",
  pulp_cold_result: "",
  pulp_heat_result: "",
  pulp_test_cavity_result: "",
  photography_type: "",
  photography_date: "",
  photography_tooth: "",
  photography_storage_key: "",
  study_models_date: "",
  study_models_photo_key: "",
  radiograph_lucency: "",
  radiograph_root_involved: false,
  radiograph_furcation: false,
  radiograph_tooth: "",
});

const emptyDx = (): VisitDiagnosis => ({
  problem_list: "",
  working_diagnosis: "",
  final_impression: "",
  referrals: "",
  general_treatment_plan_notes: "",
  icd10_codes: [],
});

function numOrNull(v: string): number | null {
  if (!v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function cleanStr(v: string | null | undefined): string | null {
  const t = (v || "").trim();
  return t || null;
}

export function ClinicalExamPanel({ patientId, chiefComplaint, onMessage }: Props) {
  const [visits, setVisits] = useState<ClinicalVisit[]>([]);
  const [open, setOpen] = useState(false);
  const [visitDate, setVisitDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [complaint, setComplaint] = useState(chiefComplaint || "");
  const [status, setStatus] = useState("in_progress");
  const [vitals, setVitals] = useState(emptyVitals);
  const [extra, setExtra] = useState(emptyExtra);
  const [intra, setIntra] = useState(emptyIntra);
  const [ix, setIx] = useState(emptyIx);
  const [dx, setDx] = useState(emptyDx);
  const [notes, setNotes] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  async function load() {
    const rows = await api<ClinicalVisit[]>(`/api/v1/clinical/patients/${patientId}/visits`);
    setVisits(rows);
  }

  useEffect(() => {
    void load();
  }, [patientId]);

  useEffect(() => {
    if (!editingId) setComplaint(chiefComplaint || "");
  }, [chiefComplaint, editingId]);

  function resetForm() {
    setEditingId(null);
    setVisitDate(new Date().toISOString().slice(0, 10));
    setComplaint(chiefComplaint || "");
    setStatus("in_progress");
    setVitals(emptyVitals());
    setExtra(emptyExtra());
    setIntra(emptyIntra());
    setIx(emptyIx());
    setDx(emptyDx());
    setNotes("");
  }

  function loadVisit(v: ClinicalVisit) {
    setEditingId(v.id);
    setOpen(true);
    setVisitDate(v.visit_date);
    setComplaint(v.chief_complaint || "");
    setStatus(v.status);
    setVitals({ ...emptyVitals(), ...(v.vitals || {}) });
    setExtra({ ...emptyExtra(), ...(v.extra_oral || {}) });
    setIntra({ ...emptyIntra(), ...(v.intra_oral || {}) });
    setIx({ ...emptyIx(), ...(v.investigations || {}) });
    setDx({ ...emptyDx(), ...(v.diagnosis || {}) });
    setNotes(v.notes || "");
  }

  function payload() {
    return {
      visit_date: visitDate,
      chief_complaint: cleanStr(complaint),
      status,
      notes: cleanStr(notes),
      vitals: {
        bp_systolic: vitals.bp_systolic,
        bp_diastolic: vitals.bp_diastolic,
        pulse: vitals.pulse,
        height_cm: vitals.height_cm,
        weight_kg: vitals.weight_kg,
        posture: cleanStr(vitals.posture),
        gait: cleanStr(vitals.gait),
        appearance: cleanStr(vitals.appearance),
      },
      extra_oral: {
        ...extra,
        head_shape: cleanStr(extra.head_shape),
        facial_form: cleanStr(extra.facial_form),
        symmetry: cleanStr(extra.symmetry),
        proportions: cleanStr(extra.proportions),
        profile: cleanStr(extra.profile),
        skeletal_anterior: cleanStr(extra.skeletal_anterior),
        skeletal_posterior: cleanStr(extra.skeletal_posterior),
        skeletal_vertical: cleanStr(extra.skeletal_vertical),
        smile_line: cleanStr(extra.smile_line),
        nasolabial_angle: cleanStr(extra.nasolabial_angle),
        chin: cleanStr(extra.chin),
        mentolabial_sulcus: cleanStr(extra.mentolabial_sulcus),
        lip_competence: cleanStr(extra.lip_competence),
        notes: cleanStr(extra.notes),
      },
      intra_oral: Object.fromEntries(
        Object.entries(intra).map(([k, v]) => [k, typeof v === "string" ? cleanStr(v) : v]),
      ),
      investigations: Object.fromEntries(
        Object.entries(ix).map(([k, v]) => {
          if (typeof v === "boolean") return [k, v];
          return [k, cleanStr(v as string)];
        }),
      ),
      diagnosis: {
        problem_list: cleanStr(dx.problem_list),
        working_diagnosis: cleanStr(dx.working_diagnosis),
        final_impression: cleanStr(dx.final_impression),
        referrals: cleanStr(dx.referrals),
        general_treatment_plan_notes: cleanStr(dx.general_treatment_plan_notes),
        icd10_codes: (dx.icd10_codes || []).map((c) => ({
          code: c.code,
          description: c.description,
        })),
      },
    };
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    try {
      if (editingId) {
        await api(`/api/v1/clinical/visits/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload()),
        });
        onMessage("Clinical exam updated");
      } else {
        await api(`/api/v1/clinical/patients/${patientId}/visits`, {
          method: "POST",
          body: JSON.stringify(payload()),
        });
        onMessage("Clinical exam visit saved");
      }
      resetForm();
      setOpen(false);
      await load();
    } catch (err) {
      onMessage(err instanceof ApiError ? err.message : "Exam save failed");
    }
  }

  return (
    <div className="glass-panel space-y-4 rounded-3xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-lg font-bold">Clinical examination</h3>
          <p className="text-sm text-muted">
            Vitals · extra-oral · intra-oral · investigations · diagnosis
          </p>
        </div>
        <button
          type="button"
          className="btn-primary text-xs"
          onClick={() => {
            resetForm();
            setOpen(true);
          }}
        >
          New visit exam
        </button>
      </div>

      {visits.length > 0 && (
        <ul className="space-y-2 text-sm">
          {visits.map((v) => (
            <li
              key={v.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-50 px-3 py-2"
            >
              <div>
                <span className="font-semibold text-brand-900">{v.visit_date}</span>
                <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs capitalize text-brand-700">
                  {v.status.replace("_", " ")}
                </span>
                {v.chief_complaint && (
                  <p className="mt-0.5 text-xs text-muted line-clamp-1">{v.chief_complaint}</p>
                )}
                {v.diagnosis?.working_diagnosis && (
                  <p className="text-xs text-brand-800">Dx: {v.diagnosis.working_diagnosis}</p>
                )}
                {v.diagnosis?.icd10_codes && v.diagnosis.icd10_codes.length > 0 && (
                  <p className="text-[11px] font-mono text-muted">
                    {v.diagnosis.icd10_codes.map((c) => c.code).join(" · ")}
                  </p>
                )}
              </div>
              <button type="button" className="btn-ghost text-xs" onClick={() => loadVisit(v)}>
                Open
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <form className="space-y-5 border-t border-brand-50 pt-4" onSubmit={onSave}>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="label">Visit date</label>
              <input
                className="input"
                type="date"
                required
                value={visitDate}
                onChange={(e) => setVisitDate(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div className="md:col-span-1">
              <label className="label">Chief complaint (this visit)</label>
              <input
                className="input"
                value={complaint}
                onChange={(e) => setComplaint(e.target.value)}
              />
            </div>
          </div>

          <section className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wide text-brand-700">
              Vital signs & general
            </h4>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="label">BP systolic</label>
                <input
                  className="input"
                  type="number"
                  value={vitals.bp_systolic ?? ""}
                  onChange={(e) =>
                    setVitals({ ...vitals, bp_systolic: numOrNull(e.target.value) })
                  }
                />
              </div>
              <div>
                <label className="label">BP diastolic</label>
                <input
                  className="input"
                  type="number"
                  value={vitals.bp_diastolic ?? ""}
                  onChange={(e) =>
                    setVitals({ ...vitals, bp_diastolic: numOrNull(e.target.value) })
                  }
                />
              </div>
              <div>
                <label className="label">Pulse</label>
                <input
                  className="input"
                  type="number"
                  value={vitals.pulse ?? ""}
                  onChange={(e) => setVitals({ ...vitals, pulse: numOrNull(e.target.value) })}
                />
              </div>
              <div>
                <label className="label">Height (cm)</label>
                <input
                  className="input"
                  type="number"
                  step="0.1"
                  value={vitals.height_cm ?? ""}
                  onChange={(e) => setVitals({ ...vitals, height_cm: numOrNull(e.target.value) })}
                />
              </div>
              <div>
                <label className="label">Weight (kg)</label>
                <input
                  className="input"
                  type="number"
                  step="0.1"
                  value={vitals.weight_kg ?? ""}
                  onChange={(e) => setVitals({ ...vitals, weight_kg: numOrNull(e.target.value) })}
                />
              </div>
              <div>
                <label className="label">Appearance</label>
                <select
                  className="input"
                  value={vitals.appearance || ""}
                  onChange={(e) => setVitals({ ...vitals, appearance: e.target.value })}
                >
                  <option value="">—</option>
                  <option value="healthy_looking">Healthy-looking</option>
                  <option value="ill_looking">Ill-looking</option>
                </select>
              </div>
              <div>
                <label className="label">Posture</label>
                <input
                  className="input"
                  value={vitals.posture || ""}
                  onChange={(e) => setVitals({ ...vitals, posture: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Gait</label>
                <input
                  className="input"
                  value={vitals.gait || ""}
                  onChange={(e) => setVitals({ ...vitals, gait: e.target.value })}
                />
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wide text-brand-700">
              Extra-oral examination
            </h4>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {(
                [
                  ["facial_form", "Facial form"],
                  ["symmetry", "Symmetry"],
                  ["profile", "Profile"],
                  ["skeletal_anterior", "Skeletal (anterior)"],
                  ["skeletal_posterior", "Skeletal (posterior)"],
                  ["skeletal_vertical", "Skeletal (vertical)"],
                  ["smile_line", "Smile line"],
                  ["nasolabial_angle", "Nasolabial angle"],
                  ["chin", "Chin"],
                  ["mentolabial_sulcus", "Mentolabial sulcus"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <label className="label">{label}</label>
                  <input
                    className="input"
                    value={(extra[key] as string) || ""}
                    onChange={(e) => setExtra({ ...extra, [key]: e.target.value })}
                  />
                </div>
              ))}
              <div>
                <label className="label">Smile corridor (mm)</label>
                <input
                  className="input"
                  type="number"
                  step="0.1"
                  value={extra.smile_corridor_mm ?? ""}
                  onChange={(e) =>
                    setExtra({ ...extra, smile_corridor_mm: numOrNull(e.target.value) })
                  }
                />
              </div>
              <div>
                <label className="label">Lip competence</label>
                <select
                  className="input"
                  value={extra.lip_competence || ""}
                  onChange={(e) => setExtra({ ...extra, lip_competence: e.target.value })}
                >
                  <option value="">—</option>
                  <option value="competent">Competent</option>
                  <option value="incompetent">Incompetent</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              {(
                [
                  ["tmj_tenderness", "TMJ tenderness"],
                  ["tmj_sounds", "TMJ sounds"],
                  ["jaw_deviation", "Jaw deviation"],
                  ["restricted_movement", "Restricted movement"],
                  ["lymph_nodes_palpable", "Lymph nodes palpable"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(extra[key])}
                    onChange={(e) => setExtra({ ...extra, [key]: e.target.checked })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wide text-brand-700">
              Intra-oral examination
            </h4>
            <div className="grid gap-3 md:grid-cols-2">
              {(
                [
                  ["tongue", "Tongue"],
                  ["palate", "Palate"],
                  ["gingiva_mucosa", "Gingiva / mucosa"],
                  ["periodontium", "Periodontium"],
                  ["missing_teeth", "Missing teeth"],
                  ["decayed_teeth", "Decayed teeth"],
                  ["filled_teeth", "Filled teeth"],
                  ["plaque_by_sextant", "Plaque (by sextant)"],
                  ["calculus_by_sextant", "Calculus (by sextant)"],
                  ["oral_habits", "Oral habits"],
                  ["prosthesis_status", "Prosthesis status"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <label className="label">{label}</label>
                  <input
                    className="input"
                    value={(intra[key] as string) || ""}
                    onChange={(e) => setIntra({ ...intra, [key]: e.target.value })}
                  />
                </div>
              ))}
              <div>
                <label className="label">Occlusion</label>
                <select
                  className="input"
                  value={intra.occlusion || ""}
                  onChange={(e) => setIntra({ ...intra, occlusion: e.target.value })}
                >
                  <option value="">—</option>
                  <option value="normal">Normal</option>
                  <option value="malocclusion">Malocclusion</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="label">Hard tissue notes</label>
                <textarea
                  className="input min-h-16"
                  value={intra.hard_tissue_notes || ""}
                  onChange={(e) => setIntra({ ...intra, hard_tissue_notes: e.target.value })}
                />
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wide text-brand-700">
              Investigations (structured pulp / photo / radiograph)
            </h4>
            <div className="grid gap-3 md:grid-cols-2">
              {(
                [
                  ["pulp_percussion_result", "Percussion result"],
                  ["pulp_cold_result", "Cold result"],
                  ["pulp_heat_result", "Heat result"],
                  ["pulp_test_cavity_result", "Test cavity result"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <label className="label">{label}</label>
                  <select
                    className="input"
                    value={(ix as any)[key] || ""}
                    onChange={(e) => setIx({ ...ix, [key]: e.target.value })}
                  >
                    <option value="">—</option>
                    {["positive", "negative", "delayed"].map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <div>
                <label className="label">Photography type</label>
                <select
                  className="input"
                  value={ix.photography_type || ""}
                  onChange={(e) => setIx({ ...ix, photography_type: e.target.value })}
                >
                  <option value="">—</option>
                  <option value="extra_oral">Extra-oral</option>
                  <option value="intra_oral">Intra-oral</option>
                </select>
              </div>
              <div>
                <label className="label">Photography date</label>
                <input
                  type="date"
                  className="input"
                  value={ix.photography_date || ""}
                  onChange={(e) => setIx({ ...ix, photography_date: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Photo tooth / key</label>
                <input
                  className="input"
                  value={ix.photography_tooth || ""}
                  onChange={(e) => setIx({ ...ix, photography_tooth: e.target.value })}
                  placeholder="Tooth"
                />
              </div>
              <div>
                <label className="label">Photo storage key</label>
                <input
                  className="input"
                  value={ix.photography_storage_key || ""}
                  onChange={(e) => setIx({ ...ix, photography_storage_key: e.target.value })}
                  placeholder="stub://photos/..."
                />
              </div>
              <div>
                <label className="label">Radiograph lucency</label>
                <select
                  className="input"
                  value={ix.radiograph_lucency || ""}
                  onChange={(e) => setIx({ ...ix, radiograph_lucency: e.target.value })}
                >
                  <option value="">—</option>
                  {["radiolucent", "opaque", "mixed"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Radiograph tooth</label>
                <input
                  className="input"
                  value={ix.radiograph_tooth || ""}
                  onChange={(e) => setIx({ ...ix, radiograph_tooth: e.target.value })}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(ix.radiograph_root_involved)}
                  onChange={(e) => setIx({ ...ix, radiograph_root_involved: e.target.checked })}
                />
                Root involved
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(ix.radiograph_furcation)}
                  onChange={(e) => setIx({ ...ix, radiograph_furcation: e.target.checked })}
                />
                Furcation
              </label>
              {(
                [
                  ["radiograph_notes", "Radiograph notes"],
                  ["photography_notes", "Photography notes"],
                  ["study_models_notes", "Study models notes"],
                  ["study_models_date", "Study models date"],
                  ["study_models_photo_key", "Study models photo key"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <label className="label">{label}</label>
                  <input
                    className="input"
                    value={(ix as any)[key] || ""}
                    onChange={(e) => setIx({ ...ix, [key]: e.target.value })}
                  />
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wide text-brand-700">
              Diagnosis & plan bridge
            </h4>
            <Icd10Picker
              selected={(dx.icd10_codes || []) as Icd10CodeRef[]}
              onChange={(codes) => setDx({ ...dx, icd10_codes: codes })}
              multiple
            />
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="label">Problem list</label>
                <textarea
                  className="input min-h-16"
                  value={dx.problem_list || ""}
                  onChange={(e) => setDx({ ...dx, problem_list: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Working diagnosis</label>
                <input
                  className="input"
                  value={dx.working_diagnosis || ""}
                  onChange={(e) => setDx({ ...dx, working_diagnosis: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Final clinical impression</label>
                <input
                  className="input"
                  value={dx.final_impression || ""}
                  onChange={(e) => setDx({ ...dx, final_impression: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Referrals</label>
                <input
                  className="input"
                  placeholder="Oral Surgery, Orthodontics, Periodontics…"
                  value={dx.referrals || ""}
                  onChange={(e) => setDx({ ...dx, referrals: e.target.value })}
                />
              </div>
              <div>
                <label className="label">General treatment plan notes</label>
                <input
                  className="input"
                  value={dx.general_treatment_plan_notes || ""}
                  onChange={(e) => setDx({ ...dx, general_treatment_plan_notes: e.target.value })}
                />
              </div>
            </div>
          </section>

          <div>
            <label className="label">Visit notes</label>
            <textarea
              className="input min-h-16"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="btn-primary">{editingId ? "Update exam" : "Save exam"}</button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                resetForm();
                setOpen(false);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
