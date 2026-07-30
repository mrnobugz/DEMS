import { FormEvent, useEffect, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/i18n";
import { useUiPrefs } from "@/lib/uiPrefs";
import { StatGrid, useDepartmentHome } from "./FrontClinicalPages";

type Item = {
  id: string;
  sku: string;
  name: string;
  category: string;
  quantity: number;
  reorder_level: number;
  unit: string;
  unit_cost: number;
};

export function InventoryPage() {
  const { home } = useDepartmentHome();
  const currency = useUiPrefs((s) => s.currency);
  const locale = useUiPrefs((s) => s.locale);
  const [items, setItems] = useState<Item[]>([]);
  const [expiring, setExpiring] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [form, setForm] = useState({
    sku: "",
    name: "",
    category: "general",
    quantity: 0,
    reorder_level: 5,
    unit: "unit",
    unit_cost: 0,
  });
  const [error, setError] = useState("");

  async function load() {
    const [i, e, s] = await Promise.all([
      api<Item[]>("/api/v1/inventory"),
      api<any[]>("/api/v1/inventory/expiring?days=90").catch(() => []),
      api<any[]>("/api/v1/inventory/suppliers").catch(() => []),
    ]);
    setItems(i);
    setExpiring(e);
    setSuppliers(s);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/api/v1/inventory", { method: "POST", body: JSON.stringify(form) });
      setForm({ ...form, sku: "", name: "" });
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function adjust(id: string, delta: number) {
    await api(`/api/v1/inventory/${id}/adjust`, {
      method: "POST",
      body: JSON.stringify({ delta, reason: "manual" }),
    });
    await load();
  }

  return (
    <div className="animate-rise space-y-6">
      <div>
        <h2 className="font-display text-3xl font-bold text-brand-900">Inventory</h2>
        <p className="text-sm text-muted">Stock levels and reorder alerts.</p>
      </div>
      {home && <StatGrid home={home} />}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <form className="glass-panel grid gap-3 rounded-3xl p-5 md:grid-cols-3" onSubmit={onCreate}>
        <input className="input" placeholder="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required />
        <input className="input" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input className="input" placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        <button className="btn-primary md:col-span-3" type="submit">
          Add item
        </button>
      </form>
      <section className="glass-panel overflow-x-auto rounded-3xl p-5">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-muted">
            <tr>
              <th className="py-2">SKU</th>
              <th>Name</th>
              <th>Qty</th>
              <th>Reorder</th>
              <th>Cost</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-t border-brand-100">
                <td className="py-3 font-mono text-xs">{i.sku}</td>
                <td>
                  {i.name}
                  {i.quantity <= i.reorder_level && (
                    <span className="status-pill status-pill--warn ml-2">Low</span>
                  )}
                </td>
                <td>
                  {i.quantity} {i.unit}
                </td>
                <td>{i.reorder_level}</td>
                <td>{formatMoney(i.unit_cost, currency, locale)}</td>
                <td className="space-x-1 text-right">
                  <button className="btn-ghost text-xs" type="button" onClick={() => adjust(i.id, 1)}>
                    +1
                  </button>
                  <button className="btn-ghost text-xs" type="button" onClick={() => adjust(i.id, -1)}>
                    −1
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <EmptyState title="No inventory items" />}
      </section>
      {(expiring.length > 0 || suppliers.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="glass-panel rounded-3xl p-5">
            <h3 className="font-display text-lg font-bold">Expiring (90d)</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {expiring.map((e) => (
                <li key={e.id}>
                  {e.sku} · {e.name} · {e.expiry_date}
                </li>
              ))}
              {expiring.length === 0 && <li className="text-muted">None</li>}
            </ul>
          </section>
          <section className="glass-panel rounded-3xl p-5">
            <h3 className="font-display text-lg font-bold">Suppliers</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {suppliers.map((s) => (
                <li key={s.id}>
                  {s.name} · {s.contact_email || "—"}
                </li>
              ))}
              {suppliers.length === 0 && <li className="text-muted">None</li>}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
