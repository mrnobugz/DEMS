import { useI18n } from "../i18n/LanguageProvider";
import type { InvoiceStatus } from "../lib/portalStore";

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  const { m } = useI18n();
  const label =
    status === "paid" ? m.status.paid : status === "partial" ? m.status.partial : status === "overdue" ? m.status.overdue : m.status.open;
  return <span className={`badge badge-${status}`}>{label}</span>;
}
