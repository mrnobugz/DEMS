import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ProcedureCatalogAdmin } from "@/components/ProcedureCatalogAdmin";
import { RolePermissionMatrix } from "@/components/RolePermissionMatrix";
import { StaffUserManager } from "@/components/StaffUserManager";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { FeeScheduleItem, StaffMember } from "@/lib/types";

type CertRow = {
  user_id: string;
  full_name: string;
  cert_expires_at?: string | null;
  title?: string | null;
};

type ShiftRow = {
  id: string;
  user_id: string;
  starts_at: string;
  ends_at: string;
  role_label?: string | null;
};

type LeaveRow = {
  id: string;
  user_id: string;
  starts_on: string;
  ends_on: string;
  leave_type: string;
  status: string;
};

type AdminView = "staff" | "roles" | "procedures" | "ops";

const VIEWS: { id: AdminView; label: string }[] = [
  { id: "staff", label: "Users" },
  { id: "roles", label: "Roles" },
  { id: "procedures", label: "Procedures" },
  { id: "ops", label: "Operations" },
];

function pretty(value: string) {
  return value.replaceAll("_", " ").replaceAll("-", " ");
}

function parseView(raw: string | null): AdminView {
  if (raw === "roles" || raw === "procedures" || raw === "ops" || raw === "staff") return raw;
  return "staff";
}

function daysUntil(iso?: string | null) {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export function ClinicAdminPage() {
  const [params, setParams] = useSearchParams();
  const view = parseView(params.get("view"));
  const currentUserId = useAuth((s) => s.user?.id);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [certs, setCerts] = useState<CertRow[]>([]);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [procCount, setProcCount] = useState(0);
  const [error, setError] = useState("");

  function setView(next: AdminView) {
    const nextParams = new URLSearchParams(params);
    if (next === "staff") nextParams.delete("view");
    else nextParams.set("view", next);
    setParams(nextParams, { replace: true });
  }

  async function load() {
    const [s, c, sh, lv, fees] = await Promise.all([
      api<StaffMember[]>("/api/v1/staff"),
      api<CertRow[]>("/api/v1/staff/cert-expiring?days=30").catch(() => []),
      api<ShiftRow[]>("/api/v1/staff/shifts").catch(() => []),
      api<LeaveRow[]>("/api/v1/staff/leaves").catch(() => []),
      api<FeeScheduleItem[]>("/api/v1/billing/fee-schedule").catch(() => []),
    ]);
    setStaff(s);
    setCerts(c);
    setShifts(sh);
    setLeaves(lv);
    setProcCount(fees.length);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of staff) m.set(s.id, s.full_name);
    return m;
  }, [staff]);

  const upcomingShifts = useMemo(() => {
    const now = Date.now();
    return [...shifts]
      .filter((s) => new Date(s.ends_at).getTime() >= now)
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  }, [shifts]);

  return (
    <div className="clin-shell admin-shell animate-rise space-y-3">
      <div className="clin-head">
        <div>
          <h2 className="font-display text-xl font-bold leading-tight text-brand-900">Clinic admin</h2>
          <p className="text-xs text-muted">Users, roles, procedure prices, and operations.</p>
        </div>
        <div className="admin-counts" role="group" aria-label="Admin summaries">
          <button
            type="button"
            className={`admin-count ${view === "staff" ? "admin-count--on" : ""}`}
            onClick={() => setView("staff")}
          >
            <strong>{staff.length}</strong> users
          </button>
          <button
            type="button"
            className={`admin-count ${view === "roles" ? "admin-count--on" : ""}`}
            onClick={() => setView("roles")}
          >
            <strong>Roles</strong>
          </button>
          <button
            type="button"
            className={`admin-count ${view === "procedures" ? "admin-count--on" : ""}`}
            onClick={() => setView("procedures")}
          >
            <strong>{procCount}</strong> procedures
          </button>
          <button
            type="button"
            className={`admin-count ${certs.length ? "admin-count--alert" : ""} ${view === "ops" ? "admin-count--on" : ""}`}
            onClick={() => setView("ops")}
          >
            <strong>{certs.length}</strong> certs due
          </button>
        </div>
      </div>

      <div className="admin-tabs" role="tablist" aria-label="Admin views">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={view === v.id}
            className={`admin-tab ${view === v.id ? "admin-tab--on" : ""}`}
            onClick={() => setView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {view === "staff" && (
        <StaffUserManager staff={staff} currentUserId={currentUserId} onChanged={load} />
      )}
      {view === "roles" && <RolePermissionMatrix />}
      {view === "procedures" && <ProcedureCatalogAdmin onCount={(n) => setProcCount(n)} />}

      {view === "ops" && (
        <div className="grid gap-3 lg:grid-cols-3">
          <section className="glass-panel">
            <h3 className="reg-section__title">Certs expiring · 30d</h3>
            {certs.length === 0 ? (
              <p className="text-xs text-muted">None due.</p>
            ) : (
              <ul className="admin-list">
                {certs.map((c) => {
                  const days = daysUntil(c.cert_expires_at);
                  return (
                    <li key={c.user_id}>
                      <div>
                        <div className="font-semibold">{c.full_name}</div>
                        <div className="text-[11px] text-muted">
                          {c.title || "Certificate"} · {c.cert_expires_at}
                        </div>
                      </div>
                      {days != null && (
                        <span className={`status-pill ${days <= 7 ? "status-pill--danger" : "status-pill--warning"}`}>
                          {days}d
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <section className="glass-panel">
            <h3 className="reg-section__title">Upcoming shifts</h3>
            {upcomingShifts.length === 0 ? (
              <p className="text-xs text-muted">No upcoming shifts.</p>
            ) : (
              <ul className="admin-list">
                {upcomingShifts.slice(0, 12).map((s) => (
                  <li key={s.id}>
                    <div>
                      <div className="font-semibold">{names.get(s.user_id) || s.role_label || "Shift"}</div>
                      <div className="text-[11px] text-muted">
                        {new Date(s.starts_at).toLocaleString()} → {new Date(s.ends_at).toLocaleTimeString()}
                      </div>
                    </div>
                    {s.role_label && <span className="status-pill status-pill--info">{s.role_label}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="glass-panel">
            <h3 className="reg-section__title">Leave</h3>
            {leaves.length === 0 ? (
              <p className="text-xs text-muted">No leave recorded.</p>
            ) : (
              <ul className="admin-list">
                {leaves.slice(0, 12).map((l) => (
                  <li key={l.id}>
                    <div>
                      <div className="font-semibold">{names.get(l.user_id) || l.user_id.slice(0, 8)}</div>
                      <div className="text-[11px] text-muted">
                        {pretty(l.leave_type)} · {l.starts_on} → {l.ends_on}
                      </div>
                    </div>
                    <span className="status-pill status-pill--info">{pretty(l.status)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
