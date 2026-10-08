import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { ArrowLeft, CalendarPlus, LayoutDashboard, LogOut, Menu, PanelLeft, Search, UserPlus } from "lucide-react";
import { AppearanceMenu } from "@/components/AppearanceMenu";
import { CommandPalette } from "@/components/CommandPalette";
import { DemstaLogo } from "@/components/DemstaLogo";
import { OfflineBanner } from "@/components/OfflineBanner";
import { Avatar } from "@/components/ui/avatar";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { IconButton } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { t, type StringKey } from "@/lib/i18n";
import {
  MODULES_DASHBOARD_PATH,
  breadcrumbFor,
  canAccessPath,
  isNavGroup,
  navForRole,
  type NavItem,
} from "@/lib/nav";
import { cn } from "@/lib/utils";
import { useUiPrefs } from "@/lib/uiPrefs";

type ClinicRow = { id: string; name: string; code: string };

const DASHBOARD_ITEM: NavItem = {
  to: MODULES_DASHBOARD_PATH,
  labelKey: "dashboard",
  icon: LayoutDashboard,
};

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

const SKIP_HISTORY_PATHS = new Set(["/", "/home", "/clinical"]);

function locationKey(pathname: string, search: string) {
  return `${pathname}${search}`;
}

function isInAppView(key: string) {
  return !key.startsWith("/login") && !key.startsWith("/portal");
}

function ShellLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  const location = useLocation();
  const label = t(item.labelKey as StringKey);
  const active = navTargetActive(item.to, location);
  const link = (
    <NavLink
      to={item.to}
      aria-label={label}
      className={() => cn("shell-link", active && "shell-link--on")}
      onClick={onNavigate}
    >
      <item.icon size={18} aria-hidden />
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function ShellNav({
  collapsed,
  onNavigate,
  clinics,
}: {
  collapsed: boolean;
  onNavigate: () => void;
  clinics: ClinicRow[];
}) {
  const { user, clear, activeClinicId, setActiveClinicId } = useAuth();
  const navigate = useNavigate();
  const entries = navForRole(user?.role, user?.effective_permissions).filter((entry) => {
    if (isNavGroup(entry)) return true;
    return entry.to !== MODULES_DASHBOARD_PATH;
  });
  const clinicName = clinics.find((clinic) => clinic.id === activeClinicId)?.name;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-2">
      <div className={cn("flex items-center gap-2 px-1", collapsed && "justify-center")}>
        <DemstaLogo withWordmark={!collapsed} size={collapsed ? 36 : 40} />
      </div>
      {!collapsed && (
        <div className="px-1">
          <p className="truncate text-sm font-semibold text-ink">{clinicName || "DEMSTA"}</p>
          <p className="truncate text-xs capitalize text-muted">{user?.role?.replaceAll("_", " ")}</p>
        </div>
      )}
      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto" aria-label="Main">
        <ShellLink item={DASHBOARD_ITEM} collapsed={collapsed} onNavigate={onNavigate} />
        {entries.map((entry) => {
          if (!isNavGroup(entry)) {
            return <ShellLink key={entry.to} item={entry} collapsed={collapsed} onNavigate={onNavigate} />;
          }
          return (
            <div key={entry.labelKey} className="mt-3">
              {!collapsed && (
                <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                  {t(entry.labelKey as StringKey)}
                </p>
              )}
              <div className="flex flex-col gap-0.5">
                {entry.children.map((child) => (
                  <ShellLink key={child.to} item={child} collapsed={collapsed} onNavigate={onNavigate} />
                ))}
              </div>
            </div>
          );
        })}
      </nav>
      <div className={cn("mt-auto space-y-2 rounded-2xl bg-brand-50 p-2", collapsed && "px-1")}>
        <div className={cn("flex items-center gap-2", collapsed && "justify-center")}>
          <Avatar name={user?.full_name || "Staff"} />
          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-ink">{user?.full_name}</div>
              <div className="truncate text-xs capitalize text-muted">{user?.role?.replaceAll("_", " ")}</div>
            </div>
          )}
        </div>
        {!collapsed && user?.role === "super_admin" && clinics.length > 0 && (
          <label className="block text-sm">
            <span className="label">Active clinic</span>
            <select
              className="input text-xs"
              value={activeClinicId ?? ""}
              onChange={(event) => setActiveClinicId(event.target.value || null)}
            >
              <option value="">— select —</option>
              {clinics.map((clinic) => (
                <option key={clinic.id} value={clinic.id}>
                  {clinic.code} · {clinic.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          className={cn("btn-ghost w-full", collapsed && "px-2")}
          aria-label={t("signOut")}
          onClick={() => {
            clear();
            navigate("/login");
          }}
        >
          <LogOut size={16} aria-hidden />
          {!collapsed && t("signOut")}
        </button>
      </div>
    </div>
  );
}

export function AppShell() {
  const { user, clear } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const chairside = useUiPrefs((s) => s.chairside);
  const collapsed = useUiPrefs((s) => s.sidebarCollapsed);
  const toggleCollapsed = useUiPrefs((s) => s.toggleSidebarCollapsed);
  const [clinics, setClinics] = useState<ClinicRow[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [linkPending, setLinkPending] = useState(false);
  const viewStackRef = useRef<string[]>([]);
  const mainRef = useRef<HTMLElement>(null);
  const [canGoBack, setCanGoBack] = useState(false);

  const showNewPatient = canAccessPath(user?.role, "/front-desk", user?.effective_permissions);
  const showNewAppointment = canAccessPath(user?.role, "/schedule", user?.effective_permissions);
  const crumbs = breadcrumbFor(location.pathname, location.search, user?.role, user?.effective_permissions).map(
    (crumb) => ({ to: crumb.to, label: t(crumb.labelKey as StringKey) }),
  );

  useEffect(() => {
    if (user?.role !== "super_admin") return;
    api<ClinicRow[]>("/api/v1/owner/clinics")
      .then(setClinics)
      .catch(() => setClinics([]));
  }, [user?.role]);

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
    setMobileOpen(false);
    setLinkPending(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      const anchor = (event.target as HTMLElement | null)?.closest("a");
      if (!anchor || anchor.target === "_blank") return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (`${url.pathname}${url.search}` === `${location.pathname}${location.search}`) return;
      setLinkPending(true);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (SKIP_HISTORY_PATHS.has(location.pathname) || location.pathname.startsWith("/clinic/")) return;
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

  function goBack() {
    const stack = viewStackRef.current;
    let index = stack.length - 2;
    while (index >= 0 && !isInAppView(stack[index])) index -= 1;
    if (index >= 0) {
      const prev = stack[index];
      viewStackRef.current = stack.slice(0, index + 1);
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
    <div className="app-frame">
      <a href="#main-content" className="skip-link">
        {t("skipToContent")}
      </a>
      <OfflineBanner />
      <div className="app-frame__body">
        <aside
          id="app-sidebar"
          className={cn("app-shell__aside hidden lg:flex", collapsed && "app-shell__aside--collapsed")}
          aria-label="Main"
        >
          <ShellNav collapsed={collapsed} onNavigate={() => undefined} clinics={clinics} />
        </aside>
        <div className="app-frame__stage">
          <header className="app-frame__header flex items-center gap-2 px-3 py-2 lg:px-5">
            <IconButton className="lg:hidden" aria-label={t("openMenu")} aria-expanded={mobileOpen} aria-controls="app-sidebar" onClick={() => setMobileOpen(true)}>
              <Menu size={18} aria-hidden />
            </IconButton>
            <IconButton
              className="hidden lg:inline-flex"
              aria-label={collapsed ? t("expandSidebar") : t("collapseSidebar")}
              aria-pressed={collapsed}
              onClick={() => toggleCollapsed()}
            >
              <PanelLeft size={18} aria-hidden />
            </IconButton>
            <Breadcrumb items={crumbs} />
            <div className="ml-auto flex items-center gap-2">
              {showNewAppointment && (
                <NavLink to="/schedule" className="btn-primary hidden xl:inline-flex">
                  <CalendarPlus size={16} aria-hidden /> {t("newAppointment")}
                </NavLink>
              )}
              {showNewPatient && (
                <NavLink to="/front-desk/register?step=0" className="btn-ghost hidden lg:inline-flex">
                  <UserPlus size={16} aria-hidden /> {t("newPatient")}
                </NavLink>
              )}
              <button type="button" className="btn-ghost hidden min-w-44 sm:inline-flex" onClick={() => setCommandOpen(true)}>
                <Search size={16} aria-hidden />
                <span className="text-muted">{t("searchPages")}</span>
                <kbd className="ml-2 rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px]">Ctrl K</kbd>
              </button>
              <IconButton className="sm:hidden" aria-label={t("searchPages")} onClick={() => setCommandOpen(true)}>
                <Search size={16} aria-hidden />
              </IconButton>
              <AppearanceMenu />
              <button
                type="button"
                className="btn-ghost px-2.5"
                aria-label={t("signOut")}
                onClick={() => {
                  clear();
                  navigate("/login");
                }}
              >
                <LogOut size={16} aria-hidden />
              </button>
            </div>
          </header>
          {linkPending && <div className="nav-progress" role="progressbar" aria-label="Loading page" />}
          <main id="main-content" ref={mainRef} className="app-shell__main" tabIndex={-1}>
            <Outlet />
          </main>
        </div>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent title="Navigation">
          <ShellNav collapsed={false} onNavigate={() => setMobileOpen(false)} clinics={clinics} />
        </SheetContent>
      </Sheet>
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />

      <button
        type="button"
        className={cn("app-back-fab app-back-fab--with-sidebar", collapsed && "app-back-fab--collapsed")}
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
