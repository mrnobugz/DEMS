import { FormEvent, useEffect, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { api } from "@/lib/api";
import { StatGrid, useDepartmentHome } from "./FrontClinicalPages";

type Template = {
  id: string;
  name: string;
  category: string;
  default_dose: string;
  default_quantity: string;
};

type Rx = {
  id: string;
  patient_id: string;
  status: string;
  items: { drug_name: string; dose: string; quantity: string }[];
  prescribed_at: string;
};

export function PharmacyPage() {
  const { home } = useDepartmentHome();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [rx, setRx] = useState<Rx[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [patientId, setPatientId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [t, r, p] = await Promise.all([
      api<Template[]>("/api/v1/pharmacy/templates"),
      api<Rx[]>("/api/v1/pharmacy/prescriptions"),
      api<{ items: any[] }>("/api/v1/patients?limit=50"),
    ]);
    setTemplates(t);
    setRx(r);
    setPatients(p.items);
    if (!patientId && p.items[0]) setPatientId(p.items[0].id);
    if (!templateId && t[0]) setTemplateId(t[0].id);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const tmpl = templates.find((t) => t.id === templateId);
    if (!tmpl) return;
    try {
      const warn = await api<{ warnings: string[] }>("/api/v1/pharmacy/warn", {
        method: "POST",
        body: JSON.stringify({ patient_id: patientId, drug_name: tmpl.name }),
      });
      if (warn.warnings?.length) {
        const ok = confirm(`${warn.warnings.join("\n")}\n\nContinue prescribing?`);
        if (!ok) return;
      }
      await api("/api/v1/pharmacy/prescriptions", {
        method: "POST",
        body: JSON.stringify({
          patient_id: patientId,
          items: [
            {
              drug_name: tmpl.name,
              dose: tmpl.default_dose,
              quantity: tmpl.default_quantity,
              instructions: null,
            },
          ],
        }),
      });
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function markDispensed(id: string) {
    await api(`/api/v1/pharmacy/prescriptions/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "dispensed" }),
    });
    await load();
  }

  return (
    <div className="animate-rise space-y-6">
      <div>
        <h2 className="font-display text-3xl font-bold text-brand-900">Pharmacy</h2>
        <p className="text-sm text-muted">Drug templates and e-prescriptions.</p>
      </div>
      {home && <StatGrid home={home} />}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <form className="glass-panel grid gap-3 rounded-3xl p-5 md:grid-cols-3" onSubmit={onCreate}>
        <label className="text-sm">
          Patient
          <select className="input mt-1" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.first_name} {p.last_name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Template
          <select className="input mt-1" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <button className="btn-primary self-end" type="submit">
          Prescribe
        </button>
      </form>
      <section className="glass-panel rounded-3xl p-5">
        <h3 className="font-display text-lg font-bold">Templates</h3>
        <ul className="mt-3 grid gap-2 sm:grid-cols-3">
          {templates.map((t) => (
            <li key={t.id} className="rounded-xl bg-brand-50/70 p-3 text-sm">
              <div className="font-semibold">{t.name}</div>
              <div className="text-xs text-muted">
                {t.category} · {t.default_dose}
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="glass-panel rounded-3xl p-5">
        <h3 className="font-display text-lg font-bold">Prescriptions</h3>
        {rx.length === 0 ? (
          <EmptyState title="No prescriptions" />
        ) : (
          <ul className="mt-3 divide-y divide-brand-100">
            {rx.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <div className="font-semibold capitalize">{r.status}</div>
                  <div className="text-xs text-muted">
                    {r.items.map((i) => i.drug_name).join(", ")}
                  </div>
                </div>
                {r.status === "active" && (
                  <button className="btn-ghost text-xs" type="button" onClick={() => markDispensed(r.id)}>
                    Mark dispensed
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
