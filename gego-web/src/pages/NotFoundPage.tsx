import { Link } from "react-router-dom";
import { MarketingLayout } from "../components/MarketingLayout";
import { useI18n } from "../i18n/LanguageProvider";
import { usePageTitle } from "../lib/usePageTitle";

export function NotFoundPage() {
  const { m } = useI18n();
  usePageTitle(m.notFound.pageTitle);
  return (
    <MarketingLayout>
      <div className="wrap py-20">
        <p className="kicker">404</p>
        <h1 className="mt-2 font-display text-4xl font-bold">{m.notFound.title}</h1>
        <p className="muted mt-3">{m.notFound.text}</p>
        <Link className="btn btn-primary mt-6" to="/">
          {m.nav.home}
        </Link>
      </div>
    </MarketingLayout>
  );
}
