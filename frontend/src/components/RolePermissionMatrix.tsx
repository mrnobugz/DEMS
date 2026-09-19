import { Fragment, useEffect, useState } from "react";
import { ConfigStatus } from "@/components/config/ConfigUi";
import { api, ApiError } from "@/lib/api";
import { hasEffectivePermission } from "@/lib/nav";
import type { PermissionCatalogItem, RoleCatalogItem } from "@/lib/types";

const LOCKED = new Set(["super_admin", "patient"]);

export function RolePermissionMatrix() {
  const [roles, setRoles] = useState<RoleCatalogItem[]>([]);
  const [catalog, setCatalog] = useState<PermissionCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState<string>("");

  async function load() {
    const [r, p] = await Promise.all([
      api<RoleCatalogItem[]>("/api/v1/config/roles"),
      api<PermissionCatalogItem[]>("/api/v1/staff/permissions"),
    ]);
    setRoles(r);
    setCatalog(p);
  }

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load role catalog"))
      .finally(() => setLoading(false));
  }, []);

  const groups = catalog.reduce<Record<string, PermissionCatalogItem[]>>((acc, item) => {
    (acc[item.resource] ||= []).push(item);
    return acc;
  }, {});

  async function toggle(role: RoleCatalogItem, perm: PermissionCatalogItem, next: boolean) {
    setError("");
    setOk("");
    setBusy(`${role.id}:${perm.id}`);
    try {
      await api(`/api/v1/config/roles/${role.id}/permissions`, {
        method: "PUT",
        body: JSON.stringify({ permission_id: perm.id, allowed: next }),
      });
      setRoles((all) =>
        all.map((row) => {
          if (row.id !== role.id) return row;
          const permissions = next
            ? Array.from(new Set([...row.permissions, perm.id]))
            : row.permissions.filter((id) => id !== perm.id);
          return { ...row, permissions };
        }),
      );
      setOk(`${role.label}: ${perm.label} ${next ? "allowed" : "removed"}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update permission");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="glass-panel space-y-3">
      <div>
        <h3 className="font-display text-base font-bold text-brand-900">Roles & permissions</h3>
        <p className="text-sm text-muted">
          Edit the clinic matrix, then grant or deny extras on a person. Core clinic-admin access cannot be revoked.
        </p>
      </div>
      <ConfigStatus loading={loading} error={error} ok={ok} />
      {!loading && catalog.length === 0 ? (
        <p className="text-sm text-muted">No permissions in the catalog yet.</p>
      ) : (
        <div className="admin-scroll overflow-x-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Permission</th>
                {roles.map((role) => (
                  <th key={role.id} className="text-center">
                    {role.label}
                    {LOCKED.has(role.id) && <div className="normal-case font-semibold text-xs">locked</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(groups).map(([resource, items]) => (
                <Fragment key={resource}>
                  <tr>
                    <td colSpan={roles.length + 1} className="bg-brand-50 font-bold capitalize text-brand-800">
                      {resource}
                    </td>
                  </tr>
                  {items.map((perm) => (
                    <tr key={perm.id}>
                      <td>
                        <div className="font-semibold">{perm.label}</div>
                        <div className="text-xs text-muted">{perm.id}</div>
                      </td>
                      {roles.map((role) => {
                        const on = hasEffectivePermission(role.permissions, perm.id);
                        const locked = LOCKED.has(role.id);
                        return (
                          <td key={role.id} className="text-center">
                            {locked ? (
                              on ? (
                                <span className="status-pill status-pill--success">Yes</span>
                              ) : (
                                <span className="text-xs text-muted">No</span>
                              )
                            ) : (
                              <input
                                type="checkbox"
                                aria-label={`${role.label}: ${perm.label}`}
                                checked={on}
                                disabled={busy === `${role.id}:${perm.id}`}
                                onChange={(e) => void toggle(role, perm, e.target.checked)}
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
