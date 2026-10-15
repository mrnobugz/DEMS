import { FormEvent, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Logo } from "../../components/Logo";
import { FormBanner, TextField } from "../../components/ui";
import { LanguageSwitch, useI18n } from "../../i18n/LanguageProvider";
import { DEMO_EMAIL, DEMO_PASSWORD, signIn, usePortal } from "../../lib/portalStore";
import { usePageTitle } from "../../lib/usePageTitle";

export function PortalLoginPage() {
  const { m } = useI18n();
  const l = m.login;
  usePageTitle(l.pageTitle);
  const portal = usePortal();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  if (portal.session) return <Navigate to="/portal" replace />;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    setSaving(true);
    setError("");
    window.setTimeout(() => {
      const result = signIn(String(data.get("email") ?? ""), String(data.get("password") ?? ""));
      setSaving(false);
      if (result) setError(l.invalid);
    }, 250);
  }

  return (
    <div className="min-h-screen bg-mist">
      <div className="wrap flex max-w-lg flex-col py-12">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <Link to="/" aria-label={m.homeAria}>
            <Logo />
          </Link>
          <LanguageSwitch />
        </div>
        <form className="panel space-y-4 p-6" onSubmit={onSubmit}>
          <h1 className="font-display text-3xl font-bold">{l.title}</h1>
          <p className="muted text-sm">{l.lead}</p>
          <TextField label={l.email} name="email" type="email" autoComplete="username" required defaultValue={DEMO_EMAIL} />
          <TextField label={l.password} name="password" type="password" autoComplete="current-password" required />
          <FormBanner message={error} tone="err" />
          <button className="btn btn-primary w-full" type="submit" disabled={saving}>
            {saving ? l.saving : l.submit}
          </button>
          <p className="text-sm">
            {l.demoPassword}: <span className="font-semibold">{DEMO_PASSWORD}</span>
          </p>
        </form>
      </div>
    </div>
  );
}
