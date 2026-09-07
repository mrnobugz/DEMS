import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

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

export function ChairsidePharmacy({ patientId }: { patientId?: string }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [rx, setRx] = useState<Rx[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    const [t, r] = await Promise.all([
      api<Template[]>("/api/v1/pharmacy/templates"),
      patientId
        ? api<Rx[]>(`/api/v1/pharmacy/prescriptions?patient_id=${patientId}`)
        : Promise.resolve([] as Rx[]),
    ]);
    setTemplates(t);
    setRx(r);
    if (!templateId && t[0]) setTemplateId(t[0].id);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof ApiError ? e.message : "Pharmacy unavailable"));
  }, [patientId]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!patientId || !templateId) return;
    const tmpl = templates.find((t) => t.id === templateId);
    if (!tmpl) return;
    setError("");
    setMsg("");
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
      setMsg(`Prescribed ${tmpl.name}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not prescribe");
    }
  }

  return (
    <section className="glass-panel space-y-3 rounded-3xl p-5">
      <div>
        <h3 className="font-display text-base font-bold text-brand-900">Pharmacy</h3>
        <p className="text-xs text-muted">Post-op analgesics, antibiotics, and mouth rinse.</p>
      </div>
      {!patientId ? (
        <p className="text-sm text-muted">Select a patient to prescribe.</p>
      ) : (
        <form className="grid gap-3 sm:grid-cols-3" onSubmit={onCreate}>
          <label className="text-sm sm:col-span-2">
            Template
            <select
              className="input mt-1"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.default_dose}
                </option>
              ))}
            </select>
          </label>
          <button className="btn-primary self-end" type="submit" disabled={!templateId}>
            Prescribe
          </button>
        </form>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {msg && <p className="text-sm text-brand-700">{msg}</p>}
      {rx.length > 0 && (
        <ul className="divide-y divide-brand-100 text-sm">
          {rx.map((r) => (
            <li key={r.id} className="flex justify-between gap-2 py-2">
              <span>{r.items.map((i) => i.drug_name).join(", ")}</span>
              <span className="text-xs capitalize text-muted">{r.status}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
