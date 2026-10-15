import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { markInboxRead } from "@/features/inbox/api/inboxApi";
import { useInboxStore } from "@/features/inbox/store/useInboxStore";
import { IconButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function relativeTime(iso?: string | null) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const items = useInboxStore((s) => s.items);
  const unread = useInboxStore((s) => s.unread);
  const markLocalRead = useInboxStore((s) => s.markLocalRead);
  const recent = useMemo(() => items.slice(0, 12), [items]);

  async function openItem(id: string, link?: string | null) {
    markLocalRead([id]);
    void markInboxRead({ ids: [id] }).catch(() => undefined);
    setOpen(false);
    if (link) navigate(link);
  }

  async function markAll() {
    markLocalRead("all");
    await markInboxRead({ all: true }).catch(() => undefined);
  }

  return (
    <div className="relative">
      <IconButton
        className="relative"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        <Bell size={18} aria-hidden />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </IconButton>
      {open && (
        <>
          <button type="button" className="fixed inset-0 z-40 cursor-default" aria-label="Close notifications" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-label="Notifications"
            className="glass-panel absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden shadow-lg"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
              <p className="text-sm font-semibold">Notifications</p>
              <button type="button" className="btn-ghost text-xs" onClick={() => void markAll()} disabled={!unread}>
                Mark all read
              </button>
            </div>
            <ul className="max-h-80 overflow-y-auto" aria-live="polite">
              {recent.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-muted">No notifications yet</li>
              )}
              {recent.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full flex-col gap-0.5 px-3 py-2.5 text-left text-sm transition hover:bg-black/5",
                      !item.read_at && "bg-brand-50/60",
                    )}
                    onClick={() => void openItem(item.id, item.link_path)}
                  >
                    <span className="font-medium text-ink">{item.title}</span>
                    <span className="text-muted">{item.body}</span>
                    <span className="text-xs capitalize text-muted">
                      {item.category} · {relativeTime(item.created_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="border-t border-border px-3 py-2">
              <button
                type="button"
                className="btn-ghost w-full justify-center text-sm"
                onClick={() => {
                  setOpen(false);
                  navigate("/billing/notifications");
                }}
              >
                Billing notification center
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
