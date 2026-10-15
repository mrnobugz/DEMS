import { FormEvent, useState } from "react";
import { FormBanner, TextAreaField, TextField } from "../../components/ui";
import { useI18n } from "../../i18n/LanguageProvider";
import { addTicket, usePortal } from "../../lib/portalStore";
import { usePageTitle } from "../../lib/usePageTitle";

export function SupportPage() {
  const { m } = useI18n();
  const p = m.portal;
  usePageTitle(p.support);
  const portal = usePortal();
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    setSaving(true);
    window.setTimeout(() => {
      addTicket(String(data.get("subject") ?? ""), String(data.get("body") ?? ""));
      setMessage(p.noteSaved);
      setSaving(false);
      form.reset();
    }, 300);
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="kicker">{p.support}</p>
        <h1 className="mt-2 font-display text-3xl font-bold">{p.supportTitle}</h1>
        <p className="muted mt-2">{p.supportLead}</p>
      </header>
      <form className="panel space-y-4 p-5" onSubmit={onSubmit}>
        <TextField label={p.subject} name="subject" required />
        <TextAreaField label={p.message} name="body" required />
        <FormBanner message={message} tone="ok" />
        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? p.saving : p.saveNote}
        </button>
      </form>
      <ul className="space-y-4">
        {portal.tickets.map((ticket) => {
          const subject = ticket.subjectKey ? m.tickets[ticket.subjectKey] : ticket.subject;
          const body = ticket.bodyKey ? m.tickets[ticket.bodyKey] : ticket.body;
          const reply = ticket.replyKey ? m.tickets[ticket.replyKey] : ticket.reply;
          return (
            <li key={ticket.id} className="panel p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-xl font-semibold">{subject}</h2>
                <span className="badge badge-open">{ticket.status === "answered" ? m.status.answered : m.status.open}</span>
              </div>
              <p className="muted mt-1 text-sm">{ticket.created}</p>
              <p className="mt-3">{body}</p>
              {reply ? (
                <p className="mt-3 border-l-4 border-primary bg-mist p-3 text-sm">
                  {p.desk}: {reply}
                </p>
              ) : (
                <p className="muted mt-3 text-sm">{p.waiting}</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
