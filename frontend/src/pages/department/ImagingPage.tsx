import { FormEvent, useEffect, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { api } from "@/lib/api";
import { StatGrid, useDepartmentHome } from "./FrontClinicalPages";

type Study = {
  id: string;
  patient_id: string;
  study_type: string;
  tooth?: string | null;
  storage_key?: string | null;
  notes?: string | null;
  captured_at: string;
};

type Patient = { id: string; first_name: string; last_name: string; patient_code: string };

export function ImagingPage() {
  const { home } = useDepartmentHome();
  const [studies, setStudies] = useState<Study[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [form, setForm] = useState({ patient_id: "", study_type: "PA", tooth: "", notes: "" });
  const [error, setError] = useState("");

  async function load() {
    const [s, p] = await Promise.all([
      api<Study[]>("/api/v1/imaging/studies"),
      api<{ items: Patient[] }>("/api/v1/patients?limit=50"),
    ]);
    setStudies(s);
    setPatients(p.items);
    if (!form.patient_id && p.items[0]) setForm((f) => ({ ...f, patient_id: p.items[0].id }));
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/api/v1/imaging/studies", {
        method: "POST",
        body: JSON.stringify({
          patient_id: form.patient_id,
          study_type: form.study_type,
          tooth: form.tooth || null,
          notes: form.notes || null,
        }),
      });
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="animate-rise space-y-6">
      <div>
        <h2 className="font-display text-3xl font-bold text-brand-900">Imaging suite</h2>
        <p className="text-sm text-muted">Study metadata registry (PACS-lite stub storage keys).</p>
      </div>
      {home && <StatGrid home={home} />}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <form className="glass-panel grid gap-3 rounded-3xl p-5 md:grid-cols-2" onSubmit={onCreate}>
        <label className="text-sm">
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
          Study type
          <select
            className="input mt-1"
            value={form.study_type}
            onChange={(e) => setForm({ ...form, study_type: e.target.value })}
          >
            {["PA", "BW", "OPG", "CBCT", "photo"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Tooth
          <input className="input mt-1" value={form.tooth} onChange={(e) => setForm({ ...form, tooth: e.target.value })} />
        </label>
        <label className="text-sm">
          Notes
          <input className="input mt-1" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </label>
        <button className="btn-primary md:col-span-2" type="submit">
          Register study
        </button>
      </form>
      <section className="glass-panel rounded-3xl p-5">
        <h3 className="font-display text-lg font-bold">Studies</h3>
        {studies.length === 0 ? (
          <EmptyState title="No imaging studies" />
        ) : (
          <ul className="mt-3 divide-y divide-brand-100">
            {studies.map((s) => (
              <li key={s.id} className="py-3 text-sm">
                <div className="font-semibold">
                  {s.study_type}
                  {s.tooth ? ` · tooth ${s.tooth}` : ""}
                </div>
                <div className="font-mono text-xs text-muted">{s.storage_key}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
