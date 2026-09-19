import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { hasEffectivePermission } from "@/lib/nav";
import { useAuth } from "@/lib/auth";
import type { Patient } from "@/lib/types";
import type { CatalogEntry } from "@/components/ClinicalCatalogsPanel";
import type { SafetyItem, SafetySummary } from "@/components/PatientSafetyBanner";

const KINDS = [
  { id: "allergy", catalog: "allergy", label: "Allergy" },
  { id: "alert", catalog: "medical_alert", label: "Alert" },
  { id: "condition", catalog: "diagnosis", label: "Condition" },
  { id: "medication", catalog: "medication", label: "Medication" },
] as const;

export function PatientSafetyPanel({
  patient,
  onChanged,
}: {
  patient: Patient;
  onChanged: () => Promise<void>;
}) {
  const perms = useAuth((s) => s.user?.effective_permissions);
  const canMerge = hasEffectivePermission(perms, "patients:merge");
  const [summary, setSummary] = useState<SafetySummary | null>(null);
  const [kind, setKind] = useState<(typeof KINDS)[number]["id"]>("allergy");
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [code, setCode] = useState("");
  const [dupes, setDupes] = useState<Patient[]>([]);
  const [dropId, setDropId] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const catalogKind = KINDS.find((k) => k.id === kind)?.catalog || "allergy";

  async function load() {
    const [s, c, d] = await Promise.all([
      api<SafetySummary>(`/api/v1/patients/${patient.id}/safety`),
      api<CatalogEntry[]>(`/api/v1/config/catalogs/${catalogKind}`).catch(() => []),
      api<Patient[]>(`/api/v1/patients/${patient.id}/duplicates`).catch(() => []),
    ]);
    setSummary(s);
    setCatalog(c);
    setDupes(d);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof ApiError ? err.message : "Could not load safety"));
  }, [patient.id, catalogKind]);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError("");
    const picked = catalog.find((row) => row.code === code);
    if (!picked) return;
    try {
      await api(`/api/v1/patients/${patient.id}/safety`, {
        method: "POST",
        body: JSON.stringify({ kind, code: picked.code, label: picked.label }),
      });
      setCode("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add");
    }
  }

  async function remove(item: SafetyItem) {
    setError("");
    try {
      await api(`/api/v1/patients/${patient.id}/safety/${item.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove");
    }
  }

  async function review() {
    setError("");
    try {
      await api(`/api/v1/patients/${patient.id}/history-reviewed`, { method: "POST" });
      setMsg("Medical history marked reviewed.");
      await load();
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not stamp review");
    }
  }

  async function merge(e: FormEvent) {
    e.preventDefault();
    if (!dropId) return;
    setError("");
    try {
      await api(`/api/v1/patients/${patient.id}/merge`, {
        method: "POST",
        body: JSON.stringify({ drop_id: dropId }),
      });
      setMsg("Records merged. The other chart is now inactive.");
      setDropId("");
      await load();
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Merge failed");
    }
  }

  const items = summary?.items || [];

  return (
    <section className="glass-panel space-y-3">
      <div>
        <h3 className="font-display text-base font-bold text-brand-900">Medical safety</h3>
        <p className="text-xs text-muted">Pick from clinic catalogs. Free-text history on the intake form still shows on the banner.</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {msg && <p className="text-sm text-brand-700">{msg}</p>}

      <form className="flex flex-wrap gap-2" onSubmit={add}>
        <select className="input w-36" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          {KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
        <select className="input flex-1" value={code} onChange={(e) => setCode(e.target.value)} required>
          <option value="">Select…</option>
          {catalog.map((row) => (
            <option key={row.id} value={row.code}>
              {row.label}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-primary">
          Add
        </button>
      </form>

      <ul className="admin-list">
        {items.length === 0 ? (
          <li className="text-xs text-muted">No coded alerts yet.</li>
        ) : (
          items.map((item) => (
            <li key={item.id}>
              <div>
                <div className="font-semibold">{item.label}</div>
                <div className="text-[11px] capitalize text-muted">
                  {item.kind} · {item.code}
                </div>
              </div>
              <button type="button" className="btn-ghost text-xs" onClick={() => void remove(item)}>
                Deactivate
              </button>
            </li>
          ))
        )}
      </ul>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <button type="button" className="btn-ghost text-xs" onClick={() => void review()}>
          Mark history reviewed
        </button>
        {summary?.history_reviewed_at && (
          <span>Last reviewed {new Date(summary.history_reviewed_at).toLocaleString()}</span>
        )}
      </div>

      {canMerge && dupes.length > 0 && (
        <form className="space-y-2 border-t border-brand-100 pt-3" onSubmit={merge}>
          <p className="text-xs font-semibold text-brand-900">Possible duplicates</p>
          <select className="input" value={dropId} onChange={(e) => setDropId(e.target.value)} required>
            <option value="">Merge this other chart into the current one…</option>
            {dupes.map((d) => (
              <option key={d.id} value={d.id}>
                {d.patient_code} · {d.first_name} {d.last_name}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-ghost text-xs">
            Merge into this patient
          </button>
        </form>
      )}
    </section>
  );
}
