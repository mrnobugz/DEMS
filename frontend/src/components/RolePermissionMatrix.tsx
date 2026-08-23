import { Fragment, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { hasEffectivePermission } from "@/lib/nav";
import type { PermissionCatalogItem, RoleCatalogItem } from "@/lib/types";

export function RolePermissionMatrix() {
  const [roles, setRoles] = useState<RoleCatalogItem[]>([]);
  const [catalog, setCatalog] = useState<PermissionCatalogItem[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api<RoleCatalogItem[]>("/api/v1/staff/roles"),
      api<PermissionCatalogItem[]>("/api/v1/staff/permissions"),
    ])
      .then(([r, p]) => {
        setRoles(r);
        setCatalog(p);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load role catalog"));
  }, []);

  const groups = catalog.reduce<Record<string, PermissionCatalogItem[]>>((acc, item) => {
    (acc[item.resource] ||= []).push(item);
    return acc;
  }, {});

  return (
    <section className="glass-panel space-y-3">
      <div>
        <h3 className="font-display text-base font-bold text-brand-900">Roles & permissions</h3>
        <p className="text-xs text-muted">
          System roles are the templates. Admins assign a role, then grant or deny extras on a person.
        </p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="admin-scroll overflow-x-auto">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Permission</th>
              {roles.map((role) => (
                <th key={role.id} className="text-center">
                  {role.label}
                  {!role.assignable && <div className="normal-case font-semibold text-[10px]">locked</div>}
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
                      <div className="text-[11px] text-muted">{perm.id}</div>
                    </td>
                    {roles.map((role) => {
                      const on = hasEffectivePermission(role.permissions, perm.id);
                      return (
                        <td key={role.id} className="text-center">
                          {on ? (
                            <span className="status-pill status-pill--success">Yes</span>
                          ) : (
                            <span className="text-[11px] text-muted">—</span>
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
    </section>
  );
}
