import { create } from "zustand";
import type { StaffNotification } from "@/features/inbox/types";

type InboxState = {
  items: StaffNotification[];
  unread: number;
  connected: boolean;
  setItems: (items: StaffNotification[]) => void;
  prepend: (item: StaffNotification) => void;
  setUnread: (count: number) => void;
  bumpUnread: () => void;
  markLocalRead: (ids: string[] | "all") => void;
  setConnected: (value: boolean) => void;
};

export const useInboxStore = create<InboxState>((set) => ({
  items: [],
  unread: 0,
  connected: false,
  setItems: (items) => set({ items }),
  prepend: (item) =>
    set((state) => {
      if (state.items.some((row) => row.id === item.id)) return state;
      return { items: [item, ...state.items].slice(0, 100) };
    }),
  setUnread: (unread) => set({ unread }),
  bumpUnread: () => set((state) => ({ unread: state.unread + 1 })),
  markLocalRead: (ids) =>
    set((state) => {
      const now = new Date().toISOString();
      const items =
        ids === "all"
          ? state.items.map((row) => (row.read_at ? row : { ...row, read_at: now }))
          : state.items.map((row) => (ids.includes(row.id) ? { ...row, read_at: now } : row));
      const unread = items.filter((row) => !row.read_at).length;
      return { items, unread };
    }),
  setConnected: (connected) => set({ connected }),
}));
