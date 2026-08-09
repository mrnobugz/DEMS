import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/i18n";
import { useUiPrefs } from "@/lib/uiPrefs";

type Plan = {
  id: string;
  payer_name: string;
  plan_name?: string | null;
  member_id?: string | null;
  coverage_pct: number;
  annual_max?: number | null;
  amount_used_ytd: number;
  deductible: number;
  deductible_met: number;
  remaining_annual?: number | null;
  remaining_deductible: number;
  is_primary: boolean;
};

type Estimate = {
  subtotal: number;
  coverage_pct: number;
  deductible_remaining: number;
  insurance_estimate: number;
  patient_estimate: number;
  payer_name?: string | null;
  notes: string;
};

type Props = {
  patientId: string;
  onMessage?: (msg: string) => void;
};

export function InsurancePlanPanel({ patientId, onMessage }: Props) {
  const currency = useUiPrefs((s) => s.currency);
  const locale = useUiPrefs((s) => s.locale);
  const money = (n: number) => formatMoney(n, currency, locale);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    payer_name: "",
    plan_name: "",
    member_id: "",
    coverage_pct: "80",
    annual_max: "1500",
    deductible: "50",
    deductible_met: "0",
    amount_used_ytd: "0",
  });

  async function load() {
    const [p, est] = await Promise.all([
      api<Plan[]>(`/api/v1/insurance/patients/${patientId}/plans`),
      api<Estimate>(`/api/v1/insurance/patients/${patientId}/estimate`).catch(() => null),
    ]);
    setPlans(p);
    setEstimate(est);
  }

  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [patientId]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api(`/api/v1/insurance/patients/${patientId}/plans`, {
        method: "POST",
        body: JSON.stringify({
          payer_name: form.payer_name,
          plan_name: form.plan_name || null,
          member_id: form.member_id || null,
          coverage_pct: Number(form.coverage_pct),
          annual_max: form.annual_max === "" ? null : Number(form.annual_max),
          deductible: Number(form.deductible),
          deductible_met: Number(form.deductible_met),
          amount_used_ytd: Number(form.amount_used_ytd),
          is_primary: true,
        }),
      });
      onMessage?.("Insurance plan saved");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    }
  }

  return (
    <div className="glass-panel space-y-4 rounded-3xl p-5">
      <div>
        <h3 className="font-display text-lg font-bold">Insurance plan</h3>
        <p className="text-sm text-muted">Coverage % · annual max · co-pay estimate at invoicing</p>
      </div>

      {estimate && (
        <div className="rounded-2xl bg-brand-50 p-3 text-sm">
          <div className="font-semibold text-brand-900">
            {estimate.payer_name || "No plan"} · patient owes {money(estimate.patient_estimate)}
          </div>
          <div className="text-xs text-muted">
            Subtotal {money(estimate.subtotal)} · insurance {money(estimate.insurance_estimate)} ·{" "}
            {estimate.notes}
          </div>
        </div>
      )}

      {plans.length > 0 && (
        <ul className="space-y-2 text-sm">
          {plans.map((p) => (
            <li key={p.id} className="rounded-xl border border-brand-100 px-3 py-2">
              <div className="font-semibold">
                {p.payer_name}
                {p.is_primary ? " · primary" : ""}
              </div>
              <div className="text-xs text-muted">
                {p.coverage_pct}% · annual remaining{" "}
                {p.remaining_annual != null ? money(p.remaining_annual) : "—"} · deductible left{" "}
                {money(p.remaining_deductible)}
              </div>
            </li>
          ))}
        </ul>
      )}

      <form className="grid gap-3 md:grid-cols-2" onSubmit={onCreate}>
        <div>
          <label className="label">Payer</label>
          <input
            className="input"
            required
            value={form.payer_name}
            onChange={(e) => setForm({ ...form, payer_name: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Plan name</label>
          <input
            className="input"
            value={form.plan_name}
            onChange={(e) => setForm({ ...form, plan_name: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Member ID</label>
          <input
            className="input"
            value={form.member_id}
            onChange={(e) => setForm({ ...form, member_id: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Coverage %</label>
          <input
            className="input"
            type="number"
            min={0}
            max={100}
            value={form.coverage_pct}
            onChange={(e) => setForm({ ...form, coverage_pct: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Annual max</label>
          <input
            className="input"
            type="number"
            min={0}
            value={form.annual_max}
            onChange={(e) => setForm({ ...form, annual_max: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Deductible</label>
          <input
            className="input"
            type="number"
            min={0}
            value={form.deductible}
            onChange={(e) => setForm({ ...form, deductible: e.target.value })}
          />
        </div>
        {error && <p className="text-sm text-red-600 md:col-span-2">{error}</p>}
        <button className="btn-primary md:col-span-2" type="submit">
          Save primary plan
        </button>
      </form>
    </div>
  );
}
