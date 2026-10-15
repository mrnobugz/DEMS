 import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, Search } from "lucide-react";
import { ConfigField, ConfigStatus, ConfirmAction, onTabListKeyDown } from "@/components/config/ConfigUi";
import { EmptyState } from "@/components/EmptyState";
import { useAnnounce } from "@/components/ui/sonner";
import { api } from "@/lib/api";
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

type StockStatus = "all" | "low" | "short" | "hidden";

const VIEWS: { id: View; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "requests", label: "Store requests" },
  { id: "stock", label: "Stock" },
  { id: "receive", label: "Receive stock" },
  { id: "issues", label: "Issue stock" },
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
  const [patientsFailed, setPatientsFailed] = useState(false);
  const [loadError, setLoadError] = useState("");
  useAnnounce(loadError);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [stockStatus, setStockStatus] = useState<StockStatus>("all");

  function setView(next: View) {
    const nextParams = new URLSearchParams(params);
    if (next === "overview") nextParams.delete("view");
    else nextParams.set("view", next);
    setParams(nextParams, { replace: true });
  }

  function showLowStock() {
    setStockStatus("low");
    setView("stock");
  }

  async function load() {
    setLoading(true);
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
      setLoadError("");
      setLoaded(true);
    } catch (err: unknown) {
      setLoadError(explainFailure(err, "load the warehouse"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    api<{ items: Patient[] }>("/api/v1/patients?limit=80")
      .then((p) => {
        setPatients(p.items);
        setPatientsFailed(false);
      })
      .catch(() => {
        setPatients([]);
        setPatientsFailed(true);
      });
  }, []);

  const stockItems = useMemo(() => items.filter((i) => i.item_kind !== "service"), [items]);
  const feeItems = useMemo(() => items.filter((i) => i.billable_at_registration || i.item_kind === "service"), [items]);
  const mainId = locations.find((l) => l.code === "MAIN")?.id;

  return (
    <div className="clin-shell admin-shell animate-rise space-y-3">
      <div className="clin-head">
        <div>
          <h2 className="font-display text-xl font-bold leading-tight text-brand-900">Warehouse</h2>
          <WarehouseSummary analysis={analysis} money={money} />
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
            aria-controls="wh-panel"
            tabIndex={view === tab.id ? 0 : -1}
            className={`admin-tab ${view === tab.id ? "admin-tab--on" : ""}`}
            onClick={() => setView(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {!loaded && loading && <WarehouseSkeleton />}
      {!loaded && !loading && loadError && (
        <section className="glass-panel space-y-3 p-4">
          <p className="text-sm font-semibold text-danger" role="alert">{loadError}</p>
          <p className="text-sm text-muted">No stock, orders, or requests were changed.</p>
          <button type="button" className="btn-primary" onClick={() => void load()}>
            Retry loading warehouse
          </button>
        </section>
      )}
      {loaded && loadError && (
        <div className="glass-panel flex flex-wrap items-center justify-between gap-2 p-3">
          <p className="text-sm font-semibold text-danger" role="alert">
            Could not refresh warehouse figures. What you see may be out of date.
          </p>
          <button type="button" className="btn-ghost" disabled={loading} onClick={() => void load()}>
            {loading ? "Retrying…" : "Retry"}
          </button>
        </div>
      )}

      {loaded && (
        <div id="wh-panel" role="tabpanel" aria-labelledby={`wh-tab-${view}`}>
          {view === "overview" && (
            <OverviewPanel analysis={analysis} money={money} onJump={setView} onShowLow={showLowStock} />
          )}
          {view === "requests" && (
            <StoreRequestsPanel canApprove={canApprove} canFulfill={canFulfill} onChanged={load} />
          )}
          {view === "stock" && (
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
            />
          )}
          {view === "receive" && (
            <ReceivePanel
              items={stockItems}
              locations={locations}
              suppliers={suppliers}
              canIssue={canIssue}
              defaultLocation={mainId}
              onReload={load}
            />
          )}
          {view === "issues" && (
            <IssuePanel
              items={stockItems}
              locations={locations}
              patients={patients}
              patientsFailed={patientsFailed}
              canIssue={canIssue}
              defaultLocation={mainId}
              onReload={load}
            />
          )}
          {view === "orders" && (
            <OrdersPanel
              orders={orders}
              items={stockItems}
              suppliers={suppliers.filter((s) => s.is_active)}
              lowStock={analysis?.low_stock || []}
              canManage={canManage}
              canIssue={canIssue}
              onReload={load}
            />
          )}
          {view === "suppliers" && <SuppliersPanel suppliers={suppliers} canManage={canManage} onReload={load} />}
          {view === "movements" && <MovementsPanel movements={movements} items={items} locations={locations} />}
          {view === "analysis" && <WarehouseAnalysisPanel />}
          {view === "fees" && <FeesPanel items={feeItems} canManage={canManage} money={money} onReload={load} />}
        </div>
      )}
    </div>
  );
}

function WarehouseSummary({ analysis, money }: { analysis: WarehouseAnalysis | null; money: (n: number) => string }) {
  if (!analysis) {
    return <p className="text-sm text-muted">Stock, store requests, receiving, issues, and purchase orders.</p>;
  }
  const alerts = [
    { count: analysis.low_stock_count, label: "low in store" },
    { count: analysis.expiring_count, label: analysis.expiring_count === 1 ? "lot expiring" : "lots expiring" },
    { count: analysis.open_requisitions ?? 0, label: (analysis.open_requisitions ?? 0) === 1 ? "open request" : "open requests" },
  ];
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
      <span>
        <strong className="text-text">{analysis.sku_count}</strong> SKUs
      </span>
      <span>
        <strong className="text-text">{money(analysis.on_hand_value)}</strong> on hand
      </span>
      {alerts.map((alert) => (
        <span key={alert.label} className={`inline-flex items-center gap-1 ${alert.count ? "font-semibold text-danger" : ""}`}>
          {alert.count > 0 && <AlertTriangle className="h-4 w-4" aria-hidden="true" />}
          {alert.count} {alert.label}
        </span>
      ))}
    </p>
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

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (char) => char.toUpperCase());
}

/** One pending/success/error status per form or list, with a guard against double submits. */
function useSubmit() {
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const inFlight = useRef(false);

  const run = useCallback(async (task: () => Promise<unknown>, done: string, failing: string, key = "form") => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusyKey(key);
    setError("");
    setOk("");
    try {
      await task();
      setOk(done);
      return true;
    } catch (err: unknown) {
      setError(explainFailure(err, failing));
      return false;
    } finally {
      inFlight.current = false;
      setBusyKey("");
    }
  }, []);

  const fail = useCallback((message: string) => {
    setOk("");
    setError(message);
  }, []);

  const succeed = useCallback((message: string) => {
    setError("");
    setOk(message);
  }, []);

  return { busy: busyKey !== "", busyKey, error, ok, run, fail, succeed };
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
  return String(rounded);
}

function qtyUnit(value: number, unit?: string | null) {
  return [qtyLabel(value), unit].filter(Boolean).join(" ");
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
  const [loadFailed, setLoadFailed] = useState("");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [issueDraft, setIssueDraft] = useState<Record<string, string>>({});

  async function loadInbox() {
    const data = await api<Requisition[]>("/api/v1/requisitions?status=open");
    setRows(data.filter((row) => ["submitted", "approved"].includes(reqStatus(row.status))));
  }

  function refresh() {
    setLoading(true);
    setLoadFailed("");
    loadInbox()
      .catch((e: unknown) => setLoadFailed(explainFailure(e, "load store requests")))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
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
    } catch (e: unknown) {
      setError(explainFailure(e, "save this request"));
      return false;
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="glass-panel space-y-3 p-4" aria-busy={loading || undefined}>
      <div>
        <h3 className="reg-section__title">Store requests</h3>
        <p className="text-sm text-muted">
          In store is the main store. Change Issue now to send less than requested. Anything left stays on the request.
        </p>
      </div>
      <ConfigStatus loading={loading} error={error} ok={ok} />
      {loadFailed && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-danger" role="alert">{loadFailed}</p>
          <button type="button" className="btn-ghost" onClick={refresh}>Retry</button>
        </div>
      )}
      {!loading && !loadFailed && !rows.length && (
        <EmptyState
          title="No requests at the store"
          hint="When a department submits a requisition, it appears here for the inventory manager."
        />
      )}
      {rows.length > 0 && (
      <ul className="space-y-2">
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
                                  className="input w-28 min-h-[var(--touch-min)]!"
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
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={busy}
                      onClick={() => void act(row.id, `/api/v1/requisitions/${row.id}/approve`, `Approved ${row.req_number}`)}
                    >
                      {busy ? "Saving…" : "Approve"}
                    </button>
                    <span className="flex flex-wrap items-end gap-2 sm:ml-auto">
                      <label className="text-sm">
                        <span className="label">Reject reason (optional)</span>
                        <input
                          className="input"
                          value={reasons[row.id] || ""}
                          disabled={busy}
                          onChange={(e) => setReasons({ ...reasons, [row.id]: e.target.value })}
                        />
                      </label>
                      <ConfirmAction
                        label="Reject"
                        confirmLabel="Yes, reject request"
                        cancelLabel="Keep request"
                        variant="danger"
                        destructive
                        disabled={busy}
                        message={`Reject ${row.req_number}? No stock is issued and the request leaves the store queue.`}
                        onConfirm={() => {
                          void act(row.id, `/api/v1/requisitions/${row.id}/reject`, `Rejected ${row.req_number}`, {
                            reason: (reasons[row.id] || "").trim() || undefined,
                          });
                        }}
                      />
                    </span>
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
                    {busy ? "Issuing…" : "Issue to department"}
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
  onShowLow,
}: {
  analysis: WarehouseAnalysis | null;
  money: (n: number) => string;
  onJump: (v: View) => void;
  onShowLow: () => void;
}) {
  if (!analysis) return <EmptyState title="No warehouse totals yet" hint="On-hand value and alerts appear after stock is received." />;
  const low = analysis.low_stock;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="glass-panel space-y-3 p-4">
        <h3 className="reg-section__title">Alerts</h3>
        <p className="text-sm text-muted">
          {analysis.low_stock_count} below reorder · {analysis.expiring_count} lots expiring · {analysis.open_pos} open POs
          {(analysis.open_requisitions || 0) > 0 ? ` · ${analysis.open_requisitions} open chair requests` : ""}
        </p>
        {low.length > 0 ? (
          <ul className="space-y-2">
            {low.slice(0, 6).map((row) => (
              <li key={row.id}>
                <button type="button" className="btn-ghost w-full justify-start text-left" onClick={onShowLow}>
                  <span className="status-pill status-pill--warning">Low</span>
                  <span className="min-w-0 flex-1 truncate" title={`${row.sku} ${row.name}`}>
                    <span className="font-mono">{row.sku}</span> {row.name}
                  </span>
                  <span className="text-sm font-normal text-muted">
                    {qtyLabel(row.quantity)} on hand · reorder at {qtyLabel(row.reorder_level)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No SKUs are below their reorder level.</p>
        )}
        <div className="flex flex-wrap gap-2">
          {low.length > 0 && (
            <button type="button" className="btn-primary" onClick={onShowLow}>
              Show all {analysis.low_stock_count} low-stock SKUs
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={() => onJump("requests")}>
            Open store requests
          </button>
        </div>
      </section>
      <section className="glass-panel space-y-2 p-4">
        <h3 className="reg-section__title">Value</h3>
        <p className="text-lg font-semibold">{money(analysis.on_hand_value)} on hand</p>
        <p className="text-sm text-muted">COGS 90d {money(analysis.cogs_90d)} · billed supplies {money(analysis.billed_supply_revenue)}</p>
        <button type="button" className="btn-ghost" onClick={() => onJump("analysis")}>Open analysis</button>
      </section>
    </div>
  );
}

function ExpiryMark({ date }: { date?: string | null }) {
  if (!date) return null;
  const days = Math.floor((new Date(date).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return <span className="status-pill status-pill--danger ml-2">Expired {date}</span>;
  if (days <= 90) return <span className="status-pill status-pill--warning ml-2">Expires {date}</span>;
  return <span className="status-pill ml-2">Expires {date}</span>;
}

function StockMarks({ item, inStore, requested }: { item: InventoryItem; inStore: number; requested: number }) {
  return (
    <>
      {inStore <= item.reorder_level && <span className="status-pill status-pill--warning ml-2">Low in store</span>}
      {requested > inStore && <span className="status-pill status-pill--warning ml-2">Short for requests</span>}
      <ExpiryMark date={item.expiry_date} />
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
  busy: boolean;
  onAdjust: (item: InventoryItem, delta: number) => void;
  onEdit: (item: InventoryItem) => void;
  onToggle: (item: InventoryItem) => void;
}

function StockActions({ item, canIssue, canManage, busy, onAdjust, onEdit, onToggle }: StockActionsProps) {
  const unit = item.unit || "unit";
  return (
    <div className="flex flex-wrap gap-2">
      {canIssue && (
        <>
          <button
            type="button"
            className="btn-ghost"
            aria-label={`Add one ${unit} of ${item.name}`}
            title={`Add one ${unit}`}
            disabled={busy}
            onClick={() => onAdjust(item, 1)}
          >
            +1
          </button>
          <button
            type="button"
            className="btn-ghost"
            aria-label={`Remove one ${unit} of ${item.name}`}
            title={`Remove one ${unit}`}
            disabled={busy}
            onClick={() => onAdjust(item, -1)}
          >
            -1
          </button>
        </>
      )}
      {canManage && (
        <>
          <button type="button" className="btn-ghost" aria-label={`Edit ${item.name}`} disabled={busy} onClick={() => onEdit(item)}>
            Edit
          </button>
          {item.is_active ? (
            <ConfirmAction
              label="Hide"
              confirmLabel="Hide SKU"
              cancelLabel="Keep visible"
              destructive
              disabled={busy}
              message={`Hide ${item.name} from stock lists? Its stock and history stay. Find it again under Show: Hidden.`}
              onConfirm={() => onToggle(item)}
            />
          ) : (
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => onToggle(item)}>
              Show again
            </button>
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
}: {
  items: InventoryItem[];
  locations: StockLocation[];
  query: string;
  setQuery: (v: string) => void;
  stockStatus: StockStatus;
  setStockStatus: (v: StockStatus) => void;
  canManage: boolean;
  canIssue: boolean;
  money: (n: number) => string;
  onReload: () => Promise<void>;
}) {
  const [edit, setEdit] = useState<InventoryItem | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [kind, setKind] = useState("all");
  const status = useSubmit();
  const closeAdd = useCallback(() => setAddOpen(false), []);
  const closeImport = useCallback(() => setImportOpen(false), []);
  const closeEdit = useCallback(() => setEdit(null), []);
  const cats = Array.from(new Set(items.map((i) => i.category))).sort();
  const filtered = query.trim() !== "" || kind !== "all" || stockStatus !== "all";
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

  function clearFilters() {
    setQuery("");
    setKind("all");
    setStockStatus("all");
  }

  function toggleHidden(item: InventoryItem) {
    void status.run(
      async () => {
        await api(`/api/v1/inventory/${item.id}`, {
          method: "PATCH",
          body: JSON.stringify({ is_active: !item.is_active }),
        });
        await onReload();
      },
      item.is_active ? `Hid ${item.name}. Find it under Show: Hidden.` : `${item.name} is back in the stock list.`,
      "update this SKU",
      item.id,
    );
  }

  function adjust(item: InventoryItem, delta: number) {
    const unit = item.unit || "unit";
    void status.run(
      async () => {
        await api(`/api/v1/inventory/${item.id}/adjust`, { method: "POST", body: JSON.stringify({ delta, reason: "manual" }) });
        await onReload();
      },
      delta > 0 ? `Added 1 ${unit} to ${item.name}.` : `Removed 1 ${unit} from ${item.name}.`,
      "adjust this quantity",
      item.id,
    );
  }

  const actionsFor = (item: InventoryItem) => (
    <StockActions
      item={item}
      canIssue={canIssue}
      canManage={canManage}
      busy={status.busyKey === item.id}
      onAdjust={adjust}
      onEdit={setEdit}
      onToggle={toggleHidden}
    />
  );

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
              autoComplete="off"
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
          <select className="input" value={stockStatus} onChange={(e) => setStockStatus(e.target.value as StockStatus)}>
            <option value="all">All SKUs</option>
            <option value="low">Low in store</option>
            <option value="short">Short for requests</option>
            <option value="hidden">Hidden</option>
          </select>
        </label>
        {filtered && (
          <button type="button" className="btn-ghost" onClick={clearFilters}>
            Clear filters
          </button>
        )}
        {canManage && (
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <button type="button" className="btn-primary" onClick={() => setAddOpen(true)}>Add SKU</button>
            <button type="button" className="btn-ghost" onClick={() => setImportOpen(true)}>Import SKUs</button>
          </div>
        )}
      </div>
      <ConfigStatus error={status.error} ok={status.ok} />
      <p className="text-sm text-muted" aria-live="polite">
        Showing {visible.length} of {items.length} SKUs. The list filters as you type.
      </p>
      {!visible.length &&
        (filtered ? (
          <EmptyState
            title="No matching SKUs"
            hint="Nothing matches this search and these filters."
            action={
              <button type="button" className="btn-ghost" onClick={clearFilters}>
                Clear filters
              </button>
            }
          />
        ) : (
          <EmptyState
            title="No stock SKUs yet"
            hint={canManage ? "Add gloves, composites, and anesthetics here, or import a spreadsheet." : "The clinic admin adds stock SKUs."}
          />
        ))}
      {visible.length > 0 && (
        <ul className="space-y-2 lg:hidden">
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
                <p className="mb-2 text-sm text-muted">Cost {money(item.unit_cost)} · Sale {money(item.sale_price)}</p>
                {actionsFor(item)}
              </li>
            );
          })}
        </ul>
      )}
      {visible.length > 0 && (
        <div className="admin-scroll hidden overflow-x-auto lg:block">
          <table className="admin-table min-w-full">
            <caption className="sr-only">Stock SKUs</caption>
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
                    <td>{actionsFor(item)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {addOpen && (
        <AddSkuDialog
          onClose={closeAdd}
          onCreated={async (message) => {
            setAddOpen(false);
            status.succeed(message);
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
          onSaved={async (message) => {
            setEdit(null);
            status.succeed(message);
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
}: {
  items: InventoryItem[];
  locations: StockLocation[];
  suppliers: WarehouseSupplier[];
  canIssue: boolean;
  defaultLocation?: string;
  onReload: () => Promise<void>;
}) {
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState(1);
  const [cost, setCost] = useState(0);
  const [lot, setLot] = useState("");
  const [expiry, setExpiry] = useState("");
  const [locationId, setLocationId] = useState(defaultLocation || "");
  const [supplierId, setSupplierId] = useState("");
  const status = useSubmit();

  const selected = items.find((i) => i.id === itemId);
  const needExpiry = expiryRequired(selected);

  useEffect(() => {
    if (defaultLocation && !locationId) setLocationId(defaultLocation);
  }, [defaultLocation, locationId]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canIssue) return;
    if (needExpiry && !expiry) {
      status.fail("Enter the expiry date before receiving this medical supply.");
      return;
    }
    const where = locations.find((l) => l.id === locationId)?.name || "the store";
    const done = `Received ${qtyUnit(qty, selected?.unit)} of ${selected?.name || "this supply"} into ${where}.`;
    void status.run(
      async () => {
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
      },
      done,
      "receive this delivery",
    );
  }

  if (!items.length || !locations.length) {
    return (
      <section className="glass-panel p-4">
        <EmptyState
          title={!items.length ? "No stock SKUs to receive" : "No stock locations"}
          hint={!items.length ? "Add a SKU under Stock first, then receive deliveries here." : "Ask the clinic admin to set up stock locations."}
        />
      </section>
    );
  }

  return (
    <form className="glass-panel grid gap-3 p-4 md:grid-cols-3" onSubmit={onSubmit}>
      <h3 className="reg-section__title md:col-span-3">Receive stock</h3>
      <ConfigField label="Supply (required)">
        <select className="input" value={itemId} onChange={(e) => setItemId(e.target.value)} required>
          <option value="">Choose supply…</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>{i.sku} · {i.name}</option>
          ))}
        </select>
      </ConfigField>
      <ConfigField label="Quantity (required)">
        <input className="input" type="number" inputMode="decimal" min={0.01} step="0.01" value={qty} onChange={(e) => setQty(Number(e.target.value))} required />
      </ConfigField>
      <ConfigField label="Unit cost">
        <input className="input" type="number" inputMode="decimal" min={0} step="0.01" value={cost} onChange={(e) => setCost(Number(e.target.value))} />
      </ConfigField>
      <ConfigField label="Lot code">
        <input className="input" value={lot} autoComplete="off" onChange={(e) => setLot(e.target.value)} />
      </ConfigField>
      <ConfigField label={needExpiry ? "Expiry date (required)" : "Expiry date"} hint={needExpiry ? "Required for medical supplies" : "Optional"}>
        <input className="input" type="date" required={needExpiry} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
      </ConfigField>
      <ConfigField label="Location (required)">
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
      <div className="flex flex-wrap items-center gap-3 md:col-span-3">
        <button className="btn-primary" type="submit" disabled={!canIssue || status.busy}>
          {status.busy ? "Receiving…" : "Receive stock"}
        </button>
        {!canIssue && <p className="text-sm text-muted">Your role can view this form but cannot post receipts.</p>}
      </div>
      <div className="md:col-span-3">
        <ConfigStatus error={status.error} ok={status.ok} />
      </div>
    </form>
  );
}

function IssuePanel({
  items,
  locations,
  patients,
  patientsFailed,
  canIssue,
  defaultLocation,
  onReload,
}: {
  items: InventoryItem[];
  locations: StockLocation[];
  patients: Patient[];
  patientsFailed: boolean;
  canIssue: boolean;
  defaultLocation?: string;
  onReload: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"department" | "patient">("department");
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState(1);
  const [fromId, setFromId] = useState(defaultLocation || "");
  const [toId, setToId] = useState("");
  const [patientId, setPatientId] = useState("");
  const [bill, setBill] = useState(true);
  const [reason, setReason] = useState("");
  const status = useSubmit();
  const sameLocation = mode === "department" && !!fromId && fromId === toId;

  useEffect(() => {
    if (defaultLocation && !fromId) setFromId(defaultLocation);
    if (!toId && locations.find((l) => l.code === "REST")) setToId(locations.find((l) => l.code === "REST")!.id);
  }, [defaultLocation, locations, fromId, toId]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canIssue) return;
    if (sameLocation) {
      status.fail("Choose a destination that is different from the location you issue from.");
      return;
    }
    if (mode === "patient" && !patientId) {
      status.fail("Choose the patient this supply is sold to.");
      return;
    }
    const item = items.find((i) => i.id === itemId);
    const what = `${qtyUnit(qty, item?.unit)} of ${item?.name || "this supply"}`;
    const locName = (id: string) => locations.find((l) => l.id === id)?.name || "the selected location";
    const patient = patients.find((p) => p.id === patientId);
    const done =
      mode === "department"
        ? `Issued ${what} from ${locName(fromId)} to ${locName(toId)}.`
        : `Issued ${what} to ${patient ? `${patient.first_name} ${patient.last_name}` : "the patient"}${bill ? " and created an invoice" : ""}.`;
    void status.run(
      async () => {
        await api("/api/v1/inventory/issue", {
          method: "POST",
          body: JSON.stringify(
            mode === "department"
              ? { inventory_item_id: itemId, quantity: qty, from_location_id: fromId, to_location_id: toId, reason }
              : { inventory_item_id: itemId, quantity: qty, location_id: fromId, patient_id: patientId, bill, reason },
          ),
        });
        await onReload();
      },
      done,
      "issue this stock",
    );
  }

  if (!items.length || !locations.length) {
    return (
      <section className="glass-panel p-4">
        <EmptyState
          title={!items.length ? "No stock SKUs to issue" : "No stock locations"}
          hint={!items.length ? "Add a SKU under Stock and receive it before issuing." : "Ask the clinic admin to set up stock locations."}
        />
      </section>
    );
  }

  return (
    <form className="glass-panel grid gap-3 p-4 md:grid-cols-3" onSubmit={onSubmit}>
      <h3 className="reg-section__title md:col-span-3">Issue stock</h3>
      <fieldset className="md:col-span-3">
        <legend className="label">Issue to</legend>
        <div className="flex flex-wrap gap-x-6">
          <label className="choice-row">
            <input type="radio" name="issue-mode" value="department" checked={mode === "department"} onChange={() => setMode("department")} />
            A department
          </label>
          <label className="choice-row">
            <input type="radio" name="issue-mode" value="patient" checked={mode === "patient"} onChange={() => setMode("patient")} />
            A patient (sale)
          </label>
        </div>
      </fieldset>
      <ConfigField label="Supply (required)">
        <select className="input" value={itemId} onChange={(e) => setItemId(e.target.value)} required>
          <option value="">Choose supply…</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>{i.sku} · {i.name} ({qtyLabel(i.quantity)} in clinic)</option>
          ))}
        </select>
      </ConfigField>
      <ConfigField label="Quantity (required)">
        <input className="input" type="number" inputMode="decimal" min={0.01} step="0.01" value={qty} onChange={(e) => setQty(Number(e.target.value))} required />
      </ConfigField>
      <ConfigField label="From location (required)">
        <select className="input" value={fromId} onChange={(e) => setFromId(e.target.value)} required>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </ConfigField>
      {mode === "department" ? (
        <ConfigField label="To location (required)">
          <select
            className="input"
            value={toId}
            onChange={(e) => setToId(e.target.value)}
            required
            aria-invalid={sameLocation || undefined}
            aria-describedby={sameLocation ? "issue-to-error" : undefined}
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          {sameLocation && (
            <span id="issue-to-error" className="text-sm text-danger">
              Choose a location different from where you issue from.
            </span>
          )}
        </ConfigField>
      ) : (
        <>
          <ConfigField
            label="Patient (required)"
            hint={patientsFailed ? "Could not load patients. Reload the page to try again." : `Showing the first ${patients.length} patients.`}
          >
            <select className="input" value={patientId} onChange={(e) => setPatientId(e.target.value)} required disabled={!patients.length}>
              <option value="">{patients.length ? "Choose patient…" : "No patients loaded"}</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
              ))}
            </select>
          </ConfigField>
          <label className="choice-row">
            <input type="checkbox" checked={bill} onChange={(e) => setBill(e.target.checked)} />
            Create an invoice for this sale
          </label>
        </>
      )}
      <div className="md:col-span-2">
        <ConfigField label="Reason (optional)">
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        </ConfigField>
      </div>
      <div className="flex flex-wrap items-center gap-3 md:col-span-3">
        <button className="btn-primary" type="submit" disabled={!canIssue || status.busy}>
          {status.busy ? "Issuing…" : "Issue stock"}
        </button>
        {!canIssue && <p className="text-sm text-muted">Your role can view this form but cannot issue stock.</p>}
      </div>
      <div className="md:col-span-3">
        <ConfigStatus error={status.error} ok={status.ok} />
      </div>
    </form>
  );
}

function poTone(status: string) {
  if (status === "received") return "status-pill--success";
  if (status === "cancelled") return "";
  return "status-pill--info";
}

function OrdersPanel({
  orders,
  items,
  suppliers,
  lowStock,
  canManage,
  canIssue,
  onReload,
}: {
  orders: PurchaseOrder[];
  items: InventoryItem[];
  suppliers: WarehouseSupplier[];
  lowStock: { id: string; sku: string; name: string; quantity: number; reorder_level: number }[];
  canManage: boolean;
  canIssue: boolean;
  onReload: () => Promise<void>;
}) {
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || "");
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState(10);
  const [cost, setCost] = useState(0);
  const [receivePo, setReceivePo] = useState<PurchaseOrder | null>(null);
  const [poExpiry, setPoExpiry] = useState("");
  const [poLot, setPoLot] = useState("");
  const createStatus = useSubmit();
  const rowStatus = useSubmit();
  const receiveFirstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!supplierId && suppliers[0]) setSupplierId(suppliers[0].id);
  }, [suppliers, supplierId]);

  useEffect(() => {
    if (receivePo) receiveFirstField.current?.focus();
  }, [receivePo]);

  const itemName = (id: string) => items.find((i) => i.id === id)?.name || "Item";
  const supplierName = (po: PurchaseOrder) =>
    po.supplier_name || suppliers.find((s) => s.id === po.supplier_id)?.name || "Unknown supplier";

  function poNeedsExpiry(po: PurchaseOrder) {
    return po.lines.some((line) => {
      const item = items.find((i) => i.id === line.inventory_item_id);
      return expiryRequired(item) && line.quantity_received < line.quantity_ordered;
    });
  }

  function onCreate(e: FormEvent) {
    e.preventDefault();
    const supplier = suppliers.find((s) => s.id === supplierId)?.name || "the supplier";
    void createStatus.run(
      async () => {
        await api("/api/v1/inventory/purchase-orders", {
          method: "POST",
          body: JSON.stringify({
            supplier_id: supplierId,
            lines: [{ inventory_item_id: itemId, qty, unit_cost: cost }],
          }),
        });
        await onReload();
      },
      `Created an order for ${qtyLabel(qty)} ${itemName(itemId)} from ${supplier}.`,
      "create this purchase order",
    );
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

  function receiveAll(po: PurchaseOrder) {
    if (poNeedsExpiry(po)) {
      setReceivePo(po);
      setPoExpiry("");
      setPoLot("");
      return;
    }
    void rowStatus.run(
      async () => {
        await postReceive(po, "", "");
        await onReload();
      },
      `Received the remaining items from ${supplierName(po)}.`,
      "receive this order",
      po.id,
    );
  }

  function confirmReceive(e: FormEvent) {
    e.preventDefault();
    if (!receivePo) return;
    const po = receivePo;
    void rowStatus
      .run(
        async () => {
          await postReceive(po, poExpiry, poLot);
          await onReload();
        },
        `Received the remaining items from ${supplierName(po)}.`,
        "receive this order",
        po.id,
      )
      .then((saved) => {
        if (saved) setReceivePo(null);
      });
  }

  function suggestLow() {
    const row = lowStock[0] || items.find((i) => i.quantity <= i.reorder_level);
    if (!row) return;
    const sku = items.find((i) => i.id === row.id);
    setItemId(row.id);
    setQty(Math.max((row.reorder_level || 0) * 2 - (row.quantity || 0), 1));
    if (sku) setCost(sku.unit_cost);
    createStatus.succeed(`Filled in ${row.name}. Check the quantity, then create the order.`);
  }

  function cancelPo(po: PurchaseOrder) {
    void rowStatus.run(
      async () => {
        await api(`/api/v1/inventory/purchase-orders/${po.id}/cancel`, { method: "POST" });
        await onReload();
      },
      `Cancelled the order from ${supplierName(po)}.`,
      "cancel this order",
      po.id,
    );
  }

  return (
    <div className="space-y-3">
      {canManage && (
        <form className="glass-panel grid gap-3 p-4 md:grid-cols-4" onSubmit={onCreate}>
          <h3 className="reg-section__title md:col-span-4">New purchase order</h3>
          {!suppliers.length && (
            <p className="text-sm text-muted md:col-span-4">Add an active supplier under Suppliers before creating an order.</p>
          )}
          <ConfigField label="Supplier (required)">
            <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required disabled={!suppliers.length}>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </ConfigField>
          <ConfigField label="Supply (required)">
            <select className="input" value={itemId} onChange={(e) => setItemId(e.target.value)} required>
              <option value="">Choose supply…</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>{i.sku} · {i.name}</option>
              ))}
            </select>
          </ConfigField>
          <ConfigField label="Quantity (required)">
            <input className="input" type="number" inputMode="numeric" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} required />
          </ConfigField>
          <ConfigField label="Unit cost">
            <input className="input" type="number" inputMode="decimal" min={0} step="any" value={cost} onChange={(e) => setCost(Number(e.target.value))} />
          </ConfigField>
          <div className="flex flex-wrap gap-2 md:col-span-4">
            <button className="btn-primary" type="submit" disabled={createStatus.busy || !suppliers.length || !items.length}>
              {createStatus.busy ? "Creating…" : "Create purchase order"}
            </button>
            <button className="btn-ghost" type="button" onClick={suggestLow} disabled={!lowStock.length || createStatus.busy}>
              Fill from low stock
            </button>
          </div>
          <div className="md:col-span-4">
            <ConfigStatus error={createStatus.error} ok={createStatus.ok} />
          </div>
        </form>
      )}
      {receivePo && (
        <form className="glass-panel grid gap-3 p-4 md:grid-cols-3" onSubmit={confirmReceive}>
          <h3 className="reg-section__title md:col-span-3">Receive remaining from {supplierName(receivePo)}</h3>
          <ConfigField label="Lot code">
            <input ref={receiveFirstField} className="input" value={poLot} autoComplete="off" onChange={(e) => setPoLot(e.target.value)} />
          </ConfigField>
          <ConfigField label="Expiry date (required)" hint="Required for medical supplies on this order">
            <input className="input" type="date" required value={poExpiry} onChange={(e) => setPoExpiry(e.target.value)} />
          </ConfigField>
          <div className="flex flex-wrap items-end gap-2">
            <button className="btn-primary" type="submit" disabled={rowStatus.busy}>
              {rowStatus.busy ? "Receiving…" : "Receive remaining"}
            </button>
            <button className="btn-ghost" type="button" onClick={() => setReceivePo(null)} disabled={rowStatus.busy}>
              Not now
            </button>
          </div>
        </form>
      )}
      <ConfigStatus error={rowStatus.error} ok={rowStatus.ok} />
      {!orders.length ? (
        <EmptyState
          title="No purchase orders"
          hint={canManage ? "Create the first order above, or fill it from low-stock SKUs." : "Orders appear here once the clinic admin creates them."}
        />
      ) : (
        <div className="admin-scroll">
          <table className="admin-table">
            <caption className="sr-only">Purchase orders</caption>
            <thead>
              <tr><th>Created</th><th>Supplier</th><th>Status</th><th>Received of ordered</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {orders.map((po) => {
                const open = po.status !== "received" && po.status !== "cancelled";
                const busy = rowStatus.busyKey === po.id;
                return (
                  <tr key={po.id}>
                    <td>{new Date(po.created_at).toLocaleDateString()}</td>
                    <td>{supplierName(po)}</td>
                    <td><span className={`status-pill ${poTone(po.status)}`}>{humanize(po.status)}</span></td>
                    <td>
                      <ul className="space-y-0.5">
                        {po.lines?.map((l) => (
                          <li key={l.id}>
                            {itemName(l.inventory_item_id)}: {qtyLabel(l.quantity_received)} of {qtyLabel(l.quantity_ordered)}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td>
                      {open && (canIssue || canManage) ? (
                        <div className="flex flex-wrap gap-2">
                          {canIssue && (
                            <button type="button" className="btn-ghost" disabled={rowStatus.busy} onClick={() => receiveAll(po)}>
                              {busy ? "Receiving…" : "Receive remaining"}
                            </button>
                          )}
                          {canManage && (
                            <ConfirmAction
                              label="Cancel order"
                              confirmLabel="Yes, cancel order"
                              cancelLabel="Keep order"
                              variant="danger"
                              destructive
                              disabled={rowStatus.busy}
                              message={`Cancel the order from ${supplierName(po)}? Items not yet received can no longer be received on it.`}
                              onConfirm={() => cancelPo(po)}
                            />
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-muted">No actions</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SuppliersPanel({
  suppliers,
  canManage,
  onReload,
}: {
  suppliers: WarehouseSupplier[];
  canManage: boolean;
  onReload: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState<WarehouseSupplier | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [history, setHistory] = useState<SupplierHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState("");
  const [historyError, setHistoryError] = useState("");
  const createStatus = useSubmit();
  const editStatus = useSubmit();
  const editFirstField = useRef<HTMLInputElement>(null);
  const keepActiveButton = useRef<HTMLButtonElement>(null);
  const historyHeading = useRef<HTMLHeadingElement>(null);

  const original = edit ? suppliers.find((s) => s.id === edit.id) : undefined;
  const deactivating = !!original?.is_active && !!edit && !edit.is_active;
  const term = search.trim().toLowerCase();
  const visible = term
    ? suppliers.filter((s) => `${s.name} ${s.contact_phone || ""} ${s.contact_email || ""}`.toLowerCase().includes(term))
    : suppliers;

  useEffect(() => {
    if (edit) editFirstField.current?.focus();
  }, [edit?.id]);

  useEffect(() => {
    if (confirmDeactivate) keepActiveButton.current?.focus();
  }, [confirmDeactivate]);

  useEffect(() => {
    if (history) historyHeading.current?.focus();
  }, [history]);

  function openEdit(s: WarehouseSupplier) {
    setConfirmDeactivate(false);
    editStatus.succeed("");
    setEdit(s);
  }

  function closeEdit(id: string) {
    setConfirmDeactivate(false);
    setEdit(null);
    queueMicrotask(() => document.getElementById(`supplier-edit-${id}`)?.focus());
  }

  function onCreate(e: FormEvent) {
    e.preventDefault();
    const added = name.trim();
    void createStatus.run(
      async () => {
        await api("/api/v1/inventory/suppliers", {
          method: "POST",
          body: JSON.stringify({ name, contact_phone: phone || null, contact_email: email || null }),
        });
        setName("");
        setPhone("");
        setEmail("");
        await onReload();
      },
      `Added supplier ${added}.`,
      "add this supplier",
    );
  }

  async function loadHistory(id: string) {
    setHistoryError("");
    setHistoryLoading(id);
    try {
      setHistory(await api<SupplierHistory>(`/api/v1/inventory/suppliers/${id}/history`));
    } catch (err: unknown) {
      setHistoryError(explainFailure(err, "load this supplier's history"));
    } finally {
      setHistoryLoading("");
    }
  }

  function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!edit) return;
    if (deactivating && !confirmDeactivate) {
      setConfirmDeactivate(true);
      return;
    }
    const draft = edit;
    void editStatus
      .run(
        async () => {
          await api(`/api/v1/inventory/suppliers/${draft.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              name: draft.name,
              contact_phone: draft.contact_phone || null,
              contact_email: draft.contact_email || null,
              is_active: draft.is_active,
            }),
          });
          await onReload();
        },
        deactivating ? `Deactivated ${draft.name}.` : `Saved ${draft.name}.`,
        "save this supplier",
      )
      .then((saved) => {
        if (!saved) return;
        closeEdit(draft.id);
        createStatus.succeed(deactivating ? `Deactivated ${draft.name}.` : `Saved ${draft.name}.`);
      });
  }

  return (
    <div className="space-y-3">
      {canManage && (
        <form className="glass-panel grid gap-3 p-4 md:grid-cols-3" onSubmit={onCreate}>
          <h3 className="reg-section__title md:col-span-3">Add supplier</h3>
          <ConfigField label="Supplier name (required)">
            <input className="input" value={name} autoComplete="organization" onChange={(e) => setName(e.target.value)} required />
          </ConfigField>
          <ConfigField label="Phone">
            <input className="input" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </ConfigField>
          <ConfigField label="Email">
            <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </ConfigField>
          <div className="md:col-span-3">
            <button className="btn-primary" type="submit" disabled={createStatus.busy}>
              {createStatus.busy ? "Adding…" : "Add supplier"}
            </button>
          </div>
        </form>
      )}
      <ConfigStatus error={createStatus.error} ok={createStatus.ok} />
      {!suppliers.length ? (
        <EmptyState
          title="No suppliers"
          hint={canManage ? "Add the vendors you buy from." : "The clinic admin adds the vendors the clinic buys from."}
        />
      ) : (
        <section className="glass-panel space-y-3 p-4">
          <h3 className="reg-section__title">Suppliers ({suppliers.length})</h3>
          {suppliers.length > 8 && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-[14rem] flex-1 text-sm">
                <span className="label">Search suppliers</span>
                <span className="search-field">
                  <Search className="search-field__icon" aria-hidden="true" />
                  <input
                    className="input"
                    type="search"
                    value={search}
                    autoComplete="off"
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Name, phone, or email"
                  />
                </span>
              </label>
              {term && (
                <button type="button" className="btn-ghost" onClick={() => setSearch("")}>Clear search</button>
              )}
              <p className="basis-full text-sm text-muted" aria-live="polite">
                Showing {visible.length} of {suppliers.length} suppliers.
              </p>
            </div>
          )}
          {!visible.length && <p className="text-sm text-muted">No suppliers match this search.</p>}
          <ul className="divide-y divide-brand-100">
            {visible.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0 text-sm">
                  <strong className="text-text">{s.name}</strong>
                  <span className="text-muted"> {s.contact_phone || s.contact_email || ""}</span>
                  {!s.is_active && <span className="status-pill ml-2">Inactive</span>}
                </span>
                <span className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-ghost"
                    aria-label={`History for ${s.name}`}
                    disabled={historyLoading === s.id}
                    onClick={() => void loadHistory(s.id)}
                  >
                    {historyLoading === s.id ? "Loading…" : "History"}
                  </button>
                  {canManage && (
                    <button
                      id={`supplier-edit-${s.id}`}
                      type="button"
                      className="btn-ghost"
                      aria-label={`Edit ${s.name}`}
                      onClick={() => openEdit(s)}
                    >
                      Edit
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {historyError && <p className="text-sm font-semibold text-danger" role="alert">{historyError}</p>}
      {history && (
        <section className="glass-panel space-y-3 p-4">
          <h3 ref={historyHeading} tabIndex={-1} className="reg-section__title">Procurement history · {history.supplier.name}</h3>
          <p className="text-sm text-muted">{history.purchase_orders.length} purchase orders · {history.receives.length} receives</p>
          {history.purchase_orders.length === 0 ? (
            <p className="text-sm text-muted">No purchase orders for this vendor yet.</p>
          ) : (
            <ul className="divide-y divide-brand-100">
              {history.purchase_orders.slice(0, 8).map((po) => (
                <li key={po.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    <span className={`status-pill ${poTone(po.status)} mr-2`}>{humanize(po.status)}</span>
                    {po.lines?.map((l) => `${qtyLabel(l.quantity_received)} of ${qtyLabel(l.quantity_ordered)}`).join(", ")}
                  </span>
                  <span className="text-sm text-muted">{new Date(po.created_at).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn-ghost" onClick={() => setHistory(null)}>Close history</button>
        </section>
      )}
      {edit && (
        <form className="glass-panel grid gap-3 p-4 md:grid-cols-3" onSubmit={saveEdit}>
          <h3 className="reg-section__title md:col-span-3">Edit supplier · {original?.name || edit.name}</h3>
          <ConfigField label="Supplier name (required)">
            <input
              ref={editFirstField}
              className="input"
              value={edit.name}
              autoComplete="organization"
              required
              onChange={(e) => setEdit({ ...edit, name: e.target.value })}
            />
          </ConfigField>
          <ConfigField label="Phone">
            <input className="input" type="tel" autoComplete="tel" value={edit.contact_phone || ""} onChange={(e) => setEdit({ ...edit, contact_phone: e.target.value })} />
          </ConfigField>
          <ConfigField label="Email">
            <input className="input" type="email" autoComplete="email" value={edit.contact_email || ""} onChange={(e) => setEdit({ ...edit, contact_email: e.target.value })} />
          </ConfigField>
          <label className="choice-row md:col-span-3">
            <input
              type="checkbox"
              checked={edit.is_active}
              onChange={(e) => {
                setConfirmDeactivate(false);
                setEdit({ ...edit, is_active: e.target.checked });
              }}
            />
            Active (shown when ordering and receiving)
          </label>
          {confirmDeactivate ? (
            <div className="flex flex-wrap items-center gap-2 md:col-span-3" role="group" aria-labelledby="supplier-deactivate-msg">
              <p id="supplier-deactivate-msg" className="basis-full text-sm text-text">
                Deactivate {original?.name || edit.name}? It will no longer appear when creating orders or receiving stock. Its order history stays.
              </p>
              <button className="btn-ghost text-danger" type="submit" disabled={editStatus.busy}>
                {editStatus.busy ? "Saving…" : "Deactivate supplier"}
              </button>
              <button
                ref={keepActiveButton}
                className="btn-ghost"
                type="button"
                disabled={editStatus.busy}
                onClick={() => {
                  setConfirmDeactivate(false);
                  setEdit({ ...edit, is_active: true });
                }}
              >
                Keep active
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 md:col-span-3">
              <button className="btn-primary" type="submit" disabled={editStatus.busy}>
                {editStatus.busy ? "Saving…" : "Save supplier"}
              </button>
              <button className="btn-ghost" type="button" disabled={editStatus.busy} onClick={() => closeEdit(edit.id)}>
                Cancel
              </button>
            </div>
          )}
          <div className="md:col-span-3">
            <ConfigStatus error={editStatus.error} />
          </div>
        </form>
      )}
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
  const [search, setSearch] = useState("");
  const names = Object.fromEntries(items.map((i) => [i.id, `${i.sku} ${i.name}`]));
  const locs = Object.fromEntries(locations.map((l) => [l.id, l.name || l.code]));
  const types = Array.from(new Set(movements.map((m) => m.movement_type))).sort();
  const term = search.trim().toLowerCase();
  const filtered = type !== "all" || term !== "";
  const rows = movements.filter((m) => {
    if (type !== "all" && m.movement_type !== type) return false;
    if (!term) return true;
    return `${names[m.inventory_item_id] || ""} ${m.reason || ""}`.toLowerCase().includes(term);
  });

  function clearFilters() {
    setType("all");
    setSearch("");
  }

  if (!movements.length) {
    return <EmptyState title="No movements yet" hint="Receives, issues, and write-offs appear here." />;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[14rem] flex-1 text-sm">
          <span className="label">Search movements</span>
          <span className="search-field">
            <Search className="search-field__icon" aria-hidden="true" />
            <input
              className="input"
              type="search"
              value={search}
              autoComplete="off"
              onChange={(e) => setSearch(e.target.value)}
              placeholder="SKU, item, or reason"
            />
          </span>
        </label>
        <label className="text-sm">
          <span className="label">Type</span>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>{humanize(t)}</option>
            ))}
          </select>
        </label>
        {filtered && (
          <button type="button" className="btn-ghost" onClick={clearFilters}>Clear filters</button>
        )}
      </div>
      <p className="text-sm text-muted" aria-live="polite">
        Showing {rows.length} of {movements.length} movements.
      </p>
      {!rows.length ? (
        <EmptyState
          title="No matching movements"
          hint="Nothing matches this search and type."
          action={<button type="button" className="btn-ghost" onClick={clearFilters}>Clear filters</button>}
        />
      ) : (
        <div className="admin-scroll">
          <table className="admin-table">
            <caption className="sr-only">Stock movements</caption>
            <thead>
              <tr><th>When</th><th>Type</th><th>Item</th><th>Qty</th><th>From / to</th><th>Reason</th></tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td>{new Date(m.created_at).toLocaleString()}</td>
                  <td><span className="status-pill">{humanize(m.movement_type)}</span></td>
                  <td>{names[m.inventory_item_id] || m.inventory_item_id.slice(0, 8)}</td>
                  <td>{qtyLabel(m.quantity)}</td>
                  <td>
                    {locs[m.from_location_id || ""] || "—"} <span aria-hidden="true">→</span>
                    <span className="sr-only"> to </span> {locs[m.to_location_id || ""] || "—"}
                  </td>
                  <td className="text-muted">{m.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FeesPanel({
  items,
  canManage,
  money,
  onReload,
}: {
  items: InventoryItem[];
  canManage: boolean;
  money: (n: number) => string;
  onReload: () => Promise<void>;
}) {
  const [form, setForm] = useState(emptyFee);
  const createStatus = useSubmit();
  const rowStatus = useSubmit();

  function onCreate(e: FormEvent) {
    e.preventDefault();
    const added = form.name.trim();
    void createStatus.run(
      async () => {
        await api("/api/v1/inventory", { method: "POST", body: JSON.stringify({ ...form, quantity: 0, item_kind: "service" }) });
        setForm(emptyFee);
        await onReload();
      },
      `Added registration fee ${added}.`,
      "add this fee",
    );
  }

  function toggle(item: InventoryItem) {
    const turningOn = !item.billable_at_registration;
    void rowStatus.run(
      async () => {
        await api(`/api/v1/inventory/${item.id}`, {
          method: "PATCH",
          body: JSON.stringify({ billable_at_registration: turningOn }),
        });
        await onReload();
      },
      turningOn ? `${item.name} is now charged at registration.` : `${item.name} is no longer charged at registration.`,
      "change this fee",
      item.id,
    );
  }

  return (
    <div className="space-y-3">
      {canManage && (
        <form className="glass-panel grid gap-3 p-4 md:grid-cols-3" onSubmit={onCreate}>
          <h3 className="reg-section__title md:col-span-3">Add registration fee</h3>
          <ConfigField label="SKU (required)">
            <input className="input" value={form.sku} autoComplete="off" onChange={(e) => setForm({ ...form, sku: e.target.value })} required />
          </ConfigField>
          <ConfigField label="Name (required)">
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </ConfigField>
          <ConfigField label="Sale price">
            <input
              className="input"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={form.sale_price}
              onChange={(e) => setForm({ ...form, sale_price: Number(e.target.value) })}
            />
          </ConfigField>
          <div className="md:col-span-3">
            <button className="btn-primary" type="submit" disabled={createStatus.busy}>
              {createStatus.busy ? "Adding…" : "Add registration fee"}
            </button>
          </div>
          <div className="md:col-span-3">
            <ConfigStatus error={createStatus.error} ok={createStatus.ok} />
          </div>
        </form>
      )}
      <ConfigStatus error={rowStatus.error} ok={rowStatus.ok} />
      {!items.length ? (
        <EmptyState
          title="No registration fees"
          hint={canManage ? "Add the fees charged when a patient registers." : "The clinic admin sets registration fees."}
        />
      ) : (
        <div className="admin-scroll">
          <table className="admin-table">
            <caption className="sr-only">Registration fees</caption>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Name</th>
                <th>Price</th>
                <th>At registration</th>
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const busy = rowStatus.busyKey === item.id;
                return (
                  <tr key={item.id}>
                    <td className="font-mono text-sm">{item.sku}</td>
                    <td>{item.name}</td>
                    <td>{money(item.sale_price || item.unit_cost)}</td>
                    <td>
                      {item.billable_at_registration ? (
                        <span className="status-pill status-pill--success">Charged</span>
                      ) : (
                        <span className="status-pill">Not charged</span>
                      )}
                    </td>
                    {canManage && (
                      <td>
                        {item.billable_at_registration ? (
                          <ConfirmAction
                            label="Stop charging"
                            confirmLabel="Yes, stop charging"
                            cancelLabel="Keep charging"
                            destructive
                            disabled={rowStatus.busy}
                            message={`Stop adding ${item.name} to new registrations? Invoices already raised do not change.`}
                            onConfirm={() => toggle(item)}
                          />
                        ) : (
                          <button type="button" className="btn-ghost" disabled={rowStatus.busy} onClick={() => toggle(item)}>
                            {busy ? "Saving…" : "Start charging"}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
