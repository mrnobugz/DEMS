import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, MonitorSmartphone } from "lucide-react";
import { DemstaLogo } from "./DemstaLogo";
import { OfflineBanner } from "./OfflineBanner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { t, type StringKey } from "@/lib/i18n";
import {
  flatNavForRole,
  isNavGroup,
  navForRole,
  roleHomeLabel,
  type NavGroup,
} from "@/lib/nav";
import { useUiPrefs } from "@/lib/uiPrefs";

type ClinicRow = { id: string; name: string; code: string };

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition ${
    isActive
      ? "bg-brand-500 text-white shadow-lg shadow-brand-500/25"
      : "text-muted hover:bg-brand-50 hover:text-brand-700"
  }`;

function navTargetActive(to: string, location: { pathname: string; search: string }) {
  const [path, qs] = to.split("?");
  if (location.pathname !== path) return false;
  if (!qs) return !location.search.startsWith("?step=");
  return location.search === `?${qs}` || (qs === "step=0" && !location.search);
}

function NavDropdown({ group }: { group: NavGroup }) {
  const location = useLocation();
  const hasActiveChild = group.children.some((c) => navTargetActive(c.to, location));
  const [open, setOpen] = useState(hasActiveChild);

  useEffect(() => {
    if (hasActiveChild) setOpen(true);
  }, [hasActiveChild]);

  const Icon = group.icon;
  return (
    <div>
      <button
        type="button"
        className={`flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition ${
          hasActiveChild && !open
            ? "bg-brand-50 text-brand-700"
            : "text-muted hover:bg-brand-50 hover:text-brand-700"
        }`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon size={18} aria-hidden />
        {t(group.labelKey as StringKey)}
        <ChevronDown
          size={14}
          aria-hidden
          className={`ml-auto transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="mt-1 flex flex-col gap-1 border-l-2 border-brand-100 pl-3 ml-4">
          {group.children.map(({ to, labelKey, icon: ChildIcon }) => (
            <NavLink
              key={to}
              to={to}
              className={() => navLinkClass({ isActive: navTargetActive(to, location) })}
            >
              <ChildIcon size={16} aria-hidden />
              {t(labelKey as StringKey)}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export function AppShell() {
  const { user, clear, activeClinicId, setActiveClinicId } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const compactWorkspace =
    location.pathname.startsWith("/front-desk/register") ||
    location.pathname.startsWith("/clinical/") ||
    location.pathname.startsWith("/patients/") ||
    location.pathname.startsWith("/admin") ||
    location.pathname.startsWith("/inventory") ||
    location.pathname.startsWith("/billing");
  const modulesLanding = location.pathname.startsWith("/dashboard/modules");
  const chairside = useUiPrefs((s) => s.chairside);
  const toggleChairside = useUiPrefs((s) => s.toggleChairside);
  const links = navForRole(user?.role, user?.effective_permissions);
  const mobileLinks = flatNavForRole(user?.role, user?.effective_permissions).slice(0, 4);
  const [clinics, setClinics] = useState<ClinicRow[]>([]);

  useEffect(() => {
    if (user?.role !== "super_admin") return;
    api<ClinicRow[]>("/api/v1/owner/clinics")
      .then(setClinics)
      .catch(() => setClinics([]));
  }, [user?.role]);

  return (
    <div className="min-h-screen">
      <a href="#main-content" className="skip-link">
        {t("skipToContent")}
      </a>
      <OfflineBanner />

      <div className={modulesLanding ? "" : "lg:grid lg:grid-cols-[260px_1fr]"}>
        {!modulesLanding && (
        <aside
          className="app-shell__aside glass-panel m-3 hidden flex-col rounded-3xl p-5 lg:flex"
          aria-label="Primary"
        >
          <DemstaLogo withWordmark size={44} />
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            {roleHomeLabel(user?.role)}
          </p>
          <nav className="mt-8 flex flex-1 flex-col gap-1.5 overflow-y-auto" aria-label="Main">
            {links.map((entry) =>
              isNavGroup(entry) ? (
                <NavDropdown key={entry.labelKey} group={entry} />
              ) : (
                <NavLink
                  key={entry.to}
                  to={entry.to}
                  end={entry.to === "/" || entry.to === "/dashboard/modules"}
                  className={navLinkClass}
                >
                  <entry.icon size={18} aria-hidden />
                  {t(entry.labelKey as StringKey)}
                </NavLink>
              ),
            )}
          </nav>
          <div className="mt-auto space-y-2 rounded-2xl bg-brand-50 p-3">
            <div className="text-sm font-semibold text-ink">{user?.full_name}</div>
            <div className="text-xs capitalize text-muted">
              {user?.role?.replaceAll("_", " ")}
            </div>
            {user?.role === "super_admin" && clinics.length > 0 && (
              <label className="block text-[11px] font-semibold text-muted">
                Active clinic
                <select
                  className="input mt-1 text-xs"
                  value={activeClinicId ?? ""}
                  onChange={(e) => setActiveClinicId(e.target.value || null)}
                >
                  <option value="">— select —</option>
                  {clinics.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} · {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="button"
              className="btn-ghost flex w-full items-center justify-center gap-2 text-sm"
              aria-pressed={chairside}
              title={t("chairsideHint")}
              onClick={() => toggleChairside()}
            >
              <MonitorSmartphone size={16} aria-hidden />
              {chairside ? t("chairsideOn") : t("chairsideOff")}
            </button>
            <button
              type="button"
              className="btn-ghost flex w-full items-center justify-center gap-2 text-sm"
              onClick={() => {
                clear();
                navigate("/login");
              }}
            >
              <LogOut size={16} aria-hidden /> {t("signOut")}
            </button>
          </div>
        </aside>
        )}

        <div className="flex min-h-screen flex-col">
          <header className={`flex items-center justify-between gap-3 px-4 lg:px-8 ${modulesLanding || compactWorkspace ? "py-2" : "py-4"}`}>
            <div className={modulesLanding ? "" : "lg:hidden"}>
              <DemstaLogo withWordmark size={modulesLanding ? 40 : 36} />
            </div>
            {!modulesLanding && !compactWorkspace && (
            <div className="app-shell__header-title hidden lg:block">
              <p className="text-sm text-muted">{t("clinicOps")}</p>
              <h1 className="font-display text-2xl font-bold text-brand-900">
                {roleHomeLabel(user?.role)}
              </h1>
            </div>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={`btn-ghost text-xs lg:hidden ${chairside ? "bg-brand-50" : ""}`}
                aria-pressed={chairside}
                onClick={() => toggleChairside()}
              >
                <MonitorSmartphone size={16} aria-hidden />
                <span className="sr-only">{chairside ? t("chairsideOn") : t("chairsideOff")}</span>
              </button>
              {chairside && (
                <span className="status-pill status-pill--info hidden sm:inline-flex">
                  Chairside
                </span>
              )}
              <div className="rounded-full border border-brand-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-brand-700">
                DEMSTA · Live
              </div>
              {modulesLanding && (
                <button
                  type="button"
                  className="btn-ghost flex items-center gap-2 text-sm"
                  onClick={() => {
                    clear();
                    navigate("/login");
                  }}
                >
                  <LogOut size={16} aria-hidden />
                  <span className="hidden sm:inline">{t("signOut")}</span>
                </button>
              )}
            </div>
          </header>

          <main
            id="main-content"
            className={`app-shell__main flex-1 overflow-visible px-4 ${
              modulesLanding ? "pb-10 lg:px-10 lg:pb-12" : compactWorkspace ? "pb-24 lg:px-6 lg:pb-6" : "pb-24 lg:px-8 lg:pb-8"
            }`}
            tabIndex={-1}
          >
            <Outlet />
          </main>

          {!chairside && !modulesLanding && (
            <nav
              className="glass-panel sticky bottom-3 z-10 mx-3 flex justify-around rounded-2xl p-2 lg:hidden"
              aria-label="Mobile"
            >
              {mobileLinks.map(({ to, labelKey, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/"}
                  className={({ isActive }) =>
                    `flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-[10px] font-semibold ${
                      isActive ? "text-brand-600" : "text-muted"
                    }`
                  }
                >
                  <Icon size={18} aria-hidden />
                  {t(labelKey as StringKey)}
                </NavLink>
              ))}
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
