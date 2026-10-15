import { useEffect } from "react";
import { toast } from "@/components/ui/sonner";
import { fetchInbox, fetchUnreadCount } from "@/features/inbox/api/inboxApi";
import { useInboxStore } from "@/features/inbox/store/useInboxStore";
import type { StaffNotification } from "@/features/inbox/types";
import { useAuth } from "@/lib/auth";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

function canUseInbox(perms: string[] | undefined, role: string | undefined) {
  if (!role || role === "patient") return false;
  if (role === "super_admin" || role === "clinic_admin") return true;
  return Boolean(perms?.includes("inbox:read") || perms?.includes("*"));
}

export function useInboxStream() {
  const token = useAuth((s) => s.accessToken);
  const user = useAuth((s) => s.user);
  const activeClinicId = useAuth((s) => s.activeClinicId);
  const prepend = useInboxStore((s) => s.prepend);
  const bumpUnread = useInboxStore((s) => s.bumpUnread);
  const setItems = useInboxStore((s) => s.setItems);
  const setUnread = useInboxStore((s) => s.setUnread);
  const setConnected = useInboxStore((s) => s.setConnected);

  useEffect(() => {
    if (!token || !canUseInbox(user?.effective_permissions, user?.role)) {
      setConnected(false);
      return;
    }

    let closed = false;
    let source: EventSource | null = null;
    let retryTimer: number | undefined;
    let pollTimer: number | undefined;

    async function hydrate() {
      try {
        const [rows, count] = await Promise.all([fetchInbox({ limit: 40 }), fetchUnreadCount()]);
        if (closed) return;
        setItems(rows);
        setUnread(count.count);
      } catch {
        /* offline / no permission — ignore */
      }
    }

    function onNotification(raw: MessageEvent) {
      try {
        const item = JSON.parse(String(raw.data)) as StaffNotification;
        if (!item?.id) return;
        prepend(item);
        if (!item.read_at) {
          bumpUnread();
          toast(item.title, { description: item.body });
        }
      } catch {
        /* ignore malformed */
      }
    }

    function connect() {
      if (closed || !token) return;
      const params = new URLSearchParams({ access_token: token });
      if (user?.role === "super_admin" && activeClinicId) {
        /* EventSource cannot set headers; clinic context comes from JWT when possible */
      }
      source = new EventSource(`${API_BASE}/api/v1/inbox/stream?${params.toString()}`);
      source.addEventListener("notification", onNotification as EventListener);
      source.onopen = () => setConnected(true);
      source.onerror = () => {
        setConnected(false);
        source?.close();
        source = null;
        if (!closed) {
          retryTimer = window.setTimeout(connect, 4000);
        }
      };
    }

    void hydrate();
    connect();
    // Fallback poll if SSE drops silently
    pollTimer = window.setInterval(() => {
      if (closed) return;
      void fetchUnreadCount()
        .then((count) => {
          if (!closed) setUnread(count.count);
        })
        .catch(() => undefined);
    }, 30000);

    return () => {
      closed = true;
      setConnected(false);
      source?.close();
      if (retryTimer) window.clearTimeout(retryTimer);
      if (pollTimer) window.clearInterval(pollTimer);
    };
  }, [
    token,
    user?.role,
    user?.effective_permissions,
    activeClinicId,
    prepend,
    bumpUnread,
    setItems,
    setUnread,
    setConnected,
  ]);
}
