import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { DemstaLogo } from "@/components/DemstaLogo";
import { formatMoney } from "@/lib/i18n";
import { clearPortalSession, getPortalSession } from "@/pages/PortalLoginPage";

type PortalHome = {
  patient: {
    id: string;
    patient_code: string;
    first_name: string;
    last_name: string;
    hygiene_recall_due?: string | null;
  };
  clinic: { name: string; currency: string; phone?: string | null };
  appointments: Array<{
    id: string;
    starts_at?: string | null;
    status: string;
    reason?: string | null;
  }>;
  invoices: Array<{
    id: string;
    invoice_number: string;
    status: string;
    total: number;
    amount_paid: number;
    balance: number;
    currency: string;
  }>;
  treatment_plans: Array<{
    id: string;
    title: string;
    status: string;
    items: Array<{ procedure_name: string; estimated_fee: number; status: string }>;
  }>;
};

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export function PortalHomePage() {
  const session = getPortalSession();
  const [home, setHome] = useState<PortalHome | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session?.access_token) return;
    fetch(`${API_BASE}/api/v1/portal/home`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message ?? "Failed to load portal");
        setHome(data);
      })
      .catch((e) => setError(e.message ?? "Failed to load"));
  }, [session?.access_token]);

  if (!session) return <Navigate to="/portal/login" replace />;

  const currency = home?.clinic.currency || session.patient.currency || "TZS";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#dbeafe,_#f8fafc_55%)] px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-center justify-between gap-3">
          <DemstaLogo withWordmark size={44} />
          <button
            className="btn-ghost"
            type="button"
            onClick={() => {
              clearPortalSession();
              window.location.href = "/portal/login";
            }}
          >
            Sign out
          </button>
        </header>

        <section className="glass-panel animate-rise rounded-3xl p-6">
          <h1 className="font-display text-3xl font-bold text-brand-900">
            Habari, {session.patient.first_name}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {session.patient.clinic_name} · {session.patient.patient_code}
            {home?.patient.hygiene_recall_due
              ? ` · Hygiene recall ${home.patient.hygiene_recall_due}`
              : ""}
          </p>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </section>

        <section className="glass-panel rounded-3xl p-5">
          <h2 className="font-display text-lg font-bold">Appointments</h2>
          <ul className="mt-3 divide-y divide-brand-100">
            {(home?.appointments ?? []).map((a) => (
              <li key={a.id} className="flex justify-between gap-3 py-3 text-sm">
                <div>
                  <div className="font-semibold">{a.reason || "Visit"}</div>
                  <div className="text-xs text-muted">
                    {a.starts_at ? new Date(a.starts_at).toLocaleString() : "—"}
                  </div>
                </div>
                <span className="status-pill status-pill--info capitalize">
                  {a.status.replaceAll("_", " ")}
                </span>
              </li>
            ))}
            {!home?.appointments?.length && (
              <li className="py-3 text-sm text-muted">No appointments yet.</li>
            )}
          </ul>
        </section>

        <section className="glass-panel rounded-3xl p-5">
          <h2 className="font-display text-lg font-bold">Invoices (TSh)</h2>
          <ul className="mt-3 divide-y divide-brand-100">
            {(home?.invoices ?? []).map((inv) => (
              <li key={inv.id} className="flex justify-between gap-3 py-3 text-sm">
                <div>
                  <div className="font-semibold">{inv.invoice_number}</div>
                  <div className="text-xs text-muted capitalize">{inv.status}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">
                    {formatMoney(inv.total, inv.currency || currency, "en-TZ")}
                  </div>
                  <div className="text-xs text-muted">
                    Balance {formatMoney(inv.balance, inv.currency || currency, "en-TZ")}
                  </div>
                </div>
              </li>
            ))}
            {!home?.invoices?.length && (
              <li className="py-3 text-sm text-muted">No invoices yet.</li>
            )}
          </ul>
        </section>

        <section className="glass-panel rounded-3xl p-5">
          <h2 className="font-display text-lg font-bold">Treatment plans</h2>
          <ul className="mt-3 space-y-3">
            {(home?.treatment_plans ?? []).map((p) => (
              <li key={p.id} className="rounded-2xl border border-brand-100 p-3 text-sm">
                <div className="font-semibold">
                  {p.title}{" "}
                  <span className="text-xs font-normal capitalize text-muted">· {p.status}</span>
                </div>
                <ul className="mt-2 space-y-1 text-xs text-muted">
                  {p.items.map((i, idx) => (
                    <li key={`${p.id}-${idx}`}>
                      {i.procedure_name} · {formatMoney(i.estimated_fee, currency, "en-TZ")}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
            {!home?.treatment_plans?.length && (
              <li className="text-sm text-muted">No plans shared yet.</li>
            )}
          </ul>
        </section>

        <p className="text-center text-xs text-muted">
          Staff clinic OS · <Link className="text-brand-700 hover:underline" to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
