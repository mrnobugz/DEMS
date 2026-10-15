import { Link } from "react-router-dom";
import { catalog, contactEmail, organization } from "../data/content";
import { useI18n } from "../i18n/LanguageProvider";
import { Logo } from "./Logo";

export function SiteFooter() {
  const { lang, m } = useI18n();
  const hours = catalog(lang).hours;
  const product = [
    { to: "/services", label: m.nav.services },
    { to: "/plans", label: m.nav.plans },
    { to: "/promotions", label: m.nav.promotions },
    { to: "/docs", label: m.nav.docs },
    { to: "/about", label: m.nav.aboutGego },
  ];
  const account = [
    { to: "/demo", label: m.nav.demo },
    { to: "/appointment", label: m.nav.appointment },
    { to: "/contact", label: m.nav.contact },
    { to: "/portal/login", label: m.nav.portal },
  ];

  return (
    <footer className="site-footer bg-ink text-white">
      <div className="wrap grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <Logo light />
          <p className="mt-4 text-sm leading-relaxed text-sky-100">{m.footer.blurb}</p>
          <address className="mt-3 text-sm not-italic text-sky-100">
            {organization.area}
            <br />
            {organization.city}, {organization.country}
          </address>
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold">{m.footer.product}</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {product.map((item) => (
              <li key={item.to}>
                <Link to={item.to}>{item.label}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold">{m.footer.work}</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {account.map((item) => (
              <li key={item.to}>
                <Link to={item.to}>{item.label}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold">{m.footer.support}</h2>
          <ul className="mt-3 space-y-2 text-sm text-sky-100">
            {hours.map((row) => (
              <li key={row.day}>
                {row.day}: {row.hours}
              </li>
            ))}
            <li>
              <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/15">
        <div className="wrap flex flex-col gap-2 py-4 text-sm text-sky-100 md:flex-row md:items-center md:justify-between">
          <p>
            © {new Date().getFullYear()} GEGO. {m.footer.copyright}
          </p>
          <p>
            {m.footer.designed} EldeTech
          </p>
        </div>
      </div>
    </footer>
  );
}
