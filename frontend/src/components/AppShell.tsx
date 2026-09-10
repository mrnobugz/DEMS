import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { ArrowLeft, LayoutDashboard, LogOut, Menu, MonitorSmartphone, X } from "lucide-react";
import { DemstaLogo } from "./DemstaLogo";
import { OfflineBanner } from "./OfflineBanner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { t, type StringKey } from "@/lib/i18n";
import { MODULES_DASHBOARD_PATH, moduleNavForPath, roleHomeLabel } from "@/lib/nav";
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
  if (qs) {
    if (location.pathname !== path) return false;
    return location.search === `?${qs}` || (qs === "step=0" && !location.search);
  }
  if (path === "/patients") {
    return location.pathname === "/patients" || location.pathname.startsWith("/patients/");
  }
  if (location.pathname !== path) return false;
  return !location.search || location.search === "?";
}

function prefersDesktopSidebar() {
  return typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
}

const SKIP_HISTORY_PATHS = new Set(["/", "/home", "/clinical"]);

function locationKey(pathname: string, search: string) {
  return `${pathname}${search}`;
}

function isInAppView(key: string) {
  return !key.startsWith("/login") && !key.startsWith("/portal");
}

export function AppShell() {
  const { user, clear, activeClinicId, setActiveClinicId } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const compactWorkspace =
    location.pathname.startsWith("/front-desk/register") ||
    location.pathname.startsWith("/clinical/") ||
    location.pathname.startsWith("/patients/") ||
    location.pathname.startsWith("/admin") ||
    location.pathname.startsWith("/inventory") ||
    location.pathname.startsWith("/billing");
  const modulesLanding = location.pathname.startsWith(MODULES_DASHBOARD_PATH);
  const moduleNav = moduleNavForPath(location.pathname, user?.role, user?.effective_permissions);
  const chairside = useUiPrefs((s) => s.chairside);
  const toggleChairside = useUiPrefs((s) => s.toggleChairside);
  const [clinics, setClinics] = useState<ClinicRow[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(() => !modulesLanding && prefersDesktopSidebar());
  const viewStackRef = useRef<string[]>([]);
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    if (user?.role !== "super_admin") return;
    api<ClinicRow[]>("/api/v1/owner/clinics")
      .then(setClinics)
      .catch(() => setClinics([]));
  }, [user?.role]);

  useEffect(() => {
    if (modulesLanding) {
      setSidebarOpen(false);
      return;
    }
    if (prefersDesktopSidebar()) setSidebarOpen(true);
  }, [modulesLanding]);

  useEffect(() => {
    if (SKIP_HISTORY_PATHS.has(location.pathname) || location.pathname.startsWith("/clinic/")) {
      return;
    }
    const key = locationKey(location.pathname, location.search);
    if (!isInAppView(key)) return;
    const stack = viewStackRef.current;
    if (stack[stack.length - 1] === key) {
      setCanGoBack(stack.length > 1 || location.pathname !== MODULES_DASHBOARD_PATH);
      return;
    }
    if (navigationType === "POP") {
      const idx = stack.lastIndexOf(key);
      if (idx >= 0) {
        viewStackRef.current = stack.slice(0, idx + 1);
        setCanGoBack(idx > 0 || location.pathname !== MODULES_DASHBOARD_PATH);
        return;
      }
    }
    stack.push(key);
    if (stack.length > 50) stack.shift();
    setCanGoBack(stack.length > 1 || location.pathname !== MODULES_DASHBOARD_PATH);
  }, [location.pathname, location.search, navigationType]);

  const showSidebar = sidebarOpen && !modulesLanding;
  const moduleTitle = moduleNav
    ? t(moduleNav.titleKey as StringKey)
    : roleHomeLabel(user?.role);

  useEffect(() => {
    if (!sidebarOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSidebarOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  useEffect(() => {
    if (!showSidebar || prefersDesktopSidebar()) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [showSidebar]);

  function closeSidebarIfNarrow() {
    if (!prefersDesktopSidebar()) setSidebarOpen(false);
  }

  function goBack() {
    const stack = viewStackRef.current;
    let i = stack.length - 2;
    while (i >= 0 && !isInAppView(stack[i])) i -= 1;
    if (i >= 0) {
      const prev = stack[i];
      viewStackRef.current = stack.slice(0, i + 1);
      setCanGoBack(viewStackRef.current.length > 1 || prev.split("?")[0] !== MODULES_DASHBOARD_PATH);
      navigate(prev);
      return;
    }
    if (location.pathname !== MODULES_DASHBOARD_PATH) {
      viewStackRef.current = [MODULES_DASHBOARD_PATH];
      setCanGoBack(false);
      navigate(MODULES_DASHBOARD_PATH);
    }
  }

  return (
    <div className="min-h-screen">
      <a href="#main-content" className="skip-link">
        {t("skipToContent")}
      </a>
      <OfflineBanner />

      <div className={showSidebar ? "lg:grid lg:grid-cols-[260px_1fr]" : ""}>
        {showSidebar && (
          <button
            type="button"
            className="app-shell__backdrop fixed inset-0 z-40 bg-ink/40 lg:hidden"
            aria-label={t("closeMenu")}
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {!modulesLanding && (
          <aside
            id="app-sidebar"
            className={`app-shell__aside glass-panel fixed inset-y-3 left-3 z-50 flex w-[min(280px,calc(100vw-1.5rem))] flex-col rounded-3xl p-5 transition-transform duration-200 lg:static lg:z-auto lg:m-3 lg:w-auto ${
              showSidebar ? "translate-x-0" : "pointer-events-none -translate-x-[120%] lg:hidden"
            }`}
            aria-label={moduleTitle}
            aria-hidden={!showSidebar}
          >
            <DemstaLogo withWordmark size={44} />
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              {moduleTitle}
            </p>
            <nav className="mt-8 flex flex-1 flex-col gap-1.5 overflow-y-auto" aria-label={moduleTitle}>
              <NavLink
                to={MODULES_DASHBOARD_PATH}
                end
                className={navLinkClass}
                onClick={() => setSidebarOpen(false)}
              >
                <LayoutDashboard size={18} aria-hidden />
                {t("dashboard")}
              </NavLink>
              {moduleNav && moduleNav.items.length > 0 && (
                <div className="my-1 h-px bg-brand-100" role="separator" />
              )}
              {moduleNav?.items.map(({ to, labelKey, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={() => navLinkClass({ isActive: navTargetActive(to, location) })}
                  onClick={closeSidebarIfNarrow}
                >
                  <Icon size={18} aria-hidden />
                  {t(labelKey as StringKey)}
                </NavLink>
              ))}
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
          <header
            className={`flex items-center justify-between gap-3 px-4 lg:px-8 ${
              modulesLanding || compactWorkspace ? "py-2" : "py-4"
            }`}
          >
            <div className="flex min-w-0 items-center gap-2">
              {!modulesLanding && (
                <button
                  type="button"
                  className="btn-ghost shrink-0 px-2.5"
                  aria-label={sidebarOpen ? t("closeMenu") : t("openMenu")}
                  aria-expanded={sidebarOpen}
                  aria-controls="app-sidebar"
                  onClick={() => setSidebarOpen((open) => !open)}
                >
                  {sidebarOpen ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
                </button>
              )}
              <div className={showSidebar ? "lg:hidden" : ""}>
                <DemstaLogo withWordmark size={modulesLanding ? 40 : 36} />
              </div>
            </div>
            {!modulesLanding && !compactWorkspace && (
              <div className="app-shell__header-title hidden min-w-0 lg:block">
                <p className="text-sm text-muted">{t("clinicOps")}</p>
                <h1 className="font-display truncate text-2xl font-bold text-brand-900">
                  {moduleTitle}
                </h1>
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={`btn-ghost text-xs ${chairside ? "bg-brand-50" : ""} ${showSidebar ? "lg:hidden" : ""}`}
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
            </div>
          </header>

          <main
            id="main-content"
            className={`app-shell__main flex-1 overflow-visible px-4 ${
              modulesLanding
                ? "pb-24 lg:px-10 lg:pb-12"
                : compactWorkspace
                  ? "pb-24 lg:px-6 lg:pb-10"
                  : "pb-24 lg:px-8 lg:pb-12"
            }`}
            tabIndex={-1}
          >
            <Outlet />
          </main>
        </div>
      </div>

      <button
        type="button"
        className={`app-back-fab ${showSidebar ? "app-back-fab--with-sidebar" : ""}`}
        aria-label={t("goBack")}
        title={t("goBack")}
        disabled={!canGoBack}
        onClick={goBack}
      >
        <ArrowLeft size={chairside ? 24 : 20} strokeWidth={2.4} aria-hidden />
      </button>
    </div>
  );
}
