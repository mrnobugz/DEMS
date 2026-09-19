import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { EmptyState } from "@/components/EmptyState";
import { RegistrationWizard } from "@/components/RegistrationWizard";
import { UnfinishedRegistrations } from "@/components/UnfinishedRegistrations";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/i18n";
import type { ChairQueueItem } from "@/lib/types";
import { useUiPrefs } from "@/lib/uiPrefs";

type Home = {
  role: string;
  today_appointments: number;
  checked_in: number;
  waitlist: number;
  open_lab_cases: number;
  overdue_lab_cases?: number;
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
    ["Lab overdue", home.overdue_lab_cases ?? 0],
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
  const [appts, setAppts] = useState<ChairQueueItem[]>([]);
  const [recall, setRecall] = useState<
    Array<{
      id: string;
      patient_code: string;
      name: string;
      hygiene_recall_due?: string | null;
      perio_risk_band?: string | null;
    }>
  >([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api<ChairQueueItem[]>("/api/v1/departments/today-appointments")
      .then(setAppts)
      .catch((e) => {
        setAppts([]);
        setError(e.message ?? "Could not load today's board");
      });
    api<typeof recall>("/api/v1/patients/hygiene-recall-due")
      .then(setRecall)
      .catch(() => setRecall([]));
  }, []);

  async function sendRecallReminders() {
    try {
      const res = await api<{ queued: number; dispatched: number }>(
        "/api/v1/notifications/reminders/hygiene-recall",
        { method: "POST", body: JSON.stringify({ days_ahead: 14 }) },
      );
      setMsg(`Queued ${res.queued} recall messages · dispatched ${res.dispatched}`);
    } catch (e: any) {
      setMsg(e.message ?? "Failed to queue recall reminders");
    }
  }

  return (
    <div className="animate-rise space-y-4">
      <div>
        <h2 className="font-display text-2xl font-bold text-brand-900">Today</h2>
        <p className="text-sm text-muted">
          Queue and walk-ins on the board. Recalls due for front desk follow-up.
        </p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {msg && <p className="text-sm text-brand-700">{msg}</p>}
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="glass-panel rounded-2xl p-4">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h3 className="font-display text-lg font-bold text-brand-900">Today&apos;s board</h3>
            <span className="text-xs font-semibold text-muted">{appts.length} on the list</span>
          </div>
          {appts.length === 0 ? (
            <EmptyState title="No visits today" hint="Registered walk-ins and booked slots appear here." />
          ) : (
            <ul className="divide-y divide-brand-100">
              {appts.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="font-semibold text-ink">
                      {a.queue_number != null ? `Q${a.queue_number} · ` : ""}
                      {a.patient_name || a.service_name || a.reason || "Visit"}
                      {a.patient_code ? (
                        <span className="ml-2 font-mono text-xs font-normal text-muted">
                          {a.patient_code}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted">
                      {a.department ? `${a.department} · ` : ""}
                      {a.dentist_name ? `${a.dentist_name} · ` : ""}
                      {a.service_name || a.reason || "Visit"} ·{" "}
                      {a.is_appointment === false ? "Walk-in" : "Appointment"}
                      {a.starts_at
                        ? ` · ${new Date(a.starts_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}`
                        : ""}
                    </div>
                  </div>
                  <span className="status-pill status-pill--info shrink-0 capitalize">
                    {a.status.replaceAll("_", " ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <UnfinishedRegistrations />
        <section className="glass-panel rounded-2xl p-4">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-display text-lg font-bold text-brand-900">
              Hygiene recall due (front desk)
            </h3>
            <button className="btn-ghost text-xs" type="button" onClick={sendRecallReminders}>
              Send recall messages
            </button>
          </div>
          {recall.length === 0 ? (
            <EmptyState
              title="No recalls due"
              hint="Perio risk bands set hygiene_recall_due automatically."
            />
          ) : (
            <ul className="divide-y divide-brand-100">
              {recall.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <Link
                      className="font-semibold text-brand-700 hover:underline"
                      to={`/patients/${r.id}`}
                    >
                      {r.patient_code} · {r.name}
                    </Link>
                    <div className="text-xs text-muted capitalize">
                      Risk {r.perio_risk_band || "—"} · due {r.hygiene_recall_due}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export function FrontDeskRegisterPage() {
  const navigate = useNavigate();
  return <RegistrationWizard onDone={() => navigate("/front-desk/register?step=0")} />;
}
