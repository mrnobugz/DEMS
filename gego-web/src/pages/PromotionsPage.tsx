import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { FormBanner, PageHero, TextField } from "../components/ui";
import { catalog } from "../data/content";
import { useI18n } from "../i18n/LanguageProvider";
import { claimPromo, usePortal } from "../lib/portalStore";
import { usePageTitle } from "../lib/usePageTitle";

export function PromotionsPage() {
  const { lang, m } = useI18n();
  const p = m.promos;
  const portal = usePortal();
  usePageTitle(p.pageTitle);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"ok" | "err">("ok");
  const [saving, setSaving] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const code = String(new FormData(form).get("code") ?? "");
    setSaving(true);
    window.setTimeout(() => {
      const result = claimPromo(code);
      setTone(result.ok ? "ok" : "err");
      setMessage(result.reason === "bad" ? p.bad : result.reason === "duplicate" ? p.duplicate : `${result.code} ${p.ok}`);
      setSaving(false);
      if (result.ok) form.reset();
    }, 300);
  }

  return (
    <>
      <PageHero kicker={p.kicker} title={p.title} text={p.hero} />
      <div className="wrap grid gap-8 py-16 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="grid gap-4">
          {catalog(lang).promotions.map((promo) => (
            <article key={promo.code} className="panel p-6">
              <p className="kicker">{promo.code}</p>
              <h2 className="mt-2 font-display text-2xl font-semibold">{promo.title}</h2>
              <p className="mt-2">{promo.detail}</p>
              <p className="muted mt-3 text-sm">
                {p.available}: {promo.until}
              </p>
            </article>
          ))}
        </div>
        <form className="panel h-fit space-y-4 p-6" onSubmit={onSubmit}>
          <h2 className="font-display text-2xl font-semibold">{p.saveTitle}</h2>
          <TextField label={p.code} name="code" required autoComplete="off" placeholder="LAUNCH" />
          <FormBanner message={message} tone={tone} />
          {portal.claimedPromos.length > 0 ? (
            <p className="text-sm" role="status">
              {p.savedHere} {portal.claimedPromos.join(", ")}
            </p>
          ) : null}
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? p.saving : p.save}
          </button>
          <p className="text-sm">
            <Link className="font-semibold text-primary" to="/demo">
              {p.quote}
            </Link>
          </p>
        </form>
      </div>
    </>
  );
}
