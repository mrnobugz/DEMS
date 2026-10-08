import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/accordion";
import { useAnnounce } from "@/components/ui/sonner";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { exportRowsToCsv } from "@/lib/exportTable";
import { hasEffectivePermission } from "@/lib/nav";
import { fetchSummary } from "@/features/billing/api/billingApi";
import { MethodDonut } from "@/features/billing/components/MethodDonut";
import { NewInvoiceDialog } from "@/features/billing/components/NewInvoiceDialog";
import { RevenueChart } from "@/features/billing/components/RevenueChart";
import { StatCards } from "@/features/billing/components/StatCards";
import { StatusBadge } from "@/features/billing/components/StatusBadge";
import { formatWhen, summaryQuery } from "@/features/billing/lib/dates";
import { useMoney } from "@/features/billing/hooks/useMoney";
import { useBillingStore, useSummaryPreset } from "@/features/billing/store/useBillingStore";
import { methodLabel, type BillingSummary } from "@/features/billing/types";

export function OverviewPage() {
  const preset = useSummaryPreset();
  const setPreset = useBillingStore((state) => state.setSummaryPreset);
  const perms = useAuth((state) => state.user?.effective_permissions);
  const canCreate = hasEffectivePermission(perms, "billing:create");
  const { money } = useMoney();
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  useAnnounce(notice);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotice("");
    fetchSummary(summaryQuery(preset))
      .then((row) => {
        if (!cancelled) setSummary(row);
      })
      .catch((err: unknown) => {
        if (!cancelled) setNotice(err instanceof ApiError ? err.message : "Could not load billing totals");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [preset, reloadKey]);

  function exportCsv() {
    if (!summary) return;
    exportRowsToCsv("billing-recent-invoices.csv", summary.recent_invoices, [
      { key: "number", header: "Invoice", value: (row) => row.invoice_number },
      { key: "patient", header: "Patient", value: (row) => row.patient_name },
      { key: "status", header: "Status", value: (row) => row.status },
      { key: "total", header: "Total", value: (row) => row.total },
      { key: "balance", header: "Balance", value: (row) => row.balance },
    ]);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <label className="block text-sm">
          <span className="label">Period</span>
          <select className="input" value={preset} onChange={(event) => setPreset(event.target.value as typeof preset)}>
            <option value="month">This month</option>
            <option value="30d">Last 30 days</option>
            <option value="quarter">This quarter</option>
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          {canCreate && (
            <Button onClick={() => setCreating(true)}>
              <Plus size={16} aria-hidden /> New invoice
            </Button>
          )}
          <Button variant="ghost" onClick={exportCsv} disabled={!summary}>
            <Download size={16} aria-hidden /> Export CSV
          </Button>
        </div>
      </div>
      <p className="text-sm" role="status" aria-live="polite">
        {notice || (summary ? `Showing ${summary.period_start} to ${summary.period_end}.` : loading ? "Loading billing totals…" : "")}
      </p>
      {loading && <PageSkeleton rows={3} />}
      {summary && !loading && (
        <>
          <StatCards summary={summary} money={money} />
          <div className="grid gap-3 xl:grid-cols-5">
            <div className="xl:col-span-3">
              <RevenueChart rows={summary.revenue_by_month} money={money} />
            </div>
            <div className="xl:col-span-2">
              <MethodDonut rows={summary.payment_methods} money={money} />
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <section className="glass-panel">
              <h3 className="mb-2 font-display text-lg font-bold text-brand-900">Recent invoices</h3>
              <ul className="space-y-2">
                {summary.recent_invoices.length === 0 && <li className="text-sm text-muted">No invoices yet.</li>}
                {summary.recent_invoices.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-2 border-t border-border py-2 text-sm">
                    <Link to={`/billing/invoices/${row.id}`} className="min-w-0">
                      <span className="block font-semibold">{row.patient_name}</span>
                      <span className="font-mono text-xs text-muted">{row.invoice_number} · {formatWhen(row.issued_at)}</span>
                    </Link>
                    <span className="text-right">
                      <StatusBadge status={row.status} overdue={row.is_overdue} />
                      <span className="mt-1 block tabular-nums">{money(row.balance)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="glass-panel">
              <h3 className="mb-2 font-display text-lg font-bold text-brand-900">Recent payments</h3>
              <ul className="space-y-2">
                {summary.recent_payments.length === 0 && <li className="text-sm text-muted">No payments yet.</li>}
                {summary.recent_payments.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-2 border-t border-border py-2 text-sm">
                    <span>
                      <span className="block font-semibold">{row.patient_name || "Patient"}</span>
                      <span className="text-xs text-muted">{methodLabel(row.method)} · {formatWhen(row.paid_at, "d MMM HH:mm")}</span>
                    </span>
                    <span className="tabular-nums font-semibold">{money(row.amount)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
      <NewInvoiceDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(invoice) => {
          setNotice(`Invoice ${invoice.invoice_number} created`);
          setReloadKey((key) => key + 1);
        }}
      />
    </div>
  );
}
