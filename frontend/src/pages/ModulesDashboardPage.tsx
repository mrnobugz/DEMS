import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowUpRight,
  Baby,
  BarChart3,
  Braces,
  Building2,
  CalendarDays,
  ClipboardPlus,
  FlaskConical,
  LayoutGrid,
  Package,
  Pill,
  Receipt,
  Scan,
  Settings2,
  Slice,
  Smile,
  Sparkles,
  UserRoundCog,
  Users,
} from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { t } from "@/lib/i18n";

export type StaffModule = {
  key: string;
  name: string;
  description: string;
  icon: string;
  route_path: string;
  sort_order?: number;
};

const ICONS: Record<string, LucideIcon> = {
  "building-2": Building2,
  "settings-2": Settings2,
  "clipboard-plus": ClipboardPlus,
  smile: Smile,
  slice: Slice,
  braces: Braces,
  baby: Baby,
  "user-round-cog": UserRoundCog,
  activity: Activity,
  scan: Scan,
  "flask-conical": FlaskConical,
  pill: Pill,
  package: Package,
  users: Users,
  "calendar-days": CalendarDays,
  receipt: Receipt,
  sparkles: Sparkles,
  "bar-chart-3": BarChart3,
};

function welcomeLine(fullName: string | undefined, role: string | undefined) {
  const name = (fullName || "there").trim();
  if (/^dr\.?\s/i.test(name)) return `Welcome back, ${name}`;
  if (role === "dentist") return `Welcome back, Dr. ${name}`;
  return `Welcome back, ${name}`;
}

function ModuleCard({ module }: { module: StaffModule }) {
  const navigate = useNavigate();
  const Icon = ICONS[module.icon] || LayoutGrid;

  function open() {
    navigate(module.route_path);
  }

  return (
    <div className="module-card-wrap">
      <button
        type="button"
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            open();
          }
        }}
        tabIndex={0}
        aria-label={`${module.name}: ${module.description}`}
        className="module-card"
      >
        <span className="module-card__icon" aria-hidden>
          <Icon size={28} strokeWidth={1.75} />
        </span>
        <div>
          <div className="module-card__name">{module.name}</div>
          <div className="module-card__hint">
            Open module <ArrowUpRight size={12} className="inline align-[-1px]" />
          </div>
        </div>
      </button>
      <div className="module-card__float" role="tooltip">
        {module.description}
      </div>
    </div>
  );
}

function ModuleCardSkeleton({ delay }: { delay: number }) {
  return (
    <div
      className="module-card animate-pulse"
      style={{ animationDelay: `${delay}ms` }}
      aria-hidden
    >
      <div className="h-13 w-13 rounded-2xl bg-brand-100" style={{ width: 52, height: 52 }} />
      <div className="h-4 w-2/3 rounded bg-brand-100" />
    </div>
  );
}

export function ModulesDashboardPage() {
  const user = useAuth((s) => s.user);
  const [modules, setModules] = useState<StaffModule[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<StaffModule[]>("/api/v1/me/modules")
      .then(setModules)
      .catch((err) => {
        setModules([]);
        setError(err instanceof ApiError ? err.message : "Could not load modules");
      });
  }, []);

  return (
    <div className="modules-dash space-y-8 animate-rise">
      <header className="max-w-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-600">
          {t("clinicOps")}
        </p>
        <h2 className="mt-1 font-display text-3xl font-bold tracking-tight text-brand-900">
          {welcomeLine(user?.full_name, user?.role)}
        </h2>
        <p className="mt-2 text-sm text-muted">{t("selectModule")}</p>
      </header>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {modules === null && (
        <div
          className="grid grid-cols-1 gap-x-6 gap-y-10 pt-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          aria-busy="true"
          aria-label="Loading modules"
        >
          {Array.from({ length: 8 }, (_, i) => (
            <ModuleCardSkeleton key={i} delay={i * 40} />
          ))}
        </div>
      )}

      {modules && modules.length === 0 && !error && (
        <div className="glass-panel flex min-h-[20rem] items-center justify-center rounded-3xl">
          <EmptyState
            title={t("noModules")}
            hint={t("contactAdmin")}
            icon={LayoutGrid}
          />
        </div>
      )}

      {modules && modules.length > 0 && (
        <div className="grid grid-cols-1 gap-x-6 gap-y-10 pt-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {modules.map((module, i) => (
            <div key={module.key} className="animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
              <ModuleCard module={module} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
