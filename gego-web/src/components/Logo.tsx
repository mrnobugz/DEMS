import { useI18n } from "../i18n/LanguageProvider";

export function Logo({ light = false }: { light?: boolean }) {
  const { m } = useI18n();
  return (
    <span className="inline-flex items-center gap-3">
      <svg width="40" height="40" viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill={light ? "#EEF9FF" : "#075E86"} />
        <path
          fill={light ? "#075E86" : "#EEF9FF"}
          d="M32 12c-6 0-10 4-11 9-1 6 0 10 2 14 1 3 2 7 2 11 0 3 2 6 7 6s7-3 7-6c0-4 1-8 2-11 2-4 3-8 2-14-1-5-5-9-11-9zm0 6c3 0 5 2 5 5 0 2-1 4-1 6 0 3 1 6 1 9 0 1-1 2-5 2s-5-1-5-2c0-3 1-6 1-9 0-2-1-4-1-6 0-3 2-5 5-5z"
        />
      </svg>
      <span className="leading-tight">
        <span className={`block font-display text-2xl font-bold ${light ? "text-white" : "text-ink"}`}>GEGO</span>
        <span className={`block text-xs font-semibold uppercase tracking-[0.14em] ${light ? "text-sky-100" : "text-primary"}`}>
          {m.logoTagline}
        </span>
      </span>
    </span>
  );
}
