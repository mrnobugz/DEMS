import { Link } from "react-router-dom";
import { PageHero } from "../components/ui";
import { organization } from "../data/content";
import { useI18n } from "../i18n/LanguageProvider";
import { usePageTitle } from "../lib/usePageTitle";

export function AboutPage() {
  const { m } = useI18n();
  const a = m.about;
  usePageTitle(a.pageTitle);

  return (
    <>
      <PageHero kicker={a.kicker} title={a.title} text={a.hero} />
      <article className="wrap grid gap-10 py-16 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="prose-block space-y-8">
          <section>
            <h2 className="font-display text-3xl font-bold">{a.fromTitle}</h2>
            <p className="muted mt-3">{a.from1}</p>
            <p className="muted">{a.from2}</p>
          </section>
          <section>
            <h2 className="font-display text-3xl font-bold">{a.whoTitle}</h2>
            <p className="muted mt-3">{a.who}</p>
          </section>
          <section>
            <h2 className="font-display text-3xl font-bold">{a.getsTitle}</h2>
            <ul className="mt-3 space-y-2">
              {a.gets.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="font-display text-3xl font-bold">{a.adviceTitle}</h2>
            <p className="muted mt-3">{a.advice}</p>
          </section>
          <div className="flex flex-wrap gap-3">
            <Link className="btn btn-primary" to="/services">
              {a.seeServices}
            </Link>
            <Link className="btn btn-ghost" to="/docs/getting-started">
              {a.readStart}
            </Link>
          </div>
        </div>
        <aside className="space-y-4">
          <img src="/img/about.jpg" alt={a.photoAlt} className="w-full object-cover" />
          <div className="panel p-5">
            <h2 className="font-display text-xl font-semibold">{a.placeTitle}</h2>
            <p className="mt-2 font-semibold">
              {organization.area}
              <br />
              {organization.city}, {organization.country}
            </p>
            <p className="muted mt-2 text-sm">{a.place}</p>
          </div>
          <div className="panel p-5">
            <h2 className="font-display text-xl font-semibold">{a.referenceTitle}</h2>
            <p className="muted mt-2 text-sm">{a.reference}</p>
            <Link className="btn btn-ghost mt-4" to="/portal/login">
              {a.openPortal}
            </Link>
          </div>
        </aside>
      </article>
    </>
  );
}
