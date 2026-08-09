import { FormEvent, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { EmptyState } from "@/components/EmptyState";
import { api } from "@/lib/api";
import { StatGrid, useDepartmentHome } from "./FrontClinicalPages";

type LabCase = {
  id: string;
  patient_id: string;
  tooth?: string | null;
  shade?: string | null;
  case_type: string;
  status: string;
  lab_name?: string | null;
  lab_cost: number;
  due_at?: string | null;
  is_overdue?: boolean;
  restoration_id?: string | null;
  restoration_case_id?: string | null;
};

type Restoration = {
  id: string;
  tooth_number: string;
  restoration_type: string;
  status: string;
  case_id?: string | null;
};

const STATUSES = ["draft", "sent", "in_progress", "received", "fitted", "cancelled"];

export function LabPage() {
  const { home } = useDepartmentHome();
  const [cases, setCases] = useState<LabCase[]>([]);
  const [overdue, setOverdue] = useState<LabCase[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [restorations, setRestorations] = useState<Restoration[]>([]);
  const [form, setForm] = useState({
    patient_id: "",
    tooth: "",
    shade: "A2",
    case_type: "crown",
    lab_name: "SmileLab Pro",
    status: "sent",
    due_at: "",
    restoration_id: "",
  });
  const [error, setError] = useState("");

  async function load() {
    const [c, o, p] = await Promise.all([
      api<LabCase[]>("/api/v1/lab/cases"),
      api<LabCase[]>("/api/v1/lab/cases/overdue"),
      api<{ items: any[] }>("/api/v1/patients?limit=50"),
    ]);
    setCases(c);
    setOverdue(o);
    setPatients(p.items);
    const nextPatient = form.patient_id || p.items[0]?.id || "";
    if (!form.patient_id && nextPatient) setForm((f) => ({ ...f, patient_id: nextPatient }));
    if (nextPatient) {
      const restos = await api<Restoration[]>(
        `/api/v1/clinical/patients/${nextPatient}/restorations`,
      ).catch(() => []);
      setRestorations(restos);
    }
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function onPatientChange(patientId: string) {
    setForm((f) => ({ ...f, patient_id: patientId, restoration_id: "" }));
    const restos = await api<Restoration[]>(
      `/api/v1/clinical/patients/${patientId}/restorations`,
    ).catch(() => []);
    setRestorations(restos);
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      const selected = restorations.find((r) => r.id === form.restoration_id);
      await api("/api/v1/lab/cases", {
        method: "POST",
        body: JSON.stringify({
          patient_id: form.patient_id,
          tooth: form.tooth || selected?.tooth_number || null,
          shade: form.shade || null,
          case_type: form.case_type,
          lab_name: form.lab_name || null,
          status: form.status,
          due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
          restoration_id: form.restoration_id || null,
          restoration_case_id: selected?.case_id || null,
        }),
      });
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function setStatus(id: string, status: string) {
    await api(`/api/v1/lab/cases/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    await load();
  }

  const overdueIds = useMemo(() => new Set(overdue.map((c) => c.id)), [overdue]);

  return (
    <div className="animate-rise space-y-6">
      <div>
        <h2 className="font-display text-3xl font-bold text-brand-900">Lab journey</h2>
        <p className="text-sm text-muted">
          Sent → In progress → Received → Fitted · overdue alerts · restoration hard-link
        </p>
      </div>
      {home && <StatGrid home={home} />}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {overdue.length > 0 && (
        <section className="rounded-3xl border border-red-200 bg-red-50/80 p-5">
          <h3 className="font-display text-lg font-bold text-red-800">
            Overdue ({overdue.length})
          </h3>
          <ul className="mt-3 space-y-2 text-sm">
            {overdue.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <strong>
                    {c.case_type} {c.tooth ? `· ${c.tooth}` : ""}
                  </strong>
                  {c.due_at ? ` · due ${format(parseISO(c.due_at), "MMM d")}` : ""}
                  {c.restoration_id ? " · linked restoration" : ""}
                </span>
                <select
                  className="input w-auto text-xs"
                  value={c.status}
                  onChange={(e) => void setStatus(c.id, e.target.value)}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form className="glass-panel grid gap-3 rounded-3xl p-5 md:grid-cols-3" onSubmit={onCreate}>
        <label className="text-sm md:col-span-2">
          Patient
          <select
            className="input mt-1"
            value={form.patient_id}
            onChange={(e) => void onPatientChange(e.target.value)}
            required
          >
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.patient_code} · {p.first_name} {p.last_name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Link restoration
          <select
            className="input mt-1"
            value={form.restoration_id}
            onChange={(e) => {
              const r = restorations.find((x) => x.id === e.target.value);
              setForm({
                ...form,
                restoration_id: e.target.value,
                tooth: r?.tooth_number || form.tooth,
                case_type: r?.restoration_type?.includes("crown") ? "crown" : form.case_type,
              });
            }}
          >
            <option value="">None</option>
            {restorations.map((r) => (
              <option key={r.id} value={r.id}>
                {r.tooth_number} · {r.restoration_type} · {r.status}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Tooth
          <input className="input mt-1" value={form.tooth} onChange={(e) => setForm({ ...form, tooth: e.target.value })} />
        </label>
        <label className="text-sm">
          Shade
          <input className="input mt-1" value={form.shade} onChange={(e) => setForm({ ...form, shade: e.target.value })} />
        </label>
        <label className="text-sm">
          Type
          <input className="input mt-1" value={form.case_type} onChange={(e) => setForm({ ...form, case_type: e.target.value })} />
        </label>
        <label className="text-sm">
          Lab
          <input className="input mt-1" value={form.lab_name} onChange={(e) => setForm({ ...form, lab_name: e.target.value })} />
        </label>
        <label className="text-sm">
          Due
          <input
            className="input mt-1"
            type="datetime-local"
            value={form.due_at}
            onChange={(e) => setForm({ ...form, due_at: e.target.value })}
          />
        </label>
        <button className="btn-primary md:col-span-3" type="submit">
          Create lab case
        </button>
      </form>
      <div className="grid gap-4 lg:grid-cols-3">
        {STATUSES.filter((s) => s !== "cancelled" && s !== "draft").map((status) => {
          const rows = cases.filter((c) => c.status === status);
          return (
            <section key={status} className="glass-panel rounded-3xl p-4">
              <h3 className="font-display text-base font-bold capitalize">{status.replaceAll("_", " ")}</h3>
              {rows.length === 0 ? (
                <p className="mt-3 text-xs text-muted">Empty</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {rows.map((c) => (
                    <li
                      key={c.id}
                      className={`rounded-xl p-3 text-sm ${
                        overdueIds.has(c.id) || c.is_overdue
                          ? "border border-red-300 bg-red-50"
                          : "bg-brand-50/60"
                      }`}
                    >
                      <div className="font-semibold">
                        {c.case_type} {c.tooth ? `· ${c.tooth}` : ""}
                        {(overdueIds.has(c.id) || c.is_overdue) && (
                          <span className="ml-2 text-[10px] font-bold uppercase text-red-700">
                            Overdue
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted">
                        {c.lab_name} · {c.shade}
                        {c.due_at ? ` · due ${format(parseISO(c.due_at), "MMM d HH:mm")}` : ""}
                        {c.restoration_id ? " · restoration linked" : ""}
                      </div>
                      <select
                        className="input mt-2 text-xs"
                        value={c.status}
                        onChange={(e) => setStatus(c.id, e.target.value)}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      {cases.length === 0 && <EmptyState title="No lab cases yet" />}
    </div>
  );
}
