import { FormEvent, useEffect, useState } from "react";
import { ProcedureCatalogAdmin } from "@/components/ProcedureCatalogAdmin";
import { ConfigField, ConfigStatus, ConfirmAction } from "@/components/config/ConfigUi";
import { api, ApiError } from "@/lib/api";

type FeeSchedule = {
  id: string;
  code: string;
  name: string;
  payer_kind: string;
  currency: string;
  is_default: boolean;
  is_active: boolean;
};

type TaxRate = {
  id: string;
  code: string;
  name: string;
  rate_bps: number;
  is_default: boolean;
  is_active: boolean;
};

type DiscountRule = {
  id: string;
  code: string;
  name: string;
  percent: number;
  max_amount?: number | null;
  requires_role?: string | null;
  is_active: boolean;
};

type PayMethod = {
  id: string;
  code: string;
  label: string;
  is_active: boolean;
};

export function FinancialConfigPanel({ onProcCount }: { onProcCount?: (n: number) => void }) {
  const [schedules, setSchedules] = useState<FeeSchedule[]>([]);
  const [taxes, setTaxes] = useState<TaxRate[]>([]);
  const [discounts, setDiscounts] = useState<DiscountRule[]>([]);
  const [methods, setMethods] = useState<PayMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [schedForm, setSchedForm] = useState({ code: "", name: "", payer_kind: "cash" });
  const [taxForm, setTaxForm] = useState({ code: "", name: "", rate_bps: "0" });
  const [discForm, setDiscForm] = useState({ code: "", name: "", percent: "10" });

  async function load() {
    const [s, t, d, p] = await Promise.all([
      api<FeeSchedule[]>("/api/v1/config/fee-schedules?include_inactive=true"),
      api<TaxRate[]>("/api/v1/config/tax-rates?include_inactive=true"),
      api<DiscountRule[]>("/api/v1/config/discounts?include_inactive=true"),
      api<PayMethod[]>("/api/v1/config/payment-methods?include_inactive=true"),
    ]);
    setSchedules(s);
    setTaxes(t);
    setDiscounts(d);
    setMethods(p);
  }

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load financial setup"))
      .finally(() => setLoading(false));
  }, []);

  function fail(err: unknown) {
    setOk("");
    setError(err instanceof ApiError ? err.message : "Save failed");
  }

  async function succeed(message: string) {
    setError("");
    await load();
    setOk(message);
  }

  async function addSchedule(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/api/v1/config/fee-schedules", {
        method: "POST",
        body: JSON.stringify(schedForm),
      });
      setSchedForm({ code: "", name: "", payer_kind: "cash" });
      await succeed("Fee schedule added");
    } catch (err) {
      fail(err);
    }
  }

  async function makeDefault(id: string) {
    setError("");
    try {
      await api(`/api/v1/config/fee-schedules/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_default: true }),
      });
      await succeed("Default fee schedule updated");
    } catch (err) {
      fail(err);
    }
  }

  async function addTax(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/api/v1/config/tax-rates", {
        method: "PUT",
        body: JSON.stringify({
          code: taxForm.code,
          name: taxForm.name,
          rate_bps: Number(taxForm.rate_bps) || 0,
        }),
      });
      setTaxForm({ code: "", name: "", rate_bps: "0" });
      await succeed("Tax rate saved");
    } catch (err) {
      fail(err);
    }
  }

  async function addDiscount(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/api/v1/config/discounts", {
        method: "PUT",
        body: JSON.stringify({
          code: discForm.code,
          name: discForm.name,
          percent: Number(discForm.percent) || 0,
        }),
      });
      setDiscForm({ code: "", name: "", percent: "10" });
      await succeed("Discount saved");
    } catch (err) {
      fail(err);
    }
  }

  async function togglePay(row: PayMethod) {
    setError("");
    try {
      await api(`/api/v1/config/payment-methods/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !row.is_active }),
      });
      await succeed(row.is_active ? `${row.label} deactivated` : `${row.label} activated`);
    } catch (err) {
      fail(err);
    }
  }

  async function deactivateTax(row: TaxRate) {
    setError("");
    try {
      await api(`/api/v1/config/tax-rates?rate_id=${row.id}`, {
        method: "PUT",
        body: JSON.stringify({
          code: row.code,
          name: row.name,
          rate_bps: row.rate_bps,
          is_default: row.is_default,
          is_active: false,
        }),
      });
      await succeed(`${row.name} deactivated`);
    } catch (err) {
      fail(err);
    }
  }

  return (
    <div className="space-y-3">
      <ConfigStatus loading={loading} error={error} ok={ok} />
      <section className="glass-panel space-y-3">
        <div>
          <h3 className="font-display text-base font-bold text-brand-900">Fee schedules</h3>
          <p className="text-sm text-muted">
            Cash, corporate, and insurance price lists. Procedure codes live on the default schedule unless you pick another.
          </p>
        </div>
        <form className="config-form-row" onSubmit={addSchedule}>
          <ConfigField label="Code">
            <input
              className="input"
              value={schedForm.code}
              onChange={(e) => setSchedForm({ ...schedForm, code: e.target.value })}
              required
            />
          </ConfigField>
          <ConfigField label="Name">
            <input
              className="input"
              value={schedForm.name}
              onChange={(e) => setSchedForm({ ...schedForm, name: e.target.value })}
              required
            />
          </ConfigField>
          <ConfigField label="Payer">
            <select
              className="input w-36"
              value={schedForm.payer_kind}
              onChange={(e) => setSchedForm({ ...schedForm, payer_kind: e.target.value })}
            >
              <option value="cash">Cash</option>
              <option value="corporate">Corporate</option>
              <option value="insurance">Insurance</option>
            </select>
          </ConfigField>
          <button type="submit" className="btn-primary">
            Add schedule
          </button>
        </form>
        {schedules.length === 0 && !loading ? (
          <p className="text-sm text-muted">No fee schedules yet. Add a cash or insurance list above.</p>
        ) : (
          <ul className="admin-list">
            {schedules.map((s) => (
              <li key={s.id}>
                <div>
                  <div className="font-semibold">
                    {s.name} <span className="text-xs font-normal text-muted">{s.code}</span>
                  </div>
                  <div className="text-xs capitalize text-muted">{s.payer_kind}</div>
                </div>
                {s.is_default ? (
                  <span className="status-pill status-pill--success">Default</span>
                ) : (
                  <button type="button" className="btn-ghost text-sm" onClick={() => void makeDefault(s.id)}>
                    Make default
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <ProcedureCatalogAdmin onCount={onProcCount} />

      <div className="grid gap-3 lg:grid-cols-3">
        <section className="glass-panel space-y-3">
          <h3 className="font-display text-base font-bold text-brand-900">Tax rates</h3>
          <form className="config-form-stack" onSubmit={addTax}>
            <ConfigField label="Code">
              <input
                className="input"
                value={taxForm.code}
                onChange={(e) => setTaxForm({ ...taxForm, code: e.target.value })}
                required
              />
            </ConfigField>
            <ConfigField label="Name">
              <input
                className="input"
                value={taxForm.name}
                onChange={(e) => setTaxForm({ ...taxForm, name: e.target.value })}
                required
              />
            </ConfigField>
            <ConfigField label="Rate (basis points)" hint="1800 = 18%">
              <input
                className="input"
                type="number"
                min={0}
                value={taxForm.rate_bps}
                onChange={(e) => setTaxForm({ ...taxForm, rate_bps: e.target.value })}
              />
            </ConfigField>
            <button type="submit" className="btn-primary w-full">
              Add tax
            </button>
          </form>
          {taxes.length === 0 && !loading ? (
            <p className="text-sm text-muted">No tax rates yet.</p>
          ) : (
            <ul className="admin-list">
              {taxes.map((t) => (
                <li key={t.id}>
                  <div>
                    <div className="font-semibold">{t.name}</div>
                    <div className="text-xs text-muted">{(t.rate_bps / 100).toFixed(2)}%</div>
                  </div>
                  {t.is_active ? (
                    <ConfirmAction
                      label="Deactivate"
                      confirmLabel="Yes, deactivate"
                      onConfirm={() => deactivateTax(t)}
                    />
                  ) : (
                    <span className="text-xs text-muted">Inactive</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="glass-panel space-y-3">
          <h3 className="font-display text-base font-bold text-brand-900">Discounts</h3>
          <form className="config-form-stack" onSubmit={addDiscount}>
            <ConfigField label="Code">
              <input
                className="input"
                value={discForm.code}
                onChange={(e) => setDiscForm({ ...discForm, code: e.target.value })}
                required
              />
            </ConfigField>
            <ConfigField label="Name">
              <input
                className="input"
                value={discForm.name}
                onChange={(e) => setDiscForm({ ...discForm, name: e.target.value })}
                required
              />
            </ConfigField>
            <ConfigField label="Percent">
              <input
                className="input"
                type="number"
                min={0}
                max={100}
                value={discForm.percent}
                onChange={(e) => setDiscForm({ ...discForm, percent: e.target.value })}
              />
            </ConfigField>
            <button type="submit" className="btn-primary w-full">
              Add discount
            </button>
          </form>
          {discounts.length === 0 && !loading ? (
            <p className="text-sm text-muted">No discount rules yet.</p>
          ) : (
            <ul className="admin-list">
              {discounts.map((d) => (
                <li key={d.id}>
                  <div>
                    <div className="font-semibold">{d.name}</div>
                    <div className="text-xs text-muted">{d.percent}%</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="glass-panel space-y-3">
          <h3 className="font-display text-base font-bold text-brand-900">Payment methods</h3>
          {methods.length === 0 && !loading ? (
            <p className="text-sm text-muted">No payment methods configured.</p>
          ) : (
            <ul className="admin-list">
              {methods.map((m) => (
                <li key={m.id}>
                  <div>
                    <div className="font-semibold">{m.label}</div>
                    {!m.is_active && <div className="text-xs text-muted">Inactive</div>}
                  </div>
                  {m.is_active ? (
                    <ConfirmAction
                      label="Deactivate"
                      confirmLabel="Yes, deactivate"
                      onConfirm={() => togglePay(m)}
                    />
                  ) : (
                    <button type="button" className="btn-ghost text-sm" onClick={() => void togglePay(m)}>
                      Activate
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
