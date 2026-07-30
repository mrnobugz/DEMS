import { FormEvent, useEffect, useState } from "react";
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
};

const STATUSES = ["draft", "sent", "in_progress", "received", "fitted", "cancelled"];

export function LabPage() {
  const { home } = useDepartmentHome();
  const [cases, setCases] = useState<LabCase[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [form, setForm] = useState({
    patient_id: "",
    tooth: "",
    shade: "A2",
    case_type: "crown",
    lab_name: "SmileLab Pro",
    status: "sent",
  });
  const [error, setError] = useState("");

  async function load() {
    const [c, p] = await Promise.all([
      api<LabCase[]>("/api/v1/lab/cases"),
      api<{ items: any[] }>("/api/v1/patients?limit=50"),
    ]);
    setCases(c);
    setPatients(p.items);
    if (!form.patient_id && p.items[0]) setForm((f) => ({ ...f, patient_id: p.items[0].id }));
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/api/v1/lab/cases", { method: "POST", body: JSON.stringify(form) });
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

  return (
    <div className="animate-rise space-y-6">
      <div>
        <h2 className="font-display text-3xl font-bold text-brand-900">Lab journey</h2>
        <p className="text-sm text-muted">Sent → In progress → Received → Fitted.</p>
      </div>
      {home && <StatGrid home={home} />}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <form className="glass-panel grid gap-3 rounded-3xl p-5 md:grid-cols-3" onSubmit={onCreate}>
        <label className="text-sm md:col-span-2">
          Patient
          <select
            className="input mt-1"
            value={form.patient_id}
            onChange={(e) => setForm({ ...form, patient_id: e.target.value })}
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
                    <li key={c.id} className="rounded-xl bg-brand-50/60 p-3 text-sm">
                      <div className="font-semibold">
                        {c.case_type} {c.tooth ? `· ${c.tooth}` : ""}
                      </div>
                      <div className="text-xs text-muted">{c.lab_name} · {c.shade}</div>
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
