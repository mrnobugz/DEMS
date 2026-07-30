import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState } from "@/components/EmptyState";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/i18n";
import { useUiPrefs } from "@/lib/uiPrefs";

type Home = {
  role: string;
  today_appointments: number;
  checked_in: number;
  waitlist: number;
  open_lab_cases: number;
  low_stock_items: number;
  open_prescriptions: number;
  outstanding_balance: number;
  imaging_today: number;
  patients_total: number;
};

export function useDepartmentHome() {
  const [home, setHome] = useState<Home | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<Home>("/api/v1/departments/home")
      .then(setHome)
      .catch((e) => setError(e.message ?? "Failed to load"));
  }, []);
  return { home, error };
}

export function StatGrid({ home }: { home: Home }) {
  const currency = useUiPrefs((s) => s.currency);
  const locale = useUiPrefs((s) => s.locale);
  const cells = [
    ["Today", home.today_appointments],
    ["Checked in", home.checked_in],
    ["Waitlist", home.waitlist],
    ["Patients", home.patients_total],
    ["Lab open", home.open_lab_cases],
    ["Low stock", home.low_stock_items],
    ["Active Rx", home.open_prescriptions],
    ["Imaging today", home.imaging_today],
  ] as const;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cells.map(([label, value]) => (
        <div key={label} className="glass-panel rounded-2xl p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
          <div className="mt-1 font-display text-2xl font-bold text-brand-900">{value}</div>
        </div>
      ))}
      <div className="glass-panel rounded-2xl p-4 sm:col-span-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">
          Outstanding
        </div>
        <div className="mt-1 font-display text-2xl font-bold text-brand-900">
          {formatMoney(home.outstanding_balance, currency, locale)}
        </div>
      </div>
    </div>
  );
}

export function FrontDeskPage() {
  const { home, error } = useDepartmentHome();
  const [appts, setAppts] = useState<any[]>([]);
  useEffect(() => {
    api<any[]>("/api/v1/departments/today-appointments").then(setAppts).catch(() => setAppts([]));
  }, []);

  return (
    <div className="animate-rise space-y-6">
      <div>
        <h2 className="font-display text-3xl font-bold text-brand-900">Front desk</h2>
        <p className="text-sm text-muted">Check-in, waitlist, and patient flow for today.</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {home && <StatGrid home={home} />}
      <div className="flex flex-wrap gap-2">
        <Link className="btn-primary" to="/patients">
          Register / find patient
        </Link>
        <Link className="btn-ghost" to="/schedule">
          Open schedule
        </Link>
        <Link className="btn-ghost" to="/billing">
          Billing
        </Link>
      </div>
      <section className="glass-panel rounded-3xl p-5">
        <h3 className="font-display text-lg font-bold text-brand-900">Today&apos;s board</h3>
        {appts.length === 0 ? (
          <EmptyState title="No appointments today" hint="Book from the schedule." />
        ) : (
          <ul className="mt-4 divide-y divide-brand-100">
            {appts.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <div className="font-semibold text-ink">{a.reason || "Visit"}</div>
                  <div className="text-xs text-muted">
                    Chair {a.chair_number} · {new Date(a.starts_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                <span className="status-pill status-pill--info capitalize">{a.status.replaceAll("_", " ")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function ClinicalHomePage() {
  const { home, error } = useDepartmentHome();
  const [appts, setAppts] = useState<any[]>([]);
  useEffect(() => {
    api<any[]>("/api/v1/departments/today-appointments").then(setAppts).catch(() => setAppts([]));
  }, []);
  return (
    <div className="animate-rise space-y-6">
      <div>
        <h2 className="font-display text-3xl font-bold text-brand-900">Clinical chair</h2>
        <p className="text-sm text-muted">Today&apos;s queue and open charts.</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {home && <StatGrid home={home} />}
      <Link className="btn-primary inline-flex" to="/patients">
        Open patient charts
      </Link>
      <section className="glass-panel rounded-3xl p-5">
        <h3 className="font-display text-lg font-bold">Chair queue</h3>
        {appts.length === 0 ? (
          <EmptyState title="No chair visits queued" />
        ) : (
          <ul className="mt-3 space-y-2">
            {appts.map((a) => (
              <li key={a.id}>
                <Link className="block rounded-xl px-3 py-2 hover:bg-brand-50" to={`/patients/${a.patient_id}`}>
                  <span className="font-semibold">{a.reason}</span>
                  <span className="ml-2 text-xs text-muted capitalize">{a.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
