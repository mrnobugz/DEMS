import { api } from "@/lib/api";
import type { StaffNotification } from "@/features/inbox/types";

function query(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export function fetchInbox(filters: { category?: string; unread_only?: boolean; limit?: number } = {}) {
  return api<StaffNotification[]>(
    `/api/v1/inbox${query({
      category: filters.category,
      unread_only: filters.unread_only ? "true" : undefined,
      limit: filters.limit ? String(filters.limit) : undefined,
    })}`,
  );
}

export function fetchUnreadCount(category?: string) {
  return api<{ count: number }>(`/api/v1/inbox/unread-count${query({ category })}`);
}

export function markInboxRead(body: { ids?: string[]; all?: boolean }) {
  return api<{ updated: number }>("/api/v1/inbox/read", {
    method: "POST",
    body: JSON.stringify({ ids: body.ids ?? [], all: Boolean(body.all) }),
  });
}
