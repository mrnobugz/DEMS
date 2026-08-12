import { FormEvent, useEffect, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/i18n";
import { useUiPrefs } from "@/lib/uiPrefs";

type Clinic = {
  id: string;
  name: string;
  code: string;
  address?: string | null;
  is_active: boolean;
  currency: string;
};

type Stats = {
  clinics: number;
  active_clinics: number;
  staff_total: number;
  patients_total: number;
  appointments_today: number;
  revenue_open: number;
};

export function OwnerPage() {
  const { activeClinicId, setActiveClinicId } = useAuth();
  const currency = useUiPrefs((s) => s.currency);
  const locale = useUiPrefs((s) => s.locale);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", code: "", currency: "TZS" });
  const [busy, setBusy] = useState(false);

  async function load() {
    const [c, s] = await Promise.all([
      api<Clinic[]>("/api/v1/owner/clinics"),
      api<Stats>("/api/v1/owner/stats"),
    ]);
    setClinics(c);
    setStats(s);
    if (!activeClinicId && c[0]) setActiveClinicId(c[0].id);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/api/v1/owner/clinics", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm({ name: "", code: "", currency: "TZS" });
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function reseed() {
    if (!confirm("Wipe demo data and reseed?")) return;
    setBusy(true);
    try {
      await api("/api/v1/owner/reseed-demo", { method: "POST" });
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="animate-rise space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl font-bold text-brand-900">System owner</h2>
          <p className="text-sm text-muted">Multi-clinic fabric · chain KPIs · tenant switcher.</p>
        </div>
        <button className="btn-ghost text-sm" type="button" disabled={busy} onClick={reseed}>
          {busy ? "Reseeding…" : "Reseed demo data"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {stats && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Clinics", stats.clinics],
            ["Active", stats.active_clinics],
            ["Staff", stats.staff_total],
            ["Patients", stats.patients_total],
            ["Appts today", stats.appointments_today],
            ["Open revenue", formatMoney(stats.revenue_open, currency, locale)],
          ].map(([label, value]) => (
            <div key={String(label)} className="glass-panel rounded-2xl p-4">
              <div className="text-xs font-semibold uppercase text-muted">{label}</div>
              <div className="mt-1 font-display text-2xl font-bold text-brand-900">{value}</div>
            </div>
          ))}
        </div>
      )}
      <form className="glass-panel grid gap-3 rounded-3xl p-5 md:grid-cols-3" onSubmit={onCreate}>
        <input
          className="input"
          placeholder="Clinic name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <input
          className="input"
          placeholder="Code"
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
          required
        />
        <button className="btn-primary" type="submit">
          Create clinic
        </button>
      </form>
      <section className="grid gap-4 md:grid-cols-2">
        {clinics.length === 0 ? (
          <EmptyState title="No clinics" />
        ) : (
          clinics.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`glass-panel rounded-3xl p-5 text-left transition ${
                activeClinicId === c.id ? "ring-2 ring-brand-500" : "hover:bg-brand-50/40"
              }`}
              onClick={() => setActiveClinicId(c.id)}
            >
              <div className="font-display text-xl font-bold text-brand-900">{c.name}</div>
              <div className="mt-1 font-mono text-xs text-muted">{c.code}</div>
              <div className="mt-2 text-sm text-muted">{c.address || "No address"}</div>
              <div className="mt-3 text-xs font-semibold text-brand-700">
                {activeClinicId === c.id ? "Active context" : "Click to switch context"}
              </div>
            </button>
          ))
        )}
      </section>
    </div>
  );
}
