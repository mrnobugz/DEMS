import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ConfigStatus, onTabListKeyDown } from "@/components/config/ConfigUi";
import { OrganizationPanel } from "@/components/OrganizationPanel";
import { ClinicalCatalogsPanel } from "@/components/ClinicalCatalogsPanel";
import { FinancialConfigPanel } from "@/components/FinancialConfigPanel";
import { RolePermissionMatrix } from "@/components/RolePermissionMatrix";
import { StaffUserManager } from "@/components/StaffUserManager";
import { TemplatesSetupPanel } from "@/components/TemplatesSetupPanel";
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

type AdminView = "organization" | "staff" | "roles" | "clinical" | "fees" | "templates" | "ops";

const VIEWS: { id: AdminView; label: string }[] = [
  { id: "organization", label: "Organization" },
  { id: "staff", label: "Users" },
  { id: "roles", label: "Roles" },
  { id: "clinical", label: "Clinical" },
  { id: "fees", label: "Fees" },
  { id: "templates", label: "Templates" },
  { id: "ops", label: "Operations" },
];

const VIEW_IDS = VIEWS.map((v) => v.id);

function pretty(value: string) {
  return value.replaceAll("_", " ").replaceAll("-", " ");
}

function parseView(raw: string | null): AdminView {
  if (
    raw === "staff" ||
    raw === "roles" ||
    raw === "clinical" ||
    raw === "fees" ||
    raw === "procedures" ||
    raw === "templates" ||
    raw === "ops" ||
    raw === "organization"
  ) {
    return raw === "procedures" ? "fees" : raw;
  }
  return "organization";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function setView(next: AdminView) {
    const nextParams = new URLSearchParams(params);
    if (next === "organization") nextParams.delete("view");
    else nextParams.set("view", next);
    setParams(nextParams, { replace: true });
  }

  async function load() {
    const [s, c, sh, lv, procs] = await Promise.all([
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
    setProcCount(procs.length);
  }

  useEffect(() => {
    setLoading(true);
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
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
          <h2 className="font-display text-xl font-bold leading-tight text-brand-900">Configurations</h2>
          <p className="text-sm text-muted">
            Clinic setup: organization, users, roles, catalogs, fees, templates, and operations.
          </p>
        </div>
        <div className="admin-counts" role="status" aria-label="Setup summary">
          <span className="admin-count">
            <strong>{staff.length}</strong> users
          </span>
          <span className="admin-count">
            <strong>{procCount}</strong> procedures
          </span>
          <span className={`admin-count ${certs.length ? "admin-count--alert" : ""}`}>
            <strong>{certs.length}</strong> certs due
          </span>
        </div>
      </div>

      <div
        className="admin-tabs"
        role="tablist"
        aria-label="Configuration sections"
        onKeyDown={(e) =>
          onTabListKeyDown(e, VIEW_IDS, view, (id) => {
            setView(id);
            queueMicrotask(() => document.getElementById(`admin-tab-${id}`)?.focus());
          })
        }
      >
        {VIEWS.map((v) => (
          <button
            key={v.id}
            id={`admin-tab-${v.id}`}
            type="button"
            role="tab"
            aria-selected={view === v.id}
            aria-controls={`admin-panel-${v.id}`}
            tabIndex={view === v.id ? 0 : -1}
            className={`admin-tab ${view === v.id ? "admin-tab--on" : ""}`}
            onClick={() => setView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>

      <ConfigStatus loading={loading} error={error} />

      <div id={`admin-panel-${view}`} role="tabpanel" aria-labelledby={`admin-tab-${view}`}>
        {view === "organization" && <OrganizationPanel />}
        {view === "staff" && (
          <StaffUserManager staff={staff} currentUserId={currentUserId} onChanged={load} />
        )}
        {view === "roles" && <RolePermissionMatrix />}
        {view === "clinical" && <ClinicalCatalogsPanel />}
        {view === "fees" && <FinancialConfigPanel onProcCount={(n) => setProcCount(n)} />}
        {view === "templates" && <TemplatesSetupPanel />}

        {view === "ops" && (
          <div className="grid gap-3 lg:grid-cols-3">
            <section className="glass-panel">
              <h3 className="reg-section__title">Certificates expiring in 30 days</h3>
              {certs.length === 0 ? (
                <p className="text-sm text-muted">No certificates due. Staff licenses look current.</p>
              ) : (
                <ul className="admin-list">
                  {certs.map((c) => {
                    const days = daysUntil(c.cert_expires_at);
                    return (
                      <li key={c.user_id}>
                        <div>
                          <div className="font-semibold">{c.full_name}</div>
                          <div className="text-xs text-muted">
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
                <p className="text-sm text-muted">No upcoming shifts on the roster.</p>
              ) : (
                <ul className="admin-list">
                  {upcomingShifts.slice(0, 12).map((s) => (
                    <li key={s.id}>
                      <div>
                        <div className="font-semibold">{names.get(s.user_id) || s.role_label || "Shift"}</div>
                        <div className="text-xs text-muted">
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
                <p className="text-sm text-muted">No leave recorded.</p>
              ) : (
                <ul className="admin-list">
                  {leaves.slice(0, 12).map((l) => (
                    <li key={l.id}>
                      <div>
                        <div className="font-semibold">{names.get(l.user_id) || l.user_id.slice(0, 8)}</div>
                        <div className="text-xs text-muted">
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
    </div>
  );
}
