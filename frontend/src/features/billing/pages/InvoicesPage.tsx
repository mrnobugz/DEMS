import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Plus, Printer } from "lucide-react";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/accordion";
import { Sheet, SheetContent } from "@/components/ui/dialog";
import { useAnnounce } from "@/components/ui/sonner";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { exportRowsToCsv } from "@/lib/exportTable";
import { hasEffectivePermission } from "@/lib/nav";
import { fetchInvoice, fetchInvoices, recordPayment, voidInvoice, writeOffInvoice } from "@/features/billing/api/billingApi";
import { InvoiceFacts } from "@/features/billing/components/InvoiceFacts";
import { InvoiceTable } from "@/features/billing/components/InvoiceTable";
import { NewInvoiceDialog } from "@/features/billing/components/NewInvoiceDialog";
import { PaymentDialog } from "@/features/billing/components/PaymentDialog";
import { printInvoice } from "@/features/billing/lib/printInvoice";
import { presetRange, type DatePreset } from "@/features/billing/lib/dates";
import { useDebounced, useMoney } from "@/features/billing/hooks/useMoney";
import {
  useBillingStore,
  useInvoicePreset,
  useInvoiceQuery,
  useInvoiceStatus,
} from "@/features/billing/store/useBillingStore";
import { invoiceBalance, type BillingInvoice } from "@/features/billing/types";

export function InvoicesPage() {
  const query = useInvoiceQuery();
  const status = useInvoiceStatus();
  const preset = useInvoicePreset();
  const setQuery = useBillingStore((state) => state.setInvoiceQuery);
  const setStatus = useBillingStore((state) => state.setInvoiceStatus);
  const setPreset = useBillingStore((state) => state.setInvoicePreset);
  const debounced = useDebounced(query);
  const perms = useAuth((state) => state.user?.effective_permissions);
  const canCreate = hasEffectivePermission(perms, "billing:create");
  const canManage = hasEffectivePermission(perms, "billing:*");
  const { money, currency, locale } = useMoney();
  const [rows, setRows] = useState<BillingInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BillingInvoice | null>(null);
  const [paying, setPaying] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"void" | "write_off" | null>(null);
  useAnnounce(notice);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const range = presetRange(preset);
    const overdue = status === "overdue";
    fetchInvoices({
      q: debounced.trim() || undefined,
      status: !status || status === "all" || overdue ? undefined : status,
      issued_from: range.from,
      issued_to: range.to,
    })
      .then((list) => {
        if (!cancelled) {
          setRows(overdue ? list.filter((row) => row.is_overdue) : list);
          setNotice("");
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setNotice(err instanceof ApiError ? err.message : "Could not load invoices");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, status, preset]);

  useEffect(() => {
    if (!openId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    fetchInvoice(openId)
      .then((invoice) => {
        if (!cancelled) setDetail(invoice);
      })
      .catch((err: unknown) => {
        if (!cancelled) setNotice(err instanceof ApiError ? err.message : "Could not open the invoice");
      });
    return () => {
      cancelled = true;
    };
  }, [openId]);

  async function refresh(id: string, message: string) {
    const [invoice, list] = await Promise.all([
      fetchInvoice(id),
      fetchInvoices({
        q: debounced.trim() || undefined,
        status: !status || status === "all" || status === "overdue" ? undefined : status,
        ...namedRange(preset),
      }),
    ]);
    setDetail(invoice);
    setRows(status === "overdue" ? list.filter((row) => row.is_overdue) : list);
    setNotice(message);
  }

  const balance = detail ? invoiceBalance(detail) : 0;
  const canPay = Boolean(detail && canCreate && balance > 0 && detail.status !== "void" && detail.status !== "refunded");
  const canVoid = Boolean(detail && canManage && detail.amount_paid <= 0 && detail.status !== "void" && detail.status !== "refunded");
  const canWriteOff = Boolean(detail && canManage && balance > 0 && detail.status !== "void");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block min-w-48 flex-1 text-sm">
          <span className="label">Search</span>
          <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Patient or invoice number" />
        </label>
        <label className="block text-sm">
          <span className="label">Status</span>
          <select className="input" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All</option>
            <option value="draft">Draft</option>
            <option value="issued">Issued</option>
            <option value="partially_paid">Partial</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
            <option value="void">Void</option>
            <option value="refunded">Refunded</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="label">Period</span>
          <select className="input" value={preset} onChange={(event) => setPreset(event.target.value as DatePreset)}>
            <option value="all">Any date</option>
            <option value="today">Today</option>
            <option value="week">Last 7 days</option>
            <option value="month">This month</option>
            <option value="quarter">This quarter</option>
          </select>
        </label>
        <Button variant="ghost" onClick={() => exportRowsToCsv("invoices.csv", rows, [
          { key: "number", header: "Invoice", value: (row) => row.invoice_number },
          { key: "patient", header: "Patient", value: (row) => row.patient_name || "" },
          { key: "status", header: "Status", value: (row) => row.status },
          { key: "total", header: "Total", value: (row) => row.total },
          { key: "balance", header: "Balance", value: (row) => invoiceBalance(row) },
        ])}>
          <Download size={16} aria-hidden /> Export CSV
        </Button>
        {canCreate && (
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} aria-hidden /> New invoice
          </Button>
        )}
      </div>
      <p className="text-sm" role="status" aria-live="polite">{notice || (loading ? "Loading invoices…" : `${rows.length} invoices`)}</p>
      {loading ? <PageSkeleton /> : <InvoiceTable rows={rows} money={money} onOpen={(invoice) => setOpenId(invoice.id)} />}
      <Sheet open={Boolean(openId)} onOpenChange={(next) => !next && setOpenId(null)}>
        <SheetContent side="right" title={detail?.invoice_number || "Invoice"} description="Invoice lines, totals, and actions">
          {!detail ? (
            <PageSkeleton rows={2} />
          ) : (
            <div className="space-y-3">
              <InvoiceFacts invoice={detail} money={money} />
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" onClick={() => printInvoice(detail, currency, locale)}>
                  <Printer size={16} aria-hidden /> Print
                </Button>
                <Link className="btn-ghost inline-flex items-center" to={`/billing/invoices/${detail.id}`}>Open page</Link>
                {canPay && <Button onClick={() => setPaying(true)}>Record payment</Button>}
                {canWriteOff && <Button variant="ghost" onClick={() => setConfirm("write_off")}>Write off</Button>}
                {canVoid && <Button variant="danger" onClick={() => setConfirm("void")}>Void</Button>}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
      {detail && (
        <PaymentDialog
          open={paying}
          balance={balance}
          money={money}
          busy={busy}
          onOpenChange={setPaying}
          onSubmit={async (values) => {
            setBusy(true);
            try {
              await recordPayment(detail.id, values);
              await refresh(detail.id, "Payment recorded");
              setPaying(false);
            } catch (err) {
              setNotice(err instanceof ApiError ? err.message : "Payment was not saved");
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
      <AlertDialog
        open={confirm !== null}
        title={confirm === "void" ? "Void this invoice?" : "Write off the balance?"}
        description={
          confirm === "void"
            ? "This unpaid invoice will be void. Supplies linked to it return to stock."
            : `Write off ${money(balance)}. Posted fees stay on the line.`
        }
        confirmLabel={confirm === "void" ? "Void invoice" : "Write off"}
        busy={busy}
        onOpenChange={(next) => !next && setConfirm(null)}
        onConfirm={() => {
          if (!detail || !confirm) return;
          setBusy(true);
          const action = confirm === "void" ? voidInvoice(detail.id) : writeOffInvoice(detail.id, balance);
          void action
            .then(() => refresh(detail.id, confirm === "void" ? "Invoice voided" : "Balance written off"))
            .catch((err: unknown) => {
              setNotice(err instanceof ApiError ? err.message : "The invoice was not changed");
            })
            .finally(() => {
              setBusy(false);
              setConfirm(null);
            });
        }}
      />
      <NewInvoiceDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(invoice) => {
          setNotice(`Invoice ${invoice.invoice_number} created`);
          setOpenId(invoice.id);
          setRows((current) => [invoice, ...current]);
        }}
      />
    </div>
  );
}

function namedRange(preset: DatePreset) {
  const range = presetRange(preset);
  return { issued_from: range.from, issued_to: range.to };
}
