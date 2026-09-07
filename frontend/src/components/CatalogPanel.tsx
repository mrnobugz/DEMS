import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/i18n";
import type { CatalogItem } from "@/lib/types";
import { useUiPrefs } from "@/lib/uiPrefs";

const KINDS = ["procedure", "drug", "supply", "lab"] as const;

const emptyForm = {
  sku: "",
  label: "",
  kind: "procedure",
  list_price: "",
  extra: "",
  payer_name: "",
  payer_amount: "",
};

export function CatalogPanel() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [kind, setKind] = useState<(typeof KINDS)[number] | "all">("all");
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const currency = useUiPrefs((s) => s.currency);
  const locale = useUiPrefs((s) => s.locale);
  const money = (n: number) => formatMoney(n, currency, locale);

  async function load() {
    const rows = await api<CatalogItem[]>("/api/v1/billing/catalog?active=true");
    setItems(rows);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof ApiError ? err.message : "Could not load catalog"));
  }, []);

  const visible = useMemo(
    () => (kind === "all" ? items : items.filter((row) => row.kind === kind)),
    [items, kind],
  );

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    const body: Record<string, unknown> = {
      sku: form.sku.trim(),
      label: form.label.trim(),
      kind: form.kind,
      list_price: Number(form.list_price) || 0,
      billable: true,
      is_active: true,
    };
    if (form.kind === "procedure") body.cdt_code = form.extra.trim() || null;
    if (form.kind === "drug") body.ndc_code = form.extra.trim() || null;
    if (form.kind === "supply") body.unit_of_measure = form.extra.trim() || "unit";
    if (form.kind === "lab") body.vendor_fee_basis = form.extra.trim() || "per-unit";
    try {
      await api("/api/v1/billing/catalog", { method: "POST", body: JSON.stringify(body) });
      setForm(emptyForm);
      setMsg("Catalog item saved. Billing will use the office fee until a payer rate is added.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save catalog item");
    }
  }

  async function addRate(itemId: string) {
    setError("");
    setMsg("");
    try {
      await api(`/api/v1/billing/catalog/${itemId}/rates`, {
        method: "POST",
        body: JSON.stringify({
          payer_name: form.payer_name.trim(),
          amount: Number(form.payer_amount) || 0,
        }),
      });
      setForm((f) => ({ ...f, payer_name: "", payer_amount: "" }));
      setMsg("Payer fee saved. Invoices on or after today use this amount for that payer.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save fee rate");
    }
  }

  const extraLabel =
    form.kind === "drug"
      ? "NDC"
      : form.kind === "supply"
        ? "Unit of measure"
        : form.kind === "lab"
          ? "Vendor fee basis"
          : "CDT code";

  return (
    <div className="space-y-3">
      <div className="glass-panel space-y-3">
        <h3 className="reg-section__title">Billable catalog</h3>
        <p className="text-xs text-muted">
          Procedures, drugs, supplies, and lab items. Warehouse registration SKUs stay in inventory.
          Billing reads the fee schedule (office or payer, by effective date).
        </p>
        <form className="grid gap-2 md:grid-cols-5" onSubmit={onAdd}>
          <input
            className="input"
            placeholder="SKU"
            value={form.sku}
            onChange={(e) => setForm({ ...form, sku: e.target.value })}
            required
          />
          <input
            className="input"
            placeholder="Label"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            required
          />
          <select
            className="input"
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value })}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <input
            className="input"
            type="number"
            min={0}
            placeholder="List price"
            value={form.list_price}
            onChange={(e) => setForm({ ...form, list_price: e.target.value })}
            required
          />
          <input
            className="input"
            placeholder={extraLabel}
            value={form.extra}
            onChange={(e) => setForm({ ...form, extra: e.target.value })}
          />
          <button className="btn-primary md:col-span-5" type="submit">
            Add catalog item
          </button>
        </form>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {msg && <p className="text-sm text-brand-700">{msg}</p>}
      </div>

      <div className="glass-panel space-y-2">
        <div className="admin-chips">
          <button
            type="button"
            className={`admin-chip ${kind === "all" ? "admin-chip--on" : ""}`}
            onClick={() => setKind("all")}
          >
            All
          </button>
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className={`admin-chip ${kind === k ? "admin-chip--on" : ""}`}
              onClick={() => setKind(k)}
            >
              {k}
            </button>
          ))}
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          <input
            className="input"
            placeholder="Payer name (blank = office)"
            value={form.payer_name}
            onChange={(e) => setForm({ ...form, payer_name: e.target.value })}
          />
          <input
            className="input"
            type="number"
            min={0}
            placeholder="Payer amount"
            value={form.payer_amount}
            onChange={(e) => setForm({ ...form, payer_amount: e.target.value })}
          />
          <p className="self-center text-[11px] text-muted">Then click “Add rate” on a row.</p>
        </div>
        <div className="admin-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Kind</th>
                <th>Label</th>
                <th className="text-right">List</th>
                <th>Fee schedules</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id}>
                  <td className="font-mono text-xs">{row.sku}</td>
                  <td className="capitalize">{row.kind}</td>
                  <td>
                    {row.label}
                    {row.tooth_required ? (
                      <span className="ml-1 text-[10px] text-muted">tooth req.</span>
                    ) : null}
                  </td>
                  <td className="text-right font-mono text-xs">{money(row.list_price)}</td>
                  <td className="text-xs text-muted">
                    {row.fee_rates
                      .map(
                        (r) =>
                          `${r.payer_name || "office"} ${money(r.amount)} (${r.effective_from})`,
                      )
                      .join(" · ") || "—"}
                  </td>
                  <td className="text-right">
                    <button
                      type="button"
                      className="btn-ghost text-xs"
                      disabled={!form.payer_amount}
                      onClick={() => void addRate(row.id)}
                    >
                      Add rate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length === 0 && (
            <p className="p-3 text-sm text-muted">No catalog items for this kind.</p>
          )}
        </div>
      </div>
    </div>
  );
}
