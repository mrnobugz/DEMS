import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const SERIES = [
  "var(--demsta-brand-500)",
  "var(--clinical-info)",
  "var(--clinical-warning)",
  "var(--clinical-danger)",
  "var(--clinical-success)",
  "var(--demsta-brand-300)",
];

export type Slice = { label: string; value: number };

const tooltipStyle = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  color: "var(--text-primary)",
};

function ChartLegend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {items.map((item) => (
        <li key={item.label} className="inline-flex items-center gap-2 text-sm">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: item.color }} aria-hidden />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export function TrendChart({
  weeks,
  money,
}: {
  weeks: { week_start: string; quantity: number; cost: number }[];
  money: (value: number) => string;
}) {
  const hasQty = weeks.some((week) => week.quantity > 0);
  const hasCost = weeks.some((week) => week.cost > 0);
  const data = weeks.map((week) => ({
    label: week.week_start.slice(5),
    quantity: week.quantity,
    cost: week.cost,
    week_start: week.week_start,
  }));

  return (
    <section className="glass-panel space-y-2 p-4 lg:col-span-2">
      <h3 className="reg-section__title">Issue trend</h3>
      <p className="text-sm text-muted">Weekly quantity and issue cost. Each line uses its own scale so both stay visible.</p>
      <ChartLegend
        items={[
          { color: "var(--demsta-brand-500)", label: "Quantity" },
          { color: "var(--clinical-warning)", label: "Issue cost" },
        ]}
      />
      {!hasQty && !hasCost && <p className="text-sm text-muted">No issues in this period.</p>}
      {(hasQty || hasCost) && (
        <div className="h-64 w-full" role="img" aria-label="Weekly issue quantity and cost">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" />
              <XAxis dataKey="label" stroke="var(--text-muted)" fontSize={12} />
              <YAxis yAxisId="qty" stroke="var(--demsta-brand-500)" fontSize={12} allowDecimals={false} />
              <YAxis yAxisId="cost" orientation="right" stroke="var(--clinical-warning)" fontSize={12} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value, name) => {
                  const amount = typeof value === "number" ? value : Number(value ?? 0);
                  return name === "cost" ? money(amount) : amount;
                }}
              />
              {hasQty && (
                <Line yAxisId="qty" type="monotone" dataKey="quantity" name="Quantity" stroke="var(--demsta-brand-500)" strokeWidth={2.5} dot />
              )}
              {hasCost && (
                <Line yAxisId="cost" type="monotone" dataKey="cost" name="Issue cost" stroke="var(--clinical-warning)" strokeWidth={2.5} dot />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

export function DonutChart({ title, hint, slices }: { title: string; hint: string; slices: Slice[] }) {
  const drawn = slices.filter((slice) => slice.value > 0);
  const total = drawn.reduce((sum, slice) => sum + slice.value, 0);
  return (
    <section className="glass-panel space-y-2 p-4">
      <h3 className="reg-section__title">{title}</h3>
      <p className="text-sm text-muted">{hint}</p>
      {!total && <p className="text-sm text-muted">Nothing to chart.</p>}
      {total > 0 && (
        <div className="flex flex-wrap items-center gap-4">
          <div className="h-40 w-40 shrink-0" role="img" aria-label={title}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={drawn} dataKey="value" nameKey="label" innerRadius={48} outerRadius={68} paddingAngle={2}>
                  {drawn.map((slice, index) => (
                    <Cell key={slice.label} fill={SERIES[index % SERIES.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="min-w-[10rem] flex-1 space-y-1">
            {drawn.map((slice, index) => (
              <li key={slice.label} className="flex items-center justify-between gap-2 text-sm">
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ background: SERIES[index % SERIES.length] }} aria-hidden />
                  {slice.label}
                </span>
                <span className="tabular-nums">
                  {slice.value} ({Math.round((slice.value / total) * 100)}%)
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function ColumnChart({
  title,
  hint,
  rows,
  format,
}: {
  title: string;
  hint: string;
  rows: Slice[];
  format: (value: number) => string;
}) {
  return (
    <section className="glass-panel space-y-2 p-4">
      <h3 className="reg-section__title">{title}</h3>
      <p className="text-sm text-muted">{hint}</p>
      {!rows.length && <p className="text-sm text-muted">Nothing in this period.</p>}
      {rows.length > 0 && (
        <div className="h-64 w-full" role="img" aria-label={title}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 16, right: 8, left: 0, bottom: 24 }}>
              <CartesianGrid stroke="var(--border)" />
              <XAxis dataKey="label" stroke="var(--text-muted)" fontSize={11} interval={0} angle={-20} textAnchor="end" />
              <YAxis stroke="var(--text-muted)" fontSize={12} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value) => format(typeof value === "number" ? value : Number(value ?? 0))} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {rows.map((row, index) => (
                  <Cell key={row.label} fill={SERIES[index % SERIES.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

export function CompareChart({
  title,
  rows,
  money,
}: {
  title: string;
  rows: { label: string; quantity: number; cost: number }[];
  money: (value: number) => string;
}) {
  return (
    <section className="glass-panel space-y-2 p-4 lg:col-span-2">
      <h3 className="reg-section__title">{title}</h3>
      <p className="text-sm text-muted">Each SKU shows quantity and issue cost on separate scales.</p>
      <ChartLegend
        items={[
          { color: "var(--demsta-brand-500)", label: "Quantity" },
          { color: "var(--clinical-warning)", label: "Issue cost" },
        ]}
      />
      {!rows.length && <p className="text-sm text-muted">No stock was issued in this period.</p>}
      {rows.length > 0 && (
        <div className="w-full" style={{ height: Math.max(180, rows.length * 48) }} role="img" aria-label={title}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" />
              <XAxis xAxisId="qty" type="number" stroke="var(--demsta-brand-500)" fontSize={11} />
              <XAxis xAxisId="cost" type="number" orientation="top" stroke="var(--clinical-warning)" fontSize={11} hide />
              <YAxis type="category" dataKey="label" width={110} stroke="var(--text-muted)" fontSize={12} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value, name) => {
                  const amount = typeof value === "number" ? value : Number(value ?? 0);
                  return name === "cost" ? money(amount) : amount;
                }}
              />
              <Legend />
              <Bar xAxisId="qty" dataKey="quantity" name="Quantity" fill="var(--demsta-brand-500)" radius={[0, 4, 4, 0]} />
              <Bar xAxisId="cost" dataKey="cost" name="Issue cost" fill="var(--clinical-warning)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
