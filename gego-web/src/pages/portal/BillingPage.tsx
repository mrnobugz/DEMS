import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { StatusBadge } from "../../components/StatusBadge";
import { FormBanner, TextField } from "../../components/ui";
import { useI18n } from "../../i18n/LanguageProvider";
import { formatTsh } from "../../lib/money";
import { planPrices } from "../../data/content";
import { invoiceView, invoices, saveCard, usePortal } from "../../lib/portalStore";
import { usePageTitle } from "../../lib/usePageTitle";

export function BillingPage() {
  const { m } = useI18n();
  const p = m.portal;
  usePageTitle(p.billing);
  const portal = usePortal();
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"ok" | "err">("ok");
  const [saving, setSaving] = useState(false);
  const rows = invoices.map((invoice) => invoiceView(invoice, portal.paidInvoiceIds));

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const last4 = String(new FormData(form).get("last4") ?? "");
    if (!/^\d{4}$/.test(last4)) {
      setTone("err");
      setMessage(p.cardBad);
      return;
    }
    setSaving(true);
    window.setTimeout(() => {
      saveCard(last4);
      setTone("ok");
      setMessage(p.cardOk);
      setSaving(false);
    }, 300);
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="kicker">{p.billing}</p>
        <h1 className="mt-2 font-display text-3xl font-bold">{p.billingTitle}</h1>
        <p className="muted mt-2">{p.billingLead}</p>
      </header>
      <section className="panel p-5">
        <h2 className="font-display text-xl font-semibold">{p.currentPlan}</h2>
        <p className="mt-2">
          {p.planLine} · {formatTsh(planPrices.clinic)} {p.perMonth}
        </p>
        <p className="muted mt-2 text-sm">{p.nextOpen}</p>
        <Link className="btn btn-ghost mt-4" to="/plans">
          {p.compare}
        </Link>
      </section>
      <section className="panel p-5">
        <h2 className="font-display text-xl font-semibold">{p.card}</h2>
        <p className="mt-2">
          {p.ending} {portal.cardLast4}
        </p>
        <form className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={onSubmit}>
          <TextField
            label={p.last4}
            name="last4"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            pattern="\d{4}"
            required
            hint={p.last4Hint}
          />
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? p.saving : p.updateCard}
          </button>
        </form>
        <div className="mt-4">
          <FormBanner message={message} tone={tone} />
        </div>
      </section>
      <section className="panel p-5">
        <h2 className="font-display text-xl font-semibold">{p.history}</h2>
        <ul className="mt-4 space-y-3">
          {rows.map((invoice) => (
            <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-100 py-3">
              <div>
                <Link className="font-semibold text-primary" to={`/portal/invoices/${invoice.id}`}>
                  {invoice.number}
                </Link>
                <p className="text-sm">
                  {p.paidLabel} {formatTsh(invoice.paid)}
                </p>
              </div>
              <StatusBadge status={invoice.status} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
