import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "./types";

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  activeClinicId: string | null;
  setSession: (access: string, refresh: string, user: User) => void;
  setActiveClinicId: (clinicId: string | null) => void;
  clear: () => void;
};

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      activeClinicId: null,
      setSession: (accessToken, refreshToken, user) =>
        set({
          accessToken,
          refreshToken,
          user,
          activeClinicId: user.clinic_id ?? null,
        }),
      setActiveClinicId: (activeClinicId) => set({ activeClinicId }),
      clear: () =>
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          activeClinicId: null,
        }),
    }),
    { name: "demsta-auth" },
  ),
);
