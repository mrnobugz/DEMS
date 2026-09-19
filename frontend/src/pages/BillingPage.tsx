import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/i18n";
import { printHtmlDocument } from "@/lib/printRegistration";
import { useUiPrefs } from "@/lib/uiPrefs";
import { CatalogPanel } from "@/components/CatalogPanel";
import { EmptyState } from "@/components/EmptyState";
import { PatientSafetyBanner } from "@/components/PatientSafetyBanner";
import { ProcedureCatalogAdmin } from "@/components/ProcedureCatalogAdmin";
import { ProcedureInvoicePanel } from "@/components/ProcedureInvoicePanel";
import type {
  ClaimDenial,
  FeeScheduleItem,
  InsuranceClaim,
  Invoice,
  Page,
  Patient,
  PatientStatement,
} from "@/lib/types";

type BillableChart = {
  id: string;
  tooth_number: string;
  surfaces?: string | null;
  condition_code: string;
  condition_label: string;
  unit_price: number;
  fee_label?: string | null;
};

type Outstanding = {
  id: string;
  invoice_number: string;
  patient_id: string;
  patient_name: string;
  patient_code: string;
  total: number;
  amount_paid: number;
  balance: number;
  status: string;
  issued_at?: string | null;
  days_outstanding: number;
  aging_bucket: string;
  currency: string;
};

type CashUp = {
  date: string;
  total: number;
  by_method: Record<string, number>;
  payment_count: number;
};

type InsuranceEstimate = {
  subtotal: number;
  coverage_pct: number;
  deductible_remaining: number;
  insurance_estimate: number;
  patient_estimate: number;
  payer_name?: string | null;
  notes: string;
};

type BillingView = "ledger" | "catalog" | "claims" | "denials" | "statements";

const VIEWS: { id: BillingView; label: string }[] = [
  { id: "ledger", label: "Ledger" },
  { id: "catalog", label: "Catalog" },
  { id: "claims", label: "Claims" },
  { id: "denials", label: "Denials" },
  { id: "statements", label: "Statements" },
];

function invoiceRemaining(inv: Invoice) {
  return Math.max(inv.total - inv.amount_paid - (inv.amount_adjusted || 0), 0);
}

function printReceipt(inv: Invoice, patientLabel: string, money: (n: number) => string) {
  const lines = inv.line_items
    .map(
      (li) =>
        `<tr><td>${li.description}${li.tooth_number ? ` (tooth ${li.tooth_number})` : ""}</td><td style="text-align:right">${money(li.total)}</td></tr>`,
    )
    .join("");
  const payments = inv.payments
    .map(
      (p) =>
        `<tr><td>${p.method} · ${format(parseISO(p.paid_at), "MMM d HH:mm")}</td><td style="text-align:right">${money(p.amount)}</td></tr>`,
    )
    .join("");
  const due = invoiceRemaining(inv);
  const html = `<!doctype html><html><head><title>Receipt ${inv.invoice_number}</title>
    <style>
      body{font-family:Georgia,serif;padding:24px;color:#041e5c}
      h1{font-size:22px;margin:0 0 4px}
      .muted{color:#5a6b85;font-size:12px}
      table{width:100%;border-collapse:collapse;margin-top:16px}
      td,th{padding:6px 0;border-bottom:1px solid #e0edff;font-size:13px}
      .total{font-weight:700;font-size:16px}
    </style></head><body>
    <h1>DEMSTA Receipt</h1>
    <div class="muted">${inv.invoice_number} · ${inv.issued_at ? format(parseISO(inv.issued_at), "MMM d, yyyy") : ""}</div>
    <p><strong>${patientLabel}</strong></p>
    <table><thead><tr><th align="left">Item</th><th align="right">Amount</th></tr></thead>
    <tbody>${lines}</tbody></table>
    <table>
      <tr><td>Subtotal</td><td style="text-align:right">${money(inv.subtotal)}</td></tr>
      <tr><td>Tax</td><td style="text-align:right">${money(inv.tax)}</td></tr>
      <tr><td>Discount</td><td style="text-align:right">${money(inv.discount)}</td></tr>
      <tr class="total"><td>Total</td><td style="text-align:right">${money(inv.total)}</td></tr>
      <tr><td>Paid</td><td style="text-align:right">${money(inv.amount_paid)}</td></tr>
      <tr><td>Adjustments</td><td style="text-align:right">${money(inv.amount_adjusted || 0)}</td></tr>
      <tr><td>Balance</td><td style="text-align:right">${money(due)}</td></tr>
    </table>
    ${payments ? `<h3 style="margin-top:20px;font-size:14px">Payments</h3><table>${payments}</table>` : ""}
    <p class="muted" style="margin-top:24px">One record. One ledger. One clinic OS.</p>
    </body></html>`;
  printHtmlDocument(html);
}

export function BillingPage() {
  const [view, setView] = useState<BillingView>("ledger");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [outstanding, setOutstanding] = useState<Outstanding[]>([]);
  const [cashUp, setCashUp] = useState<CashUp | null>(null);
  const [estimate, setEstimate] = useState<InsuranceEstimate | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [fees, setFees] = useState<FeeScheduleItem[]>([]);
  const [billable, setBillable] = useState<BillableChart[]>([]);
  const [claims, setClaims] = useState<InsuranceClaim[]>([]);
  const [denials, setDenials] = useState<ClaimDenial[]>([]);
  const [statements, setStatements] = useState<PatientStatement[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [remitPaid, setRemitPaid] = useState("");
  const [remitDenied, setRemitDenied] = useState(false);
  const [remitReason, setRemitReason] = useState("");
  const currency = useUiPrefs((s) => s.currency);
  const locale = useUiPrefs((s) => s.locale);
  const money = (n: number) => formatMoney(n, currency, locale);
  const role = useAuth((s) => s.user?.role);
  const canManageCatalog = role === "clinic_admin" || role === "super_admin" || role === "accountant";
  const [form, setForm] = useState({
    patient_id: "",
  });

  const patientMap = useMemo(() => {
    const m = new Map<string, Patient>();
    for (const p of patients) m.set(p.id, p);
    return m;
  }, [patients]);

  async function load(patientId?: string) {
    const pid = patientId ?? form.patient_id;
    const [inv, p, feeList, out, cash, claimList, denialList, stmtList] = await Promise.all([
      api<Invoice[]>("/api/v1/billing/invoices"),
      api<Page<Patient>>("/api/v1/patients?limit=100"),
      api<FeeScheduleItem[]>("/api/v1/billing/fee-schedule"),
      api<Outstanding[]>("/api/v1/billing/outstanding"),
      api<CashUp>("/api/v1/billing/cash-up"),
      api<InsuranceClaim[]>("/api/v1/billing/claims"),
      api<ClaimDenial[]>("/api/v1/billing/denials"),
      api<PatientStatement[]>("/api/v1/billing/statements"),
    ]);
    setInvoices(inv);
    setPatients(p.items);
    setFees(feeList);
    setOutstanding(out);
    setCashUp(cash);
    setClaims(claimList);
    setDenials(denialList);
    setStatements(stmtList);
    const nextPatient = pid || p.items[0]?.id || "";
    if (!form.patient_id && nextPatient) {
      setForm((f) => ({ ...f, patient_id: nextPatient }));
    }
    if (nextPatient) {
      const [rows, est] = await Promise.all([
        api<BillableChart[]>(`/api/v1/billing/patients/${nextPatient}/billable-chart`),
        api<InsuranceEstimate>(`/api/v1/insurance/patients/${nextPatient}/estimate`).catch(
          () => null,
        ),
      ]);
      setBillable(rows);
      setSelected(new Set(rows.map((r) => r.id)));
      setEstimate(est);
    } else {
      setBillable([]);
      setSelected(new Set());
      setEstimate(null);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onPatientChange(patientId: string) {
    setForm((f) => ({ ...f, patient_id: patientId }));
    const [rows, est] = await Promise.all([
      api<BillableChart[]>(`/api/v1/billing/patients/${patientId}/billable-chart`),
      api<InsuranceEstimate>(`/api/v1/insurance/patients/${patientId}/estimate`).catch(() => null),
    ]);
    setBillable(rows);
    setSelected(new Set(rows.map((r) => r.id)));
    setEstimate(est);
  }

  async function run(action: () => Promise<void>) {
    setError("");
    try {
      await action();
      await load(form.patient_id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Billing request failed");
    }
  }

  async function chartToCash() {
    await run(async () => {
      await api("/api/v1/billing/chart-to-cash", {
        method: "POST",
        body: JSON.stringify({
          patient_id: form.patient_id,
          chart_entry_ids: selected.size ? Array.from(selected) : null,
          idempotency_key: crypto.randomUUID(),
          notes: "Chart-to-Cash from odontogram",
        }),
      });
    });
  }

  async function pay(invoiceId: string, remaining: number) {
    await run(async () => {
      await api(`/api/v1/billing/invoices/${invoiceId}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount: remaining,
          method: "card",
          idempotency_key: crypto.randomUUID(),
        }),
      });
    });
  }

  async function writeOff(invoiceId: string, remaining: number) {
    await run(async () => {
      await api(`/api/v1/billing/invoices/${invoiceId}/adjustments`, {
        method: "POST",
        body: JSON.stringify({ amount: remaining, kind: "write_off" }),
      });
    });
  }

  async function voidInvoice(invoiceId: string) {
    if (
      !confirm(
        "Void this unpaid invoice? Linked supplies and drugs will return to the warehouse.",
      )
    ) {
      return;
    }
    await run(async () => {
      await api(`/api/v1/billing/invoices/${invoiceId}/void`, { method: "POST" });
    });
  }

  async function createClaim(invoiceId: string) {
    await run(async () => {
      await api("/api/v1/billing/claims", {
        method: "POST",
        body: JSON.stringify({ invoice_id: invoiceId }),
      });
    });
  }

  async function submitClaim(claimId: string) {
    await run(async () => {
      await api(`/api/v1/billing/claims/${claimId}/submit`, { method: "POST" });
    });
  }

  async function postRemittance(claim: InsuranceClaim, lineId: string) {
    const paid = Number(remitPaid);
    await run(async () => {
      await api(`/api/v1/billing/claims/${claim.id}/remittance`, {
        method: "POST",
        body: JSON.stringify({
          claim_line_id: lineId,
          paid_amount: Number.isFinite(paid) ? paid : 0,
          denied: remitDenied,
          denial_reason: remitReason || null,
          payer_name: estimate?.payer_name || "Insurance",
        }),
      });
      setRemitPaid("");
      setRemitDenied(false);
      setRemitReason("");
    });
  }

  async function generateStatement() {
    await run(async () => {
      await api("/api/v1/billing/statements", {
        method: "POST",
        body: JSON.stringify({ patient_id: form.patient_id }),
      });
    });
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const chartTotal = billable
    .filter((b) => selected.has(b.id))
    .reduce((sum, b) => sum + b.unit_price, 0);

  const agingTotals = outstanding.reduce(
    (acc, row) => {
      acc[row.aging_bucket] = (acc[row.aging_bucket] || 0) + row.balance;
      return acc;
    },
    {} as Record<string, number>,
  );

  const patientInvoices = invoices.filter((inv) => inv.patient_id === form.patient_id);
  const patientClaims = claims.filter((c) => c.patient_id === form.patient_id);
  const patientStatements = statements.filter((s) => s.patient_id === form.patient_id);
  const patientDenials = denials.filter((d) => d.patient_id === form.patient_id);

  return (
    <div className="clin-shell space-y-3 animate-rise">
      <div className="clin-head">
        <div>
          <h2 className="font-display text-xl font-bold leading-tight text-brand-900">Billing</h2>
          <p className="text-xs text-muted">
            Posted charges stay on the ledger. Claims, denials, and statements are views of it.
          </p>
        </div>
        <div className="admin-counts">
          <span className="admin-count">
            <strong>{outstanding.length}</strong> open
          </span>
          <span className="admin-count">
            <strong>{denials.length}</strong> denials
          </span>
          {cashUp && (
            <span className="admin-count">
              <strong>{cashUp.payment_count}</strong> payments today
            </span>
          )}
        </div>
      </div>

      <div className="admin-tabs" role="tablist" aria-label="Billing views">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={view === v.id}
            className={`admin-tab ${view === v.id ? "admin-tab--on" : ""}`}
            onClick={() => setView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {view === "catalog" && <CatalogPanel />}

      {view === "ledger" && (
        <>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="glass-panel space-y-2">
          <h3 className="reg-section__title">Outstanding balances</h3>
          <div className="grid grid-cols-4 gap-2 text-xs">
            {(["0_30", "31_60", "61_90", "90_plus"] as const).map((bucket) => (
              <div key={bucket} className="rounded-xl bg-brand-50 p-2">
                <div className="uppercase text-muted">{bucket.replaceAll("_", "-")}d</div>
                <div className="font-semibold">{money(agingTotals[bucket] || 0)}</div>
              </div>
            ))}
          </div>
          {outstanding.length === 0 ? (
            <p className="text-sm text-muted">No open balances.</p>
          ) : (
            <ul className="max-h-64 space-y-2 overflow-auto text-sm">
              {outstanding.map((row) => (
                <li
                  key={row.id}
                  className="flex items-start justify-between gap-2 rounded-xl border border-brand-50 px-3 py-2"
                >
                  <div>
                    <div className="font-semibold">{row.patient_name}</div>
                    <div className="text-xs text-muted">
                      {row.invoice_number} · {row.days_outstanding}d · {row.aging_bucket.replaceAll("_", "-")}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-xs font-semibold">{money(row.balance)}</div>
                    <button
                      type="button"
                      className="btn-ghost mt-1 text-[10px]"
                      onClick={() => void pay(row.id, row.balance)}
                    >
                      Collect
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="glass-panel space-y-2">
          <h3 className="reg-section__title">Daily cash-up</h3>
          {cashUp ? (
            <>
              <p className="text-sm text-muted">
                {cashUp.date} · {cashUp.payment_count} payments
              </p>
              <div className="font-display text-xl font-bold text-brand-800">
                {money(cashUp.total)}
              </div>
              <ul className="space-y-1 text-sm">
                {Object.entries(cashUp.by_method).map(([method, amount]) => (
                  <li key={method} className="flex justify-between border-b border-brand-50 py-1">
                    <span className="capitalize text-muted">{method.replaceAll("_", " ")}</span>
                    <span className="font-semibold">{money(amount)}</span>
                  </li>
                ))}
                {Object.keys(cashUp.by_method).length === 0 && (
                  <li className="text-muted">No payments recorded today.</li>
                )}
              </ul>
            </>
          ) : (
            <p className="text-sm text-muted">Loading cash-up…</p>
          )}
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1fr_1fr_1.1fr]">
        <div className="glass-panel space-y-2">
          <h3 className="reg-section__title">Chart-to-Cash</h3>
          <p className="text-xs text-muted">
            Invoice completed odontogram work without re-typing procedures.
          </p>
          <div>
            <label className="label">Patient</label>
            <select
              className="input"
              value={form.patient_id}
              onChange={(e) => void onPatientChange(e.target.value)}
            >
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.first_name} {p.last_name}
                </option>
              ))}
            </select>
          </div>
          <PatientSafetyBanner patientId={form.patient_id || undefined} />
          {billable.length === 0 ? (
            <EmptyState
              title="No unbilled chart work"
              hint="Chart a filling, crown, or RCT on the patient odontogram, then invoice here."
            />
          ) : (
            <ul className="max-h-64 space-y-2 overflow-auto text-sm">
              {billable.map((b) => (
                <li key={b.id}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-brand-50 px-3 py-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selected.has(b.id)}
                      onChange={() => toggle(b.id)}
                    />
                    <span className="flex-1">
                      <span className="font-semibold text-brand-900">
                        {b.fee_label || b.condition_label}
                      </span>
                      <span className="block text-xs text-muted">
                        Tooth {b.tooth_number}
                        {b.surfaces ? ` · ${b.surfaces}` : ""} · {b.condition_code}
                      </span>
                    </span>
                    <span className="font-mono text-xs">{money(b.unit_price)}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Selected total</span>
            <span className="font-display font-bold text-brand-800">{money(chartTotal)}</span>
          </div>
          {estimate && (
            <div className="rounded-xl bg-brand-50 px-3 py-2 text-xs text-brand-900">
              <div className="font-semibold">
                Co-pay estimate{estimate.payer_name ? ` · ${estimate.payer_name}` : ""}
              </div>
              <div>
                Insurance {money(estimate.insurance_estimate)} · patient{" "}
                {money(estimate.patient_estimate)}
              </div>
              <div className="text-muted">{estimate.notes}</div>
            </div>
          )}
          <button
            type="button"
            className="btn-primary w-full"
            disabled={!selected.size}
            onClick={() => void chartToCash()}
          >
            Generate invoice from chart
          </button>
        </div>

        <ProcedureInvoicePanel
          patientId={form.patient_id || undefined}
          onDone={() => void load(form.patient_id)}
        />

        {canManageCatalog ? (
          <ProcedureCatalogAdmin />
        ) : (
        <div className="glass-panel space-y-3">
          <h3 className="font-display text-base font-bold">Procedure catalog</h3>
          <p className="text-xs text-muted">Admin-managed prices used on specialist invoices</p>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted">
                <tr>
                  <th className="py-1">Code</th>
                  <th className="py-1">Label</th>
                  <th className="py-1">Kind</th>
                  <th className="py-1 text-right">Price</th>
                </tr>
              </thead>
              <tbody>
                {fees
                  .filter((f) => f.billable && f.is_active)
                  .map((f) => (
                    <tr key={f.id} className="border-t border-brand-50">
                      <td className="py-1.5 font-mono text-brand-700">{f.code}</td>
                      <td className="py-1.5">{f.label}</td>
                      <td className="py-1.5 text-xs text-muted">
                        {f.catalog_kind || f.category}
                        {f.inventory_item_id ? ` · ${f.quantity_on_hand ?? 0} on hand` : ""}
                      </td>
                      <td className="py-1.5 text-right font-semibold">
                        {money(f.unit_price)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
        )}
      </div>

      <div className="glass-panel overflow-hidden">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Status</th>
              <th>Total</th>
              <th>Paid</th>
              <th>Est. insurance</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const remaining = invoiceRemaining(inv);
              const p = patientMap.get(inv.patient_id);
              const label = p ? `${p.first_name} ${p.last_name}` : inv.patient_id;
              const estIns = inv.line_items.reduce((sum, li) => sum + (li.estimated_insurance || 0), 0);
              return (
                <tr key={inv.id}>
                  <td className="font-mono text-xs">{inv.invoice_number}</td>
                  <td className="capitalize">{inv.status.replace("_", " ")}</td>
                  <td>{money(inv.total)}</td>
                  <td>{money(inv.amount_paid)}</td>
                  <td>{money(estIns)}</td>
                  <td className="text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        className="btn-ghost text-xs"
                        onClick={() => printReceipt(inv, label, money)}
                      >
                        Print receipt
                      </button>
                      {remaining > 0 && (
                        <button
                          className="btn-ghost text-xs"
                          onClick={() => void pay(inv.id, remaining)}
                        >
                          Pay remaining
                        </button>
                      )}
                      {canManageCatalog && remaining > 0 && (
                        <button
                          className="btn-ghost text-xs"
                          onClick={() => void writeOff(inv.id, remaining)}
                        >
                          Write off
                        </button>
                      )}
                      {canManageCatalog && remaining > 0 && inv.amount_paid < 0.001 && inv.status !== "void" && (
                        <button
                          className="btn-ghost text-xs"
                          onClick={() => void voidInvoice(inv.id)}
                        >
                          Void
                        </button>
                      )}
                    </div>
                    {inv.line_items.some((li) => li.inventory_item_id) && (
                      <div className="mt-1 text-[10px] text-muted">
                        {inv.line_items
                          .filter((li) => li.inventory_item_id)
                          .map((li) => `${li.line_kind || "supply"} ×${li.quantity}`)
                          .join(" · ")}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
        </>
      )}

      {view === "claims" && (
        <div className="space-y-3">
          <div className="glass-panel space-y-2">
            <h3 className="reg-section__title">Create claim</h3>
            <p className="text-xs text-muted">
              One claim line traces to one posted charge. Fees are never overwritten after posting.
            </p>
            <div>
              <label className="label">Patient</label>
              <select
                className="input"
                value={form.patient_id}
                onChange={(e) => void onPatientChange(e.target.value)}
              >
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.first_name} {p.last_name}
                  </option>
                ))}
              </select>
            </div>
            {patientInvoices.length === 0 ? (
              <p className="text-sm text-muted">No invoices for this patient.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {patientInvoices.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex items-center justify-between rounded-xl border border-brand-50 px-3 py-2"
                  >
                    <span>
                      <span className="font-mono text-xs">{inv.invoice_number}</span>
                      <span className="ml-2 text-muted">{money(inv.total)}</span>
                    </span>
                    <button
                      type="button"
                      className="btn-ghost text-xs"
                      onClick={() => void createClaim(inv.id)}
                    >
                      Create claim
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="glass-panel overflow-hidden">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Claim</th>
                  <th>Status</th>
                  <th>Lines</th>
                  <th>Scrub</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(form.patient_id ? patientClaims : claims).map((claim) => (
                  <tr key={claim.id}>
                    <td className="font-mono text-xs">{claim.claim_number}</td>
                    <td className="capitalize">{claim.status.replace("_", " ")}</td>
                    <td>
                      {claim.lines.map((line) => (
                        <div key={line.id} className="text-xs">
                          {money(line.billed_amount)} · {line.status}
                          {line.denial_reason ? ` · ${line.denial_reason}` : ""}
                        </div>
                      ))}
                    </td>
                    <td className="text-xs text-muted">{claim.scrub_notes || "—"}</td>
                    <td className="text-right">
                      <div className="flex flex-col items-end gap-1">
                        {(claim.status === "draft" || claim.status === "denied") && (
                          <button
                            type="button"
                            className="btn-ghost text-xs"
                            onClick={() => void submitClaim(claim.id)}
                          >
                            Submit
                          </button>
                        )}
                        {(claim.status === "submitted" || claim.status === "adjudicated") &&
                          claim.lines.map((line) =>
                            line.status === "pending" || line.status === "partial" ? (
                              <div key={line.id} className="flex flex-wrap justify-end gap-1">
                                <input
                                  className="input w-24 text-xs"
                                  placeholder="Paid"
                                  value={remitPaid}
                                  onChange={(e) => setRemitPaid(e.target.value)}
                                />
                                <label className="flex items-center gap-1 text-[10px]">
                                  <input
                                    type="checkbox"
                                    checked={remitDenied}
                                    onChange={(e) => setRemitDenied(e.target.checked)}
                                  />
                                  Denied
                                </label>
                                <input
                                  className="input w-32 text-xs"
                                  placeholder="Reason"
                                  value={remitReason}
                                  onChange={(e) => setRemitReason(e.target.value)}
                                />
                                <button
                                  type="button"
                                  className="btn-ghost text-xs"
                                  onClick={() => void postRemittance(claim, line.id)}
                                >
                                  Post ERA
                                </button>
                              </div>
                            ) : null,
                          )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {claims.length === 0 && <p className="p-3 text-sm text-muted">No claims yet.</p>}
          </div>
        </div>
      )}

      {view === "denials" && (
        <div className="glass-panel overflow-hidden">
          <h3 className="reg-section__title px-3 pt-3">Denial work queue</h3>
          <p className="px-3 text-xs text-muted">
            Underpaid or denied lines. Correct and resubmit, appeal, or write off the remaining charge.
          </p>
          {(form.patient_id ? patientDenials : denials).length === 0 ? (
            <p className="p-3 text-sm text-muted">No denials or underpayments.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Claim</th>
                  <th>Procedure</th>
                  <th>Billed</th>
                  <th>Paid</th>
                  <th>Reason</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(form.patient_id ? patientDenials : denials).map((row) => {
                  const inv = invoices.find((i) => i.id === row.invoice_id);
                  const remaining = inv ? invoiceRemaining(inv) : 0;
                  return (
                    <tr key={row.claim_line_id}>
                      <td className="font-mono text-xs">{row.claim_number}</td>
                      <td>
                        {row.procedure}
                        {row.procedure_code ? ` · ${row.procedure_code}` : ""}
                      </td>
                      <td>{money(row.billed_amount)}</td>
                      <td>{money(row.paid_amount)}</td>
                      <td className="text-xs">{row.denial_reason || row.status}</td>
                      <td className="text-right">
                        {canManageCatalog && remaining > 0 && (
                          <button
                            type="button"
                            className="btn-ghost text-xs"
                            onClick={() => void writeOff(row.invoice_id, remaining)}
                          >
                            Write off balance
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {view === "statements" && (
        <div className="glass-panel space-y-3">
          <h3 className="reg-section__title">Patient statements</h3>
          <p className="text-xs text-muted">
            Remaining balance after insurance and adjustments, for the selected patient.
          </p>
          <div>
            <label className="label">Patient</label>
            <select
              className="input"
              value={form.patient_id}
              onChange={(e) => void onPatientChange(e.target.value)}
            >
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.first_name} {p.last_name}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="btn-primary" onClick={() => void generateStatement()}>
            Generate statement
          </button>
          {patientStatements.length === 0 ? (
            <p className="text-sm text-muted">No statements yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {patientStatements.map((stmt) => (
                <li
                  key={stmt.id}
                  className="flex items-center justify-between rounded-xl border border-brand-50 px-3 py-2"
                >
                  <div>
                    <div className="font-mono text-xs">{stmt.statement_number}</div>
                    <div className="text-xs text-muted">
                      Due {stmt.due_date || "—"} · issued{" "}
                      {format(parseISO(stmt.issued_at), "MMM d, yyyy")}
                    </div>
                  </div>
                  <div className="font-semibold">{money(stmt.balance_due)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
