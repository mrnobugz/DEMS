import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { EmptyState, PageHero, TextField } from "../components/ui";
import { catalog } from "../data/content";
import { useI18n } from "../i18n/LanguageProvider";
import { usePageTitle } from "../lib/usePageTitle";

export function DocsPage() {
  const { lang, m } = useI18n();
  const docs = catalog(lang).docs;
  const d = m.docs;
  usePageTitle(d.pageTitle);
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!normalized) return docs;
    return docs.filter((article) => {
      const haystack = [article.title, article.summary, ...article.sections.flatMap((section) => [section.heading, ...section.body])]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [docs, normalized]);

  return (
    <>
      <PageHero kicker={d.kicker} title={d.title} text={d.hero} />
      <div className="wrap py-16">
        <form role="search" className="max-w-xl" onSubmit={(event) => event.preventDefault()}>
          <TextField label={d.search} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={d.placeholder} />
        </form>
        {results.length === 0 ? (
          <div className="mt-8">
            <EmptyState title={d.emptyTitle} text={d.emptyText} />
          </div>
        ) : (
          <ul className="mt-8 grid gap-4 md:grid-cols-2">
            {results.map((article) => (
              <li key={article.slug}>
                <Link className="panel block h-full p-5 no-underline" to={`/docs/${article.slug}`}>
                  <h2 className="font-display text-2xl font-semibold text-ink">{article.title}</h2>
                  <p className="muted mt-2">{article.summary}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export function DocArticlePage() {
  const { slug } = useParams();
  const { lang, m } = useI18n();
  const docs = catalog(lang).docs;
  const article = docs.find((item) => item.slug === slug);
  const d = m.docs;
  usePageTitle(article?.title ?? d.pageTitle);

  if (!article) {
    return (
      <>
        <PageHero kicker={d.kicker} title={d.missingTitle} text={d.missingHero} />
        <div className="wrap py-16">
          <EmptyState
            title={d.missingEmpty}
            text={d.missingText}
            action={
              <Link className="btn btn-primary" to="/docs">
                {d.all}
              </Link>
            }
          />
        </div>
      </>
    );
  }

  const others = docs.filter((item) => item.slug !== article.slug).slice(0, 3);

  return (
    <>
      <PageHero kicker={d.kicker} title={article.title} text={article.summary} />
      <article className="wrap max-w-3xl py-16">
        {article.sections.map((section) => (
          <section key={section.heading} className="prose-block mb-8">
            <h2 className="font-display text-2xl font-bold">{section.heading}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph} className="muted mt-3">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
        <h2 className="font-display text-xl font-semibold">{d.more}</h2>
        <ul className="mt-3 space-y-2">
          {others.map((item) => (
            <li key={item.slug}>
              <Link className="font-semibold text-primary" to={`/docs/${item.slug}`}>
                {item.title}
              </Link>
            </li>
          ))}
        </ul>
      </article>
    </>
  );
}
