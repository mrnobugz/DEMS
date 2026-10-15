import { FormEvent, useState } from "react";
import { FormBanner, PageHero, TextAreaField, TextField } from "../components/ui";
import { catalog, contactEmail, organization } from "../data/content";
import { useI18n } from "../i18n/LanguageProvider";
import { addBooking } from "../lib/portalStore";
import { usePageTitle } from "../lib/usePageTitle";

export function ContactPage() {
  const { lang, m } = useI18n();
  const c = m.contact;
  const hours = catalog(lang).hours;
  usePageTitle(c.pageTitle);
  const [phase, setPhase] = useState<"idle" | "saving" | "saved">("idle");
  const [message, setMessage] = useState("");

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    setPhase("saving");
    window.setTimeout(() => {
      addBooking({
        kind: "message",
        title: String(data.get("clinic") || data.get("name")),
        when: new Date().toISOString().slice(0, 10),
        detail: String(data.get("message") ?? ""),
      });
      setMessage(c.saved);
      setPhase("saved");
      form.reset();
    }, 300);
  }

  return (
    <>
      <PageHero kicker={c.kicker} title={c.title} text={c.hero} />
      <div className="wrap grid gap-8 py-16 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="panel p-6">
            <h2 className="font-display text-2xl font-semibold">{c.address}</h2>
            <address className="mt-3 text-lg not-italic">
              {organization.area}
              <br />
              {organization.city}
              <br />
              {organization.country}
            </address>
          </div>
          <div className="panel p-6">
            <h2 className="font-display text-2xl font-semibold">{c.desk}</h2>
            <ul className="mt-4 space-y-2">
              {hours.map((row) => (
                <li key={row.day}>
                  <span className="font-semibold">{row.day}: </span>
                  {row.hours}
                </li>
              ))}
            </ul>
            <p className="mt-4">
              <a className="font-semibold text-primary" href={`mailto:${contactEmail}`}>
                {contactEmail}
              </a>
            </p>
          </div>
        </div>
        <form className="panel space-y-4 p-6" onSubmit={onSubmit}>
          <h2 className="font-display text-2xl font-semibold">{c.send}</h2>
          <TextField label={m.appointment.name} name="name" required autoComplete="name" />
          <TextField label={c.email} name="email" type="email" required autoComplete="email" />
          <TextField label={c.clinic} name="clinic" autoComplete="organization" />
          <TextAreaField label={c.message} name="message" required />
          <FormBanner message={message} tone="ok" />
          <button className="btn btn-primary" type="submit" disabled={phase === "saving"}>
            {phase === "saving" ? m.appointment.saving : c.submit}
          </button>
        </form>
      </div>
    </>
  );
}
