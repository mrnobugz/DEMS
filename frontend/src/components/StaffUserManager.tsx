import { FormEvent, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import type { Operatory } from "@/components/OrganizationPanel";
import { api, ApiError } from "@/lib/api";
import { hasEffectivePermission } from "@/lib/nav";
import type { PermissionCatalogItem, RoleCatalogItem, StaffMember } from "@/lib/types";

const DEPARTMENTS = [
  { id: "front-desk", label: "Front desk" },
  { id: "restorative", label: "Restorative" },
  { id: "maxillofacial", label: "Maxillofacial" },
  { id: "orthodontic", label: "Orthodontic" },
  { id: "paediatric", label: "Paediatric" },
  { id: "hygiene", label: "Hygiene" },
  { id: "imaging", label: "Imaging" },
  { id: "lab", label: "Lab" },
  { id: "pharmacy", label: "Pharmacy" },
  { id: "admin", label: "Admin" },
];

const FALLBACK_ROLES: RoleCatalogItem[] = [
  "clinic_admin",
  "dentist",
  "hygienist",
  "nurse",
  "receptionist",
  "accountant",
  "lab_tech",
  "pharmacy",
  "imaging_tech",
].map((id) => ({
  id,
  label: id.replaceAll("_", " "),
  assignable: true,
  permissions: [],
}));

type Override = "inherit" | "grant" | "deny";

function pretty(value: string) {
  return value.replaceAll("_", " ").replaceAll("-", " ");
}

function overrideFor(staff: StaffMember, perm: string): Override {
  if (staff.denied_permissions?.includes(perm)) return "deny";
  if (staff.extra_permissions?.includes(perm)) return "grant";
  return "inherit";
}

function emptyUser(role = "receptionist"): StaffMember {
  return {
    id: "",
    email: "",
    full_name: "",
    role,
    phone: "",
    specialty: "",
    is_active: true,
    extra_permissions: [],
    denied_permissions: [],
    effective_permissions: [],
    profile: {
      department: "front-desk",
      title: "",
      notes: "",
      license_no: "",
      is_scheduling_provider: true,
      production_goal: null,
      commission_rate_bps: 0,
      cert_expires_at: "",
      default_operatory_id: "",
    },
  };
}

function PermissionPicker({
  catalog,
  roles,
  roleId,
  overrides,
  onChange,
}: {
  catalog: PermissionCatalogItem[];
  roles: RoleCatalogItem[];
  roleId: string;
  overrides: Record<string, Override>;
  onChange: (next: Record<string, Override>) => void;
}) {
  const rolePerms = roles.find((r) => r.id === roleId)?.permissions || [];
  const groups = useMemo(() => {
    const map = new Map<string, PermissionCatalogItem[]>();
    for (const item of catalog) {
      const list = map.get(item.resource) || [];
      list.push(item);
      map.set(item.resource, list);
    }
    return [...map.entries()];
  }, [catalog]);

  if (!catalog.length) {
    return <p className="text-xs text-muted">Loading permission catalog…</p>;
  }

  return (
    <div>
      <h4 className="reg-section__title">Permissions</h4>
      <p className="mb-2 text-[11px] text-muted">
        Role sets the defaults. Grant adds access; deny removes it even if the role has it.
      </p>
      <div className="admin-scroll space-y-2">
        {groups.map(([resource, items]) => (
          <div key={resource}>
            <div className="text-[11px] font-bold capitalize text-brand-800">{resource}</div>
            <ul className="admin-list">
              {items.map((perm) => {
                const inRole = hasEffectivePermission(rolePerms, perm.id);
                return (
                  <li key={perm.id} className="items-center">
                    <div>
                      <div className="font-semibold">{perm.label}</div>
                      <div className="text-[11px] text-muted">
                        {perm.id}
                        {inRole ? " · included in role" : ""}
                      </div>
                    </div>
                    <select
                      className="input w-28"
                      value={overrides[perm.id] || "inherit"}
                      onChange={(e) =>
                        onChange({ ...overrides, [perm.id]: e.target.value as Override })
                      }
                    >
                      <option value="inherit">{inRole ? "Allow (role)" : "Off (role)"}</option>
                      <option value="grant">Grant</option>
                      <option value="deny">Deny</option>
                    </select>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StaffUserManager({
  staff,
  currentUserId,
  onChanged,
}: {
  staff: StaffMember[];
  currentUserId?: string;
  onChanged: () => Promise<void>;
}) {
  const [roles, setRoles] = useState<RoleCatalogItem[]>([]);
  const [catalog, setCatalog] = useState<PermissionCatalogItem[]>([]);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<StaffMember | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [password, setPassword] = useState("Demsta!Temp1");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [operatories, setOperatories] = useState<Operatory[]>([]);

  useEffect(() => {
    Promise.all([
      api<RoleCatalogItem[]>("/api/v1/staff/roles"),
      api<PermissionCatalogItem[]>("/api/v1/staff/permissions"),
      api<Operatory[]>("/api/v1/config/operatories").catch(() => []),
    ])
      .then(([r, p, o]) => {
        setRoles(r);
        setCatalog(p);
        setOperatories(o);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load roles"));
  }, []);

  const assignable = useMemo(() => {
    const rows = roles.filter((r) => r.assignable);
    return rows.length ? rows : FALLBACK_ROLES;
  }, [roles]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return staff.filter((s) => {
      if (roleFilter !== "all" && s.role !== roleFilter) return false;
      if (statusFilter === "active" && !s.is_active) return false;
      if (statusFilter === "inactive" && s.is_active) return false;
      if (!q) return true;
      const hay = `${s.full_name} ${s.email} ${s.role} ${s.specialty || ""} ${s.profile?.department || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [staff, query, roleFilter, statusFilter]);

  function listsFromOverrides() {
    return {
      extra_permissions: catalog.filter((p) => overrides[p.id] === "grant").map((p) => p.id),
      denied_permissions: catalog.filter((p) => overrides[p.id] === "deny").map((p) => p.id),
    };
  }

  function openCreate() {
    setCreating(true);
    setSelectedId(null);
    setDraft(emptyUser());
    setOverrides({});
    setPassword("Demsta!Temp1");
    setError("");
    setMsg("");
  }

  function openEditor(row: StaffMember) {
    setCreating(false);
    setSelectedId(row.id);
    setDraft({ ...row, profile: { ...row.profile } });
    const next: Record<string, Override> = {};
    for (const perm of catalog) next[perm.id] = overrideFor(row, perm.id);
    setOverrides(next);
    setPassword("");
    setError("");
    setMsg("");
  }

  function closeEditor() {
    setCreating(false);
    setSelectedId(null);
    setDraft(null);
  }

  useEffect(() => {
    if (creating || !selectedId) return;
    const row = staff.find((s) => s.id === selectedId);
    if (!row) return;
    setDraft({ ...row, profile: { ...row.profile } });
    const next: Record<string, Override> = {};
    for (const perm of catalog) next[perm.id] = overrideFor(row, perm.id);
    setOverrides(next);
  }, [staff, selectedId, catalog, creating]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError("");
    setMsg("");
    const lists = listsFromOverrides();
    try {
      if (creating) {
        if (password.trim().length < 8) {
          throw new ApiError(422, "VALIDATION_ERROR", "Password must be at least 8 characters");
        }
        const created = await api<StaffMember>("/api/v1/staff", {
          method: "POST",
          body: JSON.stringify({
            email: draft.email,
            password: password.trim(),
            full_name: draft.full_name,
            role: draft.role,
            phone: draft.phone || null,
            specialty: draft.specialty || null,
            title: draft.profile?.title || null,
            department: draft.profile?.department || null,
            license_no: draft.profile?.license_no || null,
            default_operatory_id: draft.profile?.default_operatory_id || null,
            production_goal: draft.profile?.production_goal ?? null,
            commission_rate_bps: draft.profile?.commission_rate_bps ?? 0,
            is_scheduling_provider: draft.profile?.is_scheduling_provider ?? true,
            extra_permissions: lists.extra_permissions,
            denied_permissions: lists.denied_permissions,
          }),
        });
        setMsg("User created with the selected role and permissions.");
        await onChanged();
        openEditor(created);
      } else {
        await api(`/api/v1/staff/${draft.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            email: draft.email,
            full_name: draft.full_name,
            role: draft.role,
            phone: draft.phone || null,
            specialty: draft.specialty || null,
            title: draft.profile?.title || null,
            department: draft.profile?.department || null,
            notes: draft.profile?.notes || null,
            license_no: draft.profile?.license_no || null,
            default_operatory_id: draft.profile?.default_operatory_id || null,
            production_goal: draft.profile?.production_goal ?? null,
            commission_rate_bps: draft.profile?.commission_rate_bps ?? 0,
            is_scheduling_provider: draft.profile?.is_scheduling_provider ?? true,
            cert_expires_at: draft.profile?.cert_expires_at || null,
            is_active: draft.is_active,
            extra_permissions: lists.extra_permissions,
            denied_permissions: lists.denied_permissions,
          }),
        });
        if (password.trim()) {
          await api(`/api/v1/staff/${draft.id}/password`, {
            method: "POST",
            body: JSON.stringify({ password: password.trim() }),
          });
          setPassword("");
        }
        setMsg("User saved.");
        await onChanged();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : creating ? "Could not create user" : "Could not save user");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,28rem)]">
      <section className="glass-panel space-y-3">
        <div className="admin-toolbar">
          <input
            className="input"
            type="search"
            placeholder="Search name, email, role…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select className="input" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="all">All roles</option>
            {assignable.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          >
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <button type="button" className={creating ? "btn-primary" : "btn-ghost"} onClick={openCreate}>
            Create user
          </button>
        </div>

        {filtered.length === 0 ? (
          <EmptyState title="No matching staff" hint="Create a user and assign a role plus permissions." />
        ) : (
          <div className="admin-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Access</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const extras = s.extra_permissions?.length || 0;
                  const denies = s.denied_permissions?.length || 0;
                  return (
                    <tr
                      key={s.id}
                      className={selectedId === s.id ? "bg-brand-50" : "cursor-pointer"}
                      onClick={() => openEditor(s)}
                    >
                      <td>
                        <div className="font-semibold text-brand-900">{s.full_name}</div>
                        <div className="text-[11px] text-muted">{s.email}</div>
                      </td>
                      <td>
                        <span className="status-pill status-pill--info">{pretty(s.role)}</span>
                        <div className="mt-0.5 text-[11px] capitalize text-muted">
                          {pretty(s.profile?.department || "—")}
                        </div>
                      </td>
                      <td className="text-[11px] text-muted">
                        {extras || denies ? `${extras} grant · ${denies} deny` : "Role default"}
                      </td>
                      <td>
                        <span className={`status-pill ${s.is_active ? "status-pill--success" : "status-pill--warning"}`}>
                          {s.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-muted">
          {filtered.length} of {staff.length} people · create a user or click a row to assign access
        </p>
      </section>

      <section className="glass-panel space-y-3">
        {!draft ? (
          <div className="space-y-2">
            <p className="text-xs text-muted">
              Create a clinic user, pick their role, then grant or deny permissions before they sign in.
            </p>
            <button type="button" className="btn-primary w-full" onClick={openCreate}>
              Create user
            </button>
          </div>
        ) : (
          <form className="space-y-3" onSubmit={onSubmit}>
            <div className="clin-head">
              <div>
                <h3 className="font-display text-base font-bold text-brand-900">
                  {creating ? "New user" : draft.full_name}
                </h3>
                <p className="text-xs text-muted">
                  {creating ? "Assign a role and optional permission overrides." : draft.email}
                </p>
              </div>
              <button type="button" className="btn-ghost text-xs" onClick={closeEditor}>
                Close
              </button>
            </div>
            <div className="reg-fields">
              <label className="text-xs">
                <span className="label">Full name</span>
                <input
                  className="input"
                  value={draft.full_name}
                  onChange={(e) => setDraft({ ...draft, full_name: e.target.value })}
                  required
                />
              </label>
              <label className="text-xs">
                <span className="label">Email</span>
                <input
                  className="input"
                  type="email"
                  value={draft.email}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                  required
                />
              </label>
              <label className="text-xs">
                <span className="label">Role</span>
                <select
                  className="input"
                  value={draft.role}
                  disabled={!creating && draft.id === currentUserId}
                  onChange={(e) => setDraft({ ...draft, role: e.target.value })}
                >
                  {assignable.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                <span className="label">Department</span>
                <select
                  className="input"
                  value={draft.profile?.department || ""}
                  onChange={(e) =>
                    setDraft({ ...draft, profile: { ...draft.profile, department: e.target.value } })
                  }
                >
                  <option value="">—</option>
                  {DEPARTMENTS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                <span className="label">Title</span>
                <input
                  className="input"
                  value={draft.profile?.title || ""}
                  onChange={(e) => setDraft({ ...draft, profile: { ...draft.profile, title: e.target.value } })}
                />
              </label>
              <label className="text-xs">
                <span className="label">Specialty</span>
                <input
                  className="input"
                  value={draft.specialty || ""}
                  onChange={(e) => setDraft({ ...draft, specialty: e.target.value })}
                />
              </label>
              <label className="text-xs">
                <span className="label">Phone</span>
                <input
                  className="input"
                  value={draft.phone || ""}
                  onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                />
              </label>
              <label className="text-xs">
                <span className="label">License / provider no.</span>
                <input
                  className="input"
                  value={draft.profile?.license_no || ""}
                  onChange={(e) =>
                    setDraft({ ...draft, profile: { ...draft.profile, license_no: e.target.value } })
                  }
                />
              </label>
              <label className="text-xs">
                <span className="label">Default chair</span>
                <select
                  className="input"
                  value={draft.profile?.default_operatory_id || ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      profile: { ...draft.profile, default_operatory_id: e.target.value },
                    })
                  }
                >
                  <option value="">—</option>
                  {operatories.map((op) => (
                    <option key={op.id} value={op.id}>
                      {op.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                <span className="label">Cert expires</span>
                <input
                  className="input"
                  type="date"
                  value={draft.profile?.cert_expires_at || ""}
                  onChange={(e) =>
                    setDraft({ ...draft, profile: { ...draft.profile, cert_expires_at: e.target.value } })
                  }
                />
              </label>
              <label className="text-xs">
                <span className="label">Production goal</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={draft.profile?.production_goal ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      profile: {
                        ...draft.profile,
                        production_goal: e.target.value ? Number(e.target.value) : null,
                      },
                    })
                  }
                />
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={draft.profile?.is_scheduling_provider !== false}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      profile: { ...draft.profile, is_scheduling_provider: e.target.checked },
                    })
                  }
                />
                Appears on the appointment book
              </label>
              {!creating && (
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={draft.is_active}
                    disabled={draft.id === currentUserId}
                    onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
                  />
                  Active account
                </label>
              )}
            </div>

            <PermissionPicker
              catalog={catalog}
              roles={assignable}
              roleId={draft.role}
              overrides={overrides}
              onChange={setOverrides}
            />

            <label className="text-xs">
              <span className="label">{creating ? "Temporary password" : "Reset password"}</span>
              <input
                className="input"
                type="password"
                placeholder={creating ? "Required" : "Leave blank to keep current"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required={creating}
                minLength={8}
              />
            </label>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {msg && <p className="text-sm text-brand-700">{msg}</p>}
            <button className="btn-primary w-full" type="submit" disabled={saving}>
              {saving ? "Saving…" : creating ? "Create user" : "Save user"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
