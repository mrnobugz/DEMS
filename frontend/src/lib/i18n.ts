/** Lightweight i18n string table — swap locale later without rewriting screens. */

export type LocaleCode = "en" | "sw";

const STRINGS = {
  en: {
    appName: "DEMSTA",
    tagline: "Dental Care OS",
    skipToContent: "Skip to main content",
    dashboard: "Dashboard",
    patients: "Patients",
    schedule: "Schedule",
    billing: "Billing",
    aiAssist: "AI Assist",
    owner: "System owner",
    clinicAdmin: "Clinic admin",
    frontDesk: "Front desk",
    clinical: "Clinical",
    hygiene: "Hygiene",
    imaging: "Imaging",
    lab: "Lab",
    pharmacy: "Pharmacy",
    inventory: "Inventory",
    reports: "Reports",
    signOut: "Sign out",
    chairsideOn: "Chairside on",
    chairsideOff: "Chairside",
    offline: "You're offline — drafts will sync when the connection returns.",
    online: "Back online",
    emptyTitle: "Nothing here yet",
    emptyHint: "When records appear, they'll show up in this space.",
    clinicOps: "Clinic operations",
    commandCenter: "Command Center",
    chairsideHint: "Large touch targets for chairside charting",
  },
  sw: {
    appName: "DEMSTA",
    tagline: "Mfumo wa Kliniki ya Meno",
    skipToContent: "Ruka hadi maudhui kuu",
    dashboard: "Dashibodi",
    patients: "Wagonjwa",
    schedule: "Ratiba",
    billing: "Malipo",
    aiAssist: "Msaada wa AI",
    owner: "Mmiliki wa mfumo",
    clinicAdmin: "Msimamizi",
    frontDesk: "Dawati la mbele",
    clinical: "Kliniki",
    hygiene: "Usafi",
    imaging: "Picha",
    lab: "Maabara",
    pharmacy: "Famasi",
    inventory: "Hifadhi",
    reports: "Ripoti",
    signOut: "Toka",
    chairsideOn: "Hali ya kiti",
    chairsideOff: "Hali ya kiti",
    offline: "Hauna mtandao — rasimu zitasawazishwa baadaye.",
    online: "Umerudi mtandaoni",
    emptyTitle: "Bado hakuna kitu",
    emptyHint: "Rekodi zitaonekana hapa zinapopatikana.",
    clinicOps: "Uendeshaji wa kliniki",
    commandCenter: "Kituo cha amri",
    chairsideHint: "Vitufe vikubwa kwa uchoraji wa kiti",
  },
} as const;

export type StringKey = keyof typeof STRINGS.en;

export function t(key: StringKey, locale: LocaleCode = "en"): string {
  return STRINGS[locale]?.[key] ?? STRINGS.en[key] ?? key;
}

export function formatMoney(
  amount: number,
  currency = "USD",
  locale = "en-US",
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(
  value: string | Date,
  locale = "en-US",
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, options ?? { dateStyle: "medium" }).format(d);
}
