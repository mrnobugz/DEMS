import { FormEvent, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { EmptyState } from "@/components/EmptyState";
import { Clinical3DImaging } from "@/components/viz/Clinical3DImaging";
import { JawMap, jawRegionLabel } from "@/components/viz/JawMap";
import { TOOTH_STATUS_COLORS } from "@/components/viz/teeth";
import { api } from "@/lib/api";
import {
  DeptHeader,
  PatientChip,
  PatientSelect,
  StatCards,
  prettyLabel,
  useDepartmentOverview,
  usePatientOptions,
  useQueryPrefill,
} from "./shared";
import { DepartmentChairwork } from "./DepartmentChairwork";

type FollowUp = {
  id: string;
  visit_date: string;
  pain_score?: number | null;
  swelling?: string | null;
  healing: string;
  sutures_removed: boolean;
  notes?: string | null;
};

type SurgicalCase = {
  id: string;
  patient_id: string;
  patient_name?: string | null;
  procedure_type: string;
  site?: string | null;
  diagnosis?: string | null;
  anaesthesia: string;
  asa_class?: string | null;
  status: string;
  scheduled_at?: string | null;
  performed_at?: string | null;
  complications?: string | null;
  follow_ups: FollowUp[];
  created_at: string;
};

const OPEN_SURGICAL = new Set(["planned", "scheduled", "completed", "follow_up"]);

const PROCEDURES = [
  "extraction",
  "surgical_extraction",
  "impacted_third_molar",
  "biopsy",
  "cyst_enucleation",
  "fracture_reduction",
  "implant_placement",
  "orthognathic",
  "other",
];
const STATUSES = ["planned", "scheduled", "completed", "follow_up", "closed", "cancelled"];

export function MaxillofacialPage() {
  const overview = useDepartmentOverview();
  const patients = usePatientOptions();
  const prefill = useQueryPrefill();
  const [cases, setCases] = useState<SurgicalCase[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState("");
  const [followUpFor, setFollowUpFor] = useState<string | null>(null);
  const [form, setForm] = useState({
    patient_id: "",
    procedure_type: "extraction",
    site: "",
    diagnosis: "",
    anaesthesia: "local",
    asa_class: "",
    scheduled_at: "",
  });
  const [fu, setFu] = useState({ pain_score: "", swelling: "", healing: "normal", sutures_removed: false, notes: "" });

  useEffect(() => {
    if (!prefill.patientId && !prefill.site && !prefill.tooth) return;
    const site = prefill.site || prefill.tooth;
    setForm((f) => ({
      ...f,
      patient_id: prefill.patientId || f.patient_id,
      site: site || f.site,
    }));
  }, [prefill.patientId, prefill.site, prefill.tooth]);

  async function load() {
    const qs = statusFilter ? `?status=${statusFilter}` : "";
    setCases(await api<SurgicalCase[]>(`/api/v1/specialty/surgical-cases${qs}`));
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [statusFilter]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/api/v1/specialty/surgical-cases", {
        method: "POST",
        body: JSON.stringify({
          patient_id: form.patient_id,
          procedure_type: form.procedure_type,
          site: form.site || null,
          diagnosis: form.diagnosis || null,
          anaesthesia: form.anaesthesia,
          asa_class: form.asa_class || null,
          status: form.scheduled_at ? "scheduled" : "planned",
          scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
        }),
      });
      setForm((f) => ({ ...f, site: "", diagnosis: "", scheduled_at: "" }));
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function setStatus(id: string, status: string) {
    try {
      await api(`/api/v1/specialty/surgical-cases/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function onAddFollowUp(e: FormEvent, caseId: string) {
    e.preventDefault();
    setError("");
    try {
      await api(`/api/v1/specialty/surgical-cases/${caseId}/follow-ups`, {
        method: "POST",
        body: JSON.stringify({
          pain_score: fu.pain_score === "" ? null : Number(fu.pain_score),
          swelling: fu.swelling || null,
          healing: fu.healing,
          sutures_removed: fu.sutures_removed,
          notes: fu.notes || null,
        }),
      });
      setFu({ pain_score: "", swelling: "", healing: "normal", sutures_removed: false, notes: "" });
      setFollowUpFor(null);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  const surgicalViz = useMemo(() => {
    const colors: Record<string, string | undefined> = {};
    const regionMarks: Record<string, string | undefined> = {};
    const implants: string[] = [];
    const missing: string[] = [];
    for (const c of cases) {
      if (!c.site) continue;
      const color = OPEN_SURGICAL.has(c.status) ? TOOTH_STATUS_COLORS.surgical : "#cbd5e1";
      if (/^\d{2}$/.test(c.site)) {
        colors[c.site] = color;
        if (c.procedure_type === "implant_placement") implants.push(c.site);
        if (
          (c.procedure_type === "extraction" || c.procedure_type === "surgical_extraction") &&
          (c.status === "completed" || c.status === "follow_up" || c.status === "closed")
        ) {
          missing.push(c.site);
        }
      } else {
        regionMarks[c.site] = color;
      }
    }
    return { colors, regionMarks, implants, missing };
  }, [cases]);

  return (
    <div className="animate-rise space-y-6">
      <DeptHeader
        title="Maxillofacial surgery"
        subtitle="Extractions · impactions · biopsies · trauma · implants · post-op follow-up"
      />
      {overview && (
        <StatCards
          cards={[
            { label: "Open surgical cases", value: overview.surgical_open },
            {
              label: "Scheduled within 7 days",
              value: overview.surgical_scheduled_week,
              alert: overview.surgical_scheduled_week > 0,
            },
            { label: "Restorative open cases", value: overview.restorative_open_cases },
          ]}
        />
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <DepartmentChairwork
        dept="maxillofacial"
        patientId={form.patient_id || undefined}
        selectedTooth={/^\d{2}$/.test(form.site) ? form.site : null}
      />

      <Clinical3DImaging
        mode="surgical"
        patientId={form.patient_id || undefined}
        selected={/^\d{2}$/.test(form.site) ? form.site : null}
        onSelect={(fdi) => setForm((f) => ({ ...f, site: fdi }))}
        colors={surgicalViz.colors}
        implants={surgicalViz.implants}
        missing={surgicalViz.missing}
        onAction={(actionId, tooth, meta) => {
          setForm((f) => ({
            ...f,
            site: tooth,
            procedure_type:
              actionId === "extract"
                ? "extraction"
                : actionId === "implant" || actionId === "pdip" || actionId === "auto-crown-implant"
                  ? "implant_placement"
                  : f.procedure_type,
            diagnosis:
              actionId === "auto-crown" && meta?.crown
                ? f.diagnosis ||
                  `AI virtual crown ${meta.crown.material.replace("_", " ")} ${meta.crown.md}×${meta.crown.bl} mm · ${Math.round(meta.crown.confidence * 100)}%`
                : actionId === "auto-crown-implant" && meta?.crown && meta.implant
                  ? `PDIP AI crown+implant Ø${meta.implant.diameter}×${meta.implant.length} + ${meta.crown.md}×${meta.crown.bl} mm crown`
                  : actionId === "implant" && meta?.implant
                    ? f.diagnosis ||
                      `PDIP Ø${meta.implant.diameter} × ${meta.implant.length} mm` +
                        (meta.clearanceMm != null ? ` · IAN ${meta.clearanceMm} mm` : "")
                    : f.diagnosis,
          }));
          if (actionId === "followup") {
            const match = cases.find((c) => c.site === tooth);
            if (match) setFollowUpFor(match.id);
          }
        }}
      />

      <section className="glass-panel rounded-3xl p-5">
        <div>
          <h3 className="font-display text-base font-bold text-brand-900">Non-tooth sites</h3>
          <p className="text-xs text-muted">
            Jaw regions for trauma, cysts, and orthognathic work — tooth-level surgery uses the 3D
            workspace above
          </p>
        </div>
        <div className="mx-auto mt-2 max-w-xl">
          <JawMap
            marks={surgicalViz.regionMarks}
            selected={!/^\d{2}$/.test(form.site) && form.site ? form.site : null}
            onSelect={(site) => setForm((f) => ({ ...f, site }))}
          />
        </div>
      </section>

      <form className="glass-panel grid gap-3 rounded-3xl p-5 md:grid-cols-3" onSubmit={onCreate}>
        <div className="md:col-span-2">
          <PatientSelect
            patients={patients}
            value={form.patient_id}
            onChange={(id) => setForm({ ...form, patient_id: id })}
          />
        </div>
        <label className="text-sm">
          Procedure
          <select
            className="input mt-1"
            value={form.procedure_type}
            onChange={(e) => setForm({ ...form, procedure_type: e.target.value })}
          >
            {PROCEDURES.map((p) => (
              <option key={p} value={p}>
                {prettyLabel(p)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Site / tooth
          <input
            className="input mt-1"
            value={form.site}
            onChange={(e) => setForm({ ...form, site: e.target.value })}
            placeholder="pick on the map above or type"
          />
        </label>
        <label className="text-sm">
          Anaesthesia
          <select
            className="input mt-1"
            value={form.anaesthesia}
            onChange={(e) => setForm({ ...form, anaesthesia: e.target.value })}
          >
            {["local", "sedation", "general"].map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          ASA class
          <select
            className="input mt-1"
            value={form.asa_class}
            onChange={(e) => setForm({ ...form, asa_class: e.target.value })}
          >
            <option value="">—</option>
            {["I", "II", "III", "IV"].map((a) => (
              <option key={a} value={a}>
                ASA {a}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm md:col-span-2">
          Diagnosis / indication
          <input
            className="input mt-1"
            value={form.diagnosis}
            onChange={(e) => setForm({ ...form, diagnosis: e.target.value })}
          />
        </label>
        <label className="text-sm">
          Schedule for
          <input
            className="input mt-1"
            type="datetime-local"
            value={form.scheduled_at}
            onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
          />
        </label>
        <button className="btn-primary md:col-span-3" type="submit" disabled={!form.patient_id}>
          Open surgical case
        </button>
      </form>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-lg font-bold text-brand-900">
            Surgical cases ({cases.length})
          </h3>
          <select
            className="input w-auto text-xs"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {prettyLabel(s)}
              </option>
            ))}
          </select>
        </div>
        {cases.length === 0 ? (
          <EmptyState title="No surgical cases" hint="Open a case above to start the workflow." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {cases.map((c) => (
              <div key={c.id} className="glass-panel rounded-3xl p-4 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <PatientChip id={c.patient_id} name={c.patient_name} />
                  <select
                    className="input w-auto text-xs"
                    value={c.status}
                    onChange={(e) => void setStatus(c.id, e.target.value)}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {prettyLabel(s)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-1 text-xs text-muted">
                  <span className="capitalize">{prettyLabel(c.procedure_type)}</span>
                  {c.site
                    ? ` · ${/^\d{2}$/.test(c.site) ? `tooth ${c.site}` : jawRegionLabel(c.site)}`
                    : ""}{" "}
                  · {c.anaesthesia}
                  {c.asa_class ? ` · ASA ${c.asa_class}` : ""}
                  {c.scheduled_at
                    ? ` · scheduled ${format(parseISO(c.scheduled_at), "MMM d HH:mm")}`
                    : ""}
                  {c.performed_at
                    ? ` · performed ${format(parseISO(c.performed_at), "MMM d")}`
                    : ""}
                </div>
                {c.diagnosis && <p className="mt-1 text-xs">{c.diagnosis}</p>}
                {c.complications && (
                  <p className="mt-1 text-xs font-semibold text-red-700">
                    Complications: {c.complications}
                  </p>
                )}
                {c.follow_ups.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs">
                    {c.follow_ups.map((f) => (
                      <li key={f.id} className="rounded-lg bg-brand-50/60 px-2 py-1">
                        {format(parseISO(f.visit_date), "MMM d")} · healing {prettyLabel(f.healing)}
                        {f.pain_score != null ? ` · pain ${f.pain_score}/10` : ""}
                        {f.swelling ? ` · swelling ${f.swelling}` : ""}
                        {f.sutures_removed ? " · sutures out" : ""}
                        {f.notes ? ` · ${f.notes}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
                {followUpFor === c.id ? (
                  <form
                    className="mt-3 grid gap-2 rounded-2xl bg-brand-50/60 p-3 sm:grid-cols-2"
                    onSubmit={(e) => void onAddFollowUp(e, c.id)}
                  >
                    <label className="text-xs">
                      Pain (0-10)
                      <input
                        className="input mt-1"
                        type="number"
                        min={0}
                        max={10}
                        value={fu.pain_score}
                        onChange={(e) => setFu({ ...fu, pain_score: e.target.value })}
                      />
                    </label>
                    <label className="text-xs">
                      Swelling
                      <select
                        className="input mt-1"
                        value={fu.swelling}
                        onChange={(e) => setFu({ ...fu, swelling: e.target.value })}
                      >
                        <option value="">—</option>
                        {["none", "mild", "moderate", "severe"].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs">
                      Healing
                      <select
                        className="input mt-1"
                        value={fu.healing}
                        onChange={(e) => setFu({ ...fu, healing: e.target.value })}
                      >
                        {["normal", "delayed", "infected", "dry_socket"].map((s) => (
                          <option key={s} value={s}>
                            {prettyLabel(s)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-end gap-2 pb-1 text-xs">
                      <input
                        type="checkbox"
                        checked={fu.sutures_removed}
                        onChange={(e) => setFu({ ...fu, sutures_removed: e.target.checked })}
                      />
                      Sutures removed
                    </label>
                    <label className="text-xs sm:col-span-2">
                      Notes
                      <input
                        className="input mt-1"
                        value={fu.notes}
                        onChange={(e) => setFu({ ...fu, notes: e.target.value })}
                      />
                    </label>
                    <div className="flex gap-2 sm:col-span-2">
                      <button className="btn-primary flex-1 text-xs" type="submit">
                        Save follow-up
                      </button>
                      <button
                        className="btn-ghost text-xs"
                        type="button"
                        onClick={() => setFollowUpFor(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    className="btn-ghost mt-2 text-xs"
                    type="button"
                    onClick={() => setFollowUpFor(c.id)}
                  >
                    + Post-op follow-up
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
