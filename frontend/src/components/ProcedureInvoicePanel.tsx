import { useEffect, useId, useMemo, useState } from "react";
import { Plus, Receipt, Search, Trash2 } from "lucide-react";
import { ConfigStatus } from "@/components/config/ConfigUi";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import { api, ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/i18n";
import type { FeeScheduleItem, Invoice, Patient } from "@/lib/types";
import { useUiPrefs } from "@/lib/uiPrefs";

type QtyMap = Record<string, number>;
type ToothMap = Record<string, string>;

const KIND_RE: Record<string, RegExp> = {
  imaging: /opg|cbct|pa\b|bitewing|\bbw\b|radio|x-?ray|photo|imaging|pano|ceph/i,
  surgery: /extract|surg|implant|biopsy|impact|fracture|cyst|third|wisdom|orif|enucleat/i,
};

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
}

function explainFailure(err: unknown, fallback: string) {
  const detail = err instanceof Error ? err.message.trim() : "";
  const lead = detail && !/^error\s*\d+/i.test(detail) ? detail : fallback;
  if (/try again\.?$/i.test(lead)) return lead;
  return `${lead} Check your connection and try again.`;
}

type CartLine = {
  item: FeeScheduleItem;
  quantity: number;
  tooth: string;
};

export function ProcedureInvoicePanel({
  patientId,
  onDone,
  title = "Bill procedures",
  hint = "Pick fee-schedule items, set teeth and quantities, then create the invoice.",
  kind = "all",
  /** `trigger` = compact button (clinical steps). `card` = titled glass panel. */
  variant = "trigger",
  /** Tooth from odontogram / earlier clerkship step — prefilled on new invoice lines. */
  defaultTooth,
}: {
  patientId?: string;
  onDone?: (invoice: Invoice) => void;
  title?: string;
  hint?: string;
  kind?: "all" | "imaging" | "surgery";
  variant?: "card" | "trigger";
  defaultTooth?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const toothHint = defaultTooth?.trim()
    ? `${hint} · Tooth ${defaultTooth.trim()} from chart`
    : hint;

  return (
    <>
      {variant === "card" ? (
        <section className="glass-panel space-y-3 p-4">
          <div>
            <h3 className="font-display text-base font-bold text-brand-900">{title}</h3>
            <p className="text-sm text-muted">{toothHint}</p>
          </div>
          <button
            type="button"
            className="btn-primary min-h-[var(--touch-min)]"
            disabled={!patientId}
            onClick={() => setOpen(true)}
          >
            <Receipt size={16} aria-hidden />
            {patientId ? "Open procedure billing" : "Select a patient first"}
          </button>
        </section>
      ) : (
        <button
          type="button"
          className="btn-ghost min-h-[var(--touch-min)] justify-start gap-2 px-4 text-left"
          disabled={!patientId}
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
        >
          <Receipt size={18} className="shrink-0 text-brand-700" aria-hidden />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-ink">{title}</span>
            <span className="block text-xs text-muted">
              {patientId ? toothHint : "Select a patient first"}
            </span>
          </span>
        </button>
      )}
      {open && patientId && (
        <ProcedureBillingDialog
          patientId={patientId}
          kind={kind}
          title={title}
          defaultTooth={defaultTooth}
          onClose={() => setOpen(false)}
          onDone={(invoice) => {
            setOpen(false);
            onDone?.(invoice);
          }}
        />
      )}
    </>
  );
}

export function ProcedureBillingDialog({
  patientId,
  kind = "all",
  title = "Bill procedures",
  defaultTooth,
  onClose,
  onDone,
}: {
  patientId: string;
  kind?: "all" | "imaging" | "surgery";
  title?: string;
  /** Prefill tooth on each new cart line (from odontogram selection). */
  defaultTooth?: string | null;
  onClose: () => void;
  onDone?: (invoice: Invoice) => void;
}) {
  const chartTooth = (defaultTooth || "").trim();
  const currency = useUiPrefs((s) => s.currency);
  const locale = useUiPrefs((s) => s.locale);
  const money = (n: number) => formatMoney(n, currency, locale);
  const searchId = useId();
  const categoryId = useId();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [catalog, setCatalog] = useState<FeeScheduleItem[]>([]);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [qty, setQty] = useState<QtyMap>({});
  const [tooth, setTooth] = useState<ToothMap>({});
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    Promise.all([
      api<FeeScheduleItem[]>("/api/v1/billing/fee-schedule?billable=true&active=true"),
      api<Patient>(`/api/v1/patients/${patientId}`).catch(() => null),
    ])
      .then(([rows, direct]) => {
        if (cancelled) return;
        if (direct) setPatient(direct);
        const priced = rows.filter((row) => row.unit_price > 0);
        const re = kind === "all" ? null : KIND_RE[kind];
        const filtered = re
          ? priced.filter(
              (row) =>
                row.category === kind || re.test(`${row.code} ${row.label} ${row.category}`),
            )
          : priced;
        setCatalog(filtered.length ? filtered : priced);
      })
      .catch((err) => {
        if (cancelled) return;
        setCatalog([]);
        setLoadError(explainFailure(err, "Could not load the fee schedule."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [patientId, kind]);

  const categories = useMemo(() => {
    const set = new Set(catalog.map((row) => row.category || row.catalog_kind || "other"));
    return Array.from(set).sort();
  }, [catalog]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return catalog.filter((row) => {
      if (category !== "all" && (row.category || row.catalog_kind || "other") !== category) {
        return false;
      }
      if (!term) return true;
      return `${row.code} ${row.label} ${row.category} ${row.catalog_kind || ""}`
        .toLowerCase()
        .includes(term);
    });
  }, [catalog, category, query]);

  const cart: CartLine[] = useMemo(
    () =>
      catalog
        .filter((row) => (qty[row.id] || 0) > 0)
        .map((item) => ({
          item,
          quantity: qty[item.id] || 0,
          tooth: tooth[item.id] || chartTooth || "",
        })),
    [catalog, qty, tooth, chartTooth],
  );

  const total = cart.reduce((sum, line) => sum + line.item.unit_price * line.quantity, 0);
  const filtersOn = query.trim() !== "" || category !== "all";

  function clearFilters() {
    setQuery("");
    setCategory("all");
  }

  function addToCart(id: string) {
    const row = catalog.find((r) => r.id === id);
    if (!row) return;
    const linked = Boolean(row.inventory_item_id);
    const onHand = row.quantity_on_hand ?? 0;
    if (linked && onHand < 1) {
      setOk("");
      setError(`No stock on hand for ${row.label}.`);
      return;
    }
    setError("");
    setQty((prev) => ({ ...prev, [id]: prev[id] ? prev[id] : 1 }));
    if (chartTooth) {
      setTooth((prev) => (prev[id] ? prev : { ...prev, [id]: chartTooth }));
    }
  }

  function setRowQty(id: string, next: number) {
    const row = catalog.find((r) => r.id === id);
    const linked = Boolean(row?.inventory_item_id);
    const max = linked ? Math.max(0, Math.floor(row?.quantity_on_hand || 0)) : 20;
    const value = Math.min(max, Math.max(0, next));
    setQty((prev) => {
      if (value <= 0) {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      }
      return { ...prev, [id]: value };
    });
  }

  function removeLine(id: string) {
    setQty((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    setTooth((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  }

  async function createInvoice() {
    setError("");
    setOk("");
    if (cart.length === 0) {
      setError("Add at least one procedure to the invoice.");
      return;
    }
    const oversold = cart.find(
      (line) =>
        line.item.inventory_item_id &&
        line.quantity > (line.item.quantity_on_hand || 0),
    );
    if (oversold) {
      setError(
        `Not enough stock for ${oversold.item.label} (${oversold.item.quantity_on_hand ?? 0} on hand).`,
      );
      return;
    }
    setBusy(true);
    try {
      const invoice = await api<Invoice>("/api/v1/billing/invoices/from-procedures", {
        method: "POST",
        body: JSON.stringify({
          patient_id: patientId,
          items: cart.map((line) => ({
            fee_item_id: line.item.id,
            quantity: line.quantity,
            tooth_number: line.tooth.trim() || null,
          })),
          notes: notes.trim() || "Procedural invoice",
          idempotency_key: crypto.randomUUID(),
        }),
      });
      setOk(`Invoice ${invoice.invoice_number} · ${money(invoice.total)}`);
      onDone?.(invoice);
    } catch (err) {
      setError(explainFailure(err, "Could not create the invoice."));
    } finally {
      setBusy(false);
    }
  }

  const patientLabel = patient
    ? `${patient.first_name} ${patient.last_name} · ${patient.patient_code}`
    : "Selected patient";

  return (
    <Modal
      title={title}
      subtitle={
        chartTooth
          ? `${patientLabel}. Chart tooth ${chartTooth} is applied to new lines — change a line if needed.`
          : `${patientLabel}. Search the catalog, add lines, then create the invoice.`
      }
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <p className="mr-auto text-sm font-semibold text-brand-900" aria-live="polite">
            Due {money(total)}
            {cart.length > 0 ? ` · ${cart.length} line${cart.length === 1 ? "" : "s"}` : ""}
          </p>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || cart.length === 0}
            onClick={() => void createInvoice()}
          >
            {busy ? "Creating…" : "Create invoice"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <ConfigStatus loading={loading} error={loadError || error} ok={ok} />

        {!loading && !loadError && catalog.length === 0 && (
          <EmptyState
            title="No billable procedures"
            hint="Ask an admin to add fee-schedule items under Clinic admin."
          />
        )}

        {catalog.length > 0 && (
          <>
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-[14rem] flex-1 text-sm" htmlFor={searchId}>
                <span className="label">Search catalog</span>
                <span className="search-field">
                  <Search className="search-field__icon" aria-hidden="true" />
                  <input
                    id={searchId}
                    className="input"
                    type="search"
                    value={query}
                    autoComplete="off"
                    placeholder="Code or name"
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </span>
              </label>
              <label className="text-sm" htmlFor={categoryId}>
                <span className="label">Category</span>
                <select
                  id={categoryId}
                  className="input"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="all">All categories</option>
                  {categories.map((name) => (
                    <option key={name} value={name}>
                      {titleCase(name)}
                    </option>
                  ))}
                </select>
              </label>
              {filtersOn && (
                <button type="button" className="btn-ghost" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </div>
            <p className="text-sm text-muted" aria-live="polite">
              Showing {visible.length} of {catalog.length} procedures.
            </p>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="space-y-2" aria-label="Procedure catalog">
                <h3 className="reg-section__title">Catalog</h3>
                {!visible.length ? (
                  <EmptyState
                    title="No matching procedures"
                    hint="Nothing matches this search and category."
                    action={
                      <button type="button" className="btn-ghost" onClick={clearFilters}>
                        Clear filters
                      </button>
                    }
                  />
                ) : (
                  <ul className="admin-scroll max-h-72 space-y-1 p-1">
                    {visible.map((row) => {
                      const on = (qty[row.id] || 0) > 0;
                      const linked = Boolean(row.inventory_item_id);
                      const oos = linked && (row.quantity_on_hand || 0) < 1;
                      return (
                        <li key={row.id}>
                          <div
                            className={`flex flex-wrap items-center gap-2 rounded-xl border border-border bg-canvas px-3 py-2 ${
                              on ? "border-brand-300 bg-brand-50" : ""
                            } ${oos ? "opacity-60" : ""}`}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-brand-900">{row.label}</p>
                              <p className="font-mono text-sm text-muted">
                                {row.code} · {titleCase(row.catalog_kind || row.category)}
                                {linked ? ` · ${row.quantity_on_hand ?? 0} on hand` : ""}
                              </p>
                            </div>
                            <span className="text-sm font-bold tabular-nums">{money(row.unit_price)}</span>
                            <button
                              type="button"
                              className="btn-ghost"
                              disabled={oos && !on}
                              aria-label={on ? `Already in invoice: ${row.label}` : `Add ${row.label}`}
                              onClick={() => addToCart(row.id)}
                            >
                              <Plus size={16} aria-hidden />
                              {on ? "Added" : "Add"}
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section className="space-y-2" aria-label="Invoice lines">
                <h3 className="reg-section__title">This invoice</h3>
                {cart.length === 0 ? (
                  <EmptyState
                    title="No procedures yet"
                    hint="Add items from the catalog. Set quantity and tooth on each line."
                  />
                ) : (
                  <ul className="admin-scroll max-h-72 space-y-2 p-1">
                    {cart.map((line) => {
                      const linked = Boolean(line.item.inventory_item_id);
                      const max = linked
                        ? Math.max(1, Math.floor(line.item.quantity_on_hand || 0))
                        : 20;
                      return (
                        <li
                          key={line.item.id}
                          className="space-y-2 rounded-xl border border-border bg-canvas p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-brand-900">{line.item.label}</p>
                              <p className="font-mono text-sm text-muted">{line.item.code}</p>
                            </div>
                            <button
                              type="button"
                              className="btn-ghost"
                              aria-label={`Remove ${line.item.label}`}
                              onClick={() => removeLine(line.item.id)}
                            >
                              <Trash2 size={16} aria-hidden />
                              Remove
                            </button>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-3">
                            <label className="text-sm">
                              <span className="label">Quantity</span>
                              <input
                                className="input"
                                type="number"
                                inputMode="numeric"
                                min={1}
                                max={max}
                                value={line.quantity}
                                onChange={(e) => setRowQty(line.item.id, Number(e.target.value) || 0)}
                              />
                            </label>
                            <label className="text-sm sm:col-span-2">
                              <span className="label">Tooth / site</span>
                              <input
                                className="input"
                                value={line.tooth}
                                autoComplete="off"
                                placeholder="e.g. 36 or ULQ"
                                onChange={(e) =>
                                  setTooth((prev) => ({ ...prev, [line.item.id]: e.target.value }))
                                }
                              />
                            </label>
                          </div>
                          <p className="text-sm text-muted">
                            Line total{" "}
                            <strong className="text-text">
                              {money(line.item.unit_price * line.quantity)}
                            </strong>
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <label className="block text-sm">
                  <span className="label">Invoice notes (optional)</span>
                  <input
                    className="input"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Chairside note for the ledger"
                  />
                </label>
              </section>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
