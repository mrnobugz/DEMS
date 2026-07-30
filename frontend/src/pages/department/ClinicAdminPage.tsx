import { FormEvent, useEffect, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { api } from "@/lib/api";
import { StatGrid, useDepartmentHome } from "./FrontClinicalPages";

type Staff = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  specialty?: string | null;
};

const ROLES = [
  "clinic_admin",
  "dentist",
  "hygienist",
  "receptionist",
  "accountant",
  "lab_tech",
  "pharmacy",
  "imaging_tech",
];

export function ClinicAdminPage() {
  const { home } = useDepartmentHome();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [certs, setCerts] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    email: "",
    password: "Demsta!Temp1",
    full_name: "",
    role: "receptionist",
    department: "front-desk",
  });

  async function load() {
    const [s, c, sh] = await Promise.all([
      api<Staff[]>("/api/v1/staff"),
      api<any[]>("/api/v1/staff/cert-expiring?days=30").catch(() => []),
      api<any[]>("/api/v1/staff/shifts").catch(() => []),
    ]);
    setStaff(s);
    setCerts(c);
    setShifts(sh);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/api/v1/staff", { method: "POST", body: JSON.stringify(form) });
      setForm({ ...form, email: "", full_name: "" });
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="animate-rise space-y-6">
      <div>
        <h2 className="font-display text-3xl font-bold text-brand-900">Clinic admin</h2>
        <p className="text-sm text-muted">Staff roster and department assignments.</p>
      </div>
      {home && <StatGrid home={home} />}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <form className="glass-panel grid gap-3 rounded-3xl p-5 md:grid-cols-2" onSubmit={onInvite}>
        <input
          className="input"
          placeholder="Full name"
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          required
        />
        <input
          className="input"
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
        />
        <select
          className="input"
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <input
          className="input"
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          required
        />
        <button className="btn-primary md:col-span-2" type="submit">
          Invite staff
        </button>
      </form>
      <section className="glass-panel rounded-3xl p-5">
        <h3 className="font-display text-lg font-bold">Staff</h3>
        {staff.length === 0 ? (
          <EmptyState title="No staff" />
        ) : (
          <ul className="mt-3 divide-y divide-brand-100">
            {staff.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <div className="font-semibold">{s.full_name}</div>
                  <div className="text-xs text-muted">{s.email}</div>
                </div>
                <span className="status-pill status-pill--info capitalize">
                  {s.role.replaceAll("_", " ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="glass-panel rounded-3xl p-5">
          <h3 className="font-display text-lg font-bold">Certs expiring (30d)</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {certs.map((c) => (
              <li key={c.user_id}>
                {c.full_name} · {c.cert_expires_at}
              </li>
            ))}
            {certs.length === 0 && <li className="text-muted">None</li>}
          </ul>
        </section>
        <section className="glass-panel rounded-3xl p-5">
          <h3 className="font-display text-lg font-bold">Shifts</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {shifts.map((s) => (
              <li key={s.id}>
                {s.role_label || "Shift"} · {new Date(s.starts_at).toLocaleString()}
              </li>
            ))}
            {shifts.length === 0 && <li className="text-muted">None</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
