import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CalendarCheck,
  CalendarDays,
  Receipt,
  Users,
  Wallet,
} from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { EmptyState } from "@/components/EmptyState";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/i18n";
import { roleHomePath } from "@/lib/nav";
import { useUiPrefs } from "@/lib/uiPrefs";
import type { Appointment, DashboardStats } from "@/lib/types";

const cards = [
  { key: "patients_total" as const, label: "Active patients", icon: Users },
  { key: "appointments_today" as const, label: "Today's appointments", icon: CalendarCheck },
  { key: "revenue_month" as const, label: "Revenue this month", icon: Wallet, money: true },
  { key: "open_invoices" as const, label: "Open invoices", icon: Receipt },
  { key: "no_shows_week" as const, label: "No-shows (7d)", icon: AlertTriangle },
  { key: "caries_high_risk" as const, label: "High caries risk", icon: Activity },
];

export function DashboardPage() {
  const role = useAuth((s) => s.user?.role);
  const home = roleHomePath(role);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [today, setToday] = useState<Appointment[]>([]);
  const currency = useUiPrefs((s) => s.currency);
  const locale = useUiPrefs((s) => s.locale);
  const redirect = Boolean(role && home !== "/");

  useEffect(() => {
    if (redirect) return;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    void Promise.all([
      api<DashboardStats>("/api/v1/dashboard/stats"),
      api<Appointment[]>(
        `/api/v1/appointments?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`,
      ),
    ]).then(([s, a]) => {
      setStats(s);
      setToday(a);
    });
  }, [redirect]);

  if (redirect) {
    return <Navigate to={home} replace />;
  }

  function fmt(key: (typeof cards)[number]["key"], money?: boolean) {
    if (!stats) return "—";
    const n = stats[key];
    return money ? formatMoney(n, currency, locale) : String(n);
  }

  return (
    <div className="space-y-6 animate-rise">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Key metrics">
        {cards.map(({ key, label, icon: Icon, money }, i) => (
          <div
            key={key}
            className="glass-panel animate-rise rounded-3xl p-5"
            style={{ animationDelay: `${i * 0.05}s` }}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted">{label}</p>
                <p className="mt-2 font-display text-3xl font-bold text-brand-900">
                  {fmt(key, money)}
                </p>
              </div>
              <div className="rounded-2xl bg-brand-100 p-2.5 text-brand-600" aria-hidden>
                <Icon size={20} />
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="glass-panel rounded-3xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl font-bold text-brand-900">Today's schedule</h2>
            <Link to="/schedule" className="text-sm font-semibold text-brand-600">
              Open calendar
            </Link>
          </div>
          <div className="space-y-3">
            {today.length === 0 && (
              <EmptyState
                title="No appointments today"
                hint="When the front desk books visits, they appear here."
                icon={CalendarDays}
                action={
                  <Link to="/schedule" className="btn-primary text-sm">
                    Go to schedule
                  </Link>
                }
              />
            )}
            {today.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-2xl border border-brand-100 bg-white/70 px-3 py-3"
              >
                <div
                  className="h-10 w-1.5 rounded-full"
                  style={{ background: a.color || "#0B5FFF" }}
                  aria-hidden
                />
                <div className="flex-1">
                  <div className="font-semibold text-ink">
                    {a.patient
                      ? `${a.patient.first_name} ${a.patient.last_name}`
                      : a.patient_id.slice(0, 8)}
                  </div>
                  <div className="text-xs text-muted">
                    {format(parseISO(a.starts_at), "HH:mm")} – {format(parseISO(a.ends_at), "HH:mm")}
                    {a.reason ? ` · ${a.reason}` : ""}
                    {a.chair_number ? ` · Chair ${a.chair_number}` : ""}
                  </div>
                </div>
                <span className="status-pill status-pill--info">
                  {a.status.replace("_", " ")}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel rounded-3xl p-5">
          <span className="ai-badge mb-3">AI advisory</span>
          <h2 className="font-display text-xl font-bold text-brand-900">Intelligent layer</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            DEMSTA ships with a pluggable AI gateway for caries-risk scoring, smart slot suggestions,
            and SOAP note drafts — always marked advisory, never auto-diagnosed.
          </p>
          <Link to="/ai" className="btn-primary mt-5 inline-flex">
            Open AI Assist
          </Link>
        </div>
      </section>
    </div>
  );
}
