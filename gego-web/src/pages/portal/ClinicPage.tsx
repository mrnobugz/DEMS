import { FormEvent, useState } from "react";
import { FormBanner, TextField } from "../../components/ui";
import { useI18n } from "../../i18n/LanguageProvider";
import { saveClinic, usePortal, type ClinicProfile } from "../../lib/portalStore";
import { usePageTitle } from "../../lib/usePageTitle";

export function ClinicPage() {
  const { m } = useI18n();
  const p = m.portal;
  usePageTitle(p.clinic);
  const portal = usePortal();
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"ok" | "err">("ok");
  const [saving, setSaving] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const chairs = String(data.get("chairs") ?? "");
    if (!/^\d+$/.test(chairs) || Number(chairs) < 1) {
      setTone("err");
      setMessage(p.chairsError);
      return;
    }
    const clinic: ClinicProfile = {
      name: String(data.get("name") ?? ""),
      code: String(data.get("code") ?? "").toUpperCase(),
      city: String(data.get("city") ?? ""),
      chairs,
      phone: String(data.get("phone") ?? ""),
      adminEmail: String(data.get("adminEmail") ?? ""),
    };
    setSaving(true);
    window.setTimeout(() => {
      saveClinic(clinic);
      setTone("ok");
      setMessage(p.clinicSaved);
      setSaving(false);
    }, 300);
  }

  return (
    <div>
      <p className="kicker">{p.clinic}</p>
      <h1 className="mt-2 font-display text-3xl font-bold">{p.clinicTitle}</h1>
      <p className="muted mt-2">{p.clinicLead}</p>
      <form className="panel mt-6 grid gap-4 p-5 sm:grid-cols-2" onSubmit={onSubmit} key={portal.clinic.code + portal.clinic.name}>
        <TextField label={p.clinicName} name="name" required defaultValue={portal.clinic.name} autoComplete="organization" />
        <TextField label={p.code} name="code" required defaultValue={portal.clinic.code} hint={p.codeHint} />
        <TextField label={p.city} name="city" required defaultValue={portal.clinic.city} />
        <TextField label={p.chairs} name="chairs" type="number" min={1} required defaultValue={portal.clinic.chairs} />
        <TextField label={p.phone} name="phone" type="tel" autoComplete="tel" defaultValue={portal.clinic.phone} />
        <TextField label={p.adminEmail} name="adminEmail" type="email" required autoComplete="email" defaultValue={portal.clinic.adminEmail} />
        <div className="space-y-3 sm:col-span-2">
          <FormBanner message={message} tone={tone} />
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? p.saving : p.save}
          </button>
        </div>
      </form>
    </div>
  );
}
