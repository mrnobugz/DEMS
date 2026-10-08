import { useEffect, useMemo, useState } from "react";
import { ConfigStatus } from "@/components/config/ConfigUi";
import { EmptyState } from "@/components/EmptyState";
import { api, ApiError } from "@/lib/api";
import { exportRowsToCsv, printTableSheet, type ExportColumn } from "@/lib/exportTable";
import { formatMoney } from "@/lib/i18n";
import type { WarehouseAnalysis } from "@/lib/types";
import { useUiPrefs } from "@/lib/uiPrefs";
import { ColumnChart, CompareChart, DonutChart, TrendChart } from "@/pages/department/WarehouseCharts";

const PERIODS = [
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
  { days: 180, label: "Last 180 days" },
  { days: 365, label: "Last 365 days" },
] as const;

const TYPE_LABEL: Record<string, string> = {
  issue_patient: "Patient",
  issue_department: "Department use",
  writeoff: "Write-off",
  transfer: "Issued to bay",
};

type DetailRow = {
  section: string;
  sku: string;
  name: string;
  quantity: string;
  extra: string;
};

const DETAIL_COLUMNS: ExportColumn<DetailRow>[] = [
  { key: "section", header: "Section", value: (row) => row.section },
  { key: "sku", header: "SKU", value: (row) => row.sku },
  { key: "name", header: "Name", value: (row) => row.name },
  { key: "quantity", header: "Quantity", value: (row) => row.quantity, numeric: true },
  { key: "extra", header: "Detail", value: (row) => row.extra },
];

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (char) => char.toUpperCase());
}

function detailRows(analysis: WarehouseAnalysis, money: (value: number) => string): DetailRow[] {
  const rows: DetailRow[] = [
    { section: "Summary", sku: "", name: "On hand", quantity: String(analysis.sku_count), extra: money(analysis.on_hand_value) },
    { section: "Summary", sku: "", name: "Issue cost", quantity: "", extra: money(analysis.cogs_90d) },
    { section: "Summary", sku: "", name: "Billed supplies", quantity: "", extra: money(analysis.billed_supply_revenue) },
    {
      section: "Summary",
      sku: "",
      name: "Fill rate",
      quantity: analysis.stats?.fill_rate == null ? "" : `${analysis.stats.fill_rate}%`,
      extra: analysis.stats?.stock_cover_days == null ? "" : `${analysis.stats.stock_cover_days} days cover`,
    },
  ];
  for (const row of analysis.low_stock) {
    rows.push({
      section: "Low stock",
      sku: row.sku,
      name: row.name,
      quantity: String(row.quantity),
      extra: `Reorder ${row.reorder_level}`,
    });
  }
  for (const row of analysis.expiring) {
    rows.push({
      section: "Expiring",
      sku: row.sku,
      name: row.name,
      quantity: String(row.quantity),
      extra: `${row.lot_code || "—"} · ${row.expiry_date || "—"} · ${row.location || "—"}`,
    });
  }
  for (const row of analysis.dead_stock) {
    rows.push({
      section: "Slow movers",
      sku: row.sku,
      name: row.name,
      quantity: String(row.quantity),
      extra: "No issues in this period",
    });
  }
  for (const row of analysis.top_skus || []) {
    rows.push({
      section: "Top issued",
      sku: row.sku,
      name: row.name,
      quantity: String(row.quantity),
      extra: money(row.cost),
    });
  }
  return rows;
}

export function WarehouseAnalysisPanel() {
  const currency = useUiPrefs((s) => s.currency);
  const locale = useUiPrefs((s) => s.locale);
  const money = (value: number) => formatMoney(value, currency, locale);
  const [days, setDays] = useState(90);
  const [category, setCategory] = useState("");
  const [department, setDepartment] = useState("");
  const [analysis, setAnalysis] = useState<WarehouseAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams({ days: String(days) });
    if (category) params.set("category", category);
    if (department) params.set("department", department);
    setLoading(true);
    setError("");
    api<WarehouseAnalysis>(`/api/v1/inventory/analysis?${params.toString()}`)
      .then(setAnalysis)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load warehouse analysis"))
      .finally(() => setLoading(false));
  }, [days, category, department]);

  const rows = useMemo(() => (analysis ? detailRows(analysis, money) : []), [analysis, currency, locale]);
  const periodLabel = PERIODS.find((period) => period.days === days)?.label || `Last ${days} days`;
  const departmentName =
    analysis?.departments?.find((loc) => loc.code === department)?.name || department || "All departments";
  const filterMeta = [periodLabel, category || "All categories", departmentName];

  function exportCsv() {
    if (!analysis) return;
    exportRowsToCsv(
      `warehouse-analysis-${days}d`,
      rows,
      DETAIL_COLUMNS,
    );
  }

  function printSheet() {
    if (!analysis) return;
    printTableSheet({
      title: "Warehouse analysis",
      meta: filterMeta,
      rows,
      columns: DETAIL_COLUMNS,
      footNote: "Issue cost includes write-offs and transfers. It is not a sales margin.",
    });
  }

  const cover = analysis?.stats?.stock_cover_days;
  const fill = analysis?.stats?.fill_rate;
  const buckets = analysis?.expiry_buckets;

  return (
    <div className="space-y-3">
      <section className="glass-panel space-y-3 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="reg-section__title">Analysis</h3>
            <p className="text-sm text-muted">
              On-hand value, issue cost, and expiry are stock snapshots. Charts follow the period and filters.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost" onClick={exportCsv} disabled={!analysis}>
              Export CSV
            </button>
            <button type="button" className="btn-primary" onClick={printSheet} disabled={!analysis}>
              Print
            </button>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
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
          <label className="text-sm">
            <span className="label">Category</span>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {(analysis?.categories || []).map((name) => (
                <option key={name} value={name}>
                  {titleCase(name)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="label">Department</span>
            <select className="input" value={department} onChange={(e) => setDepartment(e.target.value)}>
              <option value="">All departments</option>
              {(analysis?.departments || []).map((loc) => (
                <option key={loc.code} value={loc.code}>
                  {loc.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ConfigStatus loading={loading} error={error} />
      </section>

      {!loading && !analysis && !error && (
        <EmptyState title="No analysis yet" hint="Stock value and usage show after movements." />
      )}

      {analysis && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="On hand" value={money(analysis.on_hand_value)} hint={`${analysis.sku_count} stock SKUs`} />
            <Kpi label="Issue cost" value={money(analysis.cogs_90d)} hint={`${periodLabel}. Includes write-offs and transfers.`} />
            <Kpi label="Billed supplies" value={money(analysis.billed_supply_revenue)} hint="Invoiced supply and drug lines" />
            <Kpi label="Low stock" value={String(analysis.low_stock_count)} hint={`${analysis.stats?.low_stock_share ?? 0}% of SKUs`} />
            <Kpi label="Expiring lots" value={String(analysis.expiring_count)} hint={bucketHint(buckets)} />
            <Kpi label="Open requests" value={String(analysis.open_requisitions ?? 0)} hint={`${analysis.open_pos} open purchase orders`} />
            <Kpi label="Stock cover" value={cover == null ? "—" : `${cover} days`} hint="On hand ÷ average daily issues" />
            <Kpi label="Fill rate" value={fill == null ? "—" : `${fill}%`} hint="Fulfilled of requests in this period" />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <TrendChart weeks={analysis.usage_by_week || []} money={money} />
            <DonutChart
              title="Expiry mix"
              hint="Lot quantity already expired, due within 30 days, or due in 31–90 days."
              slices={[
                { label: "Expired", value: buckets?.expired || 0 },
                { label: "Within 30 days", value: buckets?.within_30 || 0 },
                { label: "31–90 days", value: buckets?.within_90 || 0 },
              ]}
            />
            <DonutChart
              title="Request mix"
              hint="Requisitions opened in this period, by current status."
              slices={[
                { label: "Submitted", value: analysis.requisition_counts?.submitted || 0 },
                { label: "Approved", value: analysis.requisition_counts?.approved || 0 },
                { label: "Fulfilled", value: analysis.requisition_counts?.fulfilled || 0 },
                { label: "Rejected", value: analysis.requisition_counts?.rejected || 0 },
              ]}
            />
            <DonutChart
              title="Movement mix"
              hint="Share of issued quantity by movement type."
              slices={Object.entries(analysis.usage_by_type || {}).map(([type, qty]) => ({
                label: TYPE_LABEL[type] || titleCase(type),
                value: qty,
              }))}
            />
            <ColumnChart
              title="Usage by department"
              hint="Quantity issued to each bay."
              rows={Object.entries(analysis.usage_by_department || {}).map(([code, qty]) => ({
                label: analysis.departments?.find((loc) => loc.code === code)?.name || code,
                value: qty,
              }))}
              format={(value) => String(value)}
            />
            <ColumnChart
              title="On-hand value by category"
              hint="Stock value still in the clinic, grouped by category."
              rows={Object.entries(analysis.value_by_category || {}).map(([name, value]) => ({
                label: titleCase(name),
                value,
              }))}
              format={money}
            />
            <CompareChart
              title="Top issued SKUs"
              money={money}
              rows={(analysis.top_skus || []).map((row) => ({
                label: row.sku || row.name,
                quantity: row.quantity,
                cost: row.cost,
              }))}
            />
          </div>

          <DetailTable
            title="Low stock"
            empty="No SKUs are at or below their reorder level."
            headers={["#", "SKU", "Name", "On hand", "Reorder"]}
            rows={analysis.low_stock.map((row) => [row.sku, row.name, String(row.quantity), String(row.reorder_level)])}
          />
          <DetailTable
            title="Expiring lots"
            empty="Nothing expires in the next 90 days."
            headers={["#", "SKU", "Lot", "Expires", "Qty", "Location"]}
            rows={analysis.expiring.map((row) => [
              row.sku,
              row.lot_code || "—",
              row.expiry_date || "—",
              String(row.quantity),
              row.location || "—",
            ])}
          />
          <DetailTable
            title="Slow movers"
            empty="Every on-hand SKU was issued in this period."
            headers={["#", "SKU", "Name", "On hand"]}
            rows={analysis.dead_stock.map((row) => [row.sku, row.name, String(row.quantity)])}
          />
          <DetailTable
            title="Top issued SKUs"
            empty="No stock was issued in this period."
            headers={["#", "SKU", "Name", "Qty", "Issue cost"]}
            rows={(analysis.top_skus || []).map((row) => [row.sku, row.name, String(row.quantity), money(row.cost)])}
          />
        </>
      )}
    </div>
  );
}

function bucketHint(buckets: WarehouseAnalysis["expiry_buckets"]) {
  if (!buckets) return "Lots inside 90 days";
  return `${buckets.expired} expired · ${buckets.within_30} in 30 days · ${buckets.within_90} in 31–90 days`;
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <article className="glass-panel p-3">
      <p className="text-sm text-muted">{label}</p>
      <p className="font-display text-xl font-bold text-brand-900">{value}</p>
      <p className="text-sm text-muted">{hint}</p>
    </article>
  );
}

function DetailTable({
  title,
  empty,
  headers,
  rows,
}: {
  title: string;
  empty: string;
  headers: string[];
  rows: string[][];
}) {
  return (
    <section className="glass-panel space-y-2 p-4">
      <h3 className="reg-section__title">{title}</h3>
      {!rows.length && <p className="text-sm text-muted">{empty}</p>}
      {rows.length > 0 && (
        <div className="admin-scroll">
          <table className="admin-table">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>
                {headers.map((header) => (
                  <th key={header} className={header === "#" ? "rec-num" : undefined}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${title}-${index}`}>
                  <td className="rec-num">{index + 1}</td>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className={cellIndex === 0 ? "font-mono text-xs" : undefined}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
