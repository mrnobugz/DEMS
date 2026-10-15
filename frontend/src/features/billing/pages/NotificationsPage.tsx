import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { fetchInbox, markInboxRead } from "@/features/inbox/api/inboxApi";
import { useInboxStore } from "@/features/inbox/store/useInboxStore";
import type { StaffNotification } from "@/features/inbox/types";

function formatWhen(iso?: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const markLocalRead = useInboxStore((s) => s.markLocalRead);
  const setUnread = useInboxStore((s) => s.setUnread);
  const [items, setItems] = useState<StaffNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const liveItems = useInboxStore((s) => s.items);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetchInbox({ category: "billing", limit: 100 })
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load notifications");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const billingLive = liveItems.filter((row) => row.category === "billing");
    if (!billingLive.length) return;
    setItems((current) => {
      const seen = new Set(current.map((row) => row.id));
      const fresh = billingLive.filter((row) => !seen.has(row.id));
      return fresh.length ? [...fresh, ...current] : current;
    });
  }, [liveItems]);

  const visible = filter === "unread" ? items.filter((row) => !row.read_at) : items;

  async function openRow(row: StaffNotification) {
    if (!row.read_at) {
      markLocalRead([row.id]);
      setItems((current) =>
        current.map((item) => (item.id === row.id ? { ...item, read_at: new Date().toISOString() } : item)),
      );
      await markInboxRead({ ids: [row.id] }).catch(() => undefined);
    }
    if (row.link_path) navigate(row.link_path);
  }

  async function markAll() {
    markLocalRead("all");
    setItems((current) => current.map((row) => ({ ...row, read_at: row.read_at || new Date().toISOString() })));
    setUnread(0);
    await markInboxRead({ all: true }).catch(() => undefined);
  }

  return (
    <section className="space-y-3" aria-labelledby="billing-notifications-heading">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 id="billing-notifications-heading" className="font-display text-lg font-semibold text-brand-900">
            Billing notifications
          </h3>
          <p className="text-sm text-muted">
            Live alerts when pharmacy, lab, imaging, or chairside posts a bill to the ledger.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="admin-tabs" role="tablist" aria-label="Notification filter">
            <button
              type="button"
              role="tab"
              aria-selected={filter === "all"}
              className={`admin-tab ${filter === "all" ? "admin-tab--on" : ""}`}
              onClick={() => setFilter("all")}
            >
              All
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === "unread"}
              className={`admin-tab ${filter === "unread" ? "admin-tab--on" : ""}`}
              onClick={() => setFilter("unread")}
            >
              Unread
            </button>
          </div>
          <Button variant="ghost" onClick={() => void markAll()}>
            Mark all read
          </Button>
        </div>
      </div>

      <div aria-live="polite" className="sr-only">
        {loading ? "Loading notifications" : error || `${visible.length} notifications`}
      </div>

      {loading && <p className="text-sm text-muted">Loading notifications…</p>}
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && visible.length === 0 && (
        <EmptyState
          title="No billing alerts"
          hint="When another department creates or sends a bill, it appears here instantly."
        />
      )}
      {!loading && !error && visible.length > 0 && (
        <ul className="glass-panel divide-y divide-border overflow-hidden">
          {visible.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className={`flex w-full flex-col gap-1 px-4 py-3 text-left transition hover:bg-black/5 ${
                  !row.read_at ? "bg-brand-50/50" : ""
                }`}
                onClick={() => void openRow(row)}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">{row.title}</span>
                  <span className="text-xs text-muted">{formatWhen(row.created_at)}</span>
                </div>
                <span className="text-sm text-muted">{row.body}</span>
                <span className="text-xs uppercase tracking-wide text-muted">
                  {row.event_type.replaceAll(".", " ")}
                  {!row.read_at ? " · Unread" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
