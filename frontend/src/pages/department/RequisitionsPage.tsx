import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ConfigField, ConfigStatus, ConfirmAction, onTabListKeyDown } from "@/components/config/ConfigUi";
import { EmptyState } from "@/components/EmptyState";
import { useAnnounce } from "@/components/ui/sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { hasEffectivePermission } from "@/lib/nav";
import type { InventoryItem, Requisition, StockLocation, WarehouseAlerts } from "@/lib/types";

const DEPARTMENTS = [
  { id: "restorative", label: "Restorative" },
  { id: "maxillofacial", label: "Maxillofacial" },
  { id: "orthodontic", label: "Orthodontic" },
  { id: "paediatric", label: "Paediatric" },
  { id: "hygiene", label: "Hygiene" },
  { id: "pharmacy", label: "Pharmacy" },
  { id: "lab", label: "Lab" },
  { id: "front_desk", label: "Front desk" },
] as const;

const VIEWS = [
  { id: "requests", label: "Requests" },
  { id: "raise", label: "Raise request" },
  { id: "alerts", label: "Stock alerts" },
] as const;

type View = (typeof VIEWS)[number]["id"];

function titleCase(value?: string | null) {
  if (!value) return "—";
  return value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
}

function statusTone(status: string) {
  if (status === "fulfilled") return "status-pill--success";
  if (status === "approved" || status === "submitted") return "status-pill--info";
  if (status === "rejected" || status === "cancelled") return "status-pill--danger";
  return "status-pill--warning";
}

function whenLabel(iso?: string | null) {
  if (!iso) return "—";
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : at.toLocaleString();
}

export function RequisitionsPage() {
  const role = useAuth((s) => s.user?.role);
  const perms = useAuth((s) => s.user?.effective_permissions);
  const isStore = role === "clinic_admin" || role === "super_admin" || role === "pharmacy";
  const canCreate = hasEffectivePermission(perms, "requisition:create") || hasEffectivePermission(perms, "requisition:*");
  const canApprove = isStore || hasEffectivePermission(perms, "requisition:approve") || hasEffectivePermission(perms, "requisition:*");

  const [view, setView] = useState<View>(canCreate && !canApprove ? "raise" : "requests");
  const [rows, setRows] = useState<Requisition[]>([]);
  const [alerts, setAlerts] = useState<WarehouseAlerts | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [statusFilter, setStatusFilter] = useState("open");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  useAnnounce(error);
  useAnnounce(ok);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [req, al, stock, loc] = await Promise.all([
        api<Requisition[]>(`/api/v1/requisitions?status=${encodeURIComponent(statusFilter)}`),
        api<WarehouseAlerts>("/api/v1/inventory/alerts").catch(() => null),
        api<InventoryItem[]>("/api/v1/inventory").catch(() => [] as InventoryItem[]),
        api<StockLocation[]>("/api/v1/inventory/locations").catch(() => [] as StockLocation[]),
      ]);
      setRows(req);
      setAlerts(al);
      setItems(stock.filter((row) => row.item_kind !== "service" && row.is_active));
      setLocations(loc);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load requisitions");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCount = alerts?.open_requisitions ?? rows.filter((r) => ["draft", "submitted", "approved"].includes(r.status)).length;

  return (
    <div className="clin-shell admin-shell animate-rise space-y-3">
      <div className="clin-head">
        <div>
          <h2 className="font-display text-xl font-bold leading-tight text-brand-900">Requisitions</h2>
          <p className="text-sm text-muted">
            Chair-side supply requests to the store. The inventory manager approves and issues them in Warehouse.
          </p>
        </div>
        <div className="admin-counts" role="status" aria-label="Requisition summary">
          <span className="admin-count">
            <strong>{openCount}</strong> open
          </span>
          <span className={`admin-count ${(alerts?.low_stock.length || 0) ? "admin-count--alert" : ""}`}>
            <strong>{alerts?.low_stock.length ?? 0}</strong> low stock
          </span>
          <span className={`admin-count ${(alerts?.expiring.length || 0) ? "admin-count--alert" : ""}`}>
            <strong>{alerts?.expiring.length ?? 0}</strong> expiring
          </span>
        </div>
      </div>

      <div
        className="admin-tabs"
        role="tablist"
        aria-label="Requisition sections"
        onKeyDown={(e) =>
          onTabListKeyDown(e, VIEWS.map((v) => v.id), view, (id) => {
            setView(id);
            queueMicrotask(() => document.getElementById(`req-tab-${id}`)?.focus());
          })
        }
      >
        {VIEWS.map((tab) => (
          <button
            key={tab.id}
            id={`req-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={view === tab.id}
            tabIndex={view === tab.id ? 0 : -1}
            className={`admin-tab ${view === tab.id ? "admin-tab--on" : ""}`}
            onClick={() => setView(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <ConfigStatus loading={loading} error={error} ok={ok} />

      {view === "requests" && (
        <RequestList
          rows={rows}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          canCreate={canCreate}
          isStore={isStore}
          onReload={load}
          setError={setError}
          setOk={setOk}
        />
      )}
      {view === "raise" && (
        <RaiseForm
          items={items}
          locations={locations}
          canCreate={canCreate}
          onCreated={async () => {
            setView("requests");
            setStatusFilter("open");
            setOk("Request sent to the store.");
            await load();
          }}
          setError={setError}
        />
      )}
      {view === "alerts" && <AlertsPanel alerts={alerts} onRaiseFromLow={() => setView("raise")} />}
    </div>
  );
}

function RequestList({
  rows,
  statusFilter,
  setStatusFilter,
  canCreate,
  isStore,
  onReload,
  setError,
  setOk,
}: {
  rows: Requisition[];
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  canCreate: boolean;
  isStore: boolean;
  onReload: () => Promise<void>;
  setError: (v: string) => void;
  setOk: (v: string) => void;
}) {
  async function act(path: string, okMsg: string, body?: object) {
    setError("");
    setOk("");
    try {
      await api(path, { method: "POST", body: JSON.stringify(body || {}) });
      setOk(okMsg);
      await onReload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update that requisition");
    }
  }

  return (
    <section className="glass-panel space-y-3 rounded-2xl p-4">
      {isStore && (
        <p className="text-sm text-muted">
          Approve and issue from <Link to="/inventory?view=requests">Warehouse store requests</Link>.
        </p>
      )}
      <label className="text-sm">
        <span className="label">Show</span>
        <select className="input max-w-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="open">Open (draft, submitted, approved)</option>
          <option value="submitted">Submitted</option>
          <option value="approved">Approved — ready to issue</option>
          <option value="fulfilled">Fulfilled</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
          <option value="all">All</option>
        </select>
      </label>
      {rows.length === 0 ? (
        <EmptyState title="No requisitions in this list" hint="Raise a request from the chair when a bay is short of stock." />
      ) : (
        <div className="admin-scroll">
          <table className="admin-table">
            <caption className="sr-only">Internal supply requisitions</caption>
            <thead>
              <tr>
                <th className="rec-num">#</th>
                <th>Number</th>
                <th>Department</th>
                <th>Status</th>
                <th>Lines</th>
                <th>Requested by</th>
                <th>When</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id}>
                  <td className="rec-num">{index + 1}</td>
                  <td className="font-mono text-xs">{row.req_number}</td>
                  <td>{titleCase(row.department)}</td>
                  <td>
                    <span className={`status-pill ${statusTone(row.status)}`}>{titleCase(row.status)}</span>
                  </td>
                  <td className="text-sm">
                    {row.lines.map((line) => (
                      <div key={line.id}>
                        {line.item_name || line.sku}
                        {" · in store "}
                        {line.store_on_hand ?? "—"}
                        {" · requested "}
                        {line.quantity_requested}
                        {" · issued "}
                        {line.quantity_issued}
                        {(line.shortfall || 0) > 0 ? ` · short ${line.shortfall}` : ""}
                      </div>
                    ))}
                  </td>
                  <td>{row.requested_by_name || "—"}</td>
                  <td className="text-xs">{whenLabel(row.submitted_at || row.created_at)}</td>
                  <td className="text-right">
                    <div className="inline-flex flex-wrap justify-end gap-1">
                      {row.status === "draft" && canCreate && (
                        <button
                          type="button"
                          className="btn-ghost text-xs"
                          onClick={() => void act(`/api/v1/requisitions/${row.id}/submit`, `Submitted ${row.req_number}`)}
                        >
                          Submit
                        </button>
                      )}
                      {(row.status === "draft" || row.status === "submitted") && canCreate && (
                        <ConfirmAction
                          label="Cancel"
                          confirmLabel="Yes, cancel"
                          onConfirm={() =>
                            act(`/api/v1/requisitions/${row.id}/cancel`, `Cancelled ${row.req_number}`, {
                              reason: "Cancelled by requester",
                            })
                          }
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function RaiseForm({
  items,
  locations,
  canCreate,
  onCreated,
  setError,
}: {
  items: InventoryItem[];
  locations: StockLocation[];
  canCreate: boolean;
  onCreated: () => Promise<void>;
  setError: (v: string) => void;
}) {
  const [department, setDepartment] = useState("restorative");
  const [locationId, setLocationId] = useState("");
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Array<{ inventory_item_id: string; quantity: number; label: string }>>([]);
  const [busy, setBusy] = useState(false);

  const selected = useMemo(() => items.find((i) => i.id === itemId), [items, itemId]);

  useEffect(() => {
    if (!itemId && items[0]) setItemId(items[0].id);
  }, [items, itemId]);

  function addLine() {
    if (!selected || qty <= 0) return;
    setLines((prev) => {
      const existing = prev.find((row) => row.inventory_item_id === selected.id);
      if (existing) {
        return prev.map((row) =>
          row.inventory_item_id === selected.id ? { ...row, quantity: row.quantity + qty } : row,
        );
      }
      return [...prev, { inventory_item_id: selected.id, quantity: qty, label: `${selected.sku} · ${selected.name}` }];
    });
    setQty(1);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canCreate || lines.length === 0) return;
    setBusy(true);
    setError("");
    try {
      await api<Requisition>("/api/v1/requisitions", {
        method: "POST",
        body: JSON.stringify({
          department,
          destination_location_id: locationId || null,
          notes: notes || null,
          submit: true,
          lines: lines.map((row) => ({ inventory_item_id: row.inventory_item_id, quantity: row.quantity })),
        }),
      });
      setLines([]);
      setNotes("");
      await onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not raise that requisition");
    } finally {
      setBusy(false);
    }
  }

  if (!canCreate) {
    return (
      <EmptyState
        title="You cannot raise requisitions"
        hint="Ask clinic admin to grant requisition:create if this bay should request stock."
      />
    );
  }

  return (
    <form className="glass-panel grid gap-3 p-4 md:grid-cols-2" onSubmit={onSubmit}>
      <ConfigField label="Requesting department">
        <select className="input" value={department} onChange={(e) => setDepartment(e.target.value)} required>
          {DEPARTMENTS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </ConfigField>
      <ConfigField label="Deliver to location" hint="Leave as department default if unsure">
        <select className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
          <option value="">Department default</option>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
            </option>
          ))}
        </select>
      </ConfigField>
      <ConfigField label="Supply">
        <select className="input" value={itemId} onChange={(e) => setItemId(e.target.value)}>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.sku} · {item.name} (on hand {item.quantity})
            </option>
          ))}
        </select>
      </ConfigField>
      <ConfigField label="Quantity">
        <div className="flex gap-2">
          <input
            className="input"
            type="number"
            min={0.01}
            step="0.01"
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
          />
          <button type="button" className="btn-ghost shrink-0" onClick={addLine}>
            Add line
          </button>
        </div>
      </ConfigField>
      <ConfigField label="Notes (optional)" hint="e.g. Chair 2, afternoon list">
        <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </ConfigField>
      <div className="md:col-span-2">
        {lines.length === 0 ? (
          <p className="text-sm text-muted">Add at least one supply line.</p>
        ) : (
          <ul className="divide-y divide-brand-100">
            {lines.map((line) => (
              <li key={line.inventory_item_id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  {line.label} × {line.quantity}
                </span>
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  onClick={() => setLines((prev) => prev.filter((row) => row.inventory_item_id !== line.inventory_item_id))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="md:col-span-2">
        <button className="btn-primary" type="submit" disabled={busy || lines.length === 0}>
          {busy ? "Sending…" : "Send to store"}
        </button>
      </div>
    </form>
  );
}

function AlertsPanel({
  alerts,
  onRaiseFromLow,
}: {
  alerts: WarehouseAlerts | null;
  onRaiseFromLow: () => void;
}) {
  if (!alerts) {
    return <EmptyState title="Alerts unavailable" hint="Inventory read permission is needed for low-stock and expiry lists." />;
  }
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="glass-panel space-y-2 p-4">
        <h3 className="font-display text-base font-bold text-brand-900">Below reorder level</h3>
        <p className="text-sm text-muted">Flagged automatically when on-hand drops to the minimum.</p>
        {alerts.low_stock.length === 0 ? (
          <p className="text-sm text-muted">No SKUs are below reorder.</p>
        ) : (
          <ul className="divide-y divide-brand-100">
            {alerts.low_stock.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span>
                  <span className="status-pill status-pill--warning mr-2">Low</span>
                  {row.sku} {row.name} ({row.quantity} / min {row.reorder_level})
                </span>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="btn-ghost text-sm" onClick={onRaiseFromLow}>
          Raise a request
        </button>
      </section>
      <section className="glass-panel space-y-2 p-4">
        <h3 className="font-display text-base font-bold text-brand-900">Expiry</h3>
        <p className="text-sm text-muted">Lots due within 90 days. Expired lots must not be issued.</p>
        {alerts.expired.length > 0 && (
          <ul className="divide-y divide-brand-100">
            {alerts.expired.map((row) => (
              <li key={row.lot_id} className="py-2 text-sm">
                <span className="status-pill status-pill--danger mr-2">Expired</span>
                {row.sku} {row.name} · {row.lot_code} · {row.expiry_date}
              </li>
            ))}
          </ul>
        )}
        {alerts.expiring.length === 0 ? (
          <p className="text-sm text-muted">No lots expiring in the next 90 days.</p>
        ) : (
          <ul className="divide-y divide-brand-100">
            {alerts.expiring
              .filter((row) => !alerts.expired.some((ex) => ex.lot_id === row.lot_id))
              .map((row) => (
                <li key={row.lot_id} className="py-2 text-sm">
                  <span className="status-pill status-pill--warning mr-2">Expiring</span>
                  {row.sku} {row.name} · {row.lot_code} · {row.expiry_date} ({row.quantity})
                </li>
              ))}
          </ul>
        )}
        <Link className="btn-ghost inline-flex text-sm" to="/inventory?view=analysis">
          Open warehouse analysis
        </Link>
      </section>
    </div>
  );
}
