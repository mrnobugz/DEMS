import { FormEvent, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { EmptyState } from "@/components/EmptyState";
import { Clinical3DImaging } from "@/components/viz/Clinical3DImaging";
import { PERMANENT_LOWER, PERMANENT_UPPER } from "@/components/viz/teeth";
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

type Adjustment = {
  id: string;
  visit_date: string;
  archwire?: string | null;
  procedures?: string | null;
  elastics?: string | null;
  next_visit_weeks: number;
  notes?: string | null;
};

type OrthoCase = {
  id: string;
  patient_id: string;
  patient_name?: string | null;
  angle_class?: string | null;
  malocclusion_summary?: string | null;
  appliance_type: string;
  arch: string;
  bracket_system?: string | null;
  oral_hygiene?: string | null;
  status: string;
  started_on?: string | null;
  debonded_on?: string | null;
  planned_months: number;
  next_review_due?: string | null;
  adjustments: Adjustment[];
  created_at: string;
};

const STATUSES = ["assessment", "active", "retention", "completed", "discontinued"];
const APPLIANCES = ["fixed_metal", "fixed_ceramic", "removable", "functional", "clear_aligner"];
const ANGLE_CLASSES = ["I", "II_div1", "II_div2", "III"];

export function OrthodonticPage() {
  const overview = useDepartmentOverview();
  const patients = usePatientOptions();
  const prefill = useQueryPrefill();
  const [cases, setCases] = useState<OrthoCase[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState("");
  const [adjustFor, setAdjustFor] = useState<string | null>(null);
  const [form, setForm] = useState({
    patient_id: "",
    angle_class: "",
    malocclusion_summary: "",
    appliance_type: "fixed_metal",
    arch: "both",
    bracket_system: "",
    planned_months: 18,
  });
  const [adj, setAdj] = useState({ archwire: "", procedures: "", elastics: "", next_visit_weeks: 4, notes: "" });
  const [selectedTooth, setSelectedTooth] = useState<string | null>(prefill.tooth || null);

  useEffect(() => {
    if (!prefill.patientId && !prefill.tooth) return;
    setForm((f) => ({
      ...f,
      patient_id: prefill.patientId || f.patient_id,
      arch: prefill.tooth
        ? PERMANENT_UPPER.includes(prefill.tooth)
          ? "upper"
          : "lower"
        : f.arch,
    }));
    if (prefill.tooth) setSelectedTooth(prefill.tooth);
  }, [prefill.patientId, prefill.tooth]);

  async function load() {
    const qs = statusFilter ? `?status=${statusFilter}` : "";
    setCases(await api<OrthoCase[]>(`/api/v1/specialty/ortho-cases${qs}`));
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [statusFilter]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/api/v1/specialty/ortho-cases", {
        method: "POST",
        body: JSON.stringify({
          patient_id: form.patient_id,
          angle_class: form.angle_class || null,
          malocclusion_summary: form.malocclusion_summary || null,
          appliance_type: form.appliance_type,
          arch: form.arch,
          bracket_system: form.bracket_system || null,
          planned_months: Number(form.planned_months),
        }),
      });
      setForm((f) => ({ ...f, angle_class: "", malocclusion_summary: "", bracket_system: "" }));
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function setStatus(id: string, status: string) {
    try {
      await api(`/api/v1/specialty/ortho-cases/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function onAddAdjustment(e: FormEvent, caseId: string) {
    e.preventDefault();
    setError("");
    try {
      await api(`/api/v1/specialty/ortho-cases/${caseId}/adjustments`, {
        method: "POST",
        body: JSON.stringify({
          archwire: adj.archwire || null,
          procedures: adj.procedures || null,
          elastics: adj.elastics || null,
          next_visit_weeks: Number(adj.next_visit_weeks),
          notes: adj.notes || null,
        }),
      });
      setAdj({ archwire: "", procedures: "", elastics: "", next_visit_weeks: 4, notes: "" });
      setAdjustFor(null);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  // Tint arches under active/retention treatment; drive the 3D archwire overlay
  const { archColors, wireArches } = useMemo(() => {
    const colors: Record<string, string | undefined> = {};
    let upper = false;
    let lower = false;
    for (const c of cases) {
      if (c.status !== "active" && c.status !== "retention") continue;
      const tint = c.status === "active" ? "#7dd3fc" : "#86efac";
      const arches =
        c.arch === "both" ? (["upper", "lower"] as const) : ([c.arch] as ("upper" | "lower")[]);
      for (const arch of arches) {
        if (arch === "upper") upper = true;
        else lower = true;
        for (const fdi of arch === "upper" ? PERMANENT_UPPER : PERMANENT_LOWER) {
          colors[fdi] = colors[fdi] ?? tint;
        }
      }
    }
    const wire = upper && lower ? "both" : upper ? "upper" : lower ? "lower" : null;
    return { archColors: colors, wireArches: wire as "upper" | "lower" | "both" | null };
  }, [cases]);

  return (
    <div className="animate-rise space-y-6">
      <DeptHeader
        title="Orthodontic department"
        subtitle="Angle classification · appliances · adjustment cadence · retention"
      />
      {overview && (
        <StatCards
          cards={[
            { label: "Active / retention", value: overview.ortho_active },
            {
              label: "Reviews due",
              value: overview.ortho_reviews_due,
              alert: overview.ortho_reviews_due > 0,
            },
            { label: "Paediatric profiles", value: overview.paediatric_profiles },
          ]}
        />
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <Clinical3DImaging
        mode="ortho"
        patientId={form.patient_id || undefined}
        selected={selectedTooth}
        onSelect={(fdi) => {
          setSelectedTooth(fdi);
          setForm((f) => ({
            ...f,
            arch: PERMANENT_UPPER.includes(fdi) ? "upper" : "lower",
          }));
        }}
        colors={archColors}
        wire={wireArches}
        onAction={(actionId, tooth) => {
          setSelectedTooth(tooth);
          const arch = PERMANENT_UPPER.includes(tooth) ? "upper" : "lower";
          setForm((f) => ({
            ...f,
            arch: actionId === "arch" || actionId === "tad" ? arch : f.arch,
            malocclusion_summary:
              actionId === "tad"
                ? f.malocclusion_summary || `TAD / anchorage planned at ${tooth}`
                : f.malocclusion_summary,
          }));
          if (actionId === "adjust") {
            const match =
              cases.find(
                (c) =>
                  c.patient_id === form.patient_id &&
                  (c.status === "active" || c.status === "retention"),
              ) ??
              cases.find((c) => c.status === "active" || c.status === "retention");
            if (match) {
              setAdjustFor(match.id);
              setAdj((a) => ({
                ...a,
                procedures: a.procedures || `3D review · tooth ${tooth}`,
              }));
            }
          }
        }}
      />

      <form className="glass-panel grid gap-3 rounded-3xl p-5 md:grid-cols-3" onSubmit={onCreate}>
        <div className="md:col-span-2">
          <PatientSelect
            patients={patients}
            value={form.patient_id}
            onChange={(id) => setForm({ ...form, patient_id: id })}
          />
        </div>
        <label className="text-sm">
          Angle class
          <select
            className="input mt-1"
            value={form.angle_class}
            onChange={(e) => setForm({ ...form, angle_class: e.target.value })}
          >
            <option value="">—</option>
            {ANGLE_CLASSES.map((a) => (
              <option key={a} value={a}>
                Class {prettyLabel(a)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Appliance
          <select
            className="input mt-1"
            value={form.appliance_type}
            onChange={(e) => setForm({ ...form, appliance_type: e.target.value })}
          >
            {APPLIANCES.map((a) => (
              <option key={a} value={a}>
                {prettyLabel(a)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Arch
          <select
            className="input mt-1"
            value={form.arch}
            onChange={(e) => setForm({ ...form, arch: e.target.value })}
          >
            {["both", "upper", "lower"].map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Planned duration (months)
          <input
            className="input mt-1"
            type="number"
            min={1}
            max={72}
            value={form.planned_months}
            onChange={(e) => setForm({ ...form, planned_months: Number(e.target.value) })}
          />
        </label>
        <label className="text-sm">
          Bracket system / aligner brand
          <input
            className="input mt-1"
            value={form.bracket_system}
            onChange={(e) => setForm({ ...form, bracket_system: e.target.value })}
            placeholder="e.g. MBT 0.022"
          />
        </label>
        <label className="text-sm md:col-span-2">
          Malocclusion summary
          <input
            className="input mt-1"
            value={form.malocclusion_summary}
            onChange={(e) => setForm({ ...form, malocclusion_summary: e.target.value })}
            placeholder="crowding, overjet, crossbite …"
          />
        </label>
        <button className="btn-primary md:col-span-3" type="submit" disabled={!form.patient_id}>
          Open orthodontic case
        </button>
      </form>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-lg font-bold text-brand-900">
            Ortho cases ({cases.length})
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
          <EmptyState title="No orthodontic cases" hint="Open a case above to begin assessment." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {cases.map((c) => {
              const reviewOverdue = c.next_review_due && c.next_review_due <= today;
              return (
                <div
                  key={c.id}
                  className={`glass-panel rounded-3xl p-4 text-sm ${
                    reviewOverdue ? "border border-red-300" : ""
                  }`}
                >
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
                    {c.angle_class ? `Class ${prettyLabel(c.angle_class)} · ` : ""}
                    {prettyLabel(c.appliance_type)} · {c.arch} arch
                    {c.bracket_system ? ` · ${c.bracket_system}` : ""} · {c.planned_months}m plan
                    {c.started_on
                      ? ` · started ${format(parseISO(c.started_on), "MMM yyyy")}`
                      : ""}
                  </div>
                  {c.next_review_due && (
                    <div
                      className={`mt-1 text-xs font-semibold ${
                        reviewOverdue ? "text-red-700" : "text-brand-700"
                      }`}
                    >
                      Next review {format(parseISO(c.next_review_due), "MMM d, yyyy")}
                      {reviewOverdue ? " · overdue" : ""}
                    </div>
                  )}
                  {c.malocclusion_summary && (
                    <p className="mt-1 text-xs">{c.malocclusion_summary}</p>
                  )}
                  {c.adjustments.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs">
                      {c.adjustments.map((a) => (
                        <li key={a.id} className="rounded-lg bg-brand-50/60 px-2 py-1">
                          {format(parseISO(a.visit_date), "MMM d")}
                          {a.archwire ? ` · ${a.archwire}` : ""}
                          {a.elastics ? ` · elastics ${a.elastics}` : ""}
                          {a.procedures ? ` · ${a.procedures}` : ""} · next in {a.next_visit_weeks}w
                        </li>
                      ))}
                    </ul>
                  )}
                  {adjustFor === c.id ? (
                    <form
                      className="mt-3 grid gap-2 rounded-2xl bg-brand-50/60 p-3 sm:grid-cols-2"
                      onSubmit={(e) => void onAddAdjustment(e, c.id)}
                    >
                      <label className="text-xs">
                        Archwire / aligner stage
                        <input
                          className="input mt-1"
                          value={adj.archwire}
                          onChange={(e) => setAdj({ ...adj, archwire: e.target.value })}
                          placeholder="e.g. 0.016 NiTi or stage 5/22"
                        />
                      </label>
                      <label className="text-xs">
                        Elastics
                        <input
                          className="input mt-1"
                          value={adj.elastics}
                          onChange={(e) => setAdj({ ...adj, elastics: e.target.value })}
                        />
                      </label>
                      <label className="text-xs">
                        Procedures done
                        <input
                          className="input mt-1"
                          value={adj.procedures}
                          onChange={(e) => setAdj({ ...adj, procedures: e.target.value })}
                        />
                      </label>
                      <label className="text-xs">
                        Next visit (weeks)
                        <input
                          className="input mt-1"
                          type="number"
                          min={1}
                          max={26}
                          value={adj.next_visit_weeks}
                          onChange={(e) =>
                            setAdj({ ...adj, next_visit_weeks: Number(e.target.value) })
                          }
                        />
                      </label>
                      <label className="text-xs sm:col-span-2">
                        Notes
                        <input
                          className="input mt-1"
                          value={adj.notes}
                          onChange={(e) => setAdj({ ...adj, notes: e.target.value })}
                        />
                      </label>
                      <div className="flex gap-2 sm:col-span-2">
                        <button className="btn-primary flex-1 text-xs" type="submit">
                          Save adjustment
                        </button>
                        <button
                          className="btn-ghost text-xs"
                          type="button"
                          onClick={() => setAdjustFor(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      className="btn-ghost mt-2 text-xs"
                      type="button"
                      onClick={() => setAdjustFor(c.id)}
                    >
                      + Adjustment visit
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
