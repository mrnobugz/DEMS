import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { LanguageSwitch, useI18n } from "../i18n/LanguageProvider";
import { noticesFor, signOut, usePortal } from "../lib/portalStore";
import { Logo } from "./Logo";

export function PortalLayout() {
  const { m } = useI18n();
  const portal = usePortal();
  const navigate = useNavigate();
  const unread = noticesFor(portal).filter((notice) => !notice.read).length;
  const links = [
    { to: "/portal", label: m.portal.dashboard, end: true },
    { to: "/portal/invoices", label: m.portal.invoices },
    { to: "/portal/billing", label: m.portal.billing },
    { to: "/portal/notifications", label: m.portal.notifications },
    { to: "/portal/support", label: m.portal.support },
    { to: "/portal/clinic", label: m.portal.clinic },
  ];

  return (
    <div className="min-h-screen bg-mist">
      <a className="skip-link" href="#portal-main">
        {m.skip}
      </a>
      <header className="border-b bg-white">
        <div className="wrap flex flex-wrap items-center justify-between gap-3 py-3">
          <Link to="/" aria-label={m.homeAria}>
            <Logo />
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <LanguageSwitch />
            <p className="text-sm">
              <span className="font-semibold">{portal.clinic.name}</span>
              <span className="muted"> · {portal.clinic.code}</span>
            </p>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                signOut();
                navigate("/portal/login");
              }}
            >
              {m.portal.signOut}
            </button>
          </div>
        </div>
      </header>
      <div className="wrap flex flex-col gap-6 py-6 lg:flex-row">
        <nav aria-label={m.portal.nav} className="panel h-fit p-2 lg:w-64 lg:shrink-0">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end} className="portal-link">
              <span>{link.label}</span>
              {link.to === "/portal/notifications" && unread > 0 ? (
                <span className="badge badge-open">
                  {unread} {m.portal.unreadCount}
                </span>
              ) : null}
            </NavLink>
          ))}
          <Link className="portal-link" to="/docs">
            {m.portal.docs}
          </Link>
        </nav>
        <div id="portal-main" className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
