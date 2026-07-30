import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";

type Endo = {
  id: string;
  tooth_number: string;
  procedure_type: string;
  tooth_length_mm?: number | null;
  canal_count?: number | null;
  working_length_mm?: number | null;
  prep_method?: string | null;
  status: string;
  irrigants_json?: string | null;
  dressings_json?: string | null;
  obturations: { id: string; visit_date: string; canals_filled?: string | null; material?: string | null }[];
};

export function EndoPanel({
  patientId,
  selectedTooth,
}: {
  patientId: string;
  selectedTooth: string | null;
}) {
  const [cases, setCases] = useState<Endo[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    tooth_number: selectedTooth || "36",
    procedure_type: "rct",
    tooth_length_mm: 21,
    canal_count: 3,
    working_length_mm: 20,
    prep_method: "step-back",
    irrigants: "NaOCl 2.5%, EDTA 17%",
    dressings: "Ca(OH)2",
  });

  async function load() {
    setCases(await api<Endo[]>(`/api/v1/clinical/patients/${patientId}/endo-cases`));
  }

  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [patientId]);

  useEffect(() => {
    if (selectedTooth) setForm((f) => ({ ...f, tooth_number: selectedTooth }));
  }, [selectedTooth]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await api(`/api/v1/clinical/patients/${patientId}/endo-cases`, {
        method: "POST",
        body: JSON.stringify({
          tooth_number: form.tooth_number,
          procedure_type: form.procedure_type,
          tooth_length_mm: form.tooth_length_mm,
          canal_count: form.canal_count,
          working_length_mm: form.working_length_mm,
          prep_method: form.prep_method,
          irrigants: form.irrigants.split(",").map((s) => s.trim()).filter(Boolean),
          dressings: form.dressings.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function addObturation(caseId: string) {
    await api(`/api/v1/clinical/endo-cases/${caseId}/obturations`, {
      method: "POST",
      body: JSON.stringify({
        canals_filled: "All",
        material: "Gutta-percha",
        notes: "Obturation visit",
      }),
    });
    await load();
  }

  return (
    <section className="glass-panel space-y-4 rounded-3xl p-5">
      <div>
        <h3 className="font-display text-lg font-bold text-brand-900">Endodontics</h3>
        <p className="text-sm text-muted">Pulpotomy / pulpectomy / RCT · lengths · obturations</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <form className="grid gap-2 md:grid-cols-3" onSubmit={onCreate}>
        <input
          className="input"
          value={form.tooth_number}
          onChange={(e) => setForm({ ...form, tooth_number: e.target.value })}
        />
        <select
          className="input"
          value={form.procedure_type}
          onChange={(e) => setForm({ ...form, procedure_type: e.target.value })}
        >
          {["pulpotomy", "pulpectomy", "rct"].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select
          className="input"
          value={form.prep_method}
          onChange={(e) => setForm({ ...form, prep_method: e.target.value })}
        >
          {["conventional", "step-back", "step-down"].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <input
          className="input"
          type="number"
          step="0.1"
          value={form.tooth_length_mm}
          onChange={(e) => setForm({ ...form, tooth_length_mm: Number(e.target.value) })}
          placeholder="Tooth length mm"
        />
        <input
          className="input"
          type="number"
          value={form.canal_count}
          onChange={(e) => setForm({ ...form, canal_count: Number(e.target.value) })}
          placeholder="Canals"
        />
        <input
          className="input"
          type="number"
          step="0.1"
          value={form.working_length_mm}
          onChange={(e) => setForm({ ...form, working_length_mm: Number(e.target.value) })}
          placeholder="Working length mm"
        />
        <input
          className="input md:col-span-2"
          value={form.irrigants}
          onChange={(e) => setForm({ ...form, irrigants: e.target.value })}
          placeholder="Irrigants (comma-separated)"
        />
        <button className="btn-primary" type="submit">
          Open endo case
        </button>
      </form>
      <ul className="space-y-3">
        {cases.map((c) => (
          <li key={c.id} className="rounded-2xl bg-brand-50/60 p-3 text-sm">
            <div className="font-semibold">
              Tooth {c.tooth_number} · {c.procedure_type} · {c.status}
            </div>
            <div className="text-xs text-muted">
              Length {c.tooth_length_mm}mm · WL {c.working_length_mm}mm · {c.canal_count} canals ·{" "}
              {c.prep_method}
            </div>
            <div className="mt-2 text-xs">
              Obturations: {c.obturations.length || "none"}
              {c.obturations.map((o) => (
                <div key={o.id}>
                  {o.visit_date}: {o.canals_filled} · {o.material}
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn-ghost mt-2 text-xs"
              onClick={() => void addObturation(c.id)}
            >
              Add obturation visit
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
