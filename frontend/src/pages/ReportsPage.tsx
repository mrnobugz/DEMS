import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/i18n";
import { useUiPrefs } from "@/lib/uiPrefs";

export function ReportsPage() {
  const currency = useUiPrefs((s) => s.currency);
  const locale = useUiPrefs((s) => s.locale);
  const [financial, setFinancial] = useState<any>(null);
  const [clinical, setClinical] = useState<any>(null);
  const [ops, setOps] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api("/api/v1/reports/financial").catch(() => null),
      api("/api/v1/reports/clinical").catch(() => null),
      api("/api/v1/reports/operational").catch(() => null),
    ])
      .then(([f, c, o]) => {
        setFinancial(f);
        setClinical(c);
        setOps(o);
      })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="animate-rise space-y-6">
      <div>
        <h2 className="font-display text-3xl font-bold text-brand-900">Reports</h2>
        <p className="text-sm text-muted">Financial · clinical · operational</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {financial && (
        <section className="glass-panel rounded-3xl p-5">
          <h3 className="font-display text-lg font-bold">Financial</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Stat label="Today" value={formatMoney(financial.revenue_today, currency, locale)} />
            <Stat label="This month" value={formatMoney(financial.revenue_month, currency, locale)} />
            <Stat label="Outstanding" value={formatMoney(financial.outstanding, currency, locale)} />
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-4 text-sm">
            {Object.entries(financial.aging || {}).map(([k, v]) => (
              <div key={k} className="rounded-xl bg-brand-50 p-3">
                <div className="text-xs uppercase text-muted">{k.replaceAll("_", "-")} days</div>
                <div className="font-semibold">{formatMoney(Number(v), currency, locale)}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {clinical && (
        <section className="glass-panel rounded-3xl p-5">
          <h3 className="font-display text-lg font-bold">Clinical</h3>
          <p className="mt-1 text-sm text-muted">
            Failure rate:{" "}
            {((clinical.restoration_failures?.failure_rate || 0) * 100).toFixed(1)}% · Material cost{" "}
            {formatMoney(clinical.material_cost_used || 0, currency, locale)}
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            {(clinical.top_procedures || []).map((p: any) => (
              <li key={p.type}>
                {p.type}: <strong>{p.count}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}

      {ops && (
        <section className="glass-panel rounded-3xl p-5">
          <h3 className="font-display text-lg font-bold">Operational (7d)</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <Stat label="Appointments" value={ops.appointments_7d} />
            <Stat label="Completed" value={ops.completed_7d} />
            <Stat label="No-shows" value={ops.no_shows_7d} />
            <Stat label="No-show rate" value={`${((ops.no_show_rate || 0) * 100).toFixed(1)}%`} />
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-brand-50 p-4">
      <div className="text-xs font-semibold uppercase text-muted">{label}</div>
      <div className="mt-1 font-display text-xl font-bold text-brand-900">{value}</div>
    </div>
  );
}
