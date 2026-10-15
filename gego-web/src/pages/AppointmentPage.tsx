import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { FormBanner, PageHero, SelectField, TextAreaField, TextField } from "../components/ui";
import { useI18n } from "../i18n/LanguageProvider";
import { addBooking } from "../lib/portalStore";
import { usePageTitle } from "../lib/usePageTitle";

const topicIds = ["onboarding", "training", "migration", "golive", "billing"] as const;

export function AppointmentPage() {
  const { m } = useI18n();
  const a = m.appointment;
  usePageTitle(a.pageTitle);
  const [phase, setPhase] = useState<"idle" | "saving" | "saved">("idle");
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"ok" | "err">("ok");
  const [reference, setReference] = useState("");

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const date = String(data.get("date") ?? "");
    const today = new Date().toISOString().slice(0, 10);
    if (date < today) {
      setTone("err");
      setMessage(a.past);
      return;
    }
    const topic = String(data.get("topic") ?? "onboarding");
    const clinic = String(data.get("clinic") ?? "");
    setPhase("saving");
    setMessage("");
    window.setTimeout(() => {
      const id = addBooking({
        kind: "appointment",
        title: clinic,
        topic,
        when: `${date} ${String(data.get("time") ?? "")}`,
        detail: `${String(data.get("name"))} · ${String(data.get("email"))}. ${String(data.get("notes") ?? "")}`.trim(),
      });
      setReference(id);
      setTone("ok");
      setMessage(a.saved);
      setPhase("saved");
      form.reset();
    }, 400);
  }

  return (
    <>
      <PageHero kicker={a.kicker} title={a.title} text={a.hero} />
      <div className="wrap grid gap-10 py-16 lg:grid-cols-[1fr_0.8fr]">
        <form className="panel space-y-4 p-6" onSubmit={onSubmit}>
          <TextField label={a.name} name="name" required autoComplete="name" />
          <TextField label={a.email} name="email" type="email" required autoComplete="email" />
          <TextField label={a.clinic} name="clinic" required autoComplete="organization" />
          <SelectField label={a.topic} name="topic" required defaultValue="onboarding">
            {topicIds.map((id) => (
              <option key={id} value={id}>
                {m.topics[id]}
              </option>
            ))}
          </SelectField>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label={a.date} name="date" type="date" required />
            <TextField label={a.time} name="time" type="time" required />
          </div>
          <TextAreaField label={a.notes} name="notes" />
          <FormBanner message={message} tone={tone} />
          {reference ? (
            <p className="text-sm">
              {a.reference} {reference}
            </p>
          ) : null}
          <button className="btn btn-primary" type="submit" disabled={phase === "saving"}>
            {phase === "saving" ? a.saving : a.submit}
          </button>
        </form>
        <aside className="space-y-4">
          <div className="panel p-6">
            <h2 className="font-display text-2xl font-semibold">{a.insideTitle}</h2>
            <p className="muted mt-2">{a.inside}</p>
          </div>
          <div className="panel p-6">
            <h2 className="font-display text-2xl font-semibold">{a.tourTitle}</h2>
            <p className="muted mt-2">{a.tour}</p>
            <Link className="btn btn-ghost mt-4" to="/demo">
              {m.nav.demo}
            </Link>
          </div>
        </aside>
      </div>
    </>
  );
}
