import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";

type Restoration = {
  id: string;
  tooth_number: string;
  surfaces: string;
  restoration_type: string;
  cavity_size?: string | null;
  blacks_class?: string | null;
  material?: string | null;
  shade?: string | null;
  status: string;
  quality?: {
    marginal_adaptation?: number | null;
    contacts?: number | null;
    finishing?: number | null;
  } | null;
};

type Case = {
  id: string;
  primary_tooth: string;
  case_type: string;
  status: string;
  warranty_months: number;
  recall_due_at?: string | null;
  restorations: Restoration[];
};

const TYPES = [
  "filling_composite",
  "filling_amalgam",
  "filling_gic",
  "inlay",
  "onlay",
  "crown_pfm",
  "crown_zirconia",
  "crown_emax",
  "veneer",
  "bridge_abutment",
  "bridge_pontic",
  "post_core",
  "rct_restoration",
];

const STATUSES = ["planned", "in_progress", "completed", "failed", "replaced"];

export function RestorativePanel({
  patientId,
  selectedTooth,
}: {
  patientId: string;
  selectedTooth: string | null;
}) {
  const [cases, setCases] = useState<Case[]>([]);
  const [restorations, setRestorations] = useState<Restoration[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    tooth_number: selectedTooth || "36",
    surfaces: "O",
    restoration_type: "filling_composite",
    cavity_size: "M",
    blacks_class: "I",
    material: "Composite",
    shade: "A2",
    status: "planned",
    case_id: "",
  });

  async function load() {
    const [c, r] = await Promise.all([
      api<Case[]>(`/api/v1/clinical/patients/${patientId}/restoration-cases`),
      api<Restoration[]>(`/api/v1/clinical/patients/${patientId}/restorations`),
    ]);
    setCases(c);
    setRestorations(r);
  }

  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [patientId]);

  useEffect(() => {
    if (selectedTooth) setForm((f) => ({ ...f, tooth_number: selectedTooth }));
  }, [selectedTooth]);

  async function createCase() {
    try {
      await api(`/api/v1/clinical/patients/${patientId}/restoration-cases`, {
        method: "POST",
        body: JSON.stringify({
          primary_tooth: form.tooth_number,
          case_type: form.restoration_type.includes("crown") ? "crown" : "restorative",
          warranty_months: 12,
        }),
      });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await api(`/api/v1/clinical/patients/${patientId}/restorations`, {
        method: "POST",
        body: JSON.stringify({
          ...form,
          case_id: form.case_id || null,
        }),
      });
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function setStatus(id: string, status: string) {
    await api(`/api/v1/clinical/restorations/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    await load();
  }

  async function saveQuality(id: string) {
    await api(`/api/v1/clinical/restorations/${id}/quality`, {
      method: "PUT",
      body: JSON.stringify({
        marginal_adaptation: 5,
        contacts: 4,
        wear: 5,
        postop_sensitivity: 5,
        pulp_status: "vital",
        color_match: 4,
        finishing: 5,
      }),
    });
    await load();
  }

  return (
    <section className="glass-panel space-y-4 rounded-3xl p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-bold text-brand-900">Surface-True Restorative</h3>
          <p className="text-sm text-muted">Cases · surfaces · lifecycle · quality rubrics</p>
        </div>
        <button type="button" className="btn-ghost text-sm" onClick={() => void createCase()}>
          New case for tooth {form.tooth_number}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <form className="grid gap-2 md:grid-cols-3" onSubmit={onCreate}>
        <input
          className="input"
          value={form.tooth_number}
          onChange={(e) => setForm({ ...form, tooth_number: e.target.value })}
          placeholder="Tooth"
        />
        <input
          className="input"
          value={form.surfaces}
          onChange={(e) => setForm({ ...form, surfaces: e.target.value.toUpperCase() })}
          placeholder="Surfaces MODBLFIP"
        />
        <select
          className="input"
          value={form.restoration_type}
          onChange={(e) => setForm({ ...form, restoration_type: e.target.value })}
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={form.cavity_size}
          onChange={(e) => setForm({ ...form, cavity_size: e.target.value })}
        >
          {["S", "M", "L"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          className="input"
          value={form.blacks_class}
          onChange={(e) => setForm({ ...form, blacks_class: e.target.value })}
        >
          {["I", "II", "III", "IV", "V"].map((s) => (
            <option key={s} value={s}>
              Class {s}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={form.case_id}
          onChange={(e) => setForm({ ...form, case_id: e.target.value })}
        >
          <option value="">No case link</option>
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.primary_tooth} · {c.status}
            </option>
          ))}
        </select>
        <input
          className="input"
          value={form.material}
          onChange={(e) => setForm({ ...form, material: e.target.value })}
          placeholder="Material"
        />
        <input
          className="input"
          value={form.shade}
          onChange={(e) => setForm({ ...form, shade: e.target.value })}
          placeholder="Shade"
        />
        <button className="btn-primary" type="submit">
          Add restoration
        </button>
      </form>

      <ul className="divide-y divide-brand-100">
        {restorations.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
            <div>
              <div className="font-semibold">
                {r.tooth_number} · {r.surfaces || "—"} · {r.restoration_type}
              </div>
              <div className="text-xs text-muted">
                {r.material} {r.shade} · class {r.blacks_class} · {r.cavity_size}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="input text-xs"
                value={r.status}
                onChange={(e) => void setStatus(r.id, e.target.value)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              {r.status === "completed" && !r.quality && (
                <button type="button" className="btn-ghost text-xs" onClick={() => void saveQuality(r.id)}>
                  Add quality rubric
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
