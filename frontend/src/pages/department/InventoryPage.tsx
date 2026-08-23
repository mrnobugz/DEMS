import { FormEvent, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/i18n";
import type { InventoryItem } from "@/lib/types";
import { useUiPrefs } from "@/lib/uiPrefs";

const DEPARTMENTS = [
  { id: "", label: "General / any" },
  { id: "restorative", label: "Restorative" },
  { id: "maxillofacial", label: "Maxillofacial" },
  { id: "orthodontic", label: "Orthodontic" },
  { id: "paediatric", label: "Paediatric" },
];

const emptyForm = {
  sku: "",
  name: "",
  category: "registration",
  quantity: 0,
  reorder_level: 5,
  unit: "visit",
  unit_cost: 0,
  sale_price: 0,
  item_kind: "service",
  billable_at_registration: true,
  target_department: "",
};

type Filter = "all" | "stock" | "registration";

export function InventoryPage() {
  const role = useAuth((s) => s.user?.role);
  const canManage = role === "clinic_admin" || role === "super_admin";
  const currency = useUiPrefs((s) => s.currency);
  const locale = useUiPrefs((s) => s.locale);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [expiring, setExpiring] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [i, e, s] = await Promise.all([
      api<InventoryItem[]>("/api/v1/inventory?include_inactive=true"),
      api<any[]>("/api/v1/inventory/expiring?days=90").catch(() => []),
      api<any[]>("/api/v1/inventory/suppliers").catch(() => []),
    ]);
    setItems(i);
    setExpiring(e);
    setSuppliers(s);
  }

  useEffect(() => {
    (async () => {
      try {
        await api<InventoryItem[]>("/api/v1/inventory?billable_at_registration=true");
        await load();
      } catch (err: any) {
        setError(err.message);
      }
    })();
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (filter === "stock" && i.item_kind === "service") return false;
      if (filter === "registration" && !i.billable_at_registration) return false;
      if (!q) return true;
      return `${i.sku} ${i.name} ${i.category} ${i.target_department || ""}`.toLowerCase().includes(q);
    });
  }, [items, filter, query]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/api/v1/inventory", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          target_department: form.target_department || null,
          quantity: form.item_kind === "service" ? 0 : form.quantity,
          reorder_level: form.item_kind === "service" ? 0 : form.reorder_level,
        }),
      });
      setForm({ ...emptyForm, item_kind: form.item_kind, category: form.category });
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function adjust(id: string, delta: number) {
    setError("");
    try {
      await api(`/api/v1/inventory/${id}/adjust`, {
        method: "POST",
        body: JSON.stringify({ delta, reason: "manual" }),
      });
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function toggleActive(item: InventoryItem) {
    await api(`/api/v1/inventory/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: !item.is_active }),
    });
    await load();
  }

  async function toggleRegistration(item: InventoryItem) {
    await api(`/api/v1/inventory/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ billable_at_registration: !item.billable_at_registration }),
    });
    await load();
  }

  const isService = form.item_kind === "service";

  const lowStock = items.filter((i) => i.item_kind !== "service" && i.quantity <= i.reorder_level).length;

  return (
    <div className="clin-shell animate-rise space-y-3">
      <div className="clin-head">
        <div>
          <h2 className="font-display text-xl font-bold leading-tight text-brand-900">Warehouse</h2>
          <p className="text-xs text-muted">
            Stock and registration fees collected at file opening.
          </p>
        </div>
        <div className="admin-counts">
          <span className="admin-count">
            <strong>{items.length}</strong> items
          </span>
          <span className="admin-count">
            <strong>{items.filter((i) => i.billable_at_registration).length}</strong> registration
          </span>
          {lowStock > 0 && (
            <span className="admin-count admin-count--alert">
              <strong>{lowStock}</strong> low stock
            </span>
          )}
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {canManage && (
      <form className="glass-panel space-y-2" onSubmit={onCreate}>
        <h3 className="reg-section__title">Add item</h3>
        <div className="reg-fields">
        <input
          className="input"
          placeholder="SKU"
          value={form.sku}
          onChange={(e) => setForm({ ...form, sku: e.target.value })}
          required
        />
        <input
          className="input"
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <input
          className="input"
          placeholder="Category"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
        />
        <select
          className="input"
          value={form.item_kind}
          onChange={(e) =>
            setForm({
              ...form,
              item_kind: e.target.value,
              unit: e.target.value === "service" ? "visit" : "unit",
              category: e.target.value === "service" ? "registration" : form.category,
              billable_at_registration: e.target.value === "service" ? true : form.billable_at_registration,
            })
          }
        >
          <option value="service">Service / fee</option>
          <option value="stock">Stock</option>
        </select>
        <input
          className="input"
          type="number"
          min={0}
          placeholder="Sale price"
          value={form.sale_price}
          onChange={(e) => setForm({ ...form, sale_price: Number(e.target.value) })}
        />
        <input
          className="input"
          type="number"
          min={0}
          placeholder="Unit cost"
          value={form.unit_cost}
          onChange={(e) => setForm({ ...form, unit_cost: Number(e.target.value) })}
        />
        <select
          className="input"
          value={form.target_department}
          onChange={(e) => setForm({ ...form, target_department: e.target.value })}
        >
          {DEPARTMENTS.map((d) => (
            <option key={d.id || "general"} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
        {!isService && (
          <>
            <input
              className="input"
              type="number"
              min={0}
              placeholder="Quantity"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
            />
            <input
              className="input"
              type="number"
              min={0}
              placeholder="Reorder level"
              value={form.reorder_level}
              onChange={(e) => setForm({ ...form, reorder_level: Number(e.target.value) })}
            />
            <input
              className="input"
              placeholder="Unit"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
            />
          </>
        )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={form.billable_at_registration}
              onChange={(e) => setForm({ ...form, billable_at_registration: e.target.checked })}
            />
            Billable at registration
          </label>
          <button className="btn-primary" type="submit">
            Add item
          </button>
        </div>
      </form>
      )}

      <section className="glass-panel space-y-2">
        <div className="admin-toolbar">
          <input
            className="input"
            type="search"
            placeholder="Search SKU or name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="admin-chips">
            {(
              [
                ["all", "All"],
                ["registration", "Registration"],
                ["stock", "Stock"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`admin-chip ${filter === id ? "admin-chip--on" : ""}`}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="admin-scroll overflow-x-auto">
        <table className="admin-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Name</th>
              <th>Kind</th>
              <th>Price</th>
              <th>Reg</th>
              <th>Dept</th>
              <th>Qty</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((i) => (
              <tr key={i.id} className={i.is_active ? "" : "opacity-50"}>
                <td className="font-mono text-brand-700">{i.sku}</td>
                <td>
                  {i.name}
                  {i.item_kind !== "service" && i.quantity <= i.reorder_level && (
                    <span className="status-pill status-pill--warning ml-2">Low</span>
                  )}
                </td>
                <td className="capitalize text-muted">{i.item_kind}</td>
                <td>{formatMoney(i.sale_price || i.unit_cost, currency, locale)}</td>
                <td>
                  {canManage ? (
                    <button
                      type="button"
                      className="btn-ghost text-xs"
                      onClick={() => void toggleRegistration(i)}
                    >
                      {i.billable_at_registration ? "Yes" : "No"}
                    </button>
                  ) : i.billable_at_registration ? (
                    "Yes"
                  ) : (
                    "No"
                  )}
                </td>
                <td className="capitalize">{i.target_department || "—"}</td>
                <td>
                  {i.item_kind === "service" ? "—" : `${i.quantity} ${i.unit}`}
                </td>
                <td className="space-x-1 text-right">
                  {canManage && i.item_kind !== "service" && (
                    <>
                      <button className="btn-ghost text-xs" type="button" onClick={() => adjust(i.id, 1)}>
                        +1
                      </button>
                      <button className="btn-ghost text-xs" type="button" onClick={() => adjust(i.id, -1)}>
                        −1
                      </button>
                    </>
                  )}
                  {canManage && (
                    <button className="btn-ghost text-xs" type="button" onClick={() => void toggleActive(i)}>
                      {i.is_active ? "Hide" : "Show"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && <EmptyState title="No warehouse items" />}
        </div>
      </section>
      {(expiring.length > 0 || suppliers.length > 0) && (
        <div className="grid gap-3 lg:grid-cols-2">
          <section className="glass-panel">
            <h3 className="reg-section__title">Expiring · 90d</h3>
            <ul className="admin-list">
              {expiring.map((e) => (
                <li key={e.id}>
                  <span>
                    {e.sku} · {e.name}
                  </span>
                  <span className="text-[11px] text-muted">{e.expiry_date}</span>
                </li>
              ))}
              {expiring.length === 0 && <li className="text-muted">None</li>}
            </ul>
          </section>
          <section className="glass-panel">
            <h3 className="reg-section__title">Suppliers</h3>
            <ul className="admin-list">
              {suppliers.map((s) => (
                <li key={s.id}>
                  <span>{s.name}</span>
                  <span className="text-[11px] text-muted">{s.contact_email || "—"}</span>
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
