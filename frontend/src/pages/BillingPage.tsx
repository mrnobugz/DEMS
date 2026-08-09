import { FormEvent, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { api, ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/i18n";
import { useUiPrefs } from "@/lib/uiPrefs";
import { EmptyState } from "@/components/EmptyState";
import type { FeeScheduleItem, Invoice, Page, Patient } from "@/lib/types";

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
      <tr><td>Balance</td><td style="text-align:right">${money(Math.max(inv.total - inv.amount_paid, 0))}</td></tr>
    </table>
    ${payments ? `<h3 style="margin-top:20px;font-size:14px">Payments</h3><table>${payments}</table>` : ""}
    <p class="muted" style="margin-top:24px">One record. One ledger. One clinic OS.</p>
    <script>window.onload=()=>window.print()</script>
    </body></html>`;
  const w = window.open("", "_blank", "noopener,noreferrer,width=720,height=900");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

export function BillingPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [outstanding, setOutstanding] = useState<Outstanding[]>([]);
  const [cashUp, setCashUp] = useState<CashUp | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [fees, setFees] = useState<FeeScheduleItem[]>([]);
  const [billable, setBillable] = useState<BillableChart[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const currency = useUiPrefs((s) => s.currency);
  const locale = useUiPrefs((s) => s.locale);
  const money = (n: number) => formatMoney(n, currency, locale);
  const [form, setForm] = useState({
    patient_id: "",
    description: "Clinical procedure",
    unit_price: "150",
    tooth_number: "",
  });

  const patientMap = useMemo(() => {
    const m = new Map<string, Patient>();
    for (const p of patients) m.set(p.id, p);
    return m;
  }, [patients]);

  async function load(patientId?: string) {
    const pid = patientId ?? form.patient_id;
    const [inv, p, feeList, out, cash] = await Promise.all([
      api<Invoice[]>("/api/v1/billing/invoices"),
      api<Page<Patient>>("/api/v1/patients?limit=100"),
      api<FeeScheduleItem[]>("/api/v1/billing/fee-schedule"),
      api<Outstanding[]>("/api/v1/billing/outstanding"),
      api<CashUp>("/api/v1/billing/cash-up"),
    ]);
    setInvoices(inv);
    setPatients(p.items);
    setFees(feeList);
    setOutstanding(out);
    setCashUp(cash);
    const nextPatient = pid || p.items[0]?.id || "";
    if (!form.patient_id && nextPatient) {
      setForm((f) => ({ ...f, patient_id: nextPatient }));
    }
    if (nextPatient) {
      const rows = await api<BillableChart[]>(
        `/api/v1/billing/patients/${nextPatient}/billable-chart`,
      );
      setBillable(rows);
      setSelected(new Set(rows.map((r) => r.id)));
    } else {
      setBillable([]);
      setSelected(new Set());
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onPatientChange(patientId: string) {
    setForm((f) => ({ ...f, patient_id: patientId }));
    const rows = await api<BillableChart[]>(
      `/api/v1/billing/patients/${patientId}/billable-chart`,
    );
    setBillable(rows);
    setSelected(new Set(rows.map((r) => r.id)));
  }

  async function createInvoice(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/api/v1/billing/invoices", {
        method: "POST",
        body: JSON.stringify({
          patient_id: form.patient_id,
          tax: 0,
          discount: 0,
          line_items: [
            {
              description: form.description,
              tooth_number: form.tooth_number || null,
              quantity: 1,
              unit_price: Number(form.unit_price),
            },
          ],
          idempotency_key: crypto.randomUUID(),
        }),
      });
      await load(form.patient_id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Invoice failed");
    }
  }

  async function chartToCash() {
    setError("");
    try {
      await api("/api/v1/billing/chart-to-cash", {
        method: "POST",
        body: JSON.stringify({
          patient_id: form.patient_id,
          chart_entry_ids: selected.size ? Array.from(selected) : null,
          idempotency_key: crypto.randomUUID(),
          notes: "Chart-to-Cash from odontogram",
        }),
      });
      await load(form.patient_id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Chart-to-Cash failed");
    }
  }

  async function pay(invoiceId: string, remaining: number) {
    await api(`/api/v1/billing/invoices/${invoiceId}/payments`, {
      method: "POST",
      body: JSON.stringify({
        amount: remaining,
        method: "card",
        idempotency_key: crypto.randomUUID(),
      }),
    });
    await load(form.patient_id);
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

  return (
    <div className="space-y-5 animate-rise">
      <div>
        <h2 className="font-display text-2xl font-bold text-brand-900">Billing</h2>
        <p className="text-sm text-muted">
          Chart-to-Cash · outstanding aging · daily cash-up · printable receipts
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="glass-panel space-y-3 rounded-3xl p-5">
          <h3 className="font-display text-lg font-bold">Outstanding balances</h3>
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

        <div className="glass-panel space-y-3 rounded-3xl p-5">
          <h3 className="font-display text-lg font-bold">Daily cash-up</h3>
          {cashUp ? (
            <>
              <p className="text-sm text-muted">
                {cashUp.date} · {cashUp.payment_count} payments
              </p>
              <div className="font-display text-2xl font-bold text-brand-800">
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

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr_1.1fr]">
        <div className="glass-panel space-y-3 rounded-3xl p-5">
          <h3 className="font-display text-lg font-bold">Chart-to-Cash</h3>
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
          <button
            type="button"
            className="btn-primary w-full"
            disabled={!selected.size}
            onClick={() => void chartToCash()}
          >
            Generate invoice from chart
          </button>
        </div>

        <form className="glass-panel space-y-3 rounded-3xl p-5" onSubmit={createInvoice}>
          <h3 className="font-display text-lg font-bold">Manual invoice</h3>
          <div>
            <label className="label">Patient</label>
            <select
              className="input"
              value={form.patient_id}
              onChange={(e) => setForm({ ...form, patient_id: e.target.value })}
            >
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.first_name} {p.last_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Description</label>
            <input
              className="input"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Amount</label>
              <input
                className="input"
                type="number"
                min={0}
                step="0.01"
                value={form.unit_price}
                onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Tooth</label>
              <input
                className="input"
                value={form.tooth_number}
                onChange={(e) => setForm({ ...form, tooth_number: e.target.value })}
                placeholder="e.g. 36"
              />
            </div>
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <button className="btn-primary">Create invoice</button>
        </form>

        <div className="glass-panel space-y-3 rounded-3xl p-5">
          <h3 className="font-display text-lg font-bold">Fee schedule</h3>
          <p className="text-xs text-muted">Clinic prices mapped to odontogram codes</p>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted">
                <tr>
                  <th className="py-1">Code</th>
                  <th className="py-1">Label</th>
                  <th className="py-1 text-right">Price</th>
                </tr>
              </thead>
              <tbody>
                {fees
                  .filter((f) => f.billable)
                  .map((f) => (
                    <tr key={f.id} className="border-t border-brand-50">
                      <td className="py-1.5 font-mono text-brand-700">{f.code}</td>
                      <td className="py-1.5">{f.label}</td>
                      <td className="py-1.5 text-right font-semibold">
                        {money(f.unit_price)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="glass-panel overflow-hidden rounded-3xl">
        <table className="w-full text-left text-sm">
          <thead className="bg-brand-50 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Paid</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const remaining = Math.max(inv.total - inv.amount_paid, 0);
              const p = patientMap.get(inv.patient_id);
              const label = p ? `${p.first_name} ${p.last_name}` : inv.patient_id;
              return (
                <tr key={inv.id} className="border-t border-brand-50">
                  <td className="px-4 py-3 font-mono text-xs">{inv.invoice_number}</td>
                  <td className="px-4 py-3 capitalize">{inv.status.replace("_", " ")}</td>
                  <td className="px-4 py-3">{money(inv.total)}</td>
                  <td className="px-4 py-3">{money(inv.amount_paid)}</td>
                  <td className="px-4 py-3 text-right">
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
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
