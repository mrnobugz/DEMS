import { FormEvent, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FormBanner, PageHero, SelectField, TextAreaField, TextField } from "../components/ui";
import { catalog } from "../data/content";
import { useI18n } from "../i18n/LanguageProvider";
import { addBooking, usePortal } from "../lib/portalStore";
import { usePageTitle } from "../lib/usePageTitle";

const planIds = new Set(["chair", "clinic", "group", "enterprise", "unsure"]);

export function BookDemoPage() {
  const { lang, m } = useI18n();
  const d = m.demo;
  const plans = catalog(lang).plans;
  const enterprise = catalog(lang).enterprise;
  usePageTitle(d.pageTitle);
  const [params] = useSearchParams();
  const requested = params.get("plan") ?? "clinic";
  const initialPlan = planIds.has(requested) ? requested : "clinic";
  const portal = usePortal();
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
      setMessage(m.appointment.past);
      return;
    }
    const chairs = Number(data.get("chairs"));
    if (!Number.isFinite(chairs) || chairs < 1) {
      setTone("err");
      setMessage(d.chairsError);
      return;
    }
    const clinic = String(data.get("clinic") ?? "");
    const plan = String(data.get("plan") ?? "clinic");
    setPhase("saving");
    setMessage("");
    window.setTimeout(() => {
      const id = addBooking({
        kind: "demo",
        title: clinic,
        topic: plan,
        when: `${date} ${String(data.get("time") ?? "")}`,
        detail: `${String(data.get("city") ?? "")} · ${chairs}. ${String(data.get("notes") ?? "")}`.trim(),
      });
      setReference(id);
      setTone("ok");
      setMessage(d.saved);
      setPhase("saved");
      form.reset();
    }, 400);
  }

  return (
    <>
      <PageHero kicker={d.kicker} title={d.title} text={d.hero} />
      <div className="wrap max-w-3xl py-16">
        <form key={initialPlan} className="panel space-y-4 p-6" onSubmit={onSubmit}>
          <TextField label={m.appointment.name} name="name" required autoComplete="name" />
          <TextField label={m.appointment.email} name="email" type="email" required autoComplete="email" />
          <TextField label={m.appointment.clinic} name="clinic" required autoComplete="organization" />
          <TextField label={d.city} name="city" required />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label={d.chairs} name="chairs" type="number" min={1} required defaultValue={4} />
            <SelectField label={d.plan} name="plan" defaultValue={initialPlan} required>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
              <option value="enterprise">{enterprise.name}</option>
              <option value="unsure">{d.unsure}</option>
            </SelectField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label={m.appointment.date} name="date" type="date" required />
            <TextField label={m.appointment.time} name="time" type="time" required />
          </div>
          <TextAreaField label={d.notes} name="notes" />
          {portal.claimedPromos.length > 0 ? (
            <p className="text-sm">
              {d.promos} {portal.claimedPromos.join(", ")}. {d.promoHint}
            </p>
          ) : null}
          <FormBanner message={message} tone={tone} />
          {reference ? (
            <p className="text-sm">
              {m.appointment.reference} {reference}
            </p>
          ) : null}
          <button className="btn btn-primary" type="submit" disabled={phase === "saving"}>
            {phase === "saving" ? m.appointment.saving : d.submit}
          </button>
        </form>
      </div>
    </>
  );
}
