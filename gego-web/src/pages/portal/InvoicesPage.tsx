import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { StatusBadge } from "../../components/StatusBadge";
import { EmptyState, FormBanner } from "../../components/ui";
import { useI18n } from "../../i18n/LanguageProvider";
import { formatDate, formatTsh } from "../../lib/money";
import { invoiceView, invoices, payInvoice, usePortal } from "../../lib/portalStore";
import { usePageTitle } from "../../lib/usePageTitle";

export function InvoicesPage() {
  const { lang, m } = useI18n();
  const p = m.portal;
  usePageTitle(p.invoices);
  const portal = usePortal();
  const rows = invoices.map((invoice) => invoiceView(invoice, portal.paidInvoiceIds));

  return (
    <div>
      <p className="kicker">{p.invoices}</p>
      <h1 className="mt-2 font-display text-3xl font-bold">{p.invoiceTitle}</h1>
      <p className="muted mt-2">{p.invoiceLead}</p>
      <ul className="mt-6 space-y-4">
        {rows.map((invoice) => (
          <li key={invoice.id} className="panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold">{invoice.number}</h2>
                <p className="muted text-sm">
                  {p.issued} {formatDate(invoice.issued, lang)} · {p.dueWord} {formatDate(invoice.due, lang)}
                </p>
              </div>
              <StatusBadge status={invoice.status} />
            </div>
            <p className="mt-3">
              {p.balanceWord} {formatTsh(invoice.balance)} {p.of} {formatTsh(invoice.total)}
            </p>
            <Link className="btn btn-ghost mt-4" to={`/portal/invoices/${invoice.id}`}>
              {p.view}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function InvoiceDetailPage() {
  const { invoiceId } = useParams();
  const { lang, m } = useI18n();
  const p = m.portal;
  const portal = usePortal();
  const source = invoices.find((invoice) => invoice.id === invoiceId);
  const view = source ? invoiceView(source, portal.paidInvoiceIds) : null;
  usePageTitle(view ? view.number : p.invoices);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");

  if (!view) {
    return (
      <EmptyState
        title={p.notFound}
        text={p.notFoundText}
        action={
          <Link className="btn btn-primary" to="/portal/invoices">
            {p.allInvoices}
          </Link>
        }
      />
    );
  }

  return (
    <article className="panel p-6">
      <Link className="text-sm font-semibold text-primary" to="/portal/invoices">
        {p.allInvoices}
      </Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">{view.number}</h1>
          <p className="muted mt-1">
            {p.issued} {formatDate(view.issued, lang)} · {p.dueWord} {formatDate(view.due, lang)}
          </p>
        </div>
        <StatusBadge status={view.status} />
      </div>
      <table className="mt-6 w-full text-sm">
        <caption className="sr-only">
          {p.linesCaption} {view.number}
        </caption>
        <thead>
          <tr className="border-b text-left">
            <th className="py-2 font-semibold">{p.description}</th>
            <th className="py-2 text-right font-semibold">{p.amount}</th>
          </tr>
        </thead>
        <tbody>
          {view.lines.map((line) => (
            <tr key={line.key} className="border-b">
              <td className="py-3">{m.lines[line.key]}</td>
              <td className="py-3 text-right">{formatTsh(line.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="mt-4 space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <dt>{p.total}</dt>
          <dd className="font-semibold">{formatTsh(view.total)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>{p.paidWord}</dt>
          <dd>{formatTsh(view.paid)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>{p.balanceWord}</dt>
          <dd className="font-semibold">{formatTsh(view.balance)}</dd>
        </div>
      </dl>
      <p className="muted mt-4 text-sm">{m.lines[view.noteKey]}</p>
      {view.status === "partial" ? <p className="mt-3 text-sm">{p.partialPast}</p> : null}
      <FormBanner message={message} tone="ok" />
      {view.balance > 0 && !confirming ? (
        <button className="btn btn-primary mt-4" type="button" onClick={() => setConfirming(true)}>
          {p.markPaid}
        </button>
      ) : null}
      {confirming ? (
        <div className="mt-4 border border-primary bg-mist p-4">
          <p>
            {p.confirmBody} {view.number}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => {
                payInvoice(view.id);
                setConfirming(false);
                setMessage(`${view.number} ${p.marked}`);
              }}
            >
              {p.confirm}
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setConfirming(false)}>
              {p.cancel}
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
