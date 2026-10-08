import { create } from "zustand";
import { persist } from "zustand/middleware";

export type PaletteId = "demsta" | "sky";

type UiPrefs = {
  chairside: boolean;
  dark: boolean;
  locale: string;
  currency: string;
  palette: PaletteId;
  sidebarCollapsed: boolean;
  setChairside: (on: boolean) => void;
  toggleChairside: () => void;
  toggleDark: () => void;
  setDark: (on: boolean) => void;
  setLocale: (locale: string) => void;
  setCurrency: (currency: string) => void;
  setPalette: (palette: PaletteId) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
};

function applyChairsideClass(on: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("chairside", on);
}

function applyDarkClass(on: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", on);
  document.documentElement.style.colorScheme = on ? "dark" : "light";
}

function applyPalette(palette: PaletteId) {
  if (typeof document === "undefined") return;
  if (palette === "sky") document.documentElement.dataset.palette = "sky";
  else delete document.documentElement.dataset.palette;
}

function readBoot(): Partial<Pick<UiPrefs, "chairside" | "dark" | "locale" | "currency" | "palette" | "sidebarCollapsed">> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem("demsta-ui");
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
    const state = parsed.state ?? {};
    return {
      chairside: Boolean(state.chairside),
      dark: Boolean(state.dark),
      locale: typeof state.locale === "string" ? state.locale : undefined,
      currency: typeof state.currency === "string" ? state.currency : undefined,
      palette: state.palette === "sky" ? "sky" : "demsta",
      sidebarCollapsed: Boolean(state.sidebarCollapsed),
    };
  } catch {
    return {};
  }
}

const boot = readBoot();

export const useUiPrefs = create<UiPrefs>()(
  persist(
    (set, get) => ({
      chairside: boot.chairside ?? false,
      dark: boot.dark ?? false,
      locale: boot.locale || "en-TZ",
      currency: boot.currency || "TZS",
      palette: boot.palette ?? "demsta",
      sidebarCollapsed: boot.sidebarCollapsed ?? false,
      setChairside: (chairside) => {
        applyChairsideClass(chairside);
        set({ chairside });
      },
      toggleChairside: () => {
        const next = !get().chairside;
        applyChairsideClass(next);
        set({ chairside: next });
      },
      setDark: (dark) => {
        applyDarkClass(dark);
        set({ dark });
      },
      toggleDark: () => {
        const next = !get().dark;
        applyDarkClass(next);
        set({ dark: next });
      },
      setLocale: (locale) => set({ locale }),
      setCurrency: (currency) => set({ currency }),
      setPalette: (palette) => {
        applyPalette(palette);
        set({ palette });
      },
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      toggleSidebarCollapsed: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
    }),
    {
      name: "demsta-ui",
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (state.palette !== "demsta" && state.palette !== "sky") state.palette = "demsta";
        if (typeof state.sidebarCollapsed !== "boolean") state.sidebarCollapsed = false;
        applyChairsideClass(state.chairside);
        applyDarkClass(Boolean(state.dark));
        applyPalette(state.palette === "sky" ? "sky" : "demsta");
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

applyChairsideClass(boot.chairside ?? false);
applyDarkClass(Boolean(boot.dark));
applyPalette(boot.palette === "sky" ? "sky" : "demsta");
