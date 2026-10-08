import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { t, type StringKey } from "@/lib/i18n";
import { isNavGroup, navForRole, type NavItem } from "@/lib/nav";

type Hit = { to: string; label: string; group: string };

function destinations(role: string | undefined | null, permissions?: string[] | null): Hit[] {
  const hits: Hit[] = [];
  for (const entry of navForRole(role, permissions)) {
    if (isNavGroup(entry)) {
      const group = t(entry.labelKey as StringKey);
      for (const child of entry.children) hits.push(toHit(child, group));
    } else {
      hits.push(toHit(entry, "Workspace"));
    }
  }
  if (hits.some((hit) => hit.to === "/billing")) {
    hits.push(
      { to: "/billing/invoices", label: "Invoices", group: "Billing" },
      { to: "/billing/payments", label: "Payments", group: "Billing" },
    );
  }
  return hits;
}

function toHit(item: NavItem, group: string): Hit {
  return { to: item.to, label: t(item.labelKey as StringKey), group };
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const role = useAuth((s) => s.user?.role);
  const permissions = useAuth((s) => s.user?.effective_permissions);
  const [query, setQuery] = useState("");
  const items = useMemo(() => destinations(role, permissions), [role, permissions]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => `${item.label} ${item.group} ${item.to}`.toLowerCase().includes(needle));
  }, [items, query]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpenChange, open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  function go(to: string) {
    onOpenChange(false);
    navigate(to);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t("searchPages")} description="Jump to a page you can already open." className="max-w-lg">
        <label className="block text-sm">
          <span className="label">Find a page</span>
          <span className="search-field">
            <Search className="search-field__icon" size={18} aria-hidden />
            <input
              className="input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Patients, pharmacy, warehouse…"
              autoFocus
            />
          </span>
        </label>
        <ul className="mt-3 max-h-80 space-y-1 overflow-auto" role="listbox" aria-label={t("searchPages")}>
          {filtered.length === 0 && <li className="px-2 py-6 text-sm text-muted">No matching pages.</li>}
          {filtered.map((item) => (
            <li key={item.to}>
              <button
                type="button"
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left hover:bg-brand-50"
                onClick={() => go(item.to)}
              >
                <span>
                  <span className="block text-sm font-semibold text-ink">{item.label}</span>
                  <span className="block text-xs text-muted">{item.group}</span>
                </span>
                <span className="truncate font-mono text-[11px] text-muted">{item.to}</span>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
