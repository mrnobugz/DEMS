import { Link } from "react-router-dom";
import { PageHero } from "../components/ui";
import { catalog } from "../data/content";
import { useI18n } from "../i18n/LanguageProvider";
import { formatTsh } from "../lib/money";
import { usePageTitle } from "../lib/usePageTitle";

export function PlansPage() {
  const { lang, m } = useI18n();
  const content = catalog(lang);
  const p = m.plans;
  usePageTitle(p.pageTitle);

  return (
    <>
      <PageHero kicker={p.kicker} title={p.title} text={p.hero} />
      <div className="wrap py-16">
        <div className="grid gap-6 lg:grid-cols-3">
          {content.plans.map((plan) => (
            <article key={plan.id} className={`panel flex flex-col p-6 ${plan.featured ? "border-2 border-primary" : ""}`}>
              <p className="kicker">{plan.featured ? m.home.mostClinics : m.home.planLabel}</p>
              <h2 className="mt-2 font-display text-3xl font-bold">{plan.name}</h2>
              <p className="mt-3 font-display text-4xl font-bold">{formatTsh(plan.price)}</p>
              <p className="muted text-sm">{plan.period}</p>
              <p className="mt-4">{plan.blurb}</p>
              <ul className="mt-4 flex-1 space-y-2 text-sm">
                {plan.includes.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <Link className="btn btn-primary mt-6" to={`/demo?plan=${plan.id}`}>
                {p.book} {plan.name}
              </Link>
            </article>
          ))}
        </div>
        <aside className="panel mt-8 p-6 md:flex md:items-center md:justify-between md:gap-6">
          <div>
            <h2 className="font-display text-2xl font-semibold">{content.enterprise.name}</h2>
            <p className="muted mt-2">{content.enterprise.blurb}</p>
          </div>
          <Link className="btn btn-ghost mt-4 md:mt-0" to="/demo?plan=enterprise">
            {p.enterpriseCta}
          </Link>
        </aside>
        <p className="muted mt-6 text-sm">{p.note}</p>
      </div>
    </>
  );
}
