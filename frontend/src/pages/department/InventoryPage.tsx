import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { ConfigField, ConfigStatus, ConfirmAction, onTabListKeyDown } from "@/components/config/ConfigUi";
import { EmptyState } from "@/components/EmptyState";
import { useAnnounce } from "@/components/ui/sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/i18n";
import { hasEffectivePermission } from "@/lib/nav";
import type {
  InventoryItem,
  Patient,
  PurchaseOrder,
  Requisition,
  StockLocation,
  StockMovement,
  SupplierHistory,
  WarehouseAnalysis,
  WarehouseSupplier,
} from "@/lib/types";
import { useUiPrefs } from "@/lib/uiPrefs";
import { WarehouseAnalysisPanel } from "@/pages/department/WarehouseAnalysisPanel";
import { AddSkuDialog, EditSkuDialog, ImportSkuDialog } from "@/pages/department/SkuDialogs";

type View =
  | "overview"
  | "requests"
  | "stock"
  | "receive"
  | "issues"
  | "orders"
  | "suppliers"
  | "movements"
  | "analysis"
  | "fees";

const VIEWS: { id: View; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "requests", label: "Store requests" },
  { id: "stock", label: "Stock" },
  { id: "receive", label: "Receive" },
  { id: "issues", label: "Issues" },
  { id: "orders", label: "Purchase orders" },
  { id: "suppliers", label: "Suppliers" },
  { id: "movements", label: "Movements" },
  { id: "analysis", label: "Analysis" },
  { id: "fees", label: "Registration fees" },
];

function expiryRequired(item?: InventoryItem | null) {
  if (!item) return true;
  if (item.item_kind === "service") return false;
  return item.requires_expiry !== false;
}

const emptyFee = {
  sku: "",
  name: "",
  category: "registration",
  quantity: 0,
  reorder_level: 0,
  unit: "visit",
  unit_cost: 0,
  sale_price: 0,
  item_kind: "service",
  billable_at_registration: true,
  target_department: "",
};

function parseView(raw: string | null): View {
  return VIEWS.some((v) => v.id === raw) ? (raw as View) : "overview";
}

export function InventoryPage() {
  const [params, setParams] = useSearchParams();
  const view = parseView(params.get("view"));
  const role = useAuth((s) => s.user?.role);
  const perms = useAuth((s) => s.user?.effective_permissions);
  const canManage = role === "clinic_admin" || role === "super_admin";
  const canIssue = canManage || role === "dentist" || role === "pharmacy" || role === "hygienist";
  const canApprove =
    canManage || role === "pharmacy" || hasEffectivePermission(perms, "requisition:approve");
  const canFulfill =
    canManage ||
    role === "pharmacy" ||
    hasEffectivePermission(perms, "requisition:fulfill") ||
    hasEffectivePermission(perms, "inventory:issue");
  const currency = useUiPrefs((s) => s.currency);
  const locale = useUiPrefs((s) => s.locale);
  const money = (n: number) => formatMoney(n, currency, locale);

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [suppliers, setSuppliers] = useState<WarehouseSupplier[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [analysis, setAnalysis] = useState<WarehouseAnalysis | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [error, setError] = useState("");
  useAnnounce(error);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [stockStatus, setStockStatus] = useState<"all" | "low" | "short" | "hidden">("all");

  function setView(next: View) {
    const nextParams = new URLSearchParams(params);
    if (next === "overview") nextParams.delete("view");
    else nextParams.set("view", next);
    setParams(nextParams, { replace: true });
  }

  async function load() {
    try {
      const [i, loc, s, po, mv, an] = await Promise.all([
        api<InventoryItem[]>("/api/v1/inventory?include_inactive=true"),
        api<StockLocation[]>("/api/v1/inventory/locations"),
        api<WarehouseSupplier[]>("/api/v1/inventory/suppliers?include_inactive=true"),
        api<PurchaseOrder[]>("/api/v1/inventory/purchase-orders"),
        api<StockMovement[]>("/api/v1/inventory/movements"),
        api<WarehouseAnalysis>("/api/v1/inventory/analysis"),
      ]);
      setItems(i);
      setLocations(loc);
      setSuppliers(s);
      setOrders(po);
      setMovements(mv);
      setAnalysis(an);
      setError("");
    } catch (err: unknown) {
      setError(explainFailure(err, "load the warehouse"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    api<{ items: Patient[] }>("/api/v1/patients?limit=80")
      .then((p) => setPatients(p.items))
      .catch(() => setPatients([]));
  }, []);

  const stockItems = useMemo(() => items.filter((i) => i.item_kind !== "service"), [items]);
  const feeItems = useMemo(() => items.filter((i) => i.billable_at_registration || i.item_kind === "service"), [items]);
  const mainId = locations.find((l) => l.code === "MAIN")?.id;

  return (
    <div className="clin-shell admin-shell animate-rise space-y-3">
      <div className="clin-head">
        <div>
          <h2 className="font-display text-xl font-bold leading-tight text-brand-900">Warehouse</h2>
          <p className="text-sm text-muted">Stock, store requests, receiving, issues, and purchase orders.</p>
        </div>
        <div className="admin-counts" role="group" aria-label="Warehouse summaries">
          <button type="button" className={`admin-count ${view === "stock" ? "admin-count--on" : ""}`} onClick={() => setView("stock")}>
            <strong>{analysis?.sku_count ?? stockItems.length}</strong> SKUs
          </button>
          <button type="button" className={`admin-count ${view === "analysis" ? "admin-count--on" : ""}`} onClick={() => setView("analysis")}>
            <strong>{money(analysis?.on_hand_value || 0)}</strong> on hand
          </button>
          <button type="button" className={`admin-count ${(analysis?.low_stock_count || 0) ? "admin-count--alert" : ""} ${view === "stock" && stockStatus === "low" ? "admin-count--on" : ""}`} onClick={() => { setStockStatus("low"); setView("stock"); }}>
            <strong>{analysis?.low_stock_count ?? 0}</strong> low
          </button>
          <button type="button" className={`admin-count ${(analysis?.expiring_count || 0) ? "admin-count--alert" : ""}`} onClick={() => setView("analysis")}>
            <strong>{analysis?.expiring_count ?? 0}</strong> expiring
          </button>
          <button
            type="button"
            className={`admin-count ${(analysis?.open_requisitions || 0) ? "admin-count--alert" : ""} ${view === "requests" ? "admin-count--on" : ""}`}
            onClick={() => setView("requests")}
          >
            <strong>{analysis?.open_requisitions ?? 0}</strong> requests
          </button>
        </div>
      </div>

      <div
        className="admin-tabs"
        role="tablist"
        aria-label="Warehouse views"
        onKeyDown={(e) =>
          onTabListKeyDown(
            e,
            VIEWS.map((tab) => tab.id),
            view,
            (id) => {
              setView(id);
              queueMicrotask(() => document.getElementById(`wh-tab-${id}`)?.focus());
            },
          )
        }
      >
        {VIEWS.map((tab) => (
          <button
            key={tab.id}
            id={`wh-tab-${tab.id}`}
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

      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      {loading && items.length === 0 && <WarehouseSkeleton />}

      {(!loading || items.length > 0) && view === "overview" && (
        <OverviewPanel analysis={analysis} money={money} onJump={setView} />
      )}
      {(!loading || items.length > 0) && view === "requests" && (
        <StoreRequestsPanel canApprove={canApprove} canFulfill={canFulfill} onChanged={load} />
      )}
      {(!loading || items.length > 0) && view === "stock" && (
        <StockPanel
          items={stockItems}
          locations={locations}
          query={query}
          setQuery={setQuery}
          stockStatus={stockStatus}
          setStockStatus={setStockStatus}
          canManage={canManage}
          canIssue={canIssue}
          money={money}
          onReload={load}
          setError={setError}
        />
      )}
      {(!loading || items.length > 0) && view === "receive" && (
        <ReceivePanel
          items={stockItems}
          locations={locations}
          suppliers={suppliers}
          canIssue={canIssue}
          defaultLocation={mainId}
          onReload={load}
          setError={setError}
        />
      )}
      {(!loading || items.length > 0) && view === "issues" && (
        <IssuePanel
          items={stockItems}
          locations={locations}
          patients={patients}
          canIssue={canIssue}
          defaultLocation={mainId}
          onReload={load}
          setError={setError}
        />
      )}
      {(!loading || items.length > 0) && view === "orders" && (
        <OrdersPanel
          orders={orders}
          items={stockItems}
          suppliers={suppliers.filter((s) => s.is_active)}
          lowStock={analysis?.low_stock || []}
          canManage={canManage}
          canIssue={canIssue}
          onReload={load}
          setError={setError}
        />
      )}
      {(!loading || items.length > 0) && view === "suppliers" && (
        <SuppliersPanel suppliers={suppliers} canManage={canManage} onReload={load} setError={setError} />
      )}
      {(!loading || items.length > 0) && view === "movements" && <MovementsPanel movements={movements} items={items} locations={locations} />}
      {(!loading || items.length > 0) && view === "analysis" && <WarehouseAnalysisPanel />}
      {(!loading || items.length > 0) && view === "fees" && (
        <FeesPanel items={feeItems} canManage={canManage} money={money} onReload={load} setError={setError} />
      )}
    </div>
  );
}

function reqStatus(value?: string | null) {
  return (value || "").trim().toLowerCase();
}

function explainFailure(err: unknown, action: string) {
  const detail = err instanceof Error ? err.message.trim() : "";
  const lead = detail && !/^error\s*\d+/i.test(detail) ? detail : `Could not ${action}.`;
  if (/try again\.?$/i.test(lead)) return lead;
  return `${lead} Check your connection and try again.`;
}

function WarehouseSkeleton() {
  return (
    <div className="glass-panel space-y-2 p-4" aria-busy="true" aria-live="polite">
      <p className="text-sm text-muted">Loading warehouse…</p>
      {["one", "two", "three", "four", "five"].map((row) => (
        <div key={row} className="h-11 animate-pulse rounded-xl bg-brand-50" />
      ))}
    </div>
  );
}

function qtyLabel(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "—";
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function outstandingOf(line: Requisition["lines"][number]) {
  return line.quantity_outstanding ?? Math.max(line.quantity_requested - line.quantity_issued, 0);
}

function maxIssue(line: Requisition["lines"][number]) {
  return Math.max(0, Math.min(outstandingOf(line), line.store_on_hand ?? 0));
}

function linesToIssue(row: Requisition, drafts: Record<string, string>) {
  const lines: { line_id: string; quantity: number }[] = [];
  for (const line of row.lines) {
    const cap = maxIssue(line);
    if (cap <= 0) continue;
    const raw = drafts[line.id];
    const quantity = raw == null || raw.trim() === "" ? cap : Number(raw);
    const name = line.item_name || line.sku || "This item";
    if (!Number.isFinite(quantity) || quantity < 0) {
      return { lines: [], error: `Enter an issue quantity for ${name}.` };
    }
    if (quantity - cap > 1e-9) {
      return { lines: [], error: `Issue at most ${qtyLabel(cap)} ${line.unit || ""} of ${name}.`.replace(/\s+/g, " ") };
    }
    if (quantity > 0) lines.push({ line_id: line.id, quantity });
  }
  return { lines, error: "" };
}

function StoreRequestsPanel({
  canApprove,
  canFulfill,
  onChanged,
}: {
  canApprove: boolean;
  canFulfill: boolean;
  onChanged: () => Promise<void>;
}) {
  const [rows, setRows] = useState<Requisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [issueDraft, setIssueDraft] = useState<Record<string, string>>({});

  async function loadInbox() {
    const data = await api<Requisition[]>("/api/v1/requisitions?status=open");
    setRows(data.filter((row) => ["submitted", "approved"].includes(reqStatus(row.status))));
  }

  useEffect(() => {
    setLoading(true);
    setError("");
    loadInbox()
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load store requests"))
      .finally(() => setLoading(false));
  }, []);

  async function act(id: string, path: string, okMsg: string, body?: object) {
    setError("");
    setOk("");
    setBusyId(id);
    try {
      await api(path, body ? { method: "POST", body: JSON.stringify(body) } : { method: "POST" });
      setOk(okMsg);
      await loadInbox();
      try {
        await onChanged();
      } catch {
        /* The request itself was saved. The warehouse totals refresh on the next load. */
      }
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "That action failed");
      return false;
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="glass-panel space-y-3 p-4">
      <div>
        <h3 className="reg-section__title">Store requests</h3>
        <p className="text-sm text-muted">
          In store is the main store. Change Issue now to send less than requested. Anything left stays on the request.
        </p>
      </div>
      <ConfigStatus loading={loading} error={error} ok={ok} />
      {!loading && !rows.length && (
        <EmptyState
          title="No requests at the store"
          hint="When a department submits a requisition, it appears here for the inventory manager."
        />
      )}
      {rows.length > 0 && (
      <ul className="admin-scroll space-y-2">
        {rows.map((row, index) => {
          const status = reqStatus(row.status);
          const busy = busyId === row.id;
          const canSend = row.lines.some((line) => maxIssue(line) > 0);
          const destination = row.destination_location_name || (row.department || "department").replaceAll("_", " ");
          return (
            <li key={row.id} className="rounded-2xl border border-border bg-canvas p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-brand-900">
                    <span className="rec-num">{index + 1}</span> {row.req_number}
                  </p>
                  <p className="text-sm text-muted">
                    To {destination} · {row.requested_by_name || "Unknown requester"}
                    {row.submitted_at ? ` · ${new Date(row.submitted_at).toLocaleString()}` : ""}
                  </p>
                </div>
                <span className={`status-pill ${status === "approved" ? "status-pill--info" : "status-pill--warning"}`}>
                  {status === "approved" ? "Approved" : "Submitted"}
                </span>
              </div>
              <div className="admin-scroll mt-2">
                <table className="admin-table">
                  <caption className="sr-only">Quantities for {row.req_number}</caption>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>In store</th>
                      <th>Requested</th>
                      <th>Issued</th>
                      <th>Still to issue</th>
                      {status === "approved" && canFulfill && <th>Issue now</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {row.lines.map((line) => {
                      const outstanding = outstandingOf(line);
                      const cap = maxIssue(line);
                      const name = line.item_name || line.sku || "Item";
                      return (
                        <tr key={line.id}>
                          <td>
                            {name}
                            {(line.shortfall || 0) > 0 && <span className="status-pill status-pill--warning ml-2">Short {qtyLabel(line.shortfall)}</span>}
                          </td>
                          <td>{qtyLabel(line.store_on_hand)} {line.unit || ""}</td>
                          <td>{qtyLabel(line.quantity_requested)} {line.unit || ""}</td>
                          <td>{qtyLabel(line.quantity_issued)} {line.unit || ""}</td>
                          <td>{qtyLabel(outstanding)} {line.unit || ""}</td>
                          {status === "approved" && canFulfill && (
                            <td>
                              <label className="text-sm">
                                <span className="sr-only">Issue now for {name}</span>
                                <input
                                  className="input w-28"
                                  type="number"
                                  min={0}
                                  max={cap}
                                  step="any"
                                  inputMode="decimal"
                                  value={issueDraft[line.id] ?? String(cap)}
                                  disabled={busy || cap <= 0}
                                  onChange={(e) => setIssueDraft({ ...issueDraft, [line.id]: e.target.value })}
                                />
                              </label>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-2" role="group" aria-label={`Actions for ${row.req_number}`}>
                {status === "submitted" && canApprove && (
                  <>
                    <label className="text-sm">
                      <span className="label">Reject reason</span>
                      <input
                        className="input"
                        value={reasons[row.id] || ""}
                        onChange={(e) => setReasons({ ...reasons, [row.id]: e.target.value })}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={busy}
                      onClick={() => void act(row.id, `/api/v1/requisitions/${row.id}/approve`, `Approved ${row.req_number}`)}
                    >
                      Approve
                    </button>
                    <ConfirmAction
                      label="Reject"
                      confirmLabel="Yes, reject"
                      onConfirm={() => {
                        void act(row.id, `/api/v1/requisitions/${row.id}/reject`, `Rejected ${row.req_number}`, {
                          reason: (reasons[row.id] || "").trim() || undefined,
                        });
                      }}
                    />
                  </>
                )}
                {status === "approved" && canFulfill && (
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={busy || !canSend}
                    onClick={() => {
                      const planned = linesToIssue(row, issueDraft);
                      if (planned.error) {
                        setOk("");
                        setError(planned.error);
                        return;
                      }
                      if (!planned.lines.length) {
                        setOk("");
                        setError("Enter how many to issue. Use less than requested when the department should receive less.");
                        return;
                      }
                      const leavingSome = row.lines.some((line) => {
                        const sent = planned.lines.find((item) => item.line_id === line.id)?.quantity ?? 0;
                        return sent + 1e-9 < outstandingOf(line);
                      });
                      void act(
                        row.id,
                        `/api/v1/requisitions/${row.id}/fulfill`,
                        leavingSome
                          ? `Issued the chosen quantity for ${row.req_number}. The rest stays requested.`
                          : `Issued ${row.req_number}`,
                        { lines: planned.lines },
                      ).then((saved) => {
                        if (!saved) return;
                        setIssueDraft((prev) => {
                          const next = { ...prev };
                          for (const line of planned.lines) delete next[line.line_id];
                          return next;
                        });
                      });
                    }}
                  >
                    Issue to department
                  </button>
                )}
                {status === "approved" && canFulfill && !canSend && (
                  <p className="text-sm text-muted">The main store has none of the remaining items.</p>
                )}
                {status === "submitted" && !canApprove && (
                  <p className="text-sm text-muted">Waiting for the inventory manager to approve this request.</p>
                )}
                {status === "approved" && !canFulfill && (
                  <p className="text-sm text-muted">Approved. The store can issue this stock.</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      )}
    </section>
  );
}

function OverviewPanel({
  analysis,
  money,
  onJump,
}: {
  analysis: WarehouseAnalysis | null;
  money: (n: number) => string;
  onJump: (v: View) => void;
}) {
  if (!analysis) return <EmptyState title="Loading warehouse" hint="On-hand value and alerts appear here." />;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="glass-panel space-y-2 p-4">
        <h3 className="reg-section__title">Alerts</h3>
        <p className="text-sm text-muted">
          {analysis.low_stock_count} below reorder · {analysis.expiring_count} lots expiring · {analysis.open_pos} open POs
          {(analysis.open_requisitions || 0) > 0 ? ` · ${analysis.open_requisitions} open chair requests` : ""}
        </p>
        {analysis.low_stock.slice(0, 6).map((row) => (
          <button key={row.id} type="button" className="admin-list w-full text-left" onClick={() => onJump("stock")}>
            <span className="status-pill status-pill--warning">Low</span> {row.sku} {row.name} ({row.quantity})
          </button>
        ))}
        {!analysis.low_stock.length && <p className="text-sm text-muted">No low-stock SKUs.</p>}
        <button type="button" className="btn-ghost text-sm" onClick={() => onJump("requests")}>
          Open store requests
        </button>
      </section>
      <section className="glass-panel space-y-2 p-4">
        <h3 className="reg-section__title">Value</h3>
        <p className="text-lg font-semibold">{money(analysis.on_hand_value)} on hand</p>
        <p className="text-sm text-muted">COGS 90d {money(analysis.cogs_90d)} · billed supplies {money(analysis.billed_supply_revenue)}</p>
        <button type="button" className="btn-ghost text-sm" onClick={() => onJump("analysis")}>Open analysis</button>
      </section>
    </div>
  );
}

function StockMarks({ item, inStore, requested }: { item: InventoryItem; inStore: number; requested: number }) {
  return (
    <>
      {inStore <= item.reorder_level && <span className="status-pill status-pill--warning ml-2">Low</span>}
      {requested > inStore && <span className="status-pill status-pill--warning ml-2">Short</span>}
      {item.expiry_date && <span className="status-pill status-pill--warning ml-2">Exp {item.expiry_date}</span>}
      {item.track_lots && <span className="status-pill ml-2">Lots</span>}
      {expiryRequired(item) && <span className="status-pill ml-2">Expiry required</span>}
      {!item.is_active && <span className="status-pill ml-2">Hidden</span>}
    </>
  );
}

interface StockActionsProps {
  item: InventoryItem;
  canIssue: boolean;
  canManage: boolean;
  onAdjust: (id: string, delta: number) => void;
  onEdit: (item: InventoryItem) => void;
  onToggle: (item: InventoryItem) => Promise<void>;
}

function StockActions({ item, canIssue, canManage, onAdjust, onEdit, onToggle }: StockActionsProps) {
  return (
    <div className="flex flex-wrap gap-1">
      {canIssue && (
        <>
          <button type="button" className="btn-ghost" aria-label={`Add one ${item.name}`} onClick={() => onAdjust(item.id, 1)}>+1</button>
          <button type="button" className="btn-ghost" aria-label={`Remove one ${item.name}`} onClick={() => onAdjust(item.id, -1)}>-1</button>
        </>
      )}
      {canManage && (
        <>
          <button type="button" className="btn-ghost" onClick={() => onEdit(item)}>Edit</button>
          {item.is_active ? (
            <ConfirmAction label="Hide" confirmLabel="Hide SKU" onConfirm={() => onToggle(item)} />
          ) : (
            <button type="button" className="btn-ghost" onClick={() => void onToggle(item)}>Show</button>
          )}
        </>
      )}
    </div>
  );
}

function StockPanel({
  items,
  locations,
  query,
  setQuery,
  stockStatus,
  setStockStatus,
  canManage,
  canIssue,
  money,
  onReload,
  setError,
}: {
  items: InventoryItem[];
  locations: StockLocation[];
  query: string;
  setQuery: (v: string) => void;
  stockStatus: "all" | "low" | "short" | "hidden";
  setStockStatus: (v: "all" | "low" | "short" | "hidden") => void;
  canManage: boolean;
  canIssue: boolean;
  money: (n: number) => string;
  onReload: () => Promise<void>;
  setError: (v: string) => void;
}) {
  const [edit, setEdit] = useState<InventoryItem | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [kind, setKind] = useState("all");
  const [notice, setNotice] = useState("");
  const closeAdd = useCallback(() => setAddOpen(false), []);
  const closeImport = useCallback(() => setImportOpen(false), []);
  const closeEdit = useCallback(() => setEdit(null), []);
  const cats = Array.from(new Set(items.map((i) => i.category))).sort();
  const visible = items.filter((i) => {
    const hay = `${i.sku} ${i.name} ${i.category}`.toLowerCase();
    if (query && !hay.includes(query.toLowerCase())) return false;
    if (kind !== "all" && i.category !== kind) return false;
    const inStore = i.store_on_hand ?? i.quantity;
    const requested = i.quantity_requested_open ?? 0;
    if (stockStatus === "low" && inStore > i.reorder_level) return false;
    if (stockStatus === "short" && requested <= inStore) return false;
    if (stockStatus === "hidden" && i.is_active) return false;
    return true;
  });

  async function toggleHidden(item: InventoryItem) {
    try {
      await api(`/api/v1/inventory/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !item.is_active }),
      });
      await onReload();
    } catch (err: unknown) {
      setError(explainFailure(err, "update this SKU"));
    }
  }

  async function adjust(id: string, delta: number) {
    try {
      await api(`/api/v1/inventory/${id}/adjust`, { method: "POST", body: JSON.stringify({ delta, reason: "manual" }) });
      await onReload();
    } catch (err: unknown) {
      setError(explainFailure(err, "adjust this quantity"));
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[14rem] flex-1 text-sm">
          <span className="label">Search stock</span>
          <span className="search-field">
            <Search className="search-field__icon" aria-hidden="true" />
            <input
              className="input"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="SKU or name"
            />
          </span>
        </label>
        <label className="text-sm">
          <span className="label">Category</span>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="all">All categories</option>
            {cats.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="label">Show</span>
          <select className="input" value={stockStatus} onChange={(e) => setStockStatus(e.target.value as "all" | "low" | "short" | "hidden")}>
            <option value="all">All SKUs</option>
            <option value="low">Low in store</option>
            <option value="short">Short for requests</option>
            <option value="hidden">Hidden</option>
          </select>
        </label>
        {canManage && (
          <>
            <button type="button" className="btn-primary" onClick={() => setAddOpen(true)}>Add SKU</button>
            <button type="button" className="btn-ghost" onClick={() => setImportOpen(true)}>Import SKUs</button>
          </>
        )}
      </div>
      <ConfigStatus ok={notice} />
      <p className="text-sm text-muted" aria-live="polite">
        {visible.length} of {items.length} SKUs. The list filters as you type.
      </p>
      {!visible.length && (
        <EmptyState
          title={query || kind !== "all" || stockStatus !== "all" ? "No matching SKUs" : "No stock SKUs"}
          hint={query || kind !== "all" || stockStatus !== "all" ? "Clear the search or filters." : "Add gloves, composites, and anesthetics here."}
        />
      )}
      <ul className="space-y-2 md:hidden">
        {visible.map((item) => {
          const inStore = item.store_on_hand ?? item.quantity;
          const requested = item.quantity_requested_open ?? 0;
          const issued = item.quantity_issued_open ?? 0;
          return (
            <li key={item.id} className="rounded-2xl border border-border bg-canvas p-3">
              <p className="font-mono text-sm text-muted">{item.sku}</p>
              <p className="text-base font-semibold text-text">
                {item.name}
                <StockMarks item={item} inStore={inStore} requested={requested} />
              </p>
              <p className="mt-1 text-sm text-muted">
                In store {qtyLabel(inStore)} {item.unit} · Requested {qtyLabel(requested)} · Issued {qtyLabel(issued)} · In clinic {qtyLabel(item.quantity)}
              </p>
              <p className="text-sm text-muted">{money(item.unit_cost)} / {money(item.sale_price)}</p>
              <StockActions item={item} canIssue={canIssue} canManage={canManage} onAdjust={adjust} onEdit={setEdit} onToggle={toggleHidden} />
            </li>
          );
        })}
      </ul>
      <div className="admin-scroll hidden overflow-x-auto md:block">
        <table className="admin-table min-w-full">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Name</th>
              <th>In store</th>
              <th>Requested</th>
              <th>Issued</th>
              <th>In clinic</th>
              <th>Cost / sale</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((item) => {
              const inStore = item.store_on_hand ?? item.quantity;
              const requested = item.quantity_requested_open ?? 0;
              const issued = item.quantity_issued_open ?? 0;
              return (
                <tr key={item.id}>
                  <td className="font-mono text-sm">{item.sku}</td>
                  <td>
                    {item.name}
                    <StockMarks item={item} inStore={inStore} requested={requested} />
                  </td>
                  <td>{qtyLabel(inStore)} {item.unit}</td>
                  <td>{qtyLabel(requested)} {item.unit}</td>
                  <td>{qtyLabel(issued)} {item.unit}</td>
                  <td>{qtyLabel(item.quantity)} {item.unit}</td>
                  <td>{money(item.unit_cost)} / {money(item.sale_price)}</td>
                  <td>
                    <StockActions item={item} canIssue={canIssue} canManage={canManage} onAdjust={adjust} onEdit={setEdit} onToggle={toggleHidden} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {addOpen && (
        <AddSkuDialog
          onClose={closeAdd}
          onCreated={async () => {
            setAddOpen(false);
            setNotice("SKU added.");
            await onReload();
          }}
        />
      )}
      {importOpen && (
        <ImportSkuDialog
          onClose={closeImport}
          onImported={onReload}
        />
      )}
      {edit && (
        <EditSkuDialog
          item={edit}
          locations={locations}
          onClose={closeEdit}
          onSaved={async () => {
            setEdit(null);
            await onReload();
          }}
        />
      )}
    </div>
  );
}

function ReceivePanel({
  items,
  locations,
  suppliers,
  canIssue,
  defaultLocation,
  onReload,
  setError,
}: {
  items: InventoryItem[];
  locations: StockLocation[];
  suppliers: WarehouseSupplier[];
  canIssue: boolean;
  defaultLocation?: string;
  onReload: () => Promise<void>;
  setError: (v: string) => void;
}) {
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState(1);
  const [cost, setCost] = useState(0);
  const [lot, setLot] = useState("");
  const [expiry, setExpiry] = useState("");
  const [locationId, setLocationId] = useState(defaultLocation || "");
  const [supplierId, setSupplierId] = useState("");

  const selected = items.find((i) => i.id === itemId);
  const needExpiry = expiryRequired(selected);

  useEffect(() => {
    if (defaultLocation && !locationId) setLocationId(defaultLocation);
    if (!itemId && items[0]) setItemId(items[0].id);
  }, [defaultLocation, items, itemId, locationId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canIssue) return;
    if (needExpiry && !expiry) {
      setError("Enter the expiry date before receiving this medical supply.");
      return;
    }
    try {
      await api("/api/v1/inventory/receive", {
        method: "POST",
        body: JSON.stringify({
          location_id: locationId || null,
          supplier_id: supplierId || null,
          lines: [
            {
              inventory_item_id: itemId,
              quantity: qty,
              unit_cost: cost,
              lot_code: lot || null,
              expiry_date: expiry || null,
            },
          ],
        }),
      });
      setQty(1);
      setLot("");
      setExpiry("");
      await onReload();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <form className="glass-panel grid gap-3 p-4 md:grid-cols-3" onSubmit={onSubmit}>
      <h3 className="reg-section__title md:col-span-3">Goods received</h3>
      <ConfigField label="Supply">
        <select className="input" value={itemId} onChange={(e) => setItemId(e.target.value)} required>
          {items.map((i) => (
            <option key={i.id} value={i.id}>{i.sku} · {i.name}</option>
          ))}
        </select>
      </ConfigField>
      <ConfigField label="Quantity">
        <input className="input" type="number" min={0.01} step="0.01" value={qty} onChange={(e) => setQty(Number(e.target.value))} required />
      </ConfigField>
      <ConfigField label="Unit cost">
        <input className="input" type="number" min={0} step="0.01" value={cost} onChange={(e) => setCost(Number(e.target.value))} />
      </ConfigField>
      <ConfigField label="Lot code">
        <input className="input" value={lot} onChange={(e) => setLot(e.target.value)} />
      </ConfigField>
      <ConfigField label="Expiry date" hint={needExpiry ? "Required for medical supplies" : "Optional"}>
        <input className="input" type="date" required={needExpiry} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
      </ConfigField>
      <ConfigField label="Location">
        <select className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)} required>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </ConfigField>
      <ConfigField label="Supplier" hint="Optional for walk-in deliveries">
        <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">Walk-in / no supplier</option>
          {suppliers.filter((s) => s.is_active).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </ConfigField>
      <div className="md:col-span-3">
        <button className="btn-primary" type="submit" disabled={!canIssue}>Post receive</button>
      </div>
    </form>
  );
}

function IssuePanel({
  items,
  locations,
  patients,
  canIssue,
  defaultLocation,
  onReload,
  setError,
}: {
  items: InventoryItem[];
  locations: StockLocation[];
  patients: Patient[];
  canIssue: boolean;
  defaultLocation?: string;
  onReload: () => Promise<void>;
  setError: (v: string) => void;
}) {
  const [mode, setMode] = useState<"department" | "patient">("department");
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState(1);
  const [fromId, setFromId] = useState(defaultLocation || "");
  const [toId, setToId] = useState("");
  const [patientId, setPatientId] = useState("");
  const [bill, setBill] = useState(true);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (defaultLocation && !fromId) setFromId(defaultLocation);
    if (!itemId && items[0]) setItemId(items[0].id);
    if (!toId && locations.find((l) => l.code === "REST")) setToId(locations.find((l) => l.code === "REST")!.id);
    if (!patientId && patients[0]) setPatientId(patients[0].id);
  }, [defaultLocation, items, locations, patients, fromId, itemId, toId, patientId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/api/v1/inventory/issue", {
        method: "POST",
        body: JSON.stringify(
          mode === "department"
            ? { inventory_item_id: itemId, quantity: qty, from_location_id: fromId, to_location_id: toId, reason }
            : { inventory_item_id: itemId, quantity: qty, location_id: fromId, patient_id: patientId, bill, reason },
        ),
      });
      await onReload();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <form className="glass-panel grid gap-2 p-4 md:grid-cols-3" onSubmit={onSubmit}>
      <div className="admin-chips md:col-span-3">
        <button type="button" className={`admin-chip ${mode === "department" ? "admin-chip--on" : ""}`} onClick={() => setMode("department")}>To department</button>
        <button type="button" className={`admin-chip ${mode === "patient" ? "admin-chip--on" : ""}`} onClick={() => setMode("patient")}>Patient sale</button>
      </div>
      <select className="input" value={itemId} onChange={(e) => setItemId(e.target.value)}>
        {items.map((i) => (
          <option key={i.id} value={i.id}>{i.sku} · {i.name} ({i.quantity})</option>
        ))}
      </select>
      <input className="input" type="number" min={0.01} step="0.01" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
      <select className="input" value={fromId} onChange={(e) => setFromId(e.target.value)}>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>From {l.name}</option>
        ))}
      </select>
      {mode === "department" ? (
        <select className="input" value={toId} onChange={(e) => setToId(e.target.value)}>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>To {l.name}</option>
          ))}
        </select>
      ) : (
        <>
          <select className="input" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={bill} onChange={(e) => setBill(e.target.checked)} />
            Create invoice
          </label>
        </>
      )}
      <input className="input md:col-span-2" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      <button className="btn-primary" type="submit" disabled={!canIssue}>Post issue</button>
    </form>
  );
}

function OrdersPanel({
  orders,
  items,
  suppliers,
  lowStock,
  canManage,
  canIssue,
  onReload,
  setError,
}: {
  orders: PurchaseOrder[];
  items: InventoryItem[];
  suppliers: WarehouseSupplier[];
  lowStock: { id: string; sku: string; name: string; quantity: number; reorder_level: number }[];
  canManage: boolean;
  canIssue: boolean;
  onReload: () => Promise<void>;
  setError: (v: string) => void;
}) {
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || "");
  const [itemId, setItemId] = useState(items[0]?.id || "");
  const [qty, setQty] = useState(10);
  const [cost, setCost] = useState(0);
  const [receivePo, setReceivePo] = useState<PurchaseOrder | null>(null);
  const [poExpiry, setPoExpiry] = useState("");
  const [poLot, setPoLot] = useState("");

  useEffect(() => {
    if (!supplierId && suppliers[0]) setSupplierId(suppliers[0].id);
    if (!itemId && items[0]) setItemId(items[0].id);
  }, [suppliers, items, supplierId, itemId]);

  function poNeedsExpiry(po: PurchaseOrder) {
    return po.lines.some((line) => {
      const item = items.find((i) => i.id === line.inventory_item_id);
      return expiryRequired(item) && line.quantity_received < line.quantity_ordered;
    });
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/api/v1/inventory/purchase-orders", {
        method: "POST",
        body: JSON.stringify({
          supplier_id: supplierId,
          lines: [{ inventory_item_id: itemId, qty, unit_cost: cost }],
        }),
      });
      await onReload();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function postReceive(po: PurchaseOrder, expiry: string, lot: string) {
    const lines = po.lines
      .filter((line) => line.quantity_received < line.quantity_ordered)
      .map((line) => ({
        line_id: line.id,
        quantity: line.quantity_ordered - line.quantity_received,
        expiry_date: expiry || null,
        lot_code: lot || null,
      }));
    await api(`/api/v1/inventory/purchase-orders/${po.id}/receive`, {
      method: "POST",
      body: JSON.stringify({ lines }),
    });
  }

  async function receiveAll(po: PurchaseOrder) {
    if (poNeedsExpiry(po)) {
      setReceivePo(po);
      setPoExpiry("");
      setPoLot("");
      return;
    }
    try {
      await postReceive(po, "", "");
      await onReload();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function confirmReceive(e: FormEvent) {
    e.preventDefault();
    if (!receivePo) return;
    try {
      await postReceive(receivePo, poExpiry, poLot);
      setReceivePo(null);
      await onReload();
    } catch (err: any) {
      setError(err.message);
    }
  }

  function suggestLow() {
    const row = lowStock[0] || items.find((i) => i.quantity <= i.reorder_level);
    if (!row) return;
    const sku = items.find((i) => i.id === row.id);
    setItemId(row.id);
    setQty(Math.max((row.reorder_level || 0) * 2 - (row.quantity || 0), 1));
    if (sku) setCost(sku.unit_cost);
  }

  async function cancelPo(id: string) {
    try {
      await api(`/api/v1/inventory/purchase-orders/${id}/cancel`, { method: "POST" });
      await onReload();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-3">
      {canManage && (
        <form className="glass-panel grid gap-3 p-4 md:grid-cols-4" onSubmit={onCreate}>
          <ConfigField label="Supplier">
            <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </ConfigField>
          <ConfigField label="Supply">
            <select className="input" value={itemId} onChange={(e) => setItemId(e.target.value)} required>
              {items.map((i) => (
                <option key={i.id} value={i.id}>{i.sku} · {i.name}</option>
              ))}
            </select>
          </ConfigField>
          <ConfigField label="Quantity">
            <input className="input" type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} required />
          </ConfigField>
          <ConfigField label="Unit cost">
            <input className="input" type="number" min={0} value={cost} onChange={(e) => setCost(Number(e.target.value))} />
          </ConfigField>
          <button className="btn-primary md:col-span-3" type="submit">Create purchase order</button>
          <button className="btn-ghost" type="button" onClick={suggestLow} disabled={!lowStock.length}>From low stock</button>
        </form>
      )}
      {receivePo && (
        <form className="glass-panel grid gap-3 p-4 md:grid-cols-3" onSubmit={confirmReceive}>
          <h3 className="reg-section__title md:col-span-3">Receive remaining for this order</h3>
          <ConfigField label="Lot code">
            <input className="input" value={poLot} onChange={(e) => setPoLot(e.target.value)} />
          </ConfigField>
          <ConfigField label="Expiry date" hint="Required for medical supplies on this order">
            <input className="input" type="date" required value={poExpiry} onChange={(e) => setPoExpiry(e.target.value)} />
          </ConfigField>
          <div className="flex items-end gap-2">
            <button className="btn-primary" type="submit">Post receive</button>
            <button className="btn-ghost" type="button" onClick={() => setReceivePo(null)}>Cancel</button>
          </div>
        </form>
      )}
      <div className="admin-scroll">
        <table className="admin-table">
          <thead>
            <tr><th>Status</th><th>Supplier</th><th>Lines</th><th></th></tr>
          </thead>
          <tbody>
            {orders.map((po) => (
              <tr key={po.id}>
                <td><span className="status-pill status-pill--info">{po.status}</span></td>
                <td>{po.supplier_name || suppliers.find((s) => s.id === po.supplier_id)?.name || "—"}</td>
                <td>{po.lines?.map((l) => `${l.quantity_received}/${l.quantity_ordered}`).join(", ")}</td>
                <td className="space-x-1">
                  {canIssue && po.status !== "received" && po.status !== "cancelled" && (
                    <button type="button" className="btn-ghost text-xs" onClick={() => void receiveAll(po)}>Receive remaining</button>
                  )}
                  {canManage && po.status !== "received" && po.status !== "cancelled" && (
                    <ConfirmAction label="Cancel" confirmLabel="Yes, cancel order" onConfirm={() => cancelPo(po.id)} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!orders.length && <EmptyState title="No purchase orders" hint="Create an order from low-stock SKUs." />}
      </div>
    </div>
  );
}

function SuppliersPanel({
  suppliers,
  canManage,
  onReload,
  setError,
}: {
  suppliers: WarehouseSupplier[];
  canManage: boolean;
  onReload: () => Promise<void>;
  setError: (v: string) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [edit, setEdit] = useState<WarehouseSupplier | null>(null);
  const [history, setHistory] = useState<SupplierHistory | null>(null);
  const [historyError, setHistoryError] = useState("");

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/api/v1/inventory/suppliers", {
        method: "POST",
        body: JSON.stringify({ name, contact_phone: phone || null, contact_email: email || null }),
      });
      setName("");
      setPhone("");
      setEmail("");
      await onReload();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function loadHistory(id: string) {
    setHistoryError("");
    try {
      setHistory(await api<SupplierHistory>(`/api/v1/inventory/suppliers/${id}/history`));
    } catch (err: any) {
      setHistoryError(err.message);
    }
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!edit) return;
    try {
      await api(`/api/v1/inventory/suppliers/${edit.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: edit.name,
          contact_phone: edit.contact_phone || null,
          contact_email: edit.contact_email || null,
          is_active: edit.is_active,
        }),
      });
      setEdit(null);
      await onReload();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-3">
      {canManage && (
        <form className="glass-panel grid gap-3 p-4 md:grid-cols-3" onSubmit={onCreate}>
          <ConfigField label="Supplier name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </ConfigField>
          <ConfigField label="Phone">
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </ConfigField>
          <ConfigField label="Email">
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </ConfigField>
          <button className="btn-primary md:col-span-3" type="submit">Add supplier</button>
        </form>
      )}
      <ul className="space-y-2">
        {suppliers.map((s) => (
          <li key={s.id} className="admin-list flex items-center justify-between gap-2">
            <span>
              <strong>{s.name}</strong>
              <span className="text-muted text-sm"> {s.contact_phone || s.contact_email || ""}</span>
              {!s.is_active && <span className="status-pill ml-2">Inactive</span>}
            </span>
            <span className="flex gap-1">
              <button type="button" className="btn-ghost text-xs" onClick={() => void loadHistory(s.id)}>History</button>
              {canManage && (
                <button type="button" className="btn-ghost text-xs" onClick={() => setEdit(s)}>Edit</button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {historyError && <p className="text-sm text-danger" role="alert">{historyError}</p>}
      {history && (
        <section className="glass-panel space-y-3 p-4">
          <h3 className="reg-section__title">Procurement history · {history.supplier.name}</h3>
          <p className="text-sm text-muted">{history.purchase_orders.length} purchase orders · {history.receives.length} receives</p>
          {history.purchase_orders.length === 0 ? (
            <p className="text-sm text-muted">No purchase orders for this vendor yet.</p>
          ) : (
            <ul className="divide-y divide-brand-100">
              {history.purchase_orders.slice(0, 8).map((po) => (
                <li key={po.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    <span className={`status-pill ${po.status === "received" ? "status-pill--success" : "status-pill--info"} mr-2`}>
                      {po.status}
                    </span>
                    {po.lines?.map((l) => `${l.quantity_received}/${l.quantity_ordered}`).join(", ")}
                  </span>
                  <span className="text-xs text-muted">{new Date(po.created_at).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn-ghost text-sm" onClick={() => setHistory(null)}>Close history</button>
        </section>
      )}
      {edit && (
        <form className="glass-panel grid gap-2 p-4 md:grid-cols-3" onSubmit={saveEdit}>
          <input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          <input className="input" placeholder="Phone" value={edit.contact_phone || ""} onChange={(e) => setEdit({ ...edit, contact_phone: e.target.value })} />
          <input className="input" placeholder="Email" value={edit.contact_email || ""} onChange={(e) => setEdit({ ...edit, contact_email: e.target.value })} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} />
            Active
          </label>
          <div className="md:col-span-2 flex gap-2">
            <button className="btn-primary" type="submit">Save</button>
            <button className="btn-ghost" type="button" onClick={() => setEdit(null)}>Cancel</button>
          </div>
        </form>
      )}
      {!suppliers.length && <EmptyState title="No suppliers" hint="Add the vendors you buy from." />}
    </div>
  );
}

function MovementsPanel({
  movements,
  items,
  locations,
}: {
  movements: StockMovement[];
  items: InventoryItem[];
  locations: StockLocation[];
}) {
  const [type, setType] = useState("all");
  const names = Object.fromEntries(items.map((i) => [i.id, `${i.sku} ${i.name}`]));
  const locs = Object.fromEntries(locations.map((l) => [l.id, l.code]));
  const types = Array.from(new Set(movements.map((m) => m.movement_type))).sort();
  const rows = type === "all" ? movements : movements.filter((m) => m.movement_type === type);
  return (
    <div className="space-y-3">
      <div className="admin-toolbar">
        <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      <div className="admin-scroll">
        <table className="admin-table">
          <thead>
            <tr><th>When</th><th>Type</th><th>Item</th><th>Qty</th><th>From / to</th><th>Reason</th></tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td className="text-xs">{new Date(m.created_at).toLocaleString()}</td>
                <td><span className="status-pill">{m.movement_type}</span></td>
                <td>{names[m.inventory_item_id] || m.inventory_item_id.slice(0, 8)}</td>
                <td>{m.quantity}</td>
                <td className="text-xs">{locs[m.from_location_id || ""] || "—"} → {locs[m.to_location_id || ""] || "—"}</td>
                <td className="text-xs text-muted">{m.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <EmptyState title="No movements yet" hint="Receives, issues, and write-offs appear here." />}
      </div>
    </div>
  );
}

function FeesPanel({
  items,
  canManage,
  money,
  onReload,
  setError,
}: {
  items: InventoryItem[];
  canManage: boolean;
  money: (n: number) => string;
  onReload: () => Promise<void>;
  setError: (v: string) => void;
}) {
  const [form, setForm] = useState(emptyFee);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/api/v1/inventory", { method: "POST", body: JSON.stringify({ ...form, quantity: 0, item_kind: "service" }) });
      setForm(emptyFee);
      await onReload();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function toggle(item: InventoryItem) {
    await api(`/api/v1/inventory/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ billable_at_registration: !item.billable_at_registration }),
    });
    await onReload();
  }

  return (
    <div className="space-y-3">
      {canManage && (
        <form className="glass-panel grid gap-2 p-4 md:grid-cols-3" onSubmit={onCreate}>
          <input className="input" placeholder="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required />
          <input className="input" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input className="input" type="number" placeholder="Sale price" value={form.sale_price} onChange={(e) => setForm({ ...form, sale_price: Number(e.target.value) })} />
          <button className="btn-primary md:col-span-3" type="submit">Add registration fee</button>
        </form>
      )}
      <div className="admin-scroll">
        <table className="admin-table">
          <thead>
            <tr><th>SKU</th><th>Name</th><th>Price</th><th>Registration</th></tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td className="font-mono text-xs">{item.sku}</td>
                <td>{item.name}</td>
                <td>{money(item.sale_price || item.unit_cost)}</td>
                <td>
                  {canManage ? (
                    <button type="button" className="btn-ghost text-xs" onClick={() => toggle(item)}>
                      {item.billable_at_registration ? "On" : "Off"}
                    </button>
                  ) : item.billable_at_registration ? "On" : "Off"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
