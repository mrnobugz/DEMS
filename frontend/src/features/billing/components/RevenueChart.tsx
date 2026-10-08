import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MonthRevenue } from "@/features/billing/types";

export function RevenueChart({ rows, money }: { rows: MonthRevenue[]; money: (amount: number) => string }) {
  const data = rows.map((row) => ({ ...row, label: row.month.slice(5) }));
  return (
    <section className="glass-panel min-w-0">
      <h3 className="font-display text-lg font-bold text-brand-900">Revenue by month</h3>
      <p className="mb-3 text-sm text-muted">Issued invoice totals, excluding void and refunded.</p>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid stroke="var(--border-soft)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "var(--ink-3)", fontSize: 12 }} />
            <YAxis tick={{ fill: "var(--ink-3)", fontSize: 12 }} width={72} />
            <Tooltip
              formatter={(value) => money(Number(value))}
              contentStyle={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
            />
            <Bar dataKey="amount" fill="var(--demsta-brand-500)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
