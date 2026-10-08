import { getStatusMeta } from "@/features/billing/lib/status";

export function StatusBadge({ status, overdue = false }: { status: string; overdue?: boolean }) {
  const meta = getStatusMeta(status, overdue);
  return <span className={`bill-status bill-status--${meta.tone}`}>{meta.label}</span>;
}
