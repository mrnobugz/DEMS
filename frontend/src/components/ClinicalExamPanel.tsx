import { FormEvent, useEffect, useState } from "react";
import { Icd10Picker } from "@/components/Icd10Picker";
import { RadiologyInvestigationDialog, formatRadiologyOverview } from "@/components/RadiologyInvestigationDialog";
import { api, apiUpload, ApiError } from "@/lib/api";
import type {
  ClinicalVisit,
  ExtraOralExam,
  IntraOralExam,
  RadiologyInvestigationItem,
  VisitDiagnosis,
  VisitInvestigations,
  VisitVitals,
} from "@/lib/types";

type Props = {
  patientId: string;
  chiefComplaint?: string | null;
  onMessage: (msg: string) => void;
  /** Clinical department this exam is being recorded in. */
  department?: string;
  defaultOpen?: boolean;
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
  radiology_items: [],
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

function composeExtraOral(extra: ExtraOralExam): string {
  if ((extra.notes || "").trim()) return extra.notes || "";
  const lines: string[] = [];
  const labeled: [string, string | null | undefined][] = [
    ["Head shape", extra.head_shape],
    ["Facial form", extra.facial_form],
    ["Symmetry", extra.symmetry],
    ["Proportions", extra.proportions],
    ["Profile", extra.profile],
    ["Skeletal anterior", extra.skeletal_anterior],
    ["Skeletal posterior", extra.skeletal_posterior],
    ["Skeletal vertical", extra.skeletal_vertical],
    ["Smile line", extra.smile_line],
    ["Nasolabial angle", extra.nasolabial_angle],
    ["Chin", extra.chin],
    ["Mentolabial sulcus", extra.mentolabial_sulcus],
    ["Lip competence", extra.lip_competence],
  ];
  for (const [label, value] of labeled) {
    if (value?.trim()) lines.push(`${label}: ${value.trim()}`);
  }
  if (extra.smile_corridor_mm != null) lines.push(`Smile corridor: ${extra.smile_corridor_mm} mm`);
  const flags = [
    extra.tmj_tenderness && "TMJ tenderness",
    extra.tmj_sounds && "TMJ sounds",
    extra.jaw_deviation && "Jaw deviation",
    extra.restricted_movement && "Restricted movement",
    extra.lymph_nodes_palpable && "Lymph nodes palpable",
  ].filter(Boolean);
  if (flags.length) lines.push(flags.join(", "));
  return lines.join("\n");
}

export function ClinicalExamPanel({
  patientId,
  chiefComplaint,
  onMessage,
  department,
  defaultOpen = false,
}: Props) {
  const [visits, setVisits] = useState<ClinicalVisit[]>([]);
  const [open, setOpen] = useState(defaultOpen);
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
  const [vitalsOpen, setVitalsOpen] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [radioOpen, setRadioOpen] = useState(false);
  const paediatric = department === "paediatric";
  const omfs = department === "maxillofacial";
  const simpleIx = paediatric || omfs;

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
    setVitalsOpen(false);
    setRadioOpen(false);
  }

  async function uploadExamImage(file: File) {
    setPhotoBusy(true);
    try {
      const kind = file.type.startsWith("image/") ? "photo" : "PA";
      const study = await api<{ id: string }>(
        "/api/v1/imaging/studies",
        {
          method: "POST",
          body: JSON.stringify({
            patient_id: patientId,
            study_type: kind,
            notes: `${department || "Clinical"} exam investigation`,
          }),
        },
      );
      const fd = new FormData();
      fd.append("file", file, file.name);
      await apiUpload(`/api/v1/imaging/studies/${study.id}/upload`, fd);
      setIx((prev) => ({
        ...prev,
        photography_type: kind === "photo" ? "intra_oral" : prev.photography_type,
        photography_storage_key: study.id,
        photography_notes: file.name,
      }));
      onMessage("Image uploaded");
    } catch (err) {
      onMessage(err instanceof ApiError ? err.message : "Could not upload the image");
    } finally {
      setPhotoBusy(false);
    }
  }

  function loadVisit(v: ClinicalVisit) {
    setEditingId(v.id);
    setOpen(true);
    setVisitDate(v.visit_date);
    setComplaint(v.chief_complaint || "");
    setStatus(v.status);
    setVitals({ ...emptyVitals(), ...(v.vitals || {}) });
    const nextExtra = { ...emptyExtra(), ...(v.extra_oral || {}) };
    setExtra({ ...nextExtra, notes: composeExtraOral(nextExtra) });
    setIntra({ ...emptyIntra(), ...(v.intra_oral || {}) });
    setIx({ ...emptyIx(), ...(v.investigations || {}) });
    setDx({ ...emptyDx(), ...(v.diagnosis || {}) });
    setNotes(v.notes || "");
    setVitalsOpen(false);
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
      investigations: {
        ...Object.fromEntries(
          Object.entries(ix)
            .filter(([key]) => key !== "radiology_items")
            .map(([k, v]) => {
              if (typeof v === "boolean") return [k, v];
              return [k, cleanStr(v as string)];
            }),
        ),
        radiology_items: (ix.radiology_items || []).map((row) => ({
          fee_item_id: row.fee_item_id,
          type_label: row.type_label,
          type_code: row.type_code || null,
          unit_price: row.unit_price ?? null,
          region: cleanStr(row.region),
          quantity: row.quantity || 1,
          comment: cleanStr(row.comment),
          study_id: row.study_id || null,
          invoice_id: row.invoice_id || null,
          overview: row.overview || formatRadiologyOverview(row),
        })),
      },
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
    <div className="glass-panel space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-base font-bold">
            {omfs ? "Examination" : "Clinical examination"}
          </h3>
          <p className="text-xs text-muted">
            {omfs
              ? "General · vital signs · local · diagnosis · investigation"
              : "Extra-oral · intra-oral · investigations · diagnosis"}
            {department && !omfs ? ` · ${department}` : ""}
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
          {omfs && (
            <section className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wide text-brand-700">
                General examination
              </h4>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="label">Appearance</label>
                  <input
                    className="input"
                    value={vitals.appearance || ""}
                    onChange={(e) => setVitals({ ...vitals, appearance: e.target.value })}
                    placeholder="Ill / well · distress · pallor…"
                  />
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
          )}

          <section className="space-y-2">
            <button
              type="button"
              className="reveal-toggle"
              onClick={() => setVitalsOpen((v) => !v)}
              aria-expanded={vitalsOpen}
            >
              <span className="reveal-toggle__text">
                <span className="reveal-toggle__title">Vital signs</span>
                <span className="reveal-toggle__hint">
                  {omfs ? "BP, pulse, height, weight" : "BP, pulse, height, weight, appearance"}
                </span>
              </span>
              <span className="reveal-toggle__action">{vitalsOpen ? "Hide" : "Show"}</span>
            </button>
            {vitalsOpen && (
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
              {!omfs && (
              <>
              <div>
                <label className="label">Appearance</label>
                <input
                  className="input"
                  value={vitals.appearance || ""}
                  onChange={(e) => setVitals({ ...vitals, appearance: e.target.value })}
                />
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
              </>
              )}
            </div>
            )}
          </section>

          {omfs && (
            <h4 className="text-xs font-bold uppercase tracking-wide text-brand-700">
              Local examination
            </h4>
          )}

          <section className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wide text-brand-700">
              Extra-oral examination
            </h4>
            <textarea
              className="input"
              rows={5}
              value={extra.notes || ""}
              onChange={(e) => setExtra({ ...extra, notes: e.target.value })}
              placeholder="Head, face, TMJ, lymph nodes, profile, symmetry, lips…"
            />
          </section>

          <section className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wide text-brand-700">
              Intraoral examination
            </h4>
            {omfs && (
              <textarea
                className="input"
                rows={3}
                value={intra.notes || ""}
                onChange={(e) => setIntra({ ...intra, notes: e.target.value })}
                placeholder="Soft tissue, surgical site, mouth opening, hygiene…"
              />
            )}
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
              <div>
                <label className="label">Hard tissue notes</label>
                <textarea
                  className="input"
                  rows={2}
                  value={intra.hard_tissue_notes || ""}
                  onChange={(e) => setIntra({ ...intra, hard_tissue_notes: e.target.value })}
                />
              </div>
            </div>
          </section>

          {omfs && (
          <section className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wide text-brand-700">
              Diagnosis
            </h4>
            <Icd10Picker
              selected={dx.icd10_codes || []}
              onChange={(codes) => setDx({ ...dx, icd10_codes: codes })}
              multiple
            />
            <div className="grid gap-3 md:grid-cols-2">
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
              <div className="md:col-span-2">
                <label className="label">Problem list</label>
                <textarea
                  className="input"
                  rows={2}
                  value={dx.problem_list || ""}
                  onChange={(e) => setDx({ ...dx, problem_list: e.target.value })}
                />
              </div>
            </div>
          </section>
          )}

          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wide text-brand-700">
                Investigation
              </h4>
              <button type="button" className="btn-primary text-xs" onClick={() => setRadioOpen(true)}>
                Radiology
              </button>
            </div>
            {(ix.radiology_items || []).length > 0 && (
              <ul className="space-y-1">
                {(ix.radiology_items || []).map((row, index) => (
                  <li key={`${row.fee_item_id}-${index}`} className="ix-overview">
                    {row.overview || formatRadiologyOverview(row)}
                  </li>
                ))}
              </ul>
            )}
            {simpleIx ? (
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="label">Percussion</label>
                  <select
                    className="input"
                    value={ix.pulp_percussion_result || ""}
                    onChange={(e) => setIx({ ...ix, pulp_percussion_result: e.target.value })}
                  >
                    <option value="">—</option>
                    {["positive", "negative", "delayed"].map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                {omfs && (
                  <div className="md:col-span-2">
                    <label className="label">Investigation notes</label>
                    <textarea
                      className="input"
                      rows={2}
                      value={ix.study_models_notes || ""}
                      onChange={(e) => setIx({ ...ix, study_models_notes: e.target.value })}
                      placeholder="Aspiration, biopsy, bloods, culture…"
                    />
                  </div>
                )}
                {paediatric && (
                <>
                <div className="md:col-span-2">
                  <label className="label">Radiographic</label>
                  <textarea
                    className="input"
                    rows={3}
                    value={ix.radiograph_notes || ""}
                    onChange={(e) => setIx({ ...ix, radiograph_notes: e.target.value })}
                    placeholder="Radiograph findings…"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="label">Upload image / photo</label>
                  <input
                    className="input"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/*,.dcm,application/dicom"
                    disabled={photoBusy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void uploadExamImage(file);
                    }}
                  />
                  {photoBusy && <p className="mt-1 text-xs text-muted">Uploading…</p>}
                  {ix.photography_notes && (
                    <p className="mt-1 text-xs text-brand-800">Uploaded: {ix.photography_notes}</p>
                  )}
                </div>
                </>
                )}
              </div>
            ) : (
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
            )}
          </section>

          {omfs && (
          <section className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wide text-brand-700">
              Radiology notes
            </h4>
            <textarea
              className="input"
              rows={2}
              value={ix.radiograph_notes || ""}
              onChange={(e) => setIx({ ...ix, radiograph_notes: e.target.value })}
              placeholder="OPG / PA / CBCT findings — bill and attach the film in Radiology below"
            />
          </section>
          )}

          {!omfs && (
          <section className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wide text-brand-700">
              Diagnosis & plan bridge
            </h4>
            <Icd10Picker
              selected={dx.icd10_codes || []}
              onChange={(codes) => setDx({ ...dx, icd10_codes: codes })}
              multiple
            />
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="label">Problem list</label>
                <textarea
                  className="input"
                  rows={2}
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
          )}

          {!omfs && (
          <div>
            <label className="label">Visit notes</label>
            <textarea
              className="input"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          )}

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

      {radioOpen && (
        <RadiologyInvestigationDialog
          patientId={patientId}
          visitId={editingId}
          items={ix.radiology_items || []}
          onSave={(items: RadiologyInvestigationItem[]) =>
            setIx((prev) => ({ ...prev, radiology_items: items }))
          }
          onClose={() => setRadioOpen(false)}
          onMessage={onMessage}
        />
      )}
    </div>
  );
}
