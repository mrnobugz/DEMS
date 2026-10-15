import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, Printer } from "lucide-react";
import { ConfigStatus, onTabListKeyDown } from "@/components/config/ConfigUi";
import { EmptyState } from "@/components/EmptyState";
import { useAnnounce } from "@/components/ui/sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { exportRowsToCsv, printTableSheet, type ExportColumn } from "@/lib/exportTable";
import { formatMoney } from "@/lib/i18n";
import { hasEffectivePermission } from "@/lib/nav";
import { useUiPrefs } from "@/lib/uiPrefs";

type ReportView = "overview" | "financial" | "clinical" | "operational";

type FinancialReport = {
  period_days: number;
  period_start: string;
  period_end: string;
  revenue_today: number;
  revenue_month: number;
  revenue_period: number;
  outstanding: number;
  invoices_period: number;
  aging: Record<string, number>;
  by_method: { method: string; amount: number; count: number }[];
  by_day: { date: string; amount: number }[];
};

type ClinicalReport = {
  period_days: number;
  period_start: string;
  period_end: string;
  scope: "own" | "clinic";
  visits: number;
  imaging_studies: number;
  lab_cases: number;
  top_procedures: { type: string; count: number }[];
  top_billed: { label: string; count: number; amount: number }[];
  restoration_failures: { total: number; failed_or_replaced: number; failure_rate: number };
  material_cost_used: number;
};

type OperationalReport = {
  period_days: number;
  period_start: string;
  period_end: string;
  appointments: number;
  completed: number;
  no_shows: number;
  no_show_rate: number;
  utilization_proxy: number;
  by_status: { status: string; count: number }[];
  low_stock_skus: number;
  open_requisitions: number;
};

const PERIODS = [
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
  { days: 365, label: "Last 365 days" },
] as const;

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
}

function explainFailure(err: unknown, action: string) {
  const detail = err instanceof Error ? err.message.trim() : "";
  const lead = detail && !/^error\s*\d+/i.test(detail) ? detail : `Could not ${action}.`;
  if (/try again\.?$/i.test(lead)) return lead;
  return `${lead} Check your connection and try again.`;
}

function parseView(raw: string | null, allowed: ReportView[]): ReportView {
  if (raw && allowed.includes(raw as ReportView)) return raw as ReportView;
  return "overview";
}

export function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const perms = useAuth((s) => s.user?.effective_permissions);
  const currency = useUiPrefs((s) => s.currency);
  const locale = useUiPrefs((s) => s.locale);
  const money = (n: number) => formatMoney(n, currency, locale);

  const canFinancial = hasEffectivePermission(perms, "reports:financial") || hasEffectivePermission(perms, "reports:*");
  const canClinical =
    hasEffectivePermission(perms, "reports:own") ||
    hasEffectivePermission(perms, "reports:financial") ||
    hasEffectivePermission(perms, "reports:*");
  const canOperational =
    hasEffectivePermission(perms, "reports:*") || hasEffectivePermission(perms, "reports:financial");

  const tabs = useMemo(() => {
    const list: { id: ReportView; label: string }[] = [{ id: "overview", label: "Overview" }];
    if (canFinancial) list.push({ id: "financial", label: "Financial" });
    if (canClinical) list.push({ id: "clinical", label: "Clinical" });
    if (canOperational) list.push({ id: "operational", label: "Operational" });
    return list;
  }, [canFinancial, canClinical, canOperational]);

  const view = parseView(params.get("view"), tabs.map((t) => t.id));
  const [days, setDays] = useState(30);
  const [financial, setFinancial] = useState<FinancialReport | null>(null);
  const [clinical, setClinical] = useState<ClinicalReport | null>(null);
  const [ops, setOps] = useState<OperationalReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useAnnounce(error);

  function setView(next: ReportView) {
    const nextParams = new URLSearchParams(params);
    if (next === "overview") nextParams.delete("view");
    else nextParams.set("view", next);
    setParams(nextParams, { replace: true });
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const opsDays = days === 30 ? 7 : days;
    const tasks: Promise<void>[] = [];

    if (canFinancial) {
      tasks.push(
        api<FinancialReport>(`/api/v1/reports/financial?days=${days}`)
          .then((data) => {
            if (!cancelled) setFinancial(data);
          })
          .catch((err) => {
            if (!cancelled) {
              setFinancial(null);
              throw err;
            }
          }),
      );
    } else {
      setFinancial(null);
    }

    if (canClinical) {
      tasks.push(
        api<ClinicalReport>(`/api/v1/reports/clinical?days=${days}`)
          .then((data) => {
            if (!cancelled) setClinical(data);
          })
          .catch((err) => {
            if (!cancelled) {
              setClinical(null);
              throw err;
            }
          }),
      );
    } else {
      setClinical(null);
    }

    if (canOperational) {
      tasks.push(
        api<OperationalReport>(`/api/v1/reports/operational?days=${opsDays}`)
          .then((data) => {
            if (!cancelled) setOps(data);
          })
          .catch((err) => {
            if (!cancelled) {
              setOps(null);
              throw err;
            }
          }),
      );
    } else {
      setOps(null);
    }

    Promise.allSettled(tasks).then((results) => {
      if (cancelled) return;
      const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
      if (failed) {
        setError(explainFailure(failed.reason, "load reports"));
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [days, canFinancial, canClinical, canOperational, attempt]);

  const periodLabel = PERIODS.find((p) => p.days === days)?.label || `Last ${days} days`;
  const hasAny = Boolean(financial || clinical || ops);

  function exportActive() {
    if (view === "financial" && financial) {
      exportRowsToCsv(
        `reports-financial-${days}d`,
        [
          ...financial.by_method.map((row) => ({
            section: "Payment method",
            label: row.method,
            count: String(row.count),
            amount: money(row.amount),
          })),
          ...Object.entries(financial.aging).map(([bucket, amount]) => ({
            section: "Aging",
            label: bucket.replaceAll("_", "-"),
            count: "",
            amount: money(amount),
          })),
        ],
        DETAIL_COLUMNS,
      );
      return;
    }
    if (view === "clinical" && clinical) {
      exportRowsToCsv(
        `reports-clinical-${days}d`,
        clinical.top_billed.map((row) => ({
          section: "Billed",
          label: row.label,
          count: String(row.count),
          amount: money(row.amount),
        })),
        DETAIL_COLUMNS,
      );
      return;
    }
    if (view === "operational" && ops) {
      exportRowsToCsv(
        `reports-operational-${ops.period_days}d`,
        ops.by_status.map((row) => ({
          section: "Appointment status",
          label: row.status,
          count: String(row.count),
          amount: "",
        })),
        DETAIL_COLUMNS,
      );
    }
  }

  function printActive() {
    const meta = [periodLabel, `Generated ${new Date().toLocaleString()}`];
    if (view === "financial" && financial) {
      printTableSheet({
        title: "Financial report",
        meta,
        rows: [
          { section: "Summary", label: "Revenue in period", count: "", amount: money(financial.revenue_period) },
          { section: "Summary", label: "Outstanding", count: "", amount: money(financial.outstanding) },
          ...financial.by_method.map((row) => ({
            section: "Payment method",
            label: row.method,
            count: String(row.count),
            amount: money(row.amount),
          })),
        ],
        columns: DETAIL_COLUMNS,
      });
      return;
    }
    if (view === "clinical" && clinical) {
      printTableSheet({
        title: clinical.scope === "own" ? "Clinical report (your work)" : "Clinical report",
        meta,
        rows: clinical.top_procedures.map((row) => ({
          section: "Procedures",
          label: row.type,
          count: String(row.count),
          amount: "",
        })),
        columns: DETAIL_COLUMNS,
      });
      return;
    }
    if (view === "operational" && ops) {
      printTableSheet({
        title: "Operational report",
        meta,
        rows: ops.by_status.map((row) => ({
          section: "Status",
          label: row.status,
          count: String(row.count),
          amount: "",
        })),
        columns: DETAIL_COLUMNS,
      });
    }
  }

  const canExport =
    (view === "financial" && !!financial) ||
    (view === "clinical" && !!clinical) ||
    (view === "operational" && !!ops);

  return (
    <div className="clin-shell admin-shell animate-rise space-y-3">
      <div className="clin-head">
        <div>
          <h2 className="font-display text-xl font-bold leading-tight text-brand-900">Reports</h2>
          <p className="text-sm text-muted">
            Financial collections, clinical volume, and clinic operations for the selected period.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="label">Period</span>
            <select className="input" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {PERIODS.map((period) => (
                <option key={period.days} value={period.days}>
                  {period.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn-ghost" disabled={!canExport} onClick={exportActive}>
            <Download size={16} aria-hidden /> Export CSV
          </button>
          <button type="button" className="btn-primary" disabled={!canExport} onClick={printActive}>
            <Printer size={16} aria-hidden /> Print
          </button>
        </div>
      </div>

      <div
        className="admin-tabs"
        role="tablist"
        aria-label="Report sections"
        onKeyDown={(e) =>
          onTabListKeyDown(
            e,
            tabs.map((tab) => tab.id),
            view,
            (id) => {
              setView(id);
              queueMicrotask(() => document.getElementById(`rpt-tab-${id}`)?.focus());
            },
          )
        }
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`rpt-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={view === tab.id}
            aria-controls="rpt-panel"
            tabIndex={view === tab.id ? 0 : -1}
            className={`admin-tab ${view === tab.id ? "admin-tab--on" : ""}`}
            onClick={() => setView(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div id="rpt-panel" role="tabpanel" aria-labelledby={`rpt-tab-${view}`} aria-busy={loading || undefined}>
        <ConfigStatus loading={loading} error={error} />
        {error && !loading && (
          <button type="button" className="btn-ghost mt-2" onClick={() => setAttempt((n) => n + 1)}>
            Retry loading reports
          </button>
        )}
        {!loading && !hasAny && !error && (
          <EmptyState
            title="No report access"
            hint="Your role does not include report permissions. Ask a clinic admin if you need them."
          />
        )}

        {!loading && hasAny && view === "overview" && (
          <OverviewPanel
            financial={financial}
            clinical={clinical}
            ops={ops}
            money={money}
            periodLabel={periodLabel}
            onJump={setView}
          />
        )}
        {!loading && view === "financial" && canFinancial && (
          <FinancialPanel data={financial} money={money} />
        )}
        {!loading && view === "clinical" && canClinical && (
          <ClinicalPanel data={clinical} money={money} />
        )}
        {!loading && view === "operational" && canOperational && (
          <OperationalPanel data={ops} />
        )}
      </div>
    </div>
  );
}

type DetailRow = { section: string; label: string; count: string; amount: string };

const DETAIL_COLUMNS: ExportColumn<DetailRow>[] = [
  { key: "section", header: "Section", value: (row) => row.section },
  { key: "label", header: "Label", value: (row) => row.label },
  { key: "count", header: "Count", value: (row) => row.count, numeric: true },
  { key: "amount", header: "Amount", value: (row) => row.amount, numeric: true },
];

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <article className="glass-panel p-3">
      <p className="text-sm text-muted">{label}</p>
      <p className="font-display text-xl font-bold text-brand-900">{value}</p>
      {hint && <p className="text-sm text-muted">{hint}</p>}
    </article>
  );
}

function OverviewPanel({
  financial,
  clinical,
  ops,
  money,
  periodLabel,
  onJump,
}: {
  financial: FinancialReport | null;
  clinical: ClinicalReport | null;
  ops: OperationalReport | null;
  money: (n: number) => string;
  periodLabel: string;
  onJump: (view: ReportView) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted" aria-live="polite">
        Snapshot for {periodLabel}. Open a section for detail, export, or print.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {financial && (
          <>
            <Stat label="Collections (period)" value={money(financial.revenue_period)} hint="Payments received" />
            <Stat label="Outstanding" value={money(financial.outstanding)} hint="Open invoice balances" />
          </>
        )}
        {clinical && (
          <>
            <Stat
              label="Visits"
              value={String(clinical.visits)}
              hint={clinical.scope === "own" ? "Your exams in this period" : "Clinic exams in this period"}
            />
            <Stat label="Imaging studies" value={String(clinical.imaging_studies)} />
          </>
        )}
        {ops && (
          <>
            <Stat
              label="No-show rate"
              value={`${((ops.no_show_rate || 0) * 100).toFixed(1)}%`}
              hint={`${ops.no_shows} of ${ops.appointments} appointments`}
            />
            <Stat label="Low-stock SKUs" value={String(ops.low_stock_skus)} hint={`${ops.open_requisitions} open store requests`} />
          </>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {financial && (
          <button type="button" className="btn-primary" onClick={() => onJump("financial")}>
            Open financial
          </button>
        )}
        {clinical && (
          <button type="button" className="btn-ghost" onClick={() => onJump("clinical")}>
            Open clinical
          </button>
        )}
        {ops && (
          <button type="button" className="btn-ghost" onClick={() => onJump("operational")}>
            Open operational
          </button>
        )}
      </div>
    </div>
  );
}

function FinancialPanel({
  data,
  money,
}: {
  data: FinancialReport | null;
  money: (n: number) => string;
}) {
  if (!data) {
    return <EmptyState title="No financial data" hint="Collections and aging appear after payments are recorded." />;
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted" aria-live="polite">
        {data.period_start} to {data.period_end} · {data.invoices_period} invoices in period
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Today" value={money(data.revenue_today)} />
        <Stat label="This month" value={money(data.revenue_month)} />
        <Stat label="Period collections" value={money(data.revenue_period)} />
        <Stat label="Outstanding" value={money(data.outstanding)} />
      </div>
      <section className="glass-panel space-y-2 p-4">
        <h3 className="reg-section__title">Aging (open balances)</h3>
        <div className="grid gap-2 sm:grid-cols-4">
          {Object.entries(data.aging).map(([bucket, amount]) => (
            <div key={bucket} className="rounded-xl border border-border bg-canvas p-3">
              <p className="text-sm text-muted">{bucket.replaceAll("_", "–")} days</p>
              <p className="font-semibold text-brand-900">{money(amount)}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="glass-panel space-y-2 p-4">
        <h3 className="reg-section__title">Collections by method</h3>
        {!data.by_method.length ? (
          <p className="text-sm text-muted">No payments in this period.</p>
        ) : (
          <div className="admin-scroll">
            <table className="admin-table">
              <caption className="sr-only">Collections by payment method</caption>
              <thead>
                <tr>
                  <th>Method</th>
                  <th>Payments</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.by_method.map((row) => (
                  <tr key={row.method}>
                    <td>{titleCase(row.method)}</td>
                    <td>{row.count}</td>
                    <td>{money(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="glass-panel space-y-2 p-4">
        <h3 className="reg-section__title">Daily collections</h3>
        {!data.by_day.length ? (
          <p className="text-sm text-muted">No daily totals yet.</p>
        ) : (
          <div className="admin-scroll">
            <table className="admin-table">
              <caption className="sr-only">Daily collections</caption>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.by_day.map((row) => (
                  <tr key={row.date}>
                    <td>{row.date}</td>
                    <td>{money(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function ClinicalPanel({
  data,
  money,
}: {
  data: ClinicalReport | null;
  money: (n: number) => string;
}) {
  if (!data) {
    return <EmptyState title="No clinical data" hint="Visits, imaging, and billed procedures appear after charting." />;
  }
  const failRate = ((data.restoration_failures?.failure_rate || 0) * 100).toFixed(1);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted" aria-live="polite">
        {data.period_start} to {data.period_end}
        {data.scope === "own" ? " · Your work only" : " · Clinic-wide"}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Visits" value={String(data.visits)} />
        <Stat label="Imaging" value={String(data.imaging_studies)} />
        <Stat label="Lab cases" value={String(data.lab_cases)} />
        <Stat
          label="Restoration failure"
          value={`${failRate}%`}
          hint={`${data.restoration_failures?.failed_or_replaced || 0} of ${data.restoration_failures?.total || 0}`}
        />
      </div>
      <Stat label="Material cost used" value={money(data.material_cost_used)} hint="Inventory usage in this period" />
      <div className="grid gap-3 lg:grid-cols-2">
        <section className="glass-panel space-y-2 p-4">
          <h3 className="reg-section__title">Top procedures</h3>
          {!data.top_procedures.length ? (
            <p className="text-sm text-muted">No procedures recorded in this period.</p>
          ) : (
            <ul className="space-y-1">
              {data.top_procedures.map((row) => (
                <li key={row.type} className="flex justify-between gap-2 text-sm">
                  <span>{titleCase(row.type)}</span>
                  <strong>{row.count}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="glass-panel space-y-2 p-4">
          <h3 className="reg-section__title">Top billed lines</h3>
          {!data.top_billed.length ? (
            <p className="text-sm text-muted">No billed procedure lines in this period.</p>
          ) : (
            <div className="admin-scroll">
              <table className="admin-table">
                <caption className="sr-only">Top billed lines</caption>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Count</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_billed.map((row) => (
                    <tr key={row.label}>
                      <td>{row.label}</td>
                      <td>{row.count}</td>
                      <td>{money(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function OperationalPanel({ data }: { data: OperationalReport | null }) {
  if (!data) {
    return <EmptyState title="No operational data" hint="Appointments and store alerts appear as the clinic works." />;
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted" aria-live="polite">
        {data.period_start} to {data.period_end} · {data.period_days}-day window
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Appointments" value={String(data.appointments)} />
        <Stat label="Completed" value={String(data.completed)} />
        <Stat label="No-shows" value={String(data.no_shows)} />
        <Stat label="No-show rate" value={`${((data.no_show_rate || 0) * 100).toFixed(1)}%`} />
        <Stat label="Utilization" value={`${((data.utilization_proxy || 0) * 100).toFixed(1)}%`} hint="Completed ÷ booked" />
        <Stat label="Low-stock SKUs" value={String(data.low_stock_skus)} />
        <Stat label="Open store requests" value={String(data.open_requisitions)} />
      </div>
      <section className="glass-panel space-y-2 p-4">
        <h3 className="reg-section__title">Appointments by status</h3>
        {!data.by_status.length ? (
          <p className="text-sm text-muted">No appointments in this period.</p>
        ) : (
          <div className="admin-scroll">
            <table className="admin-table">
              <caption className="sr-only">Appointments by status</caption>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {data.by_status.map((row) => (
                  <tr key={row.status}>
                    <td>{titleCase(row.status)}</td>
                    <td>{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
