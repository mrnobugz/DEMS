import { Link } from "react-router-dom";
import { formatWhen } from "@/features/billing/lib/dates";
import { StatusBadge } from "@/features/billing/components/StatusBadge";
import { invoiceBalance, methodLabel, type BillingInvoice } from "@/features/billing/types";

export function InvoiceFacts({ invoice, money }: { invoice: BillingInvoice; money: (amount: number) => string }) {
  const balance = invoiceBalance(invoice);
  const rows = [
    ["Subtotal", invoice.subtotal],
    ["Tax", invoice.tax],
    ["Discount", invoice.discount],
    ["Total", invoice.total],
    ["Paid", invoice.amount_paid],
    ["Adjustments", invoice.amount_adjusted || 0],
    ["Balance", balance],
  ] as const;
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-mono text-sm">{invoice.invoice_number}</p>
          <p className="text-muted">Issued {formatWhen(invoice.issued_at)} · Due {formatWhen(invoice.due_at)}</p>
        </div>
        <StatusBadge status={invoice.status} overdue={invoice.is_overdue} />
      </div>
      <p>
        <Link className="font-semibold text-brand-800 underline-offset-2 hover:underline" to={`/patients/${invoice.patient_id}`}>
          {invoice.patient_name || "Patient"}
        </Link>
        {invoice.patient_code ? <span className="text-muted"> · {invoice.patient_code}</span> : null}
      </p>
      <table className="w-full">
        <caption className="sr-only">Invoice lines</caption>
        <thead className="text-left text-xs uppercase text-muted">
          <tr>
            <th className="py-2">Item</th>
            <th className="py-2">Kind</th>
            <th className="py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.line_items.map((line) => (
            <tr key={line.id} className="border-t border-border">
              <td className="py-2">
                {line.description}
                {line.tooth_number ? <span className="text-muted"> · tooth {line.tooth_number}</span> : null}
              </td>
              <td className="py-2 capitalize">{(line.line_kind || "procedure").replaceAll("_", " ")}</td>
              <td className="py-2 text-right tabular-nums">{money(line.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="space-y-1">
        {rows.map(([label, amount]) => (
          <div key={label} className="flex justify-between gap-3">
            <dt className={label === "Balance" || label === "Total" ? "font-semibold" : "text-muted"}>{label}</dt>
            <dd className="tabular-nums font-semibold">{money(amount)}</dd>
          </div>
        ))}
      </dl>
      <section>
        <h3 className="font-display font-bold text-brand-900">Payments</h3>
        {invoice.payments.length === 0 ? (
          <p className="text-muted">No payments yet.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {invoice.payments.map((payment) => (
              <li key={payment.id} className="flex justify-between gap-3">
                <span>
                  {methodLabel(payment.method)} · {formatWhen(payment.paid_at, "d MMM HH:mm")}
                  {payment.reference ? <span className="text-muted"> · {payment.reference}</span> : null}
                </span>
                <span className="tabular-nums">{money(payment.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {invoice.claims && invoice.claims.length > 0 && (
        <section>
          <h3 className="font-display font-bold text-brand-900">Insurance claim</h3>
          <ul className="mt-1 space-y-1">
            {invoice.claims.map((claim) => (
              <li key={claim.id}>
                {claim.claim_number} · <span className="capitalize">{claim.status.replaceAll("_", " ")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {invoice.notes && <p className="text-muted">{invoice.notes}</p>}
    </div>
  );
}
