import { FormEvent, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  ClerkshipIntakeFields,
  clerkshipPayload,
  formFromPatient,
  type ClerkshipFormState,
} from "@/components/ClerkshipIntakeFields";
import { ClinicalExamPanel } from "@/components/ClinicalExamPanel";
import { Icd10Picker } from "@/components/Icd10Picker";
import { Odontogram } from "@/components/Odontogram";
import { PerioChart } from "@/components/PerioChart";
import { RestorativePanel } from "@/components/RestorativePanel";
import { EndoPanel } from "@/components/EndoPanel";
import { TreatmentPlanTimeline } from "@/components/TreatmentPlanTimeline";
import { api, ApiError } from "@/lib/api";
import type { ChartEntry, ClinicalNote, Patient, PerioExam, TreatmentPlan } from "@/lib/types";

export function PatientDetailPage() {
  const { id = "" } = useParams();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [chart, setChart] = useState<ChartEntry[]>([]);
  const [notes, setNotes] = useState<ClinicalNote[]>([]);
  const [plans, setPlans] = useState<TreatmentPlan[]>([]);
  const [perioExams, setPerioExams] = useState<PerioExam[]>([]);
  const [selectedTooth, setSelectedTooth] = useState<string | null>(null);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [intakeForm, setIntakeForm] = useState<ClerkshipFormState | null>(null);
  const [note, setNote] = useState({ subjective: "", objective: "", assessment: "", plan: "" });
  const [planForm, setPlanForm] = useState({
    title: "",
    target_start_date: "",
    target_end_date: "",
    approval_notes: "",
  });
  const [planItems, setPlanItems] = useState([
    {
      phase_name: "Phase 1",
      phase_order: 1,
      procedure_name: "",
      procedure_code: "",
      icd10_code: "",
      icd10_description: "",
      tooth_number: "",
      dependency_ref: "",
      description: "",
      estimated_fee: 0,
      insurance_coverage_pct: 0,
      target_date: "",
      status: "proposed",
      notes: "",
    },
  ]);
  const [msg, setMsg] = useState("");

  async function reload() {
    const [p, c, n, t, pe] = await Promise.all([
      api<Patient>(`/api/v1/patients/${id}`),
      api<ChartEntry[]>(`/api/v1/clinical/patients/${id}/chart`),
      api<ClinicalNote[]>(`/api/v1/clinical/patients/${id}/notes`),
      api<TreatmentPlan[]>(`/api/v1/clinical/patients/${id}/treatment-plans`),
      api<PerioExam[]>(`/api/v1/clinical/patients/${id}/perio`),
    ]);
    setPatient(p);
    setIntakeForm(formFromPatient(p));
    setChart(c);
    setNotes(n);
    setPlans(t);
    setPerioExams(pe);
  }

  useEffect(() => {
    if (id) void reload();
  }, [id]);

  async function saveIntake(e: FormEvent) {
    e.preventDefault();
    if (!intakeForm) return;
    try {
      const updated = await api<Patient>(`/api/v1/patients/${id}`, {
        method: "PATCH",
        body: JSON.stringify(clerkshipPayload(intakeForm)),
      });
      setPatient(updated);
      setIntakeForm(formFromPatient(updated));
      setMsg("Clerkship intake saved");
      setIntakeOpen(false);
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : "Intake save failed");
    }
  }

  async function markTooth(mark: {
    tooth: string;
    condition_code: string;
    condition_label: string;
    entry_kind: string;
    surfaces: string;
  }) {
    if (mark.condition_code === "sound") return;
    try {
      await api(`/api/v1/clinical/patients/${id}/chart`, {
        method: "POST",
        body: JSON.stringify({
          tooth_number: mark.tooth,
          condition_code: mark.condition_code,
          condition_label: mark.condition_label,
          entry_kind: mark.entry_kind,
          surfaces: mark.surfaces || null,
        }),
      });
      await reload();
      setMsg(`Charted ${mark.condition_label} on tooth ${mark.tooth}`);
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : "Chart update failed");
    }
  }

  async function saveNote(e: FormEvent) {
    e.preventDefault();
    await api(`/api/v1/clinical/patients/${id}/notes`, {
      method: "POST",
      body: JSON.stringify({ note_type: "soap", ...note, is_finalized: true }),
    });
    setNote({ subjective: "", objective: "", assessment: "", plan: "" });
    await reload();
  }

  function resetPlanForm() {
    setPlanForm({
      title: "",
      target_start_date: "",
      target_end_date: "",
      approval_notes: "",
    });
    setPlanItems([
      {
        phase_name: "Phase 1",
        phase_order: 1,
        procedure_name: "",
        procedure_code: "",
        icd10_code: "",
        icd10_description: "",
        tooth_number: "",
        dependency_ref: "",
        description: "",
        estimated_fee: 0,
        insurance_coverage_pct: 0,
        target_date: "",
        status: "proposed",
        notes: "",
      },
    ]);
  }

  async function saveTreatmentPlan(e: FormEvent) {
    e.preventDefault();
    try {
      await api(`/api/v1/clinical/patients/${id}/treatment-plans`, {
        method: "POST",
        body: JSON.stringify({
          ...planForm,
          target_start_date: planForm.target_start_date || null,
          target_end_date: planForm.target_end_date || null,
          items: planItems.map((item) => ({
            ...item,
            target_date: item.target_date || null,
            estimated_fee: Number(item.estimated_fee) || 0,
            insurance_coverage_pct: Number(item.insurance_coverage_pct) || 0,
            procedure_code: item.procedure_code || null,
            icd10_code: item.icd10_code || null,
            icd10_description: item.icd10_description || null,
            tooth_number: item.tooth_number || null,
            dependency_ref: item.dependency_ref || null,
            description: item.description || null,
            notes: item.notes || null,
          })),
        }),
      });
      resetPlanForm();
      await reload();
      setMsg("Treatment plan created");
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : "Treatment plan save failed");
    }
  }

  async function acceptPlan(plan: TreatmentPlan) {
    try {
      await api(`/api/v1/clinical/treatment-plans/${plan.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "accepted",
          accepted_by_name: `${patient?.first_name ?? ""} ${patient?.last_name ?? ""}`.trim(),
        }),
      });
      await reload();
      setMsg(`Accepted plan: ${plan.title}`);
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : "Plan update failed");
    }
  }

  function planTotals(plan: TreatmentPlan) {
    return plan.items.reduce(
      (acc, item) => {
        acc.total += item.estimated_fee;
        acc.insurance += item.insurance_estimate_amount;
        acc.patient += item.patient_estimate_amount;
        return acc;
      },
      { total: 0, insurance: 0, patient: 0 },
    );
  }

  function money(amount: number) {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  }

  async function chartToCashFromPatient() {
    try {
      const billable = await api<
        Array<{ id: string; unit_price: number; condition_label: string; tooth_number: string }>
      >(`/api/v1/billing/patients/${id}/billable-chart`);
      if (!billable.length) {
        setMsg("No unbilled chart procedures to invoice");
        return;
      }
      const inv = await api<{ invoice_number: string; total: number }>(
        "/api/v1/billing/chart-to-cash",
        {
          method: "POST",
          body: JSON.stringify({
            patient_id: id,
            chart_entry_ids: billable.map((b) => b.id),
            idempotency_key: crypto.randomUUID(),
          }),
        },
      );
      await reload();
      setMsg(`Chart-to-Cash created ${inv.invoice_number} · $${inv.total.toFixed(2)}`);
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : "Chart-to-Cash failed");
    }
  }

  async function draftSoap() {
    const draft = await api<{
      subjective: string;
      objective: string;
      assessment: string;
      plan: string;
    }>("/api/v1/ai/soap-draft", {
      method: "POST",
      body: JSON.stringify({
        chief_complaint: note.subjective || "Dental discomfort",
        findings: note.objective || undefined,
      }),
    });
    setNote({
      subjective: draft.subjective,
      objective: draft.objective,
      assessment: draft.assessment,
      plan: draft.plan,
    });
  }

  if (!patient) return <div className="text-muted">Loading patient…</div>;

  return (
    <div className="space-y-5 animate-rise">
      <div className="glass-panel rounded-3xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs text-brand-600">
              {patient.patient_code}
              {patient.hospital_reg_number ? ` · ${patient.hospital_reg_number}` : ""}
            </p>
            <h2 className="font-display text-3xl font-bold text-brand-900">
              {patient.first_name} {patient.last_name}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {patient.phone || "No phone"} · {patient.email || "No email"}
              {patient.town_city ? ` · ${patient.town_city}` : ""}
              {patient.allergies ? ` · Allergies: ${patient.allergies}` : ""}
            </p>
            {patient.chief_complaint && (
              <p className="mt-2 text-sm text-brand-800">
                <span className="font-semibold">Chief complaint:</span> {patient.chief_complaint}
              </p>
            )}
            {patient.pain_assessment?.severity && (
              <p className="mt-1 text-xs text-muted">
                Pain: {patient.pain_assessment.severity}
                {patient.pain_assessment.quality ? ` · ${patient.pain_assessment.quality}` : ""}
                {patient.pain_assessment.onset ? ` · ${patient.pain_assessment.onset}` : ""}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            {patient.caries_risk_score != null && (
              <div className="rounded-2xl bg-brand-50 px-4 py-3 text-right">
                <div className="ai-badge mb-1">Risk score</div>
                <div className="font-display text-2xl font-bold text-brand-700">
                  {(patient.caries_risk_score * 100).toFixed(0)}%
                </div>
              </div>
            )}
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={() => setIntakeOpen((v) => !v)}
            >
              {intakeOpen ? "Hide intake" : "Edit clerkship intake"}
            </button>
            <button
              type="button"
              className="btn-primary text-xs"
              onClick={() => void chartToCashFromPatient()}
            >
              Chart-to-Cash invoice
            </button>
          </div>
        </div>
      </div>

      {intakeOpen && intakeForm && (
        <form className="glass-panel space-y-4 rounded-3xl p-5" onSubmit={saveIntake}>
          <div>
            <h3 className="font-display text-lg font-bold">Digital Clerkship intake</h3>
            <p className="text-sm text-muted">Demographics, medical history, pain & symptoms</p>
          </div>
          <ClerkshipIntakeFields form={intakeForm} onChange={setIntakeForm} mode="edit" />
          <button className="btn-primary">Save intake</button>
        </form>
      )}

      {msg && <div className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-800">{msg}</div>}

      <ClinicalExamPanel
        patientId={id}
        chiefComplaint={patient.chief_complaint}
        onMessage={setMsg}
      />

      <Odontogram
        entries={chart}
        selected={selectedTooth}
        onSelect={setSelectedTooth}
        onMark={markTooth}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <RestorativePanel patientId={id} selectedTooth={selectedTooth} />
        <EndoPanel patientId={id} selectedTooth={selectedTooth} />
      </div>

      <PerioChart
        patientId={id}
        selectedTooth={selectedTooth}
        exams={perioExams}
        onSaved={reload}
        onMessage={setMsg}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <form className="glass-panel space-y-3 rounded-3xl p-5" onSubmit={saveNote}>
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold">SOAP clinical note</h3>
            <button type="button" className="btn-ghost text-xs" onClick={() => void draftSoap()}>
              AI draft
            </button>
          </div>
          {(["subjective", "objective", "assessment", "plan"] as const).map((field) => (
            <div key={field}>
              <label className="label capitalize">{field}</label>
              <textarea
                className="input min-h-16"
                value={note[field]}
                onChange={(e) => setNote({ ...note, [field]: e.target.value })}
              />
            </div>
          ))}
          <button className="btn-primary">Save note</button>
        </form>

        <div className="glass-panel rounded-3xl p-5">
          <h3 className="font-display text-lg font-bold">Recent notes & chart history</h3>
          <div className="mt-3 space-y-3">
            {notes.map((n) => (
              <div key={n.id} className="rounded-2xl border border-brand-100 bg-white/70 p-3 text-sm">
                {n.ai_draft && <span className="ai-badge mb-2">AI draft</span>}
                <p>
                  <strong>S:</strong> {n.subjective}
                </p>
                <p>
                  <strong>A:</strong> {n.assessment}
                </p>
              </div>
            ))}
            {chart.slice(-6).reverse().map((c) => (
              <div key={c.id} className="text-sm text-muted">
                Tooth {c.tooth_number}
                {c.surfaces ? ` (${c.surfaces})` : ""} — {c.condition_label} · {c.entry_kind}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <form className="glass-panel space-y-4 rounded-3xl p-5" onSubmit={saveTreatmentPlan}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-lg font-bold">Treatment planning</h3>
              <p className="text-sm text-muted">
                Sequence phases, estimate coverage, and prepare patient acceptance.
              </p>
            </div>
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={() =>
                setPlanItems((current) => [
                  ...current,
                  {
                    phase_name: `Phase ${current.length + 1}`,
                    phase_order: current.length + 1,
                    procedure_name: "",
                    procedure_code: "",
                    icd10_code: "",
                    icd10_description: "",
                    tooth_number: "",
                    dependency_ref: "",
                    description: "",
                    estimated_fee: 0,
                    insurance_coverage_pct: 0,
                    target_date: "",
                    status: "proposed",
                    notes: "",
                  },
                ])
              }
            >
              Add procedure
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="label">Plan title</label>
              <input
                className="input"
                value={planForm.title}
                onChange={(e) => setPlanForm({ ...planForm, title: e.target.value })}
                placeholder="Full-mouth restorative sequence"
                required
              />
            </div>
            <div>
              <label className="label">Approval notes</label>
              <input
                className="input"
                value={planForm.approval_notes}
                onChange={(e) => setPlanForm({ ...planForm, approval_notes: e.target.value })}
                placeholder="Discuss timeline and financing"
              />
            </div>
            <div>
              <label className="label">Target start</label>
              <input
                type="date"
                className="input"
                value={planForm.target_start_date}
                onChange={(e) => setPlanForm({ ...planForm, target_start_date: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Target end</label>
              <input
                type="date"
                className="input"
                value={planForm.target_end_date}
                onChange={(e) => setPlanForm({ ...planForm, target_end_date: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-3">
            {planItems.map((item, index) => (
              <div key={index} className="rounded-2xl border border-brand-100 bg-white/70 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="font-semibold text-ink">Procedure {index + 1}</h4>
                  {planItems.length > 1 && (
                    <button
                      type="button"
                      className="text-xs font-semibold text-rose-600"
                      onClick={() => setPlanItems((current) => current.filter((_, i) => i !== index))}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    className="input"
                    value={item.phase_name}
                    onChange={(e) =>
                      setPlanItems((current) =>
                        current.map((entry, i) =>
                          i === index ? { ...entry, phase_name: e.target.value } : entry,
                        ),
                      )
                    }
                    placeholder="Phase 1"
                    required
                  />
                  <input
                    type="number"
                    min={1}
                    className="input"
                    value={item.phase_order}
                    onChange={(e) =>
                      setPlanItems((current) =>
                        current.map((entry, i) =>
                          i === index ? { ...entry, phase_order: Number(e.target.value) || 1 } : entry,
                        ),
                      )
                    }
                    placeholder="Phase order"
                  />
                  <input
                    className="input"
                    value={item.procedure_name}
                    onChange={(e) =>
                      setPlanItems((current) =>
                        current.map((entry, i) =>
                          i === index ? { ...entry, procedure_name: e.target.value } : entry,
                        ),
                      )
                    }
                    placeholder="Procedure name"
                    required
                  />
                  <input
                    className="input"
                    value={item.tooth_number}
                    onChange={(e) =>
                      setPlanItems((current) =>
                        current.map((entry, i) =>
                          i === index ? { ...entry, tooth_number: e.target.value } : entry,
                        ),
                      )
                    }
                    placeholder="Tooth"
                  />
                  <input
                    className="input"
                    value={item.procedure_code}
                    onChange={(e) =>
                      setPlanItems((current) =>
                        current.map((entry, i) =>
                          i === index ? { ...entry, procedure_code: e.target.value } : entry,
                        ),
                      )
                    }
                    placeholder="Procedure code (CDT)"
                  />
                  <div className="md:col-span-2">
                    <Icd10Picker
                      label="Diagnosis ICD-10 (K00–K14)"
                      multiple={false}
                      selected={
                        item.icd10_code
                          ? [{ code: item.icd10_code, description: item.icd10_description || "" }]
                          : []
                      }
                      onChange={(codes) =>
                        setPlanItems((current) =>
                          current.map((entry, i) =>
                            i === index
                              ? {
                                  ...entry,
                                  icd10_code: codes[0]?.code || "",
                                  icd10_description: codes[0]?.description || "",
                                }
                              : entry,
                          ),
                        )
                      }
                    />
                  </div>
                  <input
                    className="input"
                    value={item.dependency_ref}
                    onChange={(e) =>
                      setPlanItems((current) =>
                        current.map((entry, i) =>
                          i === index ? { ...entry, dependency_ref: e.target.value } : entry,
                        ),
                      )
                    }
                    placeholder="Depends on"
                  />
                  <input
                    type="number"
                    min={0}
                    className="input"
                    value={item.estimated_fee}
                    onChange={(e) =>
                      setPlanItems((current) =>
                        current.map((entry, i) =>
                          i === index ? { ...entry, estimated_fee: Number(e.target.value) || 0 } : entry,
                        ),
                      )
                    }
                    placeholder="Estimated fee"
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="input"
                    value={item.insurance_coverage_pct}
                    onChange={(e) =>
                      setPlanItems((current) =>
                        current.map((entry, i) =>
                          i === index
                            ? { ...entry, insurance_coverage_pct: Number(e.target.value) || 0 }
                            : entry,
                        ),
                      )
                    }
                    placeholder="Insurance %"
                  />
                  <input
                    type="date"
                    className="input"
                    value={item.target_date}
                    onChange={(e) =>
                      setPlanItems((current) =>
                        current.map((entry, i) =>
                          i === index ? { ...entry, target_date: e.target.value } : entry,
                        ),
                      )
                    }
                  />
                  <input
                    className="input"
                    value={item.status}
                    onChange={(e) =>
                      setPlanItems((current) =>
                        current.map((entry, i) =>
                          i === index ? { ...entry, status: e.target.value } : entry,
                        ),
                      )
                    }
                    placeholder="Status"
                  />
                </div>
                <textarea
                  className="input mt-3 min-h-16"
                  value={item.description}
                  onChange={(e) =>
                    setPlanItems((current) =>
                      current.map((entry, i) =>
                        i === index ? { ...entry, description: e.target.value } : entry,
                      ),
                    )
                  }
                  placeholder="Clinical rationale or sequencing detail"
                />
              </div>
            ))}
          </div>

          <button className="btn-primary">Save treatment plan</button>
        </form>

        <TreatmentPlanTimeline plans={plans} />

        <div className="glass-panel rounded-3xl p-5">
          <h3 className="font-display text-lg font-bold">Plan tracker</h3>
          <div className="mt-3 space-y-4">
            {plans.map((plan) => {
              const totals = planTotals(plan);
              return (
                <div key={plan.id} className="rounded-2xl border border-brand-100 bg-white/70 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="ai-badge mb-2">{plan.status}</div>
                      <h4 className="font-semibold text-ink">{plan.title}</h4>
                      <p className="text-sm text-muted">
                        Patient est. {money(totals.patient)} · Insurance est. {money(totals.insurance)}
                      </p>
                    </div>
                    {plan.status !== "accepted" && (
                      <button className="btn-ghost text-xs" onClick={() => void acceptPlan(plan)}>
                        Mark accepted
                      </button>
                    )}
                  </div>
                  <div className="mt-3 space-y-3">
                    {Object.entries(
                      plan.items.reduce<Record<string, typeof plan.items>>((acc, item) => {
                        const key = `${item.phase_order}. ${item.phase_name}`;
                        acc[key] ??= [];
                        acc[key].push(item);
                        return acc;
                      }, {}),
                    ).map(([phase, items]) => (
                      <div key={phase}>
                        <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
                          {phase}
                        </p>
                        <div className="mt-1 space-y-2">
                          {items.map((item) => (
                            <div key={item.id} className="rounded-xl bg-brand-50/70 p-3 text-sm">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="font-semibold text-ink">
                                  {item.procedure_name}
                                  {item.tooth_number ? ` · Tooth ${item.tooth_number}` : ""}
                                </div>
                                <div className="text-brand-800">{money(item.estimated_fee)}</div>
                              </div>
                              <p className="mt-1 text-muted">
                                Patient {money(item.patient_estimate_amount)}
                                {item.insurance_coverage_pct
                                  ? ` · Insurance ${item.insurance_coverage_pct}%`
                                  : ""}
                                {item.dependency_ref ? ` · Depends on ${item.dependency_ref}` : ""}
                              </p>
                              {item.icd10_code && (
                                <p className="mt-1 font-mono text-xs text-brand-700">
                                  ICD-10 {item.icd10_code}
                                  {item.icd10_description ? ` — ${item.icd10_description}` : ""}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {!plans.length && (
              <div className="rounded-2xl border border-dashed border-brand-200 p-4 text-sm text-muted">
                No treatment plans yet. Start with a phased restorative or periodontal plan.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
