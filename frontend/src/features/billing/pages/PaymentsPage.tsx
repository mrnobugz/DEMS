import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { LegacyColumnDef } from "@tanstack/react-table/legacy";
import { Download } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageSkeleton } from "@/components/ui/accordion";
import { useAnnounce } from "@/components/ui/sonner";
import { ApiError } from "@/lib/api";
import { exportRowsToCsv } from "@/lib/exportTable";
import { fetchPayments } from "@/features/billing/api/billingApi";
import { formatWhen, inRange, paymentFetchRange, presetRange, type DatePreset } from "@/features/billing/lib/dates";
import { useDebounced, useMoney } from "@/features/billing/hooks/useMoney";
import { useBillingStore, usePaymentMethod, usePaymentPreset, usePaymentQuery } from "@/features/billing/store/useBillingStore";
import { methodLabel, PAYMENT_METHODS, type BillingPayment } from "@/features/billing/types";

export function PaymentsPage() {
  const query = usePaymentQuery();
  const method = usePaymentMethod();
  const preset = usePaymentPreset();
  const setQuery = useBillingStore((state) => state.setPaymentQuery);
  const setMethod = useBillingStore((state) => state.setPaymentMethod);
  const setPreset = useBillingStore((state) => state.setPaymentPreset);
  const debounced = useDebounced(query);
  const { money } = useMoney();
  const [rows, setRows] = useState<BillingPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  useAnnounce(notice);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const range = paymentFetchRange(preset);
    fetchPayments({
      method: method === "all" ? undefined : method,
      from: range.from,
      to: range.to,
    })
      .then((list) => {
        if (!cancelled) setRows(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) setNotice(err instanceof ApiError ? err.message : "Could not load payments");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [method, preset]);

  const needle = debounced.trim().toLowerCase();
  const matched = useMemo(
    () =>
      rows.filter((row) => {
        if (!needle) return true;
        const hay = `${row.patient_name || ""} ${row.patient_code || ""} ${row.invoice_number || ""} ${row.reference || ""}`.toLowerCase();
        return hay.includes(needle);
      }),
    [rows, needle],
  );
  const visible = useMemo(
    () => (preset === "all" ? matched : matched.filter((row) => inRange(row.paid_at, presetRange(preset)))),
    [matched, preset],
  );
  const sum = (list: BillingPayment[]) => list.reduce((total, row) => total + row.amount, 0);
  const today = sum(rows.filter((row) => inRange(row.paid_at, presetRange("today"))));
  const week = sum(rows.filter((row) => inRange(row.paid_at, presetRange("week"))));
  const month = sum(rows.filter((row) => inRange(row.paid_at, presetRange("month"))));
  const collected = sum(visible);

  const columns = useMemo<LegacyColumnDef<BillingPayment, unknown>[]>(
    () => [
      {
        id: "when",
        header: "Paid",
        accessorFn: (row) => row.paid_at,
        cell: ({ row }) => formatWhen(row.original.paid_at, "d MMM yyyy HH:mm"),
      },
      {
        id: "patient",
        header: "Patient",
        accessorFn: (row) => row.patient_name || "",
        cell: ({ row }) =>
          row.original.patient_id ? (
            <Link className="font-semibold text-brand-800 underline-offset-2 hover:underline" to={`/patients/${row.original.patient_id}`}>
              {row.original.patient_name || "Patient"}
            </Link>
          ) : (
            row.original.patient_name || "Patient"
          ),
      },
      {
        id: "invoice",
        header: "Invoice",
        accessorFn: (row) => row.invoice_number || "",
        cell: ({ row }) =>
          row.original.invoice_id ? (
            <Link className="font-mono text-sm" to={`/billing/invoices/${row.original.invoice_id}`}>
              {row.original.invoice_number || "Open"}
            </Link>
          ) : (
            "—"
          ),
      },
      {
        accessorKey: "method",
        header: "Method",
        cell: ({ row }) => methodLabel(row.original.method),
      },
      {
        accessorKey: "amount",
        header: () => <span className="block text-right">Amount</span>,
        cell: ({ row }) => <span className="block text-right tabular-nums font-semibold">{money(row.original.amount)}</span>,
      },
    ],
    [money],
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Today", today],
          ["This week", week],
          ["This month", month],
          ["Collected", collected],
        ].map(([label, amount]) => (
          <section key={String(label)} className="glass-panel">
            <p className="text-sm text-muted">{label}</p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums text-brand-900">{money(Number(amount))}</p>
          </section>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block min-w-48 flex-1 text-sm">
          <span className="label">Search</span>
          <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Patient, invoice, or reference" />
        </label>
        <label className="block text-sm">
          <span className="label">Method</span>
          <select className="input" value={method} onChange={(event) => setMethod(event.target.value)}>
            <option value="all">All methods</option>
            {PAYMENT_METHODS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="label">Period</span>
          <select className="input" value={preset} onChange={(event) => setPreset(event.target.value as DatePreset)}>
            <option value="today">Today</option>
            <option value="week">Last 7 days</option>
            <option value="month">This month</option>
            <option value="quarter">This quarter</option>
            <option value="all">Any date</option>
          </select>
        </label>
        <Button
          variant="ghost"
          onClick={() =>
            exportRowsToCsv("payments.csv", visible, [
              { key: "paid", header: "Paid", value: (row) => row.paid_at },
              { key: "patient", header: "Patient", value: (row) => row.patient_name || "" },
              { key: "invoice", header: "Invoice", value: (row) => row.invoice_number || "" },
              { key: "method", header: "Method", value: (row) => methodLabel(row.method) },
              { key: "amount", header: "Amount", value: (row) => row.amount },
            ])
          }
        >
          <Download size={16} aria-hidden /> Export CSV
        </Button>
      </div>
      <p className="text-sm" role="status" aria-live="polite">
        {notice || (loading ? "Loading payments…" : `${visible.length} payments`)}
      </p>
      {loading ? (
        <PageSkeleton />
      ) : visible.length === 0 ? (
        <EmptyState title="No payments" hint="Payments recorded on invoices show up here." />
      ) : (
        <DataTable data={visible} columns={columns} getRowId={(row) => row.id} caption="Payments" />
      )}
    </div>
  );
}
