import type { BillingSummary } from "@/features/billing/types";

function changeLabel(current: number, previous: number) {
  if (previous === 0) {
    return current === 0 ? "Same as the previous period" : "No revenue in the previous period";
  }
  const pct = ((current - previous) / previous) * 100;
  const rounded = Math.round(pct);
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}% vs previous period`;
}

export function StatCards({ summary, money }: { summary: BillingSummary; money: (amount: number) => string }) {
  const cards = [
    {
      label: "Revenue",
      value: money(summary.revenue_this_month),
      hint: changeLabel(summary.revenue_this_month, summary.revenue_last_month),
    },
    {
      label: "Outstanding",
      value: money(summary.outstanding_amount),
      hint: `${summary.outstanding_count} open invoice${summary.outstanding_count === 1 ? "" : "s"}`,
    },
    {
      label: "Overdue",
      value: money(summary.overdue_amount),
      hint: `${summary.overdue_count} past the due date`,
    },
    {
      label: "Paid",
      value: money(summary.paid_this_month),
      hint: "Collected in this period",
    },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <section key={card.label} className="glass-panel">
          <p className="text-sm text-muted">{card.label}</p>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums text-brand-900">{card.value}</p>
          <p className="mt-1 text-sm text-muted">{card.hint}</p>
        </section>
      ))}
    </div>
  );
}
