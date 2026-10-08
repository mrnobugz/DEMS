import { useMemo } from "react";
import type { LegacyColumnDef } from "@tanstack/react-table/legacy";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/features/billing/components/StatusBadge";
import { formatWhen } from "@/features/billing/lib/dates";
import { invoiceBalance, type BillingInvoice } from "@/features/billing/types";

export function InvoiceTable({
  rows,
  money,
  onOpen,
}: {
  rows: BillingInvoice[];
  money: (amount: number) => string;
  onOpen: (invoice: BillingInvoice) => void;
}) {
  const columns = useMemo<LegacyColumnDef<BillingInvoice, unknown>[]>(
    () => [
      {
        accessorKey: "invoice_number",
        header: "Invoice",
        cell: ({ row }) => <span className="font-mono text-sm">{row.original.invoice_number}</span>,
      },
      {
        id: "patient",
        header: "Patient",
        accessorFn: (invoice) => invoice.patient_name || invoice.patient_id,
        cell: ({ row }) => (
          <span>
            <span className="block font-semibold">{row.original.patient_name || "Patient"}</span>
            <span className="text-xs text-muted">{row.original.patient_code}</span>
          </span>
        ),
      },
      {
        id: "issued",
        header: "Issued",
        accessorFn: (invoice) => invoice.issued_at || "",
        cell: ({ row }) => formatWhen(row.original.issued_at),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} overdue={row.original.is_overdue} />,
      },
      {
        accessorKey: "total",
        header: () => <span className="block text-right">Total</span>,
        cell: ({ row }) => <span className="block text-right tabular-nums">{money(row.original.total)}</span>,
      },
      {
        id: "balance",
        header: () => <span className="block text-right">Balance</span>,
        accessorFn: (invoice) => invoiceBalance(invoice),
        cell: ({ row }) => (
          <span className="block text-right font-semibold tabular-nums">{money(invoiceBalance(row.original))}</span>
        ),
      },
    ],
    [money],
  );

  if (!rows.length) {
    return <EmptyState title="No invoices" hint="Try another status or period, or create an invoice." />;
  }

  return (
    <DataTable
      data={rows}
      columns={columns}
      getRowId={(invoice) => invoice.id}
      caption="Invoices"
      onRowClick={onOpen}
    />
  );
}
