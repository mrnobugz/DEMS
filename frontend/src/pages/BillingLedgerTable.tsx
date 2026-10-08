import { useMemo } from "react";
import type { LegacyColumnDef } from "@tanstack/react-table/legacy";
import { DataTable } from "@/components/ui/data-table";
import type { Invoice, Patient } from "@/lib/types";

function invoiceRemaining(inv: Invoice) {
  return Math.max(inv.total - inv.amount_paid - (inv.amount_adjusted || 0), 0);
}

export function BillingLedgerTable({
  invoices,
  patientMap,
  money,
  canManageCatalog,
  onPrint,
  onPay,
  onWriteOff,
  onVoid,
}: {
  invoices: Invoice[];
  patientMap: Map<string, Patient>;
  money: (amount: number) => string;
  canManageCatalog: boolean;
  onPrint: (invoice: Invoice, label: string) => void;
  onPay: (invoiceId: string, remaining: number) => void;
  onWriteOff: (invoiceId: string, remaining: number) => void;
  onVoid: (invoiceId: string) => void;
}) {
  const columns = useMemo<LegacyColumnDef<Invoice, unknown>[]>(
    () => [
      {
        accessorKey: "invoice_number",
        header: "Invoice",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.invoice_number}</span>,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <span className="capitalize">{row.original.status.replaceAll("_", " ")}</span>,
      },
      {
        accessorKey: "total",
        header: "Total",
        cell: ({ row }) => money(row.original.total),
      },
      {
        accessorKey: "amount_paid",
        header: "Paid",
        cell: ({ row }) => money(row.original.amount_paid),
      },
      {
        id: "insurance",
        header: "Est. insurance",
        accessorFn: (invoice) => invoice.line_items.reduce((sum, line) => sum + (line.estimated_insurance || 0), 0),
        cell: ({ getValue }) => money(Number(getValue())),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => {
          const inv = row.original;
          const remaining = invoiceRemaining(inv);
          const patient = patientMap.get(inv.patient_id);
          const label = patient ? `${patient.first_name} ${patient.last_name}` : inv.patient_id;
          return (
            <div className="text-right">
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className="btn-ghost text-xs" onClick={() => onPrint(inv, label)}>
                  Print receipt
                </button>
                {remaining > 0 && (
                  <button type="button" className="btn-ghost text-xs" onClick={() => onPay(inv.id, remaining)}>
                    Pay remaining
                  </button>
                )}
                {canManageCatalog && remaining > 0 && (
                  <button type="button" className="btn-ghost text-xs" onClick={() => onWriteOff(inv.id, remaining)}>
                    Write off
                  </button>
                )}
                {canManageCatalog && remaining > 0 && inv.amount_paid < 0.001 && inv.status !== "void" && (
                  <button type="button" className="btn-ghost text-xs" onClick={() => onVoid(inv.id)}>
                    Void
                  </button>
                )}
              </div>
              {inv.line_items.some((line) => line.inventory_item_id) && (
                <div className="mt-1 text-[10px] text-muted">
                  {inv.line_items
                    .filter((line) => line.inventory_item_id)
                    .map((line) => `${line.line_kind || "supply"} ×${line.quantity}`)
                    .join(" · ")}
                </div>
              )}
            </div>
          );
        },
      },
    ],
    [canManageCatalog, money, onPay, onPrint, onVoid, onWriteOff, patientMap],
  );

  return (
    <div className="glass-panel overflow-hidden">
      <DataTable data={invoices} columns={columns} getRowId={(invoice) => invoice.id} caption="Invoices" empty={<p className="p-4 text-sm text-muted">No invoices yet.</p>} />
    </div>
  );
}
