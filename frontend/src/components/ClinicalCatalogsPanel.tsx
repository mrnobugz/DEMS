import { FormEvent, useEffect, useState } from "react";
import { ConfigField, ConfigStatus, ConfirmAction, onTabListKeyDown } from "@/components/config/ConfigUi";
import { api, ApiError } from "@/lib/api";

export type CatalogEntry = {
  id: string;
  kind: string;
  code: string;
  label: string;
  sort_order: number;
  is_active: boolean;
};

const KINDS = [
  { id: "diagnosis", label: "Diagnoses" },
  { id: "allergy", label: "Allergies" },
  { id: "medical_alert", label: "Medical alerts" },
  { id: "medication", label: "Formulary" },
  { id: "uom", label: "Units of measure" },
  { id: "item_category", label: "Item categories" },
  { id: "surface", label: "Tooth surfaces" },
] as const;

const KIND_IDS = KINDS.map((k) => k.id);

export function ClinicalCatalogsPanel() {
  const [kind, setKind] = useState<(typeof KINDS)[number]["id"]>("diagnosis");
  const [rows, setRows] = useState<CatalogEntry[]>([]);
  const [form, setForm] = useState({ code: "", label: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function load(nextKind = kind) {
    const data = await api<CatalogEntry[]>(`/api/v1/config/catalogs/${nextKind}?include_inactive=true`);
    setRows(data);
  }

  useEffect(() => {
    setLoading(true);
    setOk("");
    load()
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load catalog"))
      .finally(() => setLoading(false));
  }, [kind]);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api(`/api/v1/config/catalogs/${kind}`, {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm({ code: "", label: "" });
      await load();
      setOk("Entry added");
    } catch (err) {
      setOk("");
      setError(err instanceof ApiError ? err.message : "Could not add entry");
    }
  }

  async function toggle(row: CatalogEntry) {
    setError("");
    try {
      await api(`/api/v1/config/catalogs/${kind}/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !row.is_active }),
      });
      await load();
      setOk(row.is_active ? `${row.label} deactivated` : `${row.label} reactivated`);
    } catch (err) {
      setOk("");
      setError(err instanceof ApiError ? err.message : "Could not update entry");
    }
  }

  const kindLabel = KINDS.find((k) => k.id === kind)?.label ?? "Catalog";

  return (
    <section className="glass-panel space-y-3">
      <div>
        <h3 className="font-display text-base font-bold text-brand-900">Clinical catalogs</h3>
        <p className="text-sm text-muted">
          Coded lists used on the chart, medical history, warehouse, and prescriptions. Deactivate instead of delete.
        </p>
      </div>
      <div
        className="admin-tabs"
        role="tablist"
        aria-label="Catalog kinds"
        onKeyDown={(e) =>
          onTabListKeyDown(e, KIND_IDS, kind, (id) => {
            setKind(id);
            queueMicrotask(() => document.getElementById(`catalog-tab-${id}`)?.focus());
          })
        }
      >
        {KINDS.map((k) => (
          <button
            key={k.id}
            id={`catalog-tab-${k.id}`}
            type="button"
            role="tab"
            aria-selected={kind === k.id}
            aria-controls="catalog-panel"
            tabIndex={kind === k.id ? 0 : -1}
            className={`admin-tab ${kind === k.id ? "admin-tab--on" : ""}`}
            onClick={() => setKind(k.id)}
          >
            {k.label}
          </button>
        ))}
      </div>
      <ConfigStatus loading={loading} error={error} ok={ok} />
      <div id="catalog-panel" role="tabpanel" aria-labelledby={`catalog-tab-${kind}`}>
        <form className="config-form-row" onSubmit={add}>
          <ConfigField label="Code">
            <input
              className="input"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              required
            />
          </ConfigField>
          <ConfigField label="Label">
            <input
              className="input"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              required
            />
          </ConfigField>
          <button type="submit" className="btn-primary">
            Add
          </button>
        </form>
        <div className="admin-scroll mt-3">
          {rows.length === 0 && !loading ? (
            <p className="text-sm text-muted">No {kindLabel.toLowerCase()} yet. Add a code and label above.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Label</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono text-xs">{row.code}</td>
                    <td className="font-semibold">{row.label}</td>
                    <td>
                      {row.is_active ? (
                        <ConfirmAction
                          label="Deactivate"
                          confirmLabel="Yes, deactivate"
                          onConfirm={() => toggle(row)}
                        />
                      ) : (
                        <button type="button" className="btn-ghost text-sm" onClick={() => void toggle(row)}>
                          Reactivate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}
