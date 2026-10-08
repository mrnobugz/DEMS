import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { EmptyState } from "@/components/ui/empty-state";
import { methodLabel, type MethodTotal } from "@/features/billing/types";

const COLORS = ["var(--demsta-brand-500)", "var(--clinical-info)", "var(--clinical-success)", "var(--clinical-warning)", "var(--clinical-danger)", "var(--demsta-brand-300)"];

export function MethodDonut({ rows, money }: { rows: MethodTotal[]; money: (amount: number) => string }) {
  const data = rows.filter((row) => row.amount > 0).map((row) => ({ ...row, name: methodLabel(row.method) }));
  return (
    <section className="glass-panel min-w-0">
      <h3 className="font-display text-lg font-bold text-brand-900">Payment methods</h3>
      <p className="mb-3 text-sm text-muted">Collections in the selected period.</p>
      {data.length === 0 ? (
        <EmptyState title="No payments in this period" hint="Recorded payments will split by method here." />
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="amount" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={2}>
                {data.map((row, index) => (
                  <Cell key={row.method} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => money(Number(value))}
                contentStyle={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
      {data.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">
          {data.map((row, index) => (
            <li key={row.method} className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-sm" style={{ background: COLORS[index % COLORS.length] }} aria-hidden />
                {row.name}
              </span>
              <span className="tabular-nums">{money(row.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
