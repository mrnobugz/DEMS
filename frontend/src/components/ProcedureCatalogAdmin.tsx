import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/i18n";
import type { FeeScheduleItem } from "@/lib/types";
import { useUiPrefs } from "@/lib/uiPrefs";

const CATEGORIES = [
  "general",
  "diagnostic",
  "imaging",
  "restorative",
  "endodontic",
  "surgery",
  "orthodontic",
  "paediatric",
  "hygiene",
];

const emptyForm = {
  code: "",
  label: "",
  category: "restorative",
  unit_price: "",
};

export function ProcedureCatalogAdmin({ onCount }: { onCount?: (n: number) => void }) {
  const [items, setItems] = useState<FeeScheduleItem[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [showInactive, setShowInactive] = useState(false);
  const currency = useUiPrefs((s) => s.currency);
  const locale = useUiPrefs((s) => s.locale);

  async function load() {
    const rows = await api<FeeScheduleItem[]>("/api/v1/billing/fee-schedule");
    setItems(rows);
    onCount?.(rows.length);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof ApiError ? err.message : "Could not load procedures"));
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((row) => {
      if (!showInactive && !row.is_active) return false;
      if (category !== "all" && row.category !== category) return false;
      if (!q) return true;
      return `${row.code} ${row.label} ${row.category}`.toLowerCase().includes(q);
    });
  }, [items, query, category, showInactive]);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    try {
      await api("/api/v1/billing/fee-schedule", {
        method: "POST",
        body: JSON.stringify({
          code: form.code.trim(),
          label: form.label.trim(),
          category: form.category,
          unit_price: Number(form.unit_price) || 0,
          billable: true,
          is_active: true,
        }),
      });
      setForm(emptyForm);
      setMsg("Saved. Specialists can bill this on invoices.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save procedure");
    }
  }

  async function patch(id: string, body: Partial<FeeScheduleItem>) {
    setError("");
    setMsg("");
    try {
      await api(`/api/v1/billing/fee-schedule/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update procedure");
    }
  }

  return (
    <section className="glass-panel space-y-3">
      <div className="clin-head">
        <div>
          <h3 className="font-display text-base font-bold text-brand-900">Billing procedures</h3>
          <p className="text-xs text-muted">Admin-owned procedure SKUs. Prices are versioned in the catalog fee schedule.</p>
        </div>
        <p className="text-[11px] text-muted">
          {visible.length} shown · {items.length} total
        </p>
      </div>

      <form className="reg-fields" onSubmit={onAdd}>
        <label className="text-xs">
          <span className="label">Code</span>
          <input
            className="input"
            placeholder="rct-ant"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            required
          />
        </label>
        <label className="text-xs">
          <span className="label">Procedure</span>
          <input
            className="input"
            placeholder="Anterior root canal"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            required
          />
        </label>
        <label className="text-xs">
          <span className="label">Category</span>
          <select
            className="input"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="label">Price</span>
          <input
            className="input"
            type="number"
            min={0}
            step="100"
            placeholder="0"
            value={form.unit_price}
            onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
            required
          />
        </label>
        <div className="flex items-end">
          <button className="btn-primary w-full" type="submit">
            Add / update
          </button>
        </div>
      </form>

      <div className="admin-toolbar">
        <input
          className="input"
          type="search"
          placeholder="Filter code or name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>
      </div>
      <div className="admin-chips">
        <button
          type="button"
          className={`admin-chip ${category === "all" ? "admin-chip--on" : ""}`}
          onClick={() => setCategory("all")}
        >
          All
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className={`admin-chip ${category === c ? "admin-chip--on" : ""}`}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {msg && <p className="text-sm text-brand-700">{msg}</p>}

      <div className="admin-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Procedure</th>
              <th>Category</th>
              <th className="text-right">Price</th>
              <th>Bill</th>
              <th>Active</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id} className={row.is_active ? "" : "opacity-50"}>
                <td className="font-mono text-brand-700">{row.code}</td>
                <td>{row.label}</td>
                <td className="capitalize text-muted">{row.category}</td>
                <td className="text-right">
                  <input
                    className="input w-28 text-right"
                    type="number"
                    min={0}
                    defaultValue={row.unit_price}
                    aria-label={`Price for ${row.code}`}
                    key={`${row.id}-${row.unit_price}`}
                    onBlur={(e) => {
                      const next = Number(e.target.value);
                      if (Number.isFinite(next) && next !== row.unit_price) {
                        void patch(row.id, { unit_price: next });
                      }
                    }}
                  />
                  <div className="mt-0.5 text-[10px] text-muted">
                    {formatMoney(row.unit_price, currency, locale)}
                  </div>
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={row.billable}
                    aria-label={`Billable ${row.code}`}
                    onChange={(e) => void patch(row.id, { billable: e.target.checked })}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={row.is_active}
                    aria-label={`Active ${row.code}`}
                    onChange={(e) => void patch(row.id, { is_active: e.target.checked })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <p className="px-1 py-3 text-xs text-muted">No procedures match this filter.</p>
        )}
      </div>
      <p className="text-[11px] text-muted">Change a price and leave the field to save.</p>
    </section>
  );
}
