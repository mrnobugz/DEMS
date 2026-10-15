import { Link } from "react-router-dom";
import { EmptyState } from "../../components/ui";
import { catalog } from "../../data/content";
import { presentNotice } from "../../i18n/presentNotice";
import { useI18n } from "../../i18n/LanguageProvider";
import type { Lang, Messages } from "../../i18n/messages";
import { formatDate, formatTsh } from "../../lib/money";
import { invoiceView, invoices, noticesFor, openBalance, usePortal } from "../../lib/portalStore";
import { usePageTitle } from "../../lib/usePageTitle";

export function DashboardPage() {
  const { lang, m } = useI18n();
  const p = m.portal;
  usePageTitle(p.dashboard);
  const portal = usePortal();
  const notices = noticesFor(portal);
  const unread = notices.filter((notice) => !notice.read).length;
  const openTickets = portal.tickets.filter((ticket) => ticket.status === "open").length;
  const balance = openBalance(portal.paidInvoiceIds);
  const nextInvoice = invoices.map((invoice) => invoiceView(invoice, portal.paidInvoiceIds)).find((invoice) => invoice.balance > 0);

  return (
    <div className="space-y-6">
      <header>
        <p className="kicker">{p.dashboard}</p>
        <h1 className="mt-2 font-display text-3xl font-bold">{portal.clinic.name}</h1>
        <p className="muted mt-2">{p.sample}</p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={p.openBalance} value={formatTsh(balance)} />
        <Stat label={p.chairs} value={portal.clinic.chairs || "—"} />
        <Stat label={p.unread} value={String(unread)} />
        <Stat label={p.openNotes} value={String(openTickets)} />
      </div>
      <section className="panel p-5">
        <h2 className="font-display text-xl font-semibold">{p.next}</h2>
        {nextInvoice ? (
          <p className="mt-2">
            {nextInvoice.number} · {formatTsh(nextInvoice.balance)} {p.balance} · {p.due} {formatDate(nextInvoice.due, lang)}
          </p>
        ) : (
          <p className="mt-2">{p.allPaid}</p>
        )}
        <Link className="btn btn-ghost mt-4" to="/portal/invoices">
          {p.viewInvoices}
        </Link>
      </section>
      <section className="panel p-5">
        <h2 className="font-display text-xl font-semibold">{p.requests}</h2>
        {portal.bookings.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title={p.noRequests}
              text={p.noRequestsText}
              action={
                <Link className="btn btn-primary" to="/demo">
                  {m.nav.demo}
                </Link>
              }
            />
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {portal.bookings.map((booking) => (
              <li key={booking.id} className="border border-sky-100 p-3">
                <p className="font-semibold">
                  {m.bookingKind[booking.kind]}: {booking.title}
                </p>
                <p className="text-sm">
                  {booking.topic ? `${topicLabel(booking.topic, lang, m)} · ` : null}
                  {booking.when}
                </p>
                <p className="muted text-sm">{booking.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="panel p-5">
        <h2 className="font-display text-xl font-semibold">{p.latest}</h2>
        <ul className="mt-4 space-y-3">
          {notices.slice(0, 3).map((notice) => {
            const text = presentNotice(notice, m, lang);
            return (
              <li key={notice.id}>
                <Link className="font-semibold text-primary" to={notice.href}>
                  {text.title}
                </Link>
                <p className="text-sm">
                  {notice.read ? m.status.read : m.status.unread} · {text.body}
                </p>
              </li>
            );
          })}
        </ul>
        <Link className="btn btn-ghost mt-4" to="/portal/notifications">
          {p.allNotes}
        </Link>
      </section>
    </div>
  );
}

function topicLabel(topic: string, lang: Lang, messages: Messages) {
  if (topic in messages.topics) return messages.topics[topic as keyof Messages["topics"]];
  const content = catalog(lang);
  const plan = content.plans.find((item) => item.id === topic);
  if (plan) return plan.name;
  if (topic === "enterprise") return content.enterprise.name;
  if (topic === "unsure") return messages.demo.unsure;
  return topic;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <article className="panel p-4">
      <h2 className="text-sm font-semibold">{label}</h2>
      <p className="mt-2 font-display text-2xl font-bold">{value}</p>
    </article>
  );
}
