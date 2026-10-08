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
  ClipboardList,
  ClipboardPlus,
  FlaskConical,
  FolderOpen,
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
import { motion, useReducedMotion } from "framer-motion";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/ui/accordion";
import { PageHeader } from "@/components/ui/tabs";
import { useAnnounce } from "@/components/ui/sonner";
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
  "clipboard-list": ClipboardList,
  smile: Smile,
  slice: Slice,
  braces: Braces,
  baby: Baby,
  "user-round-cog": UserRoundCog,
  activity: Activity,
  "folder-open": FolderOpen,
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

function ModuleCardSkeleton() {
  return (
    <div className="module-card" aria-hidden>
      <PageSkeleton rows={1} />
    </div>
  );
}

export function ModulesDashboardPage() {
  const user = useAuth((s) => s.user);
  const reduceMotion = useReducedMotion();
  const [modules, setModules] = useState<StaffModule[] | null>(null);
  const [error, setError] = useState("");
  useAnnounce(error);

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
      <PageHeader
        eyebrow={t("clinicOps")}
        title={welcomeLine(user?.full_name, user?.role)}
        description={t("selectModule")}
      />

      {error && (
        <p className="text-sm text-danger" role="alert" aria-live="assertive">
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
            <ModuleCardSkeleton key={i} />
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
            <motion.div
              key={module.key}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.24, delay: reduceMotion ? 0 : i * 0.04 }}
            >
              <ModuleCard module={module} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
