import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { ConfigField, ConfigStatus, ConfirmAction, onTabListKeyDown } from "@/components/config/ConfigUi";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import { PatientSafetyBanner } from "@/components/PatientSafetyBanner";
import { useAnnounce } from "@/components/ui/sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/i18n";
import { hasEffectivePermission } from "@/lib/nav";
import type { InventoryItem } from "@/lib/types";
import { useUiPrefs } from "@/lib/uiPrefs";

const VIEWS = [
  { id: "queue", label: "Queue" },
  { id: "counter", label: "Counter" },
  { id: "shelf", label: "Shelf" },
  { id: "formulary", label: "Formulary" },
] as const;

type View = (typeof VIEWS)[number]["id"];

type Board = {
  waiting: number;
  partial: number;
  dispensed_today: number;
  sales_today: number;
  shelf_short: number;
  expiring: { sku: string; name: string; lot_code: string; expiry_date: string; quantity: number }[];
};

type SaleLine = {
  id: string;
  inventory_item_id?: string | null;
  sku?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

type Sale = {
  id: string;
  sale_number: string;
  patient_id: string;
  patient_name?: string | null;
  patient_code?: string | null;
  invoice_number?: string | null;
  status: string;
  total: number;
  amount_paid: number;
  amount_tendered: number;
  change_due: number;
  payment_method: string;
  payment_reference?: string | null;
  created_at: string;
  lines: SaleLine[];
};

type CartLine = {
  inventory_item_id: string;
  name: string;
  sku: string;
  unit_price: number;
  shelf_on_hand: number;
  is_controlled: boolean;
  quantity: number;
};

type Template = {
  id: string;
  name: string;
  category: string;
  default_dose: string;
  default_quantity: string;
  instructions?: string | null;
  form: string;
  strength?: string | null;
  route: string;
  inventory_item_id?: string | null;
  reorder_level: number;
  is_controlled: boolean;
  is_active: boolean;
  sale_price?: number | null;
};

type RxItem = {
  id: string;
  drug_name: string;
  dose: string;
  quantity: string;
  frequency?: string | null;
  days?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  instructions?: string | null;
  inventory_item_id?: string | null;
  drug_template_id?: string | null;
  quantity_dispensed: number;
  line_status: string;
  shelf_on_hand?: number | null;
  store_on_hand?: number | null;
};

type Dispense = {
  id: string;
  prescription_item_id: string;
  drug_name?: string | null;
  quantity: number;
  quantity_returned: number;
  lot_code?: string | null;
  expiry_date?: string | null;
  label_text?: string | null;
  invoice_id?: string | null;
  unit_price: number;
};

type Rx = {
  id: string;
  rx_number?: string | null;
  patient_id: string;
  patient_name?: string | null;
  patient_code?: string | null;
  prescriber_name?: string | null;
  status: string;
  notes?: string | null;
  prescribed_at: string;
  invoice_id?: string | null;
  order_billed?: boolean;
  cancel_reason?: string | null;
  items: RxItem[];
  dispenses: Dispense[];
};

type ShelfRow = {
  template_id: string;
  name: string;
  category: string;
  form: string;
  sku?: string | null;
  unit?: string | null;
  sale_price?: number | null;
  reorder_level: number;
  shelf_on_hand: number;
  store_on_hand: number;
  inventory_item_id?: string | null;
  is_controlled: boolean;
  is_active: boolean;
};

type PatientHit = { id: string; first_name: string; last_name: string; patient_code: string };

type DraftLine = { key: string; templateId: string; dose: string; quantity: string; instructions: string };

const CATEGORIES = ["antibiotic", "analgesic", "mouthwash", "anaesthetic", "other"];
const FORMS = ["tablet", "capsule", "syrup", "gel", "rinse", "injection"];
const PAY_METHODS = [
  { id: "cash", label: "Cash" },
  { id: "mobile_money", label: "Mobile money" },
  { id: "card", label: "Card" },
  { id: "bank_transfer", label: "Bank transfer" },
];

const FREQUENCY_OPTIONS: { value: string; label: string; times: number }[] = [
  { value: "Once daily", label: "Once daily", times: 1 },
  { value: "Twice daily", label: "Twice daily", times: 2 },
  { value: "Three times daily", label: "Three times daily", times: 3 },
  { value: "Four times daily", label: "Four times daily", times: 4 },
  { value: "Every 8 hours", label: "Every 8 hours", times: 3 },
  { value: "Every 6 hours", label: "Every 6 hours", times: 4 },
  { value: "As needed", label: "As needed", times: 0 },
];

type CourseDraft = {
  templateId: string;
  frequency: string;
  days: number;
  quantity: number;
  startDate: string;
  endDate: string;
  instructions: string;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(start: string, days: number) {
  const d = new Date(`${start}T12:00:00`);
  if (Number.isNaN(d.getTime())) return start;
  d.setDate(d.getDate() + Math.max(days - 1, 0));
  return d.toISOString().slice(0, 10);
}

function unitsFromTemplate(tmpl: Template | undefined) {
  return Math.max(1, Math.round(packs(tmpl?.default_quantity || "1")));
}

function calcQty(unitsEach: number, timesPerDay: number, days: number) {
  if (timesPerDay <= 0) return Math.max(1, unitsEach);
  return Math.max(1, unitsEach * timesPerDay * Math.max(1, days));
}

function courseFromItem(item: RxItem): CourseDraft {
  const days = item.days && item.days > 0 ? item.days : 1;
  const start = item.start_date ? String(item.start_date).slice(0, 10) : todayIso();
  return {
    templateId: item.drug_template_id || "",
    frequency: item.frequency || "Twice daily",
    days,
    quantity: Math.max(1, Math.round(packs(item.quantity))),
    startDate: start,
    endDate: item.end_date ? String(item.end_date).slice(0, 10) : addDaysIso(start, days),
    instructions: item.instructions || "",
  };
}

function courseSummary(item: RxItem) {
  return [
    item.frequency,
    item.dose,
    item.days ? `${item.days} days` : null,
    item.quantity ? `qty ${item.quantity}` : null,
    item.start_date && item.end_date ? `${String(item.start_date).slice(0, 10)} → ${String(item.end_date).slice(0, 10)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function explain(err: unknown, fallback: string) {
  const message = err instanceof ApiError ? err.message : fallback;
  if (/network|failed to fetch/i.test(message)) return `${message} Check your connection and try again.`;
  return message;
}

function packs(raw: string) {
  const match = raw.match(/[\d.]+/);
  const value = match ? Number(match[0]) : 1;
  return Number.isFinite(value) ? value : 1;
}

function showQty(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function titleCase(value?: string | null) {
  if (!value) return "—";
  return value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
}

function statusTone(status: string) {
  if (status === "dispensed" || status === "fulfilled") return "status-pill--success";
  if (status === "partial" || status === "active" || status === "pending") return "status-pill--info";
  if (status === "cancelled" || status === "rejected") return "status-pill--danger";
  return "status-pill--warning";
}

function can(perms: string[] | undefined, permission: string, role: string | undefined, roles: string[]) {
  if (perms?.length) return hasEffectivePermission(perms, permission);
  return roles.includes(role || "");
}

export function PharmacyPage() {
  const user = useAuth((s) => s.user);
  const currency = useUiPrefs((s) => s.currency);
  const locale = useUiPrefs((s) => s.locale);
  const perms = user?.effective_permissions;
  const canDispense = can(perms, "pharmacy:*", user?.role, ["pharmacy", "dentist", "super_admin"]);
  const canFormulary =
    canDispense || can(perms, "config:*", user?.role, ["clinic_admin", "super_admin"]);
  const canRequest =
    canDispense || can(perms, "requisition:*", user?.role, ["clinic_admin", "super_admin"]);

  const [view, setView] = useState<View>("queue");
  const [queueFilter, setQueueFilter] = useState("waiting");
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");
  const [board, setBoard] = useState<Board | null>(null);
  const [rows, setRows] = useState<Rx[]>([]);
  const [shelfRows, setShelfRows] = useState<ShelfRow[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [stock, setStock] = useState<InventoryItem[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  useAnnounce(error);
  useAnnounce(ok);
  const [prescribeOpen, setPrescribeOpen] = useState(false);
  const [active, setActive] = useState<Rx | null>(null);
  const [editing, setEditing] = useState<Template | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setQ(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  async function load(nextQ = q, nextStatus = queueFilter) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (nextStatus) params.set("status", nextStatus);
      if (nextQ) params.set("q", nextQ);
      const [home, queue, shelfData, drugs, inv, recentSales] = await Promise.all([
        api<Board>("/api/v1/pharmacy/board"),
        api<Rx[]>(`/api/v1/pharmacy/prescriptions?${params.toString()}`),
        api<ShelfRow[]>("/api/v1/pharmacy/shelf"),
        api<Template[]>("/api/v1/pharmacy/templates?include_inactive=true"),
        api<InventoryItem[]>("/api/v1/inventory?item_kind=stock").catch(() => [] as InventoryItem[]),
        api<Sale[]>("/api/v1/pharmacy/sales").catch(() => [] as Sale[]),
      ]);
      setBoard(home);
      setRows(queue);
      setShelfRows(shelfData);
      setTemplates(drugs);
      setStock(inv);
      setSales(recentSales);
      setActive((current) => (current ? queue.find((row) => row.id === current.id) || current : null));
    } catch (err) {
      setError(explain(err, "Pharmacy could not be loaded"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(q, queueFilter);
  }, [q, queueFilter]);

  async function requestShelf(lines?: { inventory_item_id: string; quantity: number }[]) {
    setError("");
    setOk("");
    try {
      const req = await api<{ req_number: string }>("/api/v1/pharmacy/shelf/request", {
        method: "POST",
        body: JSON.stringify(lines ? { lines } : {}),
      });
      setOk(`Requested from the main store (${req.req_number}). Warehouse issues it onto the shelf.`);
      await load();
    } catch (err) {
      setError(explain(err, "Could not request stock"));
    }
  }

  const activeTemplates = templates.filter((row) => row.is_active);
  const money = (amount: number) => formatMoney(amount, currency, locale);

  return (
    <div className="clin-shell space-y-4">
      <header className="clin-head">
        <div>
          <h2 className="font-display text-2xl font-bold text-brand-900">Pharmacy</h2>
          <p className="text-sm text-muted">
            Dispense chair prescriptions from the shelf, or sell walk-in items at the counter. Stock
            leaves the pharmacy shelf only, and the sale is paid on the same invoice.
          </p>
        </div>
        {canDispense && (
          <button className="btn-primary" type="button" onClick={() => setPrescribeOpen(true)}>
            New prescription
          </button>
        )}
      </header>

      {board && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["Waiting", board.waiting],
            ["Partial fills", board.partial],
            ["Dispensed today", board.dispensed_today],
            ["Sales today", board.sales_today],
            ["Shelf short", board.shelf_short],
          ].map(([label, value]) => (
            <div key={String(label)} className="glass-panel">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
              <p className="font-display text-2xl font-bold text-brand-900">{value}</p>
            </div>
          ))}
        </div>
      )}

      {board && board.expiring.length > 0 && (
        <p className="text-sm text-muted" role="status">
          Expiring on the shelf within 90 days:{" "}
          {board.expiring.map((lot) => `${lot.name} lot ${lot.lot_code} (${lot.expiry_date})`).join("; ")}
        </p>
      )}

      <div
        className="admin-tabs"
        role="tablist"
        aria-label="Pharmacy"
        onKeyDown={(e) =>
          onTabListKeyDown(
            e,
            VIEWS.map((tab) => tab.id),
            view,
            (id) => {
              setView(id);
              queueMicrotask(() => document.getElementById(`pharm-tab-${id}`)?.focus());
            },
          )
        }
      >
        {VIEWS.map((tab) => (
          <button
            key={tab.id}
            id={`pharm-tab-${tab.id}`}
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

      <ConfigStatus loading={loading && rows.length === 0} error={error} ok={ok} />

      {view === "queue" && (
        <section className="glass-panel space-y-3">
          <div className="grid gap-3 md:grid-cols-[1fr_12rem]">
            <label className="block text-sm">
              <span className="label">Find a prescription</span>
              <span className="search-field">
                <Search className="search-field__icon" size={18} aria-hidden />
                <input
                  className="input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Patient, file number, or Rx number"
                />
              </span>
            </label>
            <label className="text-sm">
              <span className="label">Show</span>
              <select className="input" value={queueFilter} onChange={(e) => setQueueFilter(e.target.value)}>
                <option value="waiting">Waiting and partial</option>
                <option value="partial">Partial only</option>
                <option value="dispensed">Dispensed</option>
                <option value="cancelled">Cancelled</option>
                <option value="all">All</option>
              </select>
            </label>
          </div>
          {rows.length === 0 && !loading ? (
            <EmptyState title="No prescriptions in this list" hint="A chair prescription appears here as soon as it is signed." />
          ) : (
            <ul className="divide-y divide-brand-100">
              {rows.map((rx) => (
                <li key={rx.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-brand-700">{rx.rx_number || "RX"}</span>
                      <span className={`status-pill ${statusTone(rx.status)}`}>{titleCase(rx.status)}</span>
                    </div>
                    <p className="font-semibold text-brand-900">
                      <Link to={`/patients/${rx.patient_id}`}>{rx.patient_name || "Patient"}</Link>
                      {rx.patient_code ? <span className="ml-2 text-xs text-muted">{rx.patient_code}</span> : null}
                    </p>
                    <p className="text-sm text-muted">
                      {rx.items.map((item) => item.drug_name).join(", ")}
                    </p>
                    <p className="text-xs text-muted">
                      {rx.items.map((item) => courseSummary(item) || item.dose).join("; ")}
                    </p>
                    <p className="text-xs text-muted">
                      {rx.prescriber_name ? `Signed by ${rx.prescriber_name}` : "Signed"} ·{" "}
                      {new Date(rx.prescribed_at).toLocaleString()}
                    </p>
                  </div>
                  <button className="btn-ghost" type="button" onClick={() => setActive(rx)}>
                    {canDispense && (rx.status === "active" || rx.status === "partial" || rx.status === "draft")
                      ? "Dispense"
                      : "Open"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {view === "counter" && (
        <CounterPanel
          rows={shelfRows.filter((row) => row.is_active && row.inventory_item_id)}
          sales={sales}
          canSell={canDispense}
          money={money}
          onSold={async (message) => {
            setOk(message);
            await load();
          }}
        />
      )}

      {view === "shelf" && (
        <ShelfPanel
          rows={shelfRows}
          canRequest={canRequest}
          money={money}
          onRequest={() => void requestShelf()}
        />
      )}

      {view === "formulary" && (
        <FormularyPanel
          templates={templates}
          stock={stock}
          canEdit={canFormulary}
          onEdit={setEditing}
          onChanged={async (message) => {
            setOk(message);
            await load();
          }}
          onError={setError}
        />
      )}

      {prescribeOpen && canDispense && (
        <PrescribeDialog
          templates={activeTemplates}
          onClose={() => setPrescribeOpen(false)}
          onSaved={async (message) => {
            setPrescribeOpen(false);
            setOk(message);
            setQueueFilter("waiting");
            await load(q, "waiting");
          }}
        />
      )}

      {active && (
        <DispenseDialog
          rx={active}
          templates={templates}
          canDispense={canDispense}
          money={money}
          onClose={() => setActive(null)}
          onChanged={async (message) => {
            setOk(message);
            await load();
          }}
          onRequest={requestShelf}
        />
      )}

      {editing && canFormulary && (
        <DrugDialog
          initial={editing.id ? editing : null}
          stock={stock}
          onClose={() => setEditing(null)}
          onSaved={async (message) => {
            setEditing(null);
            setOk(message);
            await load();
          }}
        />
      )}
    </div>
  );
}

function ShelfPanel({
  rows,
  canRequest,
  money,
  onRequest,
}: {
  rows: ShelfRow[];
  canRequest: boolean;
  money: (amount: number) => string;
  onRequest: () => void;
}) {
  const short = rows.filter((row) => row.is_active && row.inventory_item_id && row.shelf_on_hand <= row.reorder_level);
  return (
    <section className="glass-panel space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          Dispensing uses the pharmacy shelf only. The main store stays in Warehouse until it is issued here.
        </p>
        {canRequest && (
          <button className="btn-primary" type="button" onClick={onRequest} disabled={short.length === 0}>
            Request short stock
          </button>
        )}
      </div>
      <p className="text-sm">
        <Link to="/inventory?view=requests">Open warehouse requests</Link>
        <span className="text-muted"> to approve and issue.</span>
      </p>
      {rows.length === 0 ? (
        <EmptyState title="No formulary drugs" hint="Add a drug and link it to a warehouse SKU." />
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table w-full text-left">
            <thead>
              <tr>
                <th>Drug</th>
                <th>Shelf</th>
                <th>Main store</th>
                <th>Reorder</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              {rows.filter((row) => row.is_active).map((row) => {
                const low = Boolean(row.inventory_item_id) && row.shelf_on_hand <= row.reorder_level;
                return (
                  <tr key={row.template_id}>
                    <td>
                      <div className="font-semibold">{row.name}</div>
                      <div className="text-xs text-muted">
                        {row.sku || "Not linked to stock"} · {row.form}
                        {row.is_controlled ? " · Controlled" : ""}
                      </div>
                    </td>
                    <td className={low ? "font-semibold text-danger" : ""}>
                      {showQty(row.shelf_on_hand)} {row.unit || ""}
                    </td>
                    <td>
                      {showQty(row.store_on_hand)} {row.unit || ""}
                    </td>
                    <td>{showQty(row.reorder_level)}</td>
                    <td>{row.sale_price != null ? money(row.sale_price) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FormularyPanel({
  templates,
  stock,
  canEdit,
  onEdit,
  onChanged,
  onError,
}: {
  templates: Template[];
  stock: InventoryItem[];
  canEdit: boolean;
  onEdit: (row: Template) => void;
  onChanged: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const sku = useMemo(() => new Map(stock.map((item) => [item.id, item])), [stock]);
  return (
    <section className="glass-panel space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">The formulary is what clinicians prescribe. Link each drug to the SKU on the shelf.</p>
        {canEdit && (
          <button
            className="btn-primary"
            type="button"
            onClick={() =>
              onEdit({
                id: "",
                name: "",
                category: "analgesic",
                default_dose: "",
                default_quantity: "1",
                form: "tablet",
                route: "oral",
                reorder_level: 0,
                is_controlled: false,
                is_active: true,
              })
            }
          >
            Add drug
          </button>
        )}
      </div>
      {templates.length === 0 ? (
        <EmptyState title="Formulary is empty" />
      ) : (
        <ul className="divide-y divide-brand-100">
          {templates.map((row) => {
            const item = row.inventory_item_id ? sku.get(row.inventory_item_id) : undefined;
            return (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold">
                    {row.name}{" "}
                    {!row.is_active && <span className="status-pill status-pill--warning">Inactive</span>}
                    {row.is_controlled && <span className="status-pill status-pill--danger">Controlled</span>}
                  </p>
                  <p className="text-sm text-muted">
                    {titleCase(row.category)} · {row.form} · {row.default_dose} · qty {row.default_quantity}
                    {item ? ` · ${item.sku}` : " · no SKU"}
                  </p>
                </div>
                {canEdit && row.is_active && (
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-ghost" type="button" onClick={() => onEdit(row)}>
                      Edit
                    </button>
                    <ConfirmAction
                      label="Deactivate"
                      confirmLabel="Deactivate drug"
                      onConfirm={async () => {
                        try {
                          await api(`/api/v1/pharmacy/templates/${row.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({ is_active: false }),
                          });
                          await onChanged(`${row.name} deactivated`);
                        } catch (err) {
                          onError(explain(err, "Could not deactivate that drug"));
                        }
                      }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function CounterPanel({
  rows,
  sales,
  canSell,
  money,
  onSold,
}: {
  rows: ShelfRow[];
  sales: Sale[];
  canSell: boolean;
  money: (amount: number) => string;
  onSold: (message: string) => Promise<void>;
}) {
  const [find, setFind] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [patientQuery, setPatientQuery] = useState("");
  const [hits, setHits] = useState<PatientHit[]>([]);
  const [patient, setPatient] = useState<PatientHit | null>(null);
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [tendered, setTendered] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  useAnnounce(error);

  useEffect(() => {
    const needle = patientQuery.trim();
    if (needle.length < 2 || patient) {
      setHits([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void api<{ items: PatientHit[] }>(`/api/v1/patients?limit=8&q=${encodeURIComponent(needle)}`)
        .then((page) => setHits(page.items))
        .catch(() => setHits([]));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [patientQuery, patient]);

  const needle = find.trim().toLowerCase();
  const catalog = rows.filter((row) => {
    if (!needle) return true;
    return `${row.name} ${row.sku || ""} ${row.category}`.toLowerCase().includes(needle);
  });
  const total = cart.reduce((sum, line) => sum + line.quantity * line.unit_price, 0);
  const received = method === "cash" ? Number(tendered || 0) : total;
  const change = method === "cash" ? Math.max(received - total, 0) : 0;
  const controlled = cart.some((line) => line.is_controlled);
  const shortCash = method === "cash" && (tendered.trim() === "" || received + 0.001 < total);

  function addRow(row: ShelfRow) {
    if (!row.inventory_item_id || !row.sale_price || row.sale_price <= 0) return;
    const cap = Math.floor(Number(row.shelf_on_hand) || 0);
    if (cap < 1) return;
    setReceipt(null);
    setCart((current) => {
      const found = current.find((line) => line.inventory_item_id === row.inventory_item_id);
      if (!found) {
        return [
          ...current,
          {
            inventory_item_id: row.inventory_item_id || "",
            name: row.name,
            sku: row.sku || "",
            unit_price: row.sale_price || 0,
            shelf_on_hand: row.shelf_on_hand,
            is_controlled: row.is_controlled,
            quantity: 1,
          },
        ];
      }
      if (found.quantity >= cap) return current;
      return current.map((line) =>
        line.inventory_item_id === row.inventory_item_id ? { ...line, quantity: line.quantity + 1, shelf_on_hand: row.shelf_on_hand } : line,
      );
    });
  }

  function setQty(id: string, next: number, cap: number) {
    setCart((current) =>
      current
        .map((line) => (line.inventory_item_id === id ? { ...line, quantity: Math.min(Math.max(next, 1), Math.max(cap, 1)) } : line))
        .filter((line) => line.quantity > 0),
    );
  }

  async function checkout(acknowledge = false) {
    if (!patient) {
      setError("Choose the patient who is paying");
      return;
    }
    if (cart.length === 0) {
      setError("Add at least one shelf item");
      return;
    }
    if (controlled && notes.trim().length < 3) {
      setError("Controlled medicine needs a register note");
      return;
    }
    if (shortCash) {
      setError("Cash received is less than the total");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (!acknowledge) {
        const warnings: string[] = [];
        for (const line of cart) {
          const warn = await api<{ warnings: string[] }>("/api/v1/pharmacy/warn", {
            method: "POST",
            body: JSON.stringify({ patient_id: patient.id, drug_name: line.name }),
          });
          warnings.push(...(warn.warnings || []));
        }
        if (warnings.length) {
          const proceed = window.confirm(`${warnings.join("\n")}\n\nSell anyway?`);
          if (!proceed) {
            setBusy(false);
            return;
          }
          acknowledge = true;
        }
      }
      const sale = await api<Sale>("/api/v1/pharmacy/sales", {
        method: "POST",
        body: JSON.stringify({
          patient_id: patient.id,
          lines: cart.map((line) => ({ inventory_item_id: line.inventory_item_id, quantity: line.quantity })),
          payment_method: method,
          payment_reference: reference.trim() || null,
          amount_tendered: method === "cash" ? received : total,
          notes: notes.trim() || null,
          acknowledge_warnings: acknowledge,
        }),
      });
      setReceipt(sale);
      setCart([]);
      setNotes("");
      setReference("");
      setTendered("");
      await onSold(`Sale ${sale.sale_number} paid ${money(sale.amount_paid)}`);
    } catch (err) {
      setError(explain(err, "Could not complete the sale"));
    } finally {
      setBusy(false);
    }
  }

  function printReceipt(sale: Sale) {
    const page = window.open("", "pharm-receipt", "noopener,width=420,height=640");
    if (!page) return;
    const lines = sale.lines
      .map((line) => `${line.description}  x${line.quantity}  ${line.line_total}`)
      .join("\n");
    const text = [
      sale.sale_number,
      sale.patient_name || "Patient",
      sale.patient_code || "",
      "",
      lines,
      "",
      `Total ${sale.total}`,
      `Paid ${sale.amount_paid} (${sale.payment_method})`,
      sale.change_due > 0 ? `Change ${sale.change_due}` : "",
      sale.invoice_number ? `Invoice ${sale.invoice_number}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const safe = text.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
    page.document.write(`<pre style="font:16px/1.45 sans-serif;padding:24px">${safe}</pre>`);
    page.document.close();
    page.focus();
    page.print();
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
      <section className="glass-panel space-y-3">
        <label className="block text-sm">
          <span className="label">Find a shelf item</span>
          <span className="search-field">
            <Search className="search-field__icon" size={18} aria-hidden />
            <input className="input" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Name or SKU" />
          </span>
        </label>
        {catalog.length === 0 ? (
          <EmptyState title="Nothing on the shelf matches" hint="Link a formulary drug to a SKU, then move stock onto the pharmacy shelf." />
        ) : (
          <ul className="counter-catalog">
            {catalog.map((row) => {
              const priced = (row.sale_price || 0) > 0;
              const onHand = Math.floor(Number(row.shelf_on_hand) || 0);
              const inCart = cart.find((line) => line.inventory_item_id === row.inventory_item_id);
              const canAdd = canSell && priced && onHand >= 1;
              const reason = !priced ? "No sale price" : onHand < 1 ? "Out of stock on the shelf" : "";
              return (
                <li key={row.inventory_item_id || row.template_id}>
                  <button
                    type="button"
                    className={`counter-pick ${inCart ? "counter-pick--on" : ""}`}
                    aria-pressed={Boolean(inCart)}
                    disabled={!canAdd}
                    onClick={() => addRow(row)}
                  >
                    <span>
                      <span className="font-semibold text-brand-900">
                        {row.name}
                        {row.is_controlled ? <span className="ml-2 text-xs font-semibold text-red-700">Controlled</span> : null}
                      </span>
                      <span className="mt-0.5 block text-sm text-muted">
                        {row.sku || "No SKU"} · shelf {showQty(row.shelf_on_hand)}
                        {row.unit ? ` ${row.unit}` : ""} · {priced ? money(row.sale_price || 0) : "No sale price"}
                        {reason ? ` · ${reason}` : ""}
                      </span>
                    </span>
                    <span className="counter-pick__action">
                      {inCart ? `In cart · ${inCart.quantity}` : canAdd ? "Add" : "Unavailable"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="glass-panel counter-cart space-y-3">
        <h3 className="font-display text-lg font-bold text-brand-900">Cart</h3>
        <ConfigStatus error={error} />
        {!canSell && <p className="text-sm text-muted">You can review the shelf. Selling needs pharmacy access.</p>}
        <label className="block text-sm">
          <span className="label">Patient</span>
          {patient ? (
            <span className="flex items-center justify-between gap-2">
              <span>
                {patient.first_name} {patient.last_name}{" "}
                <span className="text-muted">{patient.patient_code}</span>
              </span>
              <button className="btn-ghost" type="button" onClick={() => setPatient(null)}>
                Change
              </button>
            </span>
          ) : (
            <input
              className="input"
              value={patientQuery}
              onChange={(e) => setPatientQuery(e.target.value)}
              placeholder="Name or file number"
            />
          )}
        </label>
        {hits.length > 0 && (
          <ul className="rounded-xl border border-border">
            {hits.map((hit) => (
              <li key={hit.id}>
                <button
                  className="btn-ghost w-full justify-start"
                  type="button"
                  onClick={() => {
                    setPatient(hit);
                    setPatientQuery("");
                    setHits([]);
                  }}
                >
                  {hit.first_name} {hit.last_name} · {hit.patient_code}
                </button>
              </li>
            ))}
          </ul>
        )}
        {patient && <PatientSafetyBanner patientId={patient.id} />}
        {cart.length === 0 ? (
          <EmptyState title="Cart is empty" hint="Add shelf items, choose the patient, then take payment." />
        ) : (
          <ul className="space-y-2">
            {cart.map((line) => (
              <li key={line.inventory_item_id} className="rounded-xl border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{line.name}</p>
                    <p className="text-sm text-muted">
                      {line.sku} · {money(line.unit_price)} · shelf {showQty(line.shelf_on_hand)}
                    </p>
                  </div>
                  <p className="font-semibold">{money(line.quantity * line.unit_price)}</p>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    className="btn-ghost min-h-[var(--touch-min)] min-w-[var(--touch-min)]"
                    type="button"
                    aria-label={`Decrease ${line.name}`}
                    onClick={() => setQty(line.inventory_item_id, line.quantity - 1, Math.floor(line.shelf_on_hand))}
                  >
                    −
                  </button>
                  <span className="min-w-8 text-center text-sm font-semibold">{line.quantity}</span>
                  <button
                    className="btn-ghost min-h-[var(--touch-min)] min-w-[var(--touch-min)]"
                    type="button"
                    aria-label={`Increase ${line.name}`}
                    disabled={line.quantity >= Math.floor(line.shelf_on_hand)}
                    onClick={() => setQty(line.inventory_item_id, line.quantity + 1, Math.floor(line.shelf_on_hand))}
                  >
                    +
                  </button>
                  <button className="btn-ghost" type="button" onClick={() => setCart((current) => current.filter((row) => row.inventory_item_id !== line.inventory_item_id))}>
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="font-display text-xl font-bold text-brand-900">Total {money(total)}</p>
        <label className="block text-sm">
          <span className="label">Payment</span>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAY_METHODS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {method === "cash" ? (
          <label className="block text-sm">
            <span className="label">Cash received</span>
            <input
              className="input"
              inputMode="decimal"
              value={tendered}
              onChange={(e) => setTendered(e.target.value)}
              required
            />
          </label>
        ) : (
          <label className="block text-sm">
            <span className="label">Reference</span>
            <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} />
          </label>
        )}
        {method === "cash" && tendered.trim() !== "" && (
          <p className="text-sm" role="status">
            Change {money(change)}
          </p>
        )}
        <label className="block text-sm">
          <span className="label">{controlled ? "Controlled-drug register note" : "Sale note"}</span>
          <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} required={controlled} />
        </label>
        {canSell && (
          <ConfirmAction
            label="Take payment"
            confirmLabel={busy ? "Saving…" : "Complete sale"}
            onConfirm={() => void checkout(false)}
          />
        )}
        {receipt && (
          <div className="rounded-xl bg-brand-50/70 p-3 text-sm" role="status">
            <p className="font-semibold">
              {receipt.sale_number} · {receipt.patient_name} · {money(receipt.total)}
            </p>
            <p className="text-muted">
              Paid {money(receipt.amount_paid)}
              {receipt.change_due > 0 ? ` · change ${money(receipt.change_due)}` : ""}
              {receipt.invoice_number ? ` · ${receipt.invoice_number}` : ""}
            </p>
            <ul className="mt-2 space-y-1">
              {receipt.lines.map((line) => (
                <li key={line.id}>
                  {line.description} × {line.quantity} · {money(line.line_total)}
                </li>
              ))}
            </ul>
            <button className="btn-ghost mt-2" type="button" onClick={() => printReceipt(receipt)}>
              Print receipt
            </button>
          </div>
        )}
        <h3 className="font-display text-base font-bold">Recent sales</h3>
        {sales.length === 0 ? (
          <p className="text-sm text-muted">No counter sales yet.</p>
        ) : (
          <ul className="divide-y divide-brand-100">
            {sales.slice(0, 8).map((sale) => (
              <li key={sale.id} className="py-2 text-sm">
                <p className="font-semibold">
                  {sale.sale_number} · {sale.patient_name || "Patient"} · {money(sale.total)}
                </p>
                <p className="text-muted">
                  {titleCase(sale.payment_method.replaceAll("_", " "))} · {new Date(sale.created_at).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PrescribeDialog({
  templates,
  onClose,
  onSaved,
}: {
  templates: Template[];
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [patientQuery, setPatientQuery] = useState("");
  const [hits, setHits] = useState<PatientHit[]>([]);
  const [patient, setPatient] = useState<PatientHit | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([
    { key: "1", templateId: templates[0]?.id || "", dose: templates[0]?.default_dose || "", quantity: templates[0]?.default_quantity || "1", instructions: templates[0]?.instructions || "" },
  ]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useAnnounce(error);

  useEffect(() => {
    const needle = patientQuery.trim();
    if (needle.length < 2) {
      setHits([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void api<{ items: PatientHit[] }>(`/api/v1/patients?limit=8&q=${encodeURIComponent(needle)}`)
        .then((page) => setHits(page.items))
        .catch(() => setHits([]));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [patientQuery]);

  function applyTemplate(key: string, templateId: string) {
    const tmpl = templates.find((row) => row.id === templateId);
    setLines((current) =>
      current.map((line) =>
        line.key === key
          ? {
              ...line,
              templateId,
              dose: tmpl?.default_dose || line.dose,
              quantity: tmpl?.default_quantity || line.quantity,
              instructions: tmpl?.instructions || "",
            }
          : line,
      ),
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!patient) {
      setError("Choose a patient");
      return;
    }
    const ready = lines.filter((line) => line.templateId && line.dose.trim() && line.quantity.trim());
    if (ready.length === 0) {
      setError("Add at least one drug from the formulary");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const warnings: string[] = [];
      for (const line of ready) {
        const tmpl = templates.find((row) => row.id === line.templateId);
        if (!tmpl) continue;
        const warn = await api<{ warnings: string[] }>("/api/v1/pharmacy/warn", {
          method: "POST",
          body: JSON.stringify({ patient_id: patient.id, drug_name: tmpl.name }),
        });
        warnings.push(...(warn.warnings || []));
      }
      if (warnings.length) {
        const proceed = window.confirm(`${warnings.join("\n")}\n\nSign the prescription anyway?`);
        if (!proceed) {
          setBusy(false);
          return;
        }
      }
      await api("/api/v1/pharmacy/prescriptions", {
        method: "POST",
        body: JSON.stringify({
          patient_id: patient.id,
          notes: notes.trim() || null,
          items: ready.map((line) => {
            const tmpl = templates.find((row) => row.id === line.templateId)!;
            return {
              drug_name: tmpl.name,
              dose: line.dose.trim(),
              quantity: line.quantity.trim(),
              instructions: line.instructions.trim() || null,
              drug_template_id: tmpl.id,
            };
          }),
        }),
      });
      await onSaved(`Prescription sent to the pharmacy queue for ${patient.first_name} ${patient.last_name}`);
    } catch (err) {
      setError(explain(err, "Could not sign the prescription"));
      setBusy(false);
    }
  }

  return (
    <Modal
      title="New prescription"
      subtitle="This goes to the pharmacy queue. Stock is taken only when the shelf dispenses it."
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost" type="button" onClick={onClose}>
            Close
          </button>
          <button className="btn-primary" type="submit" form="rx-form" disabled={busy}>
            {busy ? "Signing…" : "Sign prescription"}
          </button>
        </>
      }
    >
      <form id="rx-form" className="space-y-4" onSubmit={onSubmit}>
        <ConfigStatus error={error} />
        <ConfigField label="Patient">
          <input
            className="input"
            value={patient ? `${patient.first_name} ${patient.last_name}` : patientQuery}
            onChange={(e) => {
              setPatient(null);
              setPatientQuery(e.target.value);
            }}
            placeholder="Type a name or file number"
            required
          />
        </ConfigField>
        {!patient && hits.length > 0 && (
          <ul className="divide-y divide-brand-100 rounded-xl border border-border">
            {hits.map((hit) => (
              <li key={hit.id}>
                <button
                  className="w-full px-3 py-2 text-left text-sm hover:bg-brand-50"
                  type="button"
                  onClick={() => {
                    setPatient(hit);
                    setHits([]);
                  }}
                >
                  {hit.first_name} {hit.last_name}{" "}
                  <span className="text-muted">{hit.patient_code}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {patient && <PatientSafetyBanner patientId={patient.id} />}
        {lines.map((line, index) => (
          <fieldset key={line.key} className="grid gap-3 rounded-xl border border-border p-3 md:grid-cols-2">
            <legend className="px-1 text-sm font-semibold">Drug {index + 1}</legend>
            <ConfigField label="Formulary">
              <select
                className="input"
                value={line.templateId}
                onChange={(e) => applyTemplate(line.key, e.target.value)}
                required
              >
                <option value="">Choose</option>
                {templates.map((tmpl) => (
                  <option key={tmpl.id} value={tmpl.id}>
                    {tmpl.name}
                    {tmpl.is_controlled ? " (controlled)" : ""}
                  </option>
                ))}
              </select>
            </ConfigField>
            <ConfigField label="Dose">
              <input
                className="input"
                value={line.dose}
                onChange={(e) =>
                  setLines((current) => current.map((row) => (row.key === line.key ? { ...row, dose: e.target.value } : row)))
                }
                required
              />
            </ConfigField>
            <ConfigField label="Quantity to give" hint="Packs, tablets, or bottles.">
              <input
                className="input"
                value={line.quantity}
                onChange={(e) =>
                  setLines((current) =>
                    current.map((row) => (row.key === line.key ? { ...row, quantity: e.target.value } : row)),
                  )
                }
                required
              />
            </ConfigField>
            <ConfigField label="Instructions">
              <input
                className="input"
                value={line.instructions}
                onChange={(e) =>
                  setLines((current) =>
                    current.map((row) => (row.key === line.key ? { ...row, instructions: e.target.value } : row)),
                  )
                }
              />
            </ConfigField>
          </fieldset>
        ))}
        <button
          className="btn-ghost"
          type="button"
          onClick={() =>
            setLines((current) => [
              ...current,
              { key: String(Date.now()), templateId: "", dose: "", quantity: "1", instructions: "" },
            ])
          }
        >
          Add another drug
        </button>
        <ConfigField label="Note for pharmacy">
          <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </ConfigField>
      </form>
    </Modal>
  );
}

function DispenseDialog({
  rx,
  templates,
  canDispense,
  money,
  onClose,
  onChanged,
  onRequest,
}: {
  rx: Rx;
  templates: Template[];
  canDispense: boolean;
  money: (amount: number) => string;
  onClose: () => void;
  onChanged: (message: string) => Promise<void>;
  onRequest: (lines: { inventory_item_id: string; quantity: number }[]) => Promise<void>;
}) {
  const open = rx.status === "active" || rx.status === "partial" || rx.status === "draft";
  const [give, setGive] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      rx.items.map((item) => [item.id, showQty(Math.max(packs(item.quantity) - item.quantity_dispensed, 0))]),
    ),
  );
  const [course, setCourse] = useState<Record<string, CourseDraft>>(() =>
    Object.fromEntries(rx.items.map((item) => [item.id, courseFromItem(item)])),
  );
  const [courseNotes, setCourseNotes] = useState(rx.notes || "");
  const [bill, setBill] = useState(!rx.order_billed);
  const [collect, setCollect] = useState(true);
  const [payMethod, setPayMethod] = useState("cash");
  const [payRef, setPayRef] = useState("");
  const [notes, setNotes] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [returnQty, setReturnQty] = useState<Record<string, string>>({});
  const [returnReason, setReturnReason] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  useAnnounce(error);
  useAnnounce(saved);

  const courseKey = `${rx.id}|${rx.notes || ""}|${rx.items
    .map((item) =>
      [
        item.id,
        item.drug_template_id,
        item.frequency,
        item.days,
        item.quantity,
        item.start_date,
        item.end_date,
        item.instructions,
        item.quantity_dispensed,
        item.line_status,
      ].join(":"),
    )
    .join("|")}`;

  useEffect(() => {
    setCourse(Object.fromEntries(rx.items.map((item) => [item.id, courseFromItem(item)])));
    setCourseNotes(rx.notes || "");
    setGive(
      Object.fromEntries(
        rx.items.map((item) => [item.id, showQty(Math.max(packs(item.quantity) - item.quantity_dispensed, 0))]),
      ),
    );
  }, [courseKey]);

  function lineEditable(item: RxItem) {
    return (
      open &&
      canDispense &&
      item.quantity_dispensed <= 0 &&
      (item.line_status === "pending" || item.line_status === "partial")
    );
  }

  function writeLine(id: string, next: CourseDraft) {
    setCourse((current) => ({ ...current, [id]: next }));
    const item = rx.items.find((row) => row.id === id);
    if (item && item.quantity_dispensed <= 0) {
      setGive((current) => ({ ...current, [id]: String(next.quantity) }));
    }
  }

  const anyEditable = rx.items.some(lineEditable);
  const controlled = rx.items.some((item) => {
    const templateId = course[item.id]?.templateId || item.drug_template_id;
    return templates.find((row) => row.id === templateId)?.is_controlled;
  });
  const billing = useMemo(() => {
    return rx.items.reduce((sum, item) => {
      const row = course[item.id];
      const templateId = row?.templateId || item.drug_template_id;
      const price = Number(templates.find((tmpl) => tmpl.id === templateId)?.sale_price || 0);
      const qty = row?.quantity ?? Math.max(1, Math.round(packs(item.quantity)));
      return sum + qty * price;
    }, 0);
  }, [course, rx.items, templates]);
  const chargeNow = Boolean(rx.order_billed) || bill;

  async function saveCourse() {
    const editable = rx.items.filter(lineEditable);
    if (editable.length === 0) return;
    for (const item of editable) {
      const row = course[item.id];
      if (!row?.frequency.trim()) {
        setError("Choose a frequency");
        return;
      }
      if (row.days < 1) {
        setError("Days must be at least 1");
        return;
      }
      if (row.quantity < 1) {
        setError("Total quantity must be at least 1");
        return;
      }
      if (!row.startDate || !row.endDate) {
        setError("Start and end dates are required");
        return;
      }
      if (row.endDate < row.startDate) {
        setError("End date cannot be before start date");
        return;
      }
    }
    setSaving(true);
    setError("");
    try {
      await api(`/api/v1/pharmacy/prescriptions/${rx.id}/course`, {
        method: "PATCH",
        body: JSON.stringify({
          notes: courseNotes.trim() || null,
          items: editable.map((item) => {
            const row = course[item.id]!;
            return {
              id: item.id,
              drug_template_id: row.templateId || null,
              frequency: row.frequency,
              days: row.days,
              quantity: String(row.quantity),
              start_date: row.startDate,
              end_date: row.endDate,
              instructions: row.instructions.trim() || null,
            };
          }),
        }),
      });
      setSaved("Course saved. You can dispense it now.");
      await onChanged("Course updated. Dispense when the shelf is ready.");
    } catch (err) {
      setError(explain(err, "Could not save the course"));
    } finally {
      setSaving(false);
    }
  }

  function courseDirty() {
    if ((courseNotes || "") !== (rx.notes || "")) return true;
    return rx.items.some((item) => {
      const row = course[item.id];
      const savedRow = courseFromItem(item);
      if (!row) return false;
      return (
        row.templateId !== savedRow.templateId ||
        row.frequency !== savedRow.frequency ||
        row.days !== savedRow.days ||
        row.quantity !== savedRow.quantity ||
        row.startDate !== savedRow.startDate ||
        row.endDate !== savedRow.endDate ||
        row.instructions !== savedRow.instructions
      );
    });
  }

  async function dispense(e: FormEvent) {
    e.preventDefault();
    if (anyEditable && courseDirty()) {
      setError("Save the course before dispensing.");
      return;
    }
    const lines = rx.items
      .filter(
        (item) =>
          item.inventory_item_id && (item.line_status === "pending" || item.line_status === "partial"),
      )
      .map((item) => ({ prescription_item_id: item.id, quantity: Number(give[item.id] || 0) }))
      .filter((line) => line.quantity > 0);
    if (lines.length === 0) {
      setError("Enter a quantity for a shelf drug, or mark the line for an outside pharmacy.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const warnings: string[] = [];
      for (const line of lines) {
        const item = rx.items.find((row) => row.id === line.prescription_item_id);
        if (!item) continue;
        const warn = await api<{ warnings: string[] }>("/api/v1/pharmacy/warn", {
          method: "POST",
          body: JSON.stringify({ patient_id: rx.patient_id, drug_name: item.drug_name }),
        });
        warnings.push(...(warn.warnings || []));
      }
      let acknowledge = false;
      if (warnings.length) {
        const proceed = window.confirm(`${warnings.join("\n")}\n\nDispense anyway?`);
        if (!proceed) {
          setBusy(false);
          return;
        }
        acknowledge = true;
      }
      await api(`/api/v1/pharmacy/prescriptions/${rx.id}/dispense`, {
        method: "POST",
        body: JSON.stringify({
          lines,
          bill: rx.order_billed ? false : bill,
          collect_payment: chargeNow && collect,
          payment_method: payMethod,
          payment_reference: payRef.trim() || null,
          acknowledge_warnings: acknowledge,
          notes: notes.trim() || null,
        }),
      });
      await onChanged(`Dispensed for ${rx.patient_name || "the patient"}`);
      onClose();
    } catch (err) {
      setError(explain(err, "Could not dispense"));
      setBusy(false);
    }
  }

  async function release(itemId: string) {
    setError("");
    try {
      await api(`/api/v1/pharmacy/prescriptions/${rx.id}/external`, {
        method: "POST",
        body: JSON.stringify({ item_ids: [itemId] }),
      });
      await onChanged("Marked for an outside pharmacy");
      onClose();
    } catch (err) {
      setError(explain(err, "Could not release that line"));
    }
  }

  async function cancelRx() {
    if (cancelReason.trim().length < 3) {
      setError("Enter a reason of at least 3 characters");
      return;
    }
    try {
      await api(`/api/v1/pharmacy/prescriptions/${rx.id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: cancelReason.trim() }),
      });
      await onChanged("Prescription cancelled");
      onClose();
    } catch (err) {
      setError(explain(err, "Could not cancel"));
    }
  }

  async function sendBack(eventId: string) {
    const quantity = Number(returnQty[eventId] || 0);
    if (quantity <= 0 || returnReason.trim().length < 3) {
      setError("Enter the quantity coming back and a reason");
      return;
    }
    try {
      await api(`/api/v1/pharmacy/dispenses/${eventId}/return`, {
        method: "POST",
        body: JSON.stringify({ quantity, reason: returnReason.trim() }),
      });
      await onChanged("Stock returned to the pharmacy shelf. Adjust the invoice in Billing if it was already charged.");
      onClose();
    } catch (err) {
      setError(explain(err, "Could not return that fill"));
    }
  }

  function printLabel(text: string) {
    const page = window.open("", "rx-label", "noopener,width=420,height=640");
    if (!page) return;
    const safe = text.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
    page.document.write(`<pre style="font:16px/1.45 sans-serif;padding:24px">${safe}</pre>`);
    page.document.close();
    page.focus();
    page.print();
  }

  return (
    <Modal
      title={`${rx.rx_number || "Prescription"} · ${rx.patient_name || "Patient"}`}
      subtitle={
        rx.prescriber_name
          ? `Signed by ${rx.prescriber_name}. Edit the course before it leaves the shelf.`
          : "Edit the course before it leaves the shelf."
      }
      onClose={onClose}
      footer={
        open && canDispense ? (
          <>
            <button className="btn-ghost" type="button" onClick={onClose} disabled={busy || saving}>
              Close
            </button>
            {anyEditable && (
              <button className="btn-ghost" type="button" onClick={() => void saveCourse()} disabled={busy || saving}>
                {saving ? "Saving course…" : "Save course"}
              </button>
            )}
            <button className="btn-primary" type="submit" form="dispense-form" disabled={busy || saving}>
              {busy ? "Dispensing…" : chargeNow && collect ? "Dispense and take payment" : bill ? "Dispense and bill" : "Dispense"}
            </button>
          </>
        ) : (
          <button className="btn-primary" type="button" onClick={onClose}>
            Close
          </button>
        )
      }
    >
      <form id="dispense-form" className="space-y-4" onSubmit={dispense}>
        <ConfigStatus error={error} ok={saved} />
        <PatientSafetyBanner patientId={rx.patient_id} />
        {!canDispense && (
          <p className="text-sm text-muted">You can review this course. Editing and dispensing need pharmacy access.</p>
        )}
        {rx.cancel_reason && <p className="text-sm text-danger">Cancelled: {rx.cancel_reason}</p>}
        <section className="chairside-rx-dialog space-y-4" aria-label="Prescription course">
          {rx.items.map((item) => {
            const draft = course[item.id] || courseFromItem(item);
            const editable = lineEditable(item);
            const picked = templates.find((row) => row.id === draft.templateId);
            const unitPrice = Number(picked?.sale_price || 0);
            const choices = templates.filter((row) => row.is_active || row.id === draft.templateId);
            const freqOptions = FREQUENCY_OPTIONS.some((row) => row.value === draft.frequency)
              ? FREQUENCY_OPTIONS
              : [...FREQUENCY_OPTIONS, { value: draft.frequency, label: draft.frequency, times: 0 }];
            const prescribedNow = editable ? draft.quantity : packs(item.quantity);
            const left = Math.max(prescribedNow - item.quantity_dispensed, 0);
            const shelfId = item.inventory_item_id;
            const shelfShort = shelfId != null && (item.shelf_on_hand || 0) < Number(give[item.id] || 0);
            return (
              <section key={item.id} className="chairside-rx-dialog__compose" aria-labelledby={`rx-line-${item.id}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 id={`rx-line-${item.id}`} className="chairside-rx-dialog__title">
                    {picked?.name || item.drug_name}
                  </h3>
                  <span className={`status-pill ${statusTone(item.line_status)}`}>{titleCase(item.line_status)}</span>
                </div>
                {picked?.is_controlled && <span className="status-pill status-pill--danger">Controlled</span>}
                <div className="chairside-rx-dialog__grid">
                  <ConfigField label="Formulary drug">
                    <select
                      className="input"
                      value={draft.templateId}
                      disabled={!editable}
                      onChange={(e) => {
                        const templateId = e.target.value;
                        const tmpl = templates.find((row) => row.id === templateId);
                        const times = FREQUENCY_OPTIONS.find((row) => row.value === draft.frequency)?.times ?? 0;
                        writeLine(item.id, {
                          ...draft,
                          templateId,
                          quantity: calcQty(unitsFromTemplate(tmpl), times, draft.days),
                          instructions: draft.instructions || tmpl?.instructions || "",
                        });
                      }}
                    >
                      {!draft.templateId && <option value="">Choose</option>}
                      {choices.map((tmpl) => (
                        <option key={tmpl.id} value={tmpl.id}>
                          {tmpl.name}
                          {tmpl.is_controlled ? " (controlled)" : ""}
                          {tmpl.sale_price != null && tmpl.sale_price > 0 ? ` · ${money(tmpl.sale_price)}` : " · no price"}
                        </option>
                      ))}
                    </select>
                  </ConfigField>
                  <ConfigField label="Frequency">
                    <select
                      className="input"
                      value={draft.frequency}
                      disabled={!editable}
                      onChange={(e) => {
                        const frequency = e.target.value;
                        const times = FREQUENCY_OPTIONS.find((row) => row.value === frequency)?.times ?? 0;
                        writeLine(item.id, {
                          ...draft,
                          frequency,
                          quantity: calcQty(unitsFromTemplate(picked), times, draft.days),
                        });
                      }}
                    >
                      {freqOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </ConfigField>
                  <ConfigField label="Days" hint="End date follows the course length.">
                    <input
                      className="input"
                      type="number"
                      min={1}
                      max={365}
                      value={draft.days}
                      disabled={!editable}
                      onChange={(e) => {
                        const days = Math.max(1, Number(e.target.value) || 1);
                        const times = FREQUENCY_OPTIONS.find((row) => row.value === draft.frequency)?.times ?? 0;
                        writeLine(item.id, {
                          ...draft,
                          days,
                          endDate: addDaysIso(draft.startDate, days),
                          quantity: calcQty(unitsFromTemplate(picked), times, days),
                        });
                      }}
                    />
                  </ConfigField>
                  <ConfigField label="Total quantity" hint="Suggested from frequency × days; edit if needed.">
                    <input
                      className="input"
                      type="number"
                      min={1}
                      value={draft.quantity}
                      disabled={!editable}
                      onChange={(e) =>
                        writeLine(item.id, { ...draft, quantity: Math.max(1, Number(e.target.value) || 1) })
                      }
                    />
                  </ConfigField>
                  <ConfigField label="Start date">
                    <input
                      className="input"
                      type="date"
                      value={draft.startDate}
                      disabled={!editable}
                      onChange={(e) => writeLine(item.id, { ...draft, startDate: e.target.value })}
                    />
                  </ConfigField>
                  <ConfigField label="Ending date">
                    <input
                      className="input"
                      type="date"
                      value={draft.endDate}
                      disabled={!editable}
                      onChange={(e) => writeLine(item.id, { ...draft, endDate: e.target.value })}
                    />
                  </ConfigField>
                  <div className="chairside-rx-dialog__span">
                    <ConfigField label="Instructions">
                      <input
                        className="input"
                        value={draft.instructions}
                        disabled={!editable}
                        onChange={(e) => writeLine(item.id, { ...draft, instructions: e.target.value })}
                      />
                    </ConfigField>
                  </div>
                </div>
                <p className="text-sm text-muted">
                  {draft.frequency} · {draft.days} days · qty {draft.quantity} · {draft.startDate} → {draft.endDate}
                  {item.quantity_dispensed > 0 ? ` · given ${showQty(item.quantity_dispensed)}` : ""}
                </p>
                <p className="text-sm text-muted">
                  Line estimate {money(draft.quantity * unitPrice)}
                  {unitPrice <= 0 ? " · no sale price" : ` · ${money(unitPrice)} each`}
                  {" · "}Shelf {item.shelf_on_hand == null ? "—" : showQty(item.shelf_on_hand)} · Main store{" "}
                  {item.store_on_hand == null ? "—" : showQty(item.store_on_hand)}
                </p>
                {!editable && item.quantity_dispensed > 0 && (
                  <p className="text-sm text-muted">This line has left the shelf, so the course is locked.</p>
                )}
                {open && canDispense && (item.line_status === "pending" || item.line_status === "partial") && (
                  <div className="grid gap-3 md:grid-cols-2">
                    {shelfId ? (
                      <ConfigField label="Give now" hint={`${showQty(left)} still outstanding`}>
                        <input
                          className="input"
                          inputMode="decimal"
                          value={give[item.id] ?? ""}
                          onChange={(e) => setGive((current) => ({ ...current, [item.id]: e.target.value }))}
                        />
                      </ConfigField>
                    ) : (
                      <p className="text-sm text-muted">This drug is not linked to a shelf SKU.</p>
                    )}
                    <div className="flex items-end">
                      <button className="btn-ghost" type="button" onClick={() => void release(item.id)}>
                        Patient will buy outside
                      </button>
                    </div>
                  </div>
                )}
                {shelfShort && shelfId && canDispense && (
                  <button
                    className="btn-ghost"
                    type="button"
                    onClick={() =>
                      void onRequest([
                        {
                          inventory_item_id: shelfId,
                          quantity: Math.max(left, draft.quantity, 1),
                        },
                      ])
                    }
                  >
                    Request {showQty(Math.max(left, draft.quantity, 1))} from the main store
                  </button>
                )}
              </section>
            );
          })}
          <div className="chairside-rx-dialog__totals" role="status" aria-live="polite">
            <div>
              <p className="label">Total quantity</p>
              <p className="text-lg font-bold text-brand-900">
                {rx.items.reduce((sum, item) => sum + (course[item.id]?.quantity || 0), 0)}
              </p>
            </div>
            <div>
              <p className="label">Billing amount</p>
              <p className="text-lg font-bold text-brand-900">{money(billing)}</p>
            </div>
            <p className="chairside-rx-dialog__totals-note text-sm text-muted">
              {rx.order_billed
                ? "This script is already on an invoice. Saving a quantity change updates that invoice until it is paid."
                : "Save the course before dispensing. Billing is added when you dispense, unless the chair already billed it."}
            </p>
          </div>
          {anyEditable ? (
            <ConfigField label="Note for pharmacy">
              <textarea className="input" value={courseNotes} onChange={(e) => setCourseNotes(e.target.value)} rows={2} />
            </ConfigField>
          ) : (
            courseNotes && <p className="text-sm text-muted">Note: {courseNotes}</p>
          )}
        </section>
        {open && canDispense && (
          <>
            {rx.order_billed ? (
              <p className="text-sm">
                <Link to="/billing">Open billing</Link>
                <span className="text-muted"> — this course is already invoiced. Dispensing will not create a second bill.</span>
              </p>
            ) : (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={bill} onChange={(e) => setBill(e.target.checked)} />
                Add a billing invoice for this fill
              </label>
            )}
            {(rx.order_billed || bill) && (
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex items-center gap-2 text-sm md:col-span-2">
                  <input type="checkbox" checked={collect} onChange={(e) => setCollect(e.target.checked)} />
                  Take payment now
                </label>
                {collect && (
                  <>
                    <label className="text-sm">
                      <span className="label">Payment</span>
                      <select className="input" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                        {PAY_METHODS.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm">
                      <span className="label">Reference</span>
                      <input className="input" value={payRef} onChange={(e) => setPayRef(e.target.value)} />
                    </label>
                  </>
                )}
              </div>
            )}
            <ConfigField
              label={controlled ? "Controlled-drug register note" : "Dispense note"}
              hint={controlled ? "Required for a controlled medicine." : "Optional counsel or batch note."}
            >
              <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} required={controlled} />
            </ConfigField>
            <div className="grid gap-2 md:grid-cols-[1fr_auto]">
              <ConfigField label="Cancel reason">
                <input className="input" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
              </ConfigField>
              <button className="btn-ghost self-end" type="button" onClick={() => void cancelRx()}>
                Cancel prescription
              </button>
            </div>
          </>
        )}
        {rx.dispenses.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-display text-base font-bold">Fills</h3>
            {rx.invoice_id && (
              <p className="text-sm">
                <Link to="/billing">Open billing</Link>
                <span className="text-muted"> to collect or adjust the invoice.</span>
              </p>
            )}
            {rx.dispenses.map((event) => (
              <div key={event.id} className="rounded-xl bg-brand-50/70 p-3 text-sm">
                <p className="font-semibold">
                  {event.drug_name} · {showQty(event.quantity)}
                  {event.quantity_returned > 0 ? ` · returned ${showQty(event.quantity_returned)}` : ""} ·{" "}
                  {money(event.unit_price)}
                </p>
                <p className="text-muted">
                  {event.lot_code ? `Lot ${event.lot_code}` : "Lot not recorded"}
                  {event.expiry_date ? ` · exp ${event.expiry_date}` : ""}
                </p>
                {event.label_text && (
                  <button className="btn-ghost mt-2" type="button" onClick={() => printLabel(event.label_text || "")}>
                    Print label
                  </button>
                )}
                {canDispense && event.quantity > event.quantity_returned && (
                  <div className="mt-2 grid gap-2 md:grid-cols-[8rem_1fr_auto]">
                    <label className="text-sm">
                      <span className="label">Return qty</span>
                      <input
                        className="input"
                        inputMode="decimal"
                        value={returnQty[event.id] || ""}
                        onChange={(e) => setReturnQty((current) => ({ ...current, [event.id]: e.target.value }))}
                      />
                    </label>
                    <label className="text-sm">
                      <span className="label">Reason</span>
                      <input className="input" value={returnReason} onChange={(e) => setReturnReason(e.target.value)} />
                    </label>
                    <button className="btn-ghost self-end" type="button" onClick={() => void sendBack(event.id)}>
                      Return to shelf
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </form>
    </Modal>
  );
}

function DrugDialog({
  initial,
  stock,
  onClose,
  onSaved,
}: {
  initial: Template | null;
  stock: InventoryItem[];
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [category, setCategory] = useState(initial?.category || "analgesic");
  const [form, setForm] = useState(initial?.form || "tablet");
  const [strength, setStrength] = useState(initial?.strength || "");
  const [route, setRoute] = useState(initial?.route || "oral");
  const [dose, setDose] = useState(initial?.default_dose || "");
  const [quantity, setQuantity] = useState(initial?.default_quantity || "1");
  const [instructions, setInstructions] = useState(initial?.instructions || "");
  const [skuId, setSkuId] = useState(initial?.inventory_item_id || "");
  const [reorder, setReorder] = useState(String(initial?.reorder_level ?? 0));
  const [controlled, setControlled] = useState(Boolean(initial?.is_controlled));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useAnnounce(error);
  const editing = Boolean(initial?.id);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const body = {
      name: name.trim(),
      category,
      form,
      strength: strength.trim() || null,
      route,
      default_dose: dose.trim(),
      default_quantity: quantity.trim() || "1",
      instructions: instructions.trim() || null,
      inventory_item_id: skuId || null,
      reorder_level: Number(reorder || 0),
      is_controlled: controlled,
    };
    try {
      if (editing && initial) {
        await api(`/api/v1/pharmacy/templates/${initial.id}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await api("/api/v1/pharmacy/templates", { method: "POST", body: JSON.stringify(body) });
      }
      await onSaved(editing ? `${body.name} updated` : `${body.name} added to the formulary`);
    } catch (err) {
      setError(explain(err, "Could not save the drug"));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={editing ? "Edit formulary drug" : "Add formulary drug"}
      subtitle="Link the warehouse SKU so the shelf quantity is real."
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost" type="button" onClick={onClose}>
            Close
          </button>
          <button className="btn-primary" type="submit" form="drug-form" disabled={busy}>
            {busy ? "Saving…" : "Save drug"}
          </button>
        </>
      }
    >
      <form id="drug-form" className="grid gap-3 md:grid-cols-2" onSubmit={onSubmit}>
        <ConfigStatus error={error} />
        <ConfigField label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </ConfigField>
        <ConfigField label="Category">
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {titleCase(item)}
              </option>
            ))}
          </select>
        </ConfigField>
        <ConfigField label="Form">
          <select className="input" value={form} onChange={(e) => setForm(e.target.value)}>
            {FORMS.map((item) => (
              <option key={item} value={item}>
                {titleCase(item)}
              </option>
            ))}
          </select>
        </ConfigField>
        <ConfigField label="Strength">
          <input className="input" value={strength} onChange={(e) => setStrength(e.target.value)} placeholder="500 mg" />
        </ConfigField>
        <ConfigField label="Route">
          <input className="input" value={route} onChange={(e) => setRoute(e.target.value)} required />
        </ConfigField>
        <ConfigField label="Default dose">
          <input className="input" value={dose} onChange={(e) => setDose(e.target.value)} required />
        </ConfigField>
        <ConfigField label="Default quantity">
          <input className="input" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
        </ConfigField>
        <ConfigField label="Reorder level" hint="Request from the store when the shelf is at or below this.">
          <input className="input" inputMode="decimal" value={reorder} onChange={(e) => setReorder(e.target.value)} />
        </ConfigField>
        <ConfigField label="Shelf SKU">
          <select className="input" value={skuId} onChange={(e) => setSkuId(e.target.value)}>
            <option value="">Not linked</option>
            {stock.map((item) => (
              <option key={item.id} value={item.id}>
                {item.sku} · {item.name}
              </option>
            ))}
          </select>
        </ConfigField>
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input type="checkbox" checked={controlled} onChange={(e) => setControlled(e.target.checked)} />
          Controlled medicine (a register note is required at dispense)
        </label>
        <ConfigField label="Default instructions">
          <textarea className="input md:col-span-2" rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
        </ConfigField>
      </form>
    </Modal>
  );
}
