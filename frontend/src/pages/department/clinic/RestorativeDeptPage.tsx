import { FormEvent, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { EmptyState } from "@/components/EmptyState";
import { ArchChart } from "@/components/viz/ArchChart";
import { Mouth3DLazy } from "@/components/viz/Mouth3DLazy";
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

type Restoration = {
  id: string;
  tooth_number: string;
  surfaces: string;
  restoration_type: string;
  material?: string | null;
  status: string;
};

type RestorationCase = {
  id: string;
  patient_id: string;
  patient_name?: string | null;
  primary_tooth: string;
  case_type: string;
  status: string;
  warranty_months: number;
  recall_due_at?: string | null;
  restorations: Restoration[];
  created_at: string;
};

type EndoCase = {
  id: string;
  patient_id: string;
  patient_name?: string | null;
  tooth_number: string;
  procedure_type: string;
  canal_count?: number | null;
  status: string;
  created_at: string;
};

const CASE_STATUSES = ["planned", "in_progress", "completed", "failed"];

export function RestorativeDeptPage() {
  const overview = useDepartmentOverview();
  const patients = usePatientOptions();
  const prefill = useQueryPrefill();
  const [cases, setCases] = useState<RestorationCase[]>([]);
  const [endoCases, setEndoCases] = useState<EndoCase[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    patient_id: "",
    primary_tooth: "",
    case_type: "restorative",
    warranty_months: 12,
    notes: "",
  });

  useEffect(() => {
    if (!prefill.patientId && !prefill.tooth) return;
    setForm((f) => ({
      ...f,
      patient_id: prefill.patientId || f.patient_id,
      primary_tooth: prefill.tooth || f.primary_tooth,
    }));
  }, [prefill.patientId, prefill.tooth]);

  async function load() {
    const qs = statusFilter ? `?status=${statusFilter}` : "";
    const [c, e] = await Promise.all([
      api<RestorationCase[]>(`/api/v1/specialty/restorative/cases${qs}`),
      api<EndoCase[]>("/api/v1/specialty/restorative/endo-cases"),
    ]);
    setCases(c);
    setEndoCases(e);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [statusFilter]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api(`/api/v1/clinical/patients/${form.patient_id}/restoration-cases`, {
        method: "POST",
        body: JSON.stringify({
          primary_tooth: form.primary_tooth,
          case_type: form.case_type,
          warranty_months: Number(form.warranty_months),
          notes: form.notes || null,
        }),
      });
      setForm((f) => ({ ...f, primary_tooth: "", notes: "" }));
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  const toothColors = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    // endo first so restorative case status wins when both exist on a tooth
    for (const e of endoCases) map[e.tooth_number] = TOOTH_STATUS_COLORS.rct;
    for (const c of cases) map[c.primary_tooth] = TOOTH_STATUS_COLORS[c.status];
    return map;
  }, [cases, endoCases]);

  const toothBadges = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    for (const c of cases) {
      const surfaces = c.restorations.map((r) => r.surfaces).filter(Boolean).join(" ");
      if (surfaces) map[c.primary_tooth] = surfaces;
    }
    return map;
  }, [cases]);

  return (
    <div className="animate-rise space-y-6">
      <DeptHeader
        title="Restorative department"
        subtitle="Surface-true restorations · multi-visit cases · endodontics · warranty recalls"
      />
      {overview && (
        <StatCards
          cards={[
            { label: "Open cases", value: overview.restorative_open_cases },
            { label: "Planned restorations", value: overview.restorative_planned },
            {
              label: "Endo in progress",
              value: overview.endo_in_progress,
              alert: overview.endo_in_progress > 0,
            },
          ]}
        />
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="glass-panel grid gap-4 rounded-3xl p-5 lg:grid-cols-2">
        <div>
          <h3 className="font-display text-base font-bold text-brand-900">Department tooth map — 2D</h3>
          <p className="mb-2 text-xs text-muted">
            Colored by case status · badges show charted surfaces · click a tooth to start a case
          </p>
          <ArchChart
            colors={toothColors}
            badges={toothBadges}
            selected={form.primary_tooth || null}
            onSelect={(fdi) => setForm((f) => ({ ...f, primary_tooth: fdi }))}
          />
        </div>
        <div>
          <h3 className="font-display text-base font-bold text-brand-900">3D model</h3>
          <p className="mb-2 text-xs text-muted">
            Rotate/zoom · same status colors · tap a tooth to select it for the case form
          </p>
          <Mouth3DLazy
            title="Restorative 3D tooth map"
            colors={toothColors}
            selected={form.primary_tooth || null}
            onSelect={(fdi) => setForm((f) => ({ ...f, primary_tooth: fdi }))}
          />
        </div>
        <div className="flex flex-wrap gap-3 text-[11px] font-semibold text-muted lg:col-span-2">
          {(["planned", "in_progress", "completed", "failed"] as const).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5 capitalize">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full border border-black/10"
                style={{ background: TOOTH_STATUS_COLORS[s] }}
              />
              {prettyLabel(s)}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full border border-black/10"
              style={{ background: TOOTH_STATUS_COLORS.rct }}
            />
            Endo (RCT)
          </span>
        </div>
      </section>

      <form className="glass-panel grid gap-3 rounded-3xl p-5 md:grid-cols-4" onSubmit={onCreate}>
        <div className="md:col-span-2">
          <PatientSelect
            patients={patients}
            value={form.patient_id}
            onChange={(id) => setForm({ ...form, patient_id: id })}
          />
        </div>
        <label className="text-sm">
          Primary tooth (FDI)
          <input
            className="input mt-1"
            value={form.primary_tooth}
            onChange={(e) => setForm({ ...form, primary_tooth: e.target.value })}
            placeholder="pick on the chart or type, e.g. 36"
            required
          />
        </label>
        <label className="text-sm">
          Case type
          <select
            className="input mt-1"
            value={form.case_type}
            onChange={(e) => setForm({ ...form, case_type: e.target.value })}
          >
            {["restorative", "crown", "bridge", "veneer", "onlay"].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Warranty (months)
          <input
            className="input mt-1"
            type="number"
            min={0}
            max={60}
            value={form.warranty_months}
            onChange={(e) => setForm({ ...form, warranty_months: Number(e.target.value) })}
          />
        </label>
        <label className="text-sm md:col-span-2">
          Notes
          <input
            className="input mt-1"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </label>
        <button className="btn-primary md:col-span-4" type="submit" disabled={!form.patient_id}>
          Open restorative case
        </button>
      </form>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-lg font-bold text-brand-900">
            Restoration cases ({cases.length})
          </h3>
          <select
            className="input w-auto text-xs"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            {CASE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {prettyLabel(s)}
              </option>
            ))}
          </select>
        </div>
        {cases.length === 0 ? (
          <EmptyState title="No restoration cases" hint="Open a case above to start tracking." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {cases.map((c) => (
              <div key={c.id} className="glass-panel rounded-3xl p-4 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <PatientChip id={c.patient_id} name={c.patient_name} />
                  <span className="status-pill status-pill--info capitalize">
                    {prettyLabel(c.status)}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted">
                  Tooth {c.primary_tooth} · {c.case_type} · warranty {c.warranty_months}m
                  {c.recall_due_at
                    ? ` · recall ${format(parseISO(c.recall_due_at), "MMM d, yyyy")}`
                    : ""}
                </div>
                {c.restorations.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs">
                    {c.restorations.map((r) => (
                      <li key={r.id} className="rounded-lg bg-brand-50/60 px-2 py-1">
                        {r.tooth_number} {r.surfaces && `· ${r.surfaces}`} · {r.restoration_type}
                        {r.material ? ` · ${r.material}` : ""} ·{" "}
                        <span className="capitalize">{prettyLabel(r.status)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-lg font-bold text-brand-900">
          Endodontic cases ({endoCases.length})
        </h3>
        {endoCases.length === 0 ? (
          <EmptyState
            title="No endo cases"
            hint="Endodontic cases are opened from the patient chart."
          />
        ) : (
          <div className="glass-panel overflow-x-auto rounded-3xl p-2">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted">
                <tr>
                  <th className="p-2">Patient</th>
                  <th className="p-2">Tooth</th>
                  <th className="p-2">Procedure</th>
                  <th className="p-2">Canals</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Opened</th>
                </tr>
              </thead>
              <tbody>
                {endoCases.map((e) => (
                  <tr key={e.id} className="border-t border-brand-100/60">
                    <td className="p-2">
                      <PatientChip id={e.patient_id} name={e.patient_name} />
                    </td>
                    <td className="p-2">{e.tooth_number}</td>
                    <td className="p-2 uppercase">{e.procedure_type}</td>
                    <td className="p-2">{e.canal_count ?? "—"}</td>
                    <td className="p-2 capitalize">{prettyLabel(e.status)}</td>
                    <td className="p-2 text-xs text-muted">
                      {format(parseISO(e.created_at), "MMM d, yyyy")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
