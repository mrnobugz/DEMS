import { FormEvent, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { EmptyState } from "@/components/EmptyState";
import { Clinical3DImaging } from "@/components/viz/Clinical3DImaging";
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

type Treatment = {
  id: string;
  treatment_type: string;
  tooth?: string | null;
  performed_on: string;
  notes?: string | null;
};

type PaediatricProfile = {
  id: string;
  patient_id: string;
  patient_name?: string | null;
  patient_age?: number | null;
  guardian_name?: string | null;
  guardian_phone?: string | null;
  guardian_relation?: string | null;
  behaviour_rating?: number | null;
  dentition_stage: string;
  caries_risk: string;
  oral_habits?: string | null;
  medical_alerts?: string | null;
  fluoride_last?: string | null;
  fluoride_next?: string | null;
  treatments: Treatment[];
};

const FRANKL = ["1 — definitely negative", "2 — negative", "3 — positive", "4 — definitely positive"];
const TREATMENTS = [
  "fluoride_varnish",
  "fissure_sealant",
  "pulpotomy",
  "pulpectomy",
  "stainless_steel_crown",
  "restoration",
  "extraction",
  "space_maintainer",
  "other",
];

export function PaediatricPage() {
  const overview = useDepartmentOverview();
  const patients = usePatientOptions();
  const prefill = useQueryPrefill();
  const [profiles, setProfiles] = useState<PaediatricProfile[]>([]);
  const [riskFilter, setRiskFilter] = useState("");
  const [error, setError] = useState("");
  const [treatFor, setTreatFor] = useState<string | null>(null);
  const [form, setForm] = useState({
    patient_id: "",
    guardian_name: "",
    guardian_phone: "",
    guardian_relation: "parent",
    behaviour_rating: "",
    dentition_stage: "primary",
    caries_risk: "moderate",
    oral_habits: "",
    medical_alerts: "",
  });
  const [tx, setTx] = useState({ treatment_type: "fluoride_varnish", tooth: "", notes: "" });

  useEffect(() => {
    if (!prefill.patientId && !prefill.tooth) return;
    setForm((f) => ({ ...f, patient_id: prefill.patientId || f.patient_id }));
    if (prefill.tooth) setTx((t) => ({ ...t, tooth: prefill.tooth }));
    if (prefill.patientId) setTreatFor(prefill.patientId);
  }, [prefill.patientId, prefill.tooth]);

  async function load() {
    const qs = riskFilter ? `?caries_risk=${riskFilter}` : "";
    setProfiles(await api<PaediatricProfile[]>(`/api/v1/specialty/paediatric/profiles${qs}`));
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [riskFilter]);

  async function onUpsert(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api(`/api/v1/specialty/paediatric/patients/${form.patient_id}/profile`, {
        method: "PUT",
        body: JSON.stringify({
          guardian_name: form.guardian_name || null,
          guardian_phone: form.guardian_phone || null,
          guardian_relation: form.guardian_relation || null,
          behaviour_rating: form.behaviour_rating ? Number(form.behaviour_rating) : null,
          dentition_stage: form.dentition_stage,
          caries_risk: form.caries_risk,
          oral_habits: form.oral_habits || null,
          medical_alerts: form.medical_alerts || null,
        }),
      });
      setForm((f) => ({ ...f, guardian_name: "", guardian_phone: "", oral_habits: "", medical_alerts: "" }));
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function onAddTreatment(e: FormEvent, patientId: string) {
    e.preventDefault();
    setError("");
    try {
      await api(`/api/v1/specialty/paediatric/patients/${patientId}/treatments`, {
        method: "POST",
        body: JSON.stringify({
          treatment_type: tx.treatment_type,
          tooth: tx.tooth || null,
          notes: tx.notes || null,
        }),
      });
      setTx({ treatment_type: "fluoride_varnish", tooth: "", notes: "" });
      setTreatFor(null);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  // Department-wide primary dentition map colored by recorded treatments
  const treatmentColors = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    for (const p of profiles) {
      for (const tr of p.treatments) {
        if (tr.tooth) map[tr.tooth] = TOOTH_STATUS_COLORS[tr.treatment_type] ?? "#3b82f6";
      }
    }
    return map;
  }, [profiles]);

  const legendTypes = ["fluoride_varnish", "fissure_sealant", "stainless_steel_crown", "pulpotomy", "extraction"];

  return (
    <div className="animate-rise space-y-6">
      <DeptHeader
        title="Paediatric department"
        subtitle="Frankl behaviour · caries risk · fluoride recalls · primary & mixed dentition care"
      />
      {overview && (
        <StatCards
          cards={[
            { label: "Paediatric profiles", value: overview.paediatric_profiles },
            {
              label: "Fluoride recalls due",
              value: overview.paediatric_fluoride_due,
              alert: overview.paediatric_fluoride_due > 0,
            },
            { label: "Ortho active", value: overview.ortho_active },
          ]}
        />
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <Clinical3DImaging
        mode="paediatric"
        dentition={form.dentition_stage === "permanent" ? "permanent" : "primary"}
        patientId={form.patient_id || treatFor || undefined}
        selected={tx.tooth || null}
        onSelect={(fdi) => setTx((t) => ({ ...t, tooth: fdi }))}
        colors={treatmentColors}
        missing={profiles.flatMap((p) =>
          p.treatments.filter((tr) => tr.treatment_type === "extraction" && tr.tooth).map((tr) => tr.tooth as string),
        )}
        endo={profiles.flatMap((p) =>
          p.treatments
            .filter((tr) => (tr.treatment_type === "pulpotomy" || tr.treatment_type === "pulpectomy") && tr.tooth)
            .map((tr) => tr.tooth as string),
        )}
        onAction={(actionId, tooth) => {
          setTx((t) => ({
            ...t,
            tooth,
            treatment_type:
              actionId === "fluoride"
                ? "fluoride_varnish"
                : actionId === "sealant"
                  ? "fissure_sealant"
                  : actionId === "ssc"
                    ? "stainless_steel_crown"
                    : t.treatment_type,
          }));
          const pid = form.patient_id || treatFor;
          if (pid && profiles.some((p) => p.patient_id === pid)) {
            if (actionId !== "profile") setTreatFor(pid);
          }
        }}
      />
      <div className="flex flex-wrap gap-3 px-1 text-[11px] font-semibold text-muted">
        {legendTypes.map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5 capitalize">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full border border-black/10"
              style={{ background: TOOTH_STATUS_COLORS[t] }}
            />
            {prettyLabel(t)}
          </span>
        ))}
      </div>

      <form className="glass-panel grid gap-3 rounded-3xl p-5 md:grid-cols-3" onSubmit={onUpsert}>
        <div className="md:col-span-2">
          <PatientSelect
            patients={patients}
            value={form.patient_id}
            onChange={(id) => setForm({ ...form, patient_id: id })}
            label="Child patient"
          />
        </div>
        <label className="text-sm">
          Behaviour (Frankl)
          <select
            className="input mt-1"
            value={form.behaviour_rating}
            onChange={(e) => setForm({ ...form, behaviour_rating: e.target.value })}
          >
            <option value="">—</option>
            {FRANKL.map((f, i) => (
              <option key={f} value={i + 1}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Dentition stage
          <select
            className="input mt-1"
            value={form.dentition_stage}
            onChange={(e) => setForm({ ...form, dentition_stage: e.target.value })}
          >
            {["primary", "mixed", "permanent"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Caries risk
          <select
            className="input mt-1"
            value={form.caries_risk}
            onChange={(e) => setForm({ ...form, caries_risk: e.target.value })}
          >
            {["low", "moderate", "high"].map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Guardian
          <input
            className="input mt-1"
            value={form.guardian_name}
            onChange={(e) => setForm({ ...form, guardian_name: e.target.value })}
          />
        </label>
        <label className="text-sm">
          Guardian phone
          <input
            className="input mt-1"
            value={form.guardian_phone}
            onChange={(e) => setForm({ ...form, guardian_phone: e.target.value })}
          />
        </label>
        <label className="text-sm">
          Relation
          <select
            className="input mt-1"
            value={form.guardian_relation}
            onChange={(e) => setForm({ ...form, guardian_relation: e.target.value })}
          >
            {["parent", "grandparent", "sibling", "guardian", "other"].map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Oral habits
          <input
            className="input mt-1"
            value={form.oral_habits}
            onChange={(e) => setForm({ ...form, oral_habits: e.target.value })}
            placeholder="thumb sucking, bruxism …"
          />
        </label>
        <label className="text-sm md:col-span-2">
          Medical alerts
          <input
            className="input mt-1"
            value={form.medical_alerts}
            onChange={(e) => setForm({ ...form, medical_alerts: e.target.value })}
            placeholder="allergies, asthma, cardiac …"
          />
        </label>
        <button className="btn-primary md:col-span-3" type="submit" disabled={!form.patient_id}>
          Save paediatric profile
        </button>
      </form>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-lg font-bold text-brand-900">
            Profiles ({profiles.length})
          </h3>
          <select
            className="input w-auto text-xs"
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
          >
            <option value="">All caries risk</option>
            {["low", "moderate", "high"].map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        {profiles.length === 0 ? (
          <EmptyState
            title="No paediatric profiles"
            hint="Save a profile above to start preventive tracking."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {profiles.map((p) => {
              const fluorideDue = p.fluoride_next && p.fluoride_next <= today;
              return (
                <div
                  key={p.id}
                  className={`glass-panel rounded-3xl p-4 text-sm ${
                    fluorideDue ? "border border-red-300" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      <PatientChip id={p.patient_id} name={p.patient_name} />
                      {p.patient_age != null && (
                        <span className="ml-2 text-xs text-muted">{p.patient_age} yrs</span>
                      )}
                    </span>
                    <span
                      className={`status-pill capitalize ${
                        p.caries_risk === "high"
                          ? "status-pill--danger"
                          : p.caries_risk === "moderate"
                            ? "status-pill--warning"
                            : "status-pill--info"
                      }`}
                    >
                      {p.caries_risk} risk
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {p.dentition_stage} dentition
                    {p.behaviour_rating ? ` · Frankl ${p.behaviour_rating}/4` : ""}
                    {p.guardian_name
                      ? ` · ${p.guardian_name} (${p.guardian_relation || "guardian"})`
                      : ""}
                    {p.guardian_phone ? ` · ${p.guardian_phone}` : ""}
                  </div>
                  {p.medical_alerts && (
                    <p className="mt-1 text-xs font-semibold text-red-700">⚠ {p.medical_alerts}</p>
                  )}
                  {p.oral_habits && <p className="mt-1 text-xs">Habits: {p.oral_habits}</p>}
                  {(p.fluoride_last || p.fluoride_next) && (
                    <div
                      className={`mt-1 text-xs font-semibold ${
                        fluorideDue ? "text-red-700" : "text-brand-700"
                      }`}
                    >
                      Fluoride
                      {p.fluoride_last
                        ? ` last ${format(parseISO(p.fluoride_last), "MMM d, yyyy")}`
                        : ""}
                      {p.fluoride_next
                        ? ` · next ${format(parseISO(p.fluoride_next), "MMM d, yyyy")}`
                        : ""}
                      {fluorideDue ? " · due now" : ""}
                    </div>
                  )}
                  {p.treatments.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs">
                      {p.treatments.map((tr) => (
                        <li key={tr.id} className="rounded-lg bg-brand-50/60 px-2 py-1">
                          {format(parseISO(tr.performed_on), "MMM d")} ·{" "}
                          {prettyLabel(tr.treatment_type)}
                          {tr.tooth ? ` · tooth ${tr.tooth}` : ""}
                          {tr.notes ? ` · ${tr.notes}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                  {treatFor === p.patient_id ? (
                    <form
                      className="mt-3 grid gap-2 rounded-2xl bg-brand-50/60 p-3 sm:grid-cols-2"
                      onSubmit={(e) => void onAddTreatment(e, p.patient_id)}
                    >
                      <div className="sm:col-span-2">
                        <p className="text-[10px] font-semibold uppercase text-muted">
                          Treated tooth — pick on the 3D workspace above
                        </p>
                        <p className="mt-1 text-sm font-semibold text-brand-900">
                          {tx.tooth ? `Primary tooth ${tx.tooth}` : "No tooth selected yet"}
                        </p>
                      </div>
                      <label className="text-xs">
                        Treatment
                        <select
                          className="input mt-1"
                          value={tx.treatment_type}
                          onChange={(e) => setTx({ ...tx, treatment_type: e.target.value })}
                        >
                          {TREATMENTS.map((t) => (
                            <option key={t} value={t}>
                              {prettyLabel(t)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs">
                        Tooth
                        <input
                          className="input mt-1"
                          value={tx.tooth}
                          onChange={(e) => setTx({ ...tx, tooth: e.target.value })}
                          placeholder="e.g. 55"
                        />
                      </label>
                      <label className="text-xs sm:col-span-2">
                        Notes
                        <input
                          className="input mt-1"
                          value={tx.notes}
                          onChange={(e) => setTx({ ...tx, notes: e.target.value })}
                        />
                      </label>
                      <div className="flex gap-2 sm:col-span-2">
                        <button className="btn-primary flex-1 text-xs" type="submit">
                          Record treatment
                        </button>
                        <button
                          className="btn-ghost text-xs"
                          type="button"
                          onClick={() => setTreatFor(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      className="btn-ghost mt-2 text-xs"
                      type="button"
                      onClick={() => setTreatFor(p.patient_id)}
                    >
                      + Preventive treatment
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
