import { create } from "zustand";
import { persist } from "zustand/middleware";

type UiPrefs = {
  chairside: boolean;
  locale: string;
  currency: string;
  setChairside: (on: boolean) => void;
  toggleChairside: () => void;
  setLocale: (locale: string) => void;
  setCurrency: (currency: string) => void;
};

function applyChairsideClass(on: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("chairside", on);
}

export const useUiPrefs = create<UiPrefs>()(
  persist(
    (set, get) => ({
      chairside: false,
      locale: "en-TZ",
      currency: "TZS",
      setChairside: (chairside) => {
        applyChairsideClass(chairside);
        set({ chairside });
      },
      toggleChairside: () => {
        const next = !get().chairside;
        applyChairsideClass(next);
        set({ chairside: next });
      },
      setLocale: (locale) => set({ locale }),
      setCurrency: (currency) => set({ currency }),
    }),
    {
      name: "demsta-ui",
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        applyChairsideClass(state.chairside);
        // Migrate legacy USD prefs → Tanzanian Shilling
        if (!state.currency || state.currency === "USD" || state.currency === "TSH") {
          state.currency = "TZS";
        }
        if (!state.locale || state.locale === "en-US") {
          state.locale = "en-TZ";
        }
      },
    },
  ),
);
