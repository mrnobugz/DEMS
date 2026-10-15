import { Link } from "react-router-dom";
import { ServiceGrid } from "../components/ServiceGrid";
import { SectionHeading } from "../components/ui";
import { catalog } from "../data/content";
import { useI18n } from "../i18n/LanguageProvider";
import { formatTsh } from "../lib/money";
import { usePageTitle } from "../lib/usePageTitle";

export function HomePage() {
  const { lang, m } = useI18n();
  const content = catalog(lang);
  usePageTitle(m.home.pageTitle);
  const h = m.home;

  return (
    <>
      <section
        className="relative grid min-h-[78vh] place-items-center bg-ink text-white"
        style={{
          backgroundImage: "linear-gradient(rgba(9,30,62,0.78), rgba(9,30,62,0.72)), url(/img/carousel-1.jpg)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="wrap py-20 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-100">{h.eyebrow}</p>
          <h1 className="mx-auto mt-4 max-w-4xl font-display text-4xl font-bold md:text-6xl">{h.title}</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-sky-50">{h.lead}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link className="btn btn-accent" to="/demo">
              {m.nav.demo}
            </Link>
            <Link className="btn btn-ghost-light" to="/appointment">
              {m.nav.appointment}
            </Link>
          </div>
        </div>
      </section>

      <section className="wrap relative z-10 -mt-12 grid gap-px bg-white/40 md:grid-cols-3" aria-label={h.supportTitle}>
        <div className="bg-primary p-8 text-white">
          <h2 className="font-display text-2xl font-semibold">{h.supportTitle}</h2>
          <p className="mt-3 text-sm leading-relaxed">{h.supportBody}</p>
          <Link className="btn btn-light mt-6" to="/contact">
            {h.contact}
          </Link>
        </div>
        <div className="bg-ink p-8 text-white">
          <h2 className="font-display text-2xl font-semibold">{h.seeTitle}</h2>
          <p className="mt-3 text-sm leading-relaxed">{h.seeBody}</p>
          <Link className="btn btn-accent mt-6" to="/demo">
            {m.nav.demo}
          </Link>
        </div>
        <div className="bg-coral p-8 text-ink">
          <h2 className="font-display text-2xl font-semibold">{h.portalTitle}</h2>
          <p className="mt-3 text-sm leading-relaxed">{h.portalBody}</p>
          <Link className="btn btn-light mt-6" to="/portal/login">
            {h.signIn}
          </Link>
        </div>
      </section>

      <section className="wrap py-16">
        <SectionHeading kicker={h.servicesKicker} title={h.servicesTitle} text={h.servicesText} />
        <ServiceGrid limit={4} />
        <Link className="btn btn-primary mt-8" to="/services">
          {h.allServices}
        </Link>
      </section>

      <section className="bg-mist py-16">
        <div className="wrap grid items-center gap-10 lg:grid-cols-2">
          <div>
            <SectionHeading kicker={h.aboutKicker} title={h.aboutTitle} text={h.aboutText} />
            <ul className="mt-6 space-y-3 text-sm">
              {h.aboutPoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <Link className="btn btn-primary mt-6" to="/about">
              {h.aboutLink}
            </Link>
          </div>
          <img src="/img/about.jpg" alt={m.about.photoAlt} className="h-full max-h-[460px] w-full object-cover" />
        </div>
      </section>

      <section className="wrap py-16">
        <SectionHeading kicker={h.plansKicker} title={h.plansTitle} text={h.plansText} />
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          {content.plans.map((plan) => (
            <article key={plan.id} className={`panel p-6 ${plan.featured ? "border-2 border-primary" : ""}`}>
              <p className="kicker">{plan.featured ? h.mostClinics : h.planLabel}</p>
              <h3 className="mt-2 font-display text-2xl font-semibold">{plan.name}</h3>
              <p className="mt-3 font-display text-3xl font-bold">{formatTsh(plan.price)}</p>
              <p className="muted text-sm">{plan.period}</p>
              <p className="mt-3 text-sm">{plan.blurb}</p>
              <Link className="btn btn-primary mt-6" to={`/demo?plan=${plan.id}`}>
                {h.bookPlan}
              </Link>
            </article>
          ))}
        </div>
        <Link className="mt-6 inline-flex min-h-11 items-center font-semibold text-primary" to="/plans">
          {h.compare}
        </Link>
      </section>

      <section className="bg-ink py-16 text-white">
        <div className="wrap">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-100">{h.promoKicker}</p>
          <h2 className="mt-2 font-display text-3xl font-bold">{h.promoTitle}</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {content.promotions.map((promo) => (
              <article key={promo.code} className="border border-white/30 p-5">
                <p className="font-display text-sm font-semibold tracking-wider">{promo.code}</p>
                <h3 className="mt-2 font-display text-xl font-semibold">{promo.title}</h3>
                <p className="mt-2 text-sm text-sky-50">{promo.detail}</p>
              </article>
            ))}
          </div>
          <Link className="btn btn-accent mt-8" to="/promotions">
            {h.usePromo}
          </Link>
        </div>
      </section>

      <section className="wrap py-16">
        <SectionHeading kicker={h.docsKicker} title={h.docsTitle} text={h.docsText} />
        <ul className="mt-8 grid gap-4 md:grid-cols-2">
          {content.docs.slice(0, 4).map((article) => (
            <li key={article.slug}>
              <Link className="panel block p-5 no-underline" to={`/docs/${article.slug}`}>
                <h3 className="font-display text-xl font-semibold text-ink">{article.title}</h3>
                <p className="muted mt-2 text-sm">{article.summary}</p>
              </Link>
            </li>
          ))}
        </ul>
        <Link className="btn btn-ghost mt-8" to="/docs">
          {h.allDocs}
        </Link>
      </section>
    </>
  );
}
