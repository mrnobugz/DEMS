import { ServiceGrid } from "../components/ServiceGrid";
import { PageHero } from "../components/ui";
import { useI18n } from "../i18n/LanguageProvider";
import { usePageTitle } from "../lib/usePageTitle";

export function ServicesPage() {
  const { m } = useI18n();
  usePageTitle(m.services.pageTitle);

  return (
    <>
      <PageHero kicker={m.services.kicker} title={m.services.title} text={m.services.hero} />
      <div className="wrap py-16">
        <ServiceGrid linked={false} />
      </div>
    </>
  );
}
