import { format, parseISO, startOfMonth, subDays } from "date-fns";

export type DatePreset = "all" | "today" | "week" | "month" | "quarter";
export type SummaryPreset = "month" | "30d" | "quarter";

function iso(day: Date) {
  return format(day, "yyyy-MM-dd");
}

function quarterStart(now: Date) {
  return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
}

export function presetRange(preset: DatePreset, now = new Date()): { from?: string; to?: string } {
  const to = iso(now);
  if (preset === "all") return {};
  if (preset === "today") return { from: to, to };
  if (preset === "week") return { from: iso(subDays(now, 6)), to };
  if (preset === "month") return { from: iso(startOfMonth(now)), to };
  return { from: iso(quarterStart(now)), to };
}

export function summaryQuery(preset: SummaryPreset, now = new Date()): { from?: string; to?: string } {
  if (preset === "month") return {};
  const to = iso(now);
  if (preset === "30d") return { from: iso(subDays(now, 29)), to };
  return { from: iso(quarterStart(now)), to };
}

/** Fetch window that still contains today, this week, and this month. */
export function paymentFetchRange(preset: DatePreset, now = new Date()): { from?: string; to?: string } {
  if (preset === "all") return {};
  const to = iso(now);
  const candidates = [iso(startOfMonth(now)), iso(subDays(now, 6)), presetRange(preset, now).from].filter(
    (value): value is string => Boolean(value),
  );
  const from = candidates.sort()[0];
  return { from, to };
}

export function formatWhen(value?: string | null, pattern = "d MMM yyyy") {
  if (!value) return "—";
  const parsed = parseISO(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return format(parsed, pattern);
}

export function dayKey(value?: string | null) {
  if (!value) return "";
  const parsed = parseISO(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return format(parsed, "yyyy-MM-dd");
}

export function inRange(value: string | null | undefined, range: { from?: string; to?: string }) {
  const day = dayKey(value);
  if (!day) return false;
  if (range.from && day < range.from) return false;
  if (range.to && day > range.to) return false;
  return true;
}
