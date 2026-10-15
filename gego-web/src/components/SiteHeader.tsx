import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { catalog, contactEmail, organization } from "../data/content";
import { LanguageSwitch, useI18n } from "../i18n/LanguageProvider";
import { Logo } from "./Logo";

export function SiteHeader() {
  const { lang, m } = useI18n();
  const hours = catalog(lang).hours;
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const links = [
    { to: "/", label: m.nav.home, end: true },
    { to: "/services", label: m.nav.services },
    { to: "/about", label: m.nav.about },
    { to: "/docs", label: m.nav.docs },
    { to: "/plans", label: m.nav.plans },
    { to: "/promotions", label: m.nav.promotions },
  ];

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-white shadow-sm">
      <div className="hidden bg-mist lg:block">
        <div className="wrap flex items-center justify-between gap-4 py-2 text-sm">
          <p>
            {organization.area}, {organization.city} · {m.supportLead}: {hours[0].day} {hours[0].hours}
          </p>
          <div className="flex items-center gap-3">
            <LanguageSwitch />
            <p className="relative bg-primary px-5 py-2 text-white">
              <a className="text-white underline-offset-2 hover:underline" href={`mailto:${contactEmail}`}>
                {contactEmail}
              </a>
              <span className="mx-3" aria-hidden="true">
                |
              </span>
              <Link className="text-white underline-offset-2 hover:underline" to="/appointment">
                {m.nav.appointment}
              </Link>
            </p>
          </div>
        </div>
      </div>
      <div className="wrap flex items-center justify-between gap-3 py-3">
        <Link to="/" aria-label={m.homeAria}>
          <Logo />
        </Link>
        <div className="flex items-center gap-2 lg:hidden">
          <LanguageSwitch />
          <button
            type="button"
            className="btn btn-ghost"
            aria-expanded={open}
            aria-controls="site-nav"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? m.closeMenu : m.menu}
          </button>
        </div>
        <nav
          id="site-nav"
          aria-label={m.primaryNav}
          className={`${open ? "block" : "hidden"} absolute left-0 right-0 top-full border-t bg-white px-4 py-3 lg:static lg:block lg:border-0 lg:p-0`}
        >
          <div className="flex flex-col lg:flex-row lg:items-center">
            {links.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end} className="nav-link">
                {link.label}
              </NavLink>
            ))}
            <div className="mt-2 flex flex-col gap-2 lg:mt-0 lg:ml-3 lg:flex-row">
              <Link className="btn btn-ghost" to="/portal/login">
                {m.nav.portal}
              </Link>
              <Link className="btn btn-primary" to="/demo">
                {m.nav.demo}
              </Link>
            </div>
            <div className="mt-3 space-y-1 text-sm lg:hidden">
              <p className="muted">
                {organization.area}, {organization.city}, {organization.country}
              </p>
              <p className="muted">
                {hours[0].day} {hours[0].hours}
              </p>
              <p>
                <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
              </p>
              <Link className="nav-link px-0" to="/appointment">
                {m.nav.appointment}
              </Link>
            </div>
          </div>
        </nav>
      </div>
    </header>
  );
}
