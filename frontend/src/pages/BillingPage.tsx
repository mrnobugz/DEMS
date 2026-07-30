import { FormEvent, useEffect, useState } from "react";
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

export function BillingPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
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

  async function load(patientId?: string) {
    const pid = patientId ?? form.patient_id;
    const [inv, p, feeList] = await Promise.all([
      api<Invoice[]>("/api/v1/billing/invoices"),
      api<Page<Patient>>("/api/v1/patients?limit=100"),
      api<FeeScheduleItem[]>("/api/v1/billing/fee-schedule"),
    ]);
    setInvoices(inv);
    setPatients(p.items);
    setFees(feeList);
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

  return (
    <div className="space-y-5 animate-rise">
      <div>
        <h2 className="font-display text-2xl font-bold text-brand-900">Billing</h2>
        <p className="text-sm text-muted">
          Chart-to-Cash · fee schedule · idempotent invoices & payments
        </p>
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
              return (
                <tr key={inv.id} className="border-t border-brand-50">
                  <td className="px-4 py-3 font-mono text-xs">{inv.invoice_number}</td>
                  <td className="px-4 py-3 capitalize">{inv.status.replace("_", " ")}</td>
                  <td className="px-4 py-3">{money(inv.total)}</td>
                  <td className="px-4 py-3">{money(inv.amount_paid)}</td>
                  <td className="px-4 py-3 text-right">
                    {remaining > 0 && (
                      <button
                        className="btn-ghost text-xs"
                        onClick={() => void pay(inv.id, remaining)}
                      >
                        Pay remaining
                      </button>
                    )}
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
