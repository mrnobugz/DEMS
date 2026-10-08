import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Printer } from "lucide-react";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/accordion";
import { useAnnounce } from "@/components/ui/sonner";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { hasEffectivePermission } from "@/lib/nav";
import { fetchInvoice, recordPayment, voidInvoice, writeOffInvoice } from "@/features/billing/api/billingApi";
import { InvoiceFacts } from "@/features/billing/components/InvoiceFacts";
import { PaymentDialog } from "@/features/billing/components/PaymentDialog";
import { printInvoice } from "@/features/billing/lib/printInvoice";
import { useMoney } from "@/features/billing/hooks/useMoney";
import { invoiceBalance, type BillingInvoice } from "@/features/billing/types";

export function InvoiceDetailPage() {
  const { invoiceId = "" } = useParams();
  const perms = useAuth((state) => state.user?.effective_permissions);
  const canCreate = hasEffectivePermission(perms, "billing:create");
  const canManage = hasEffectivePermission(perms, "billing:*");
  const { money, currency, locale } = useMoney();
  const [invoice, setInvoice] = useState<BillingInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [paying, setPaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"void" | "write_off" | null>(null);
  useAnnounce(notice);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchInvoice(invoiceId)
      .then((row) => {
        if (!cancelled) setInvoice(row);
      })
      .catch((err: unknown) => {
        if (!cancelled) setNotice(err instanceof ApiError ? err.message : "Could not load this invoice");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [invoiceId]);

  const balance = invoice ? invoiceBalance(invoice) : 0;
  const canPay = Boolean(invoice && canCreate && balance > 0 && invoice.status !== "void" && invoice.status !== "refunded");
  const canVoid = Boolean(invoice && canManage && invoice.amount_paid <= 0 && invoice.status !== "void" && invoice.status !== "refunded");
  const canWriteOff = Boolean(invoice && canManage && balance > 0 && invoice.status !== "void");

  return (
    <div className="space-y-3">
      <Link className="text-sm font-semibold text-brand-800 underline-offset-2 hover:underline" to="/billing/invoices">
        Back to invoices
      </Link>
      <p className="text-sm" role="status" aria-live="polite">
        {notice || (loading ? "Loading invoice…" : "")}
      </p>
      {loading && <PageSkeleton rows={3} />}
      {invoice && !loading && (
        <section className="glass-panel space-y-3">
          <InvoiceFacts invoice={invoice} money={money} />
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => printInvoice(invoice, currency, locale)}>
              <Printer size={16} aria-hidden /> Print
            </Button>
            {canPay && <Button onClick={() => setPaying(true)}>Record payment</Button>}
            {canWriteOff && <Button variant="ghost" onClick={() => setConfirm("write_off")}>Write off</Button>}
            {canVoid && <Button variant="danger" onClick={() => setConfirm("void")}>Void</Button>}
          </div>
        </section>
      )}
      {invoice && (
        <PaymentDialog
          open={paying}
          balance={balance}
          money={money}
          busy={busy}
          onOpenChange={setPaying}
          onSubmit={async (values) => {
            setBusy(true);
            try {
              const next = await recordPayment(invoice.id, values);
              setInvoice(next);
              setNotice("Payment recorded");
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
          if (!invoice || !confirm) return;
          setBusy(true);
          const action = confirm === "void" ? voidInvoice(invoice.id) : writeOffInvoice(invoice.id, balance);
          void action
            .then((next) => {
              setInvoice(next);
              setNotice(confirm === "void" ? "Invoice voided" : "Balance written off");
            })
            .catch((err: unknown) => setNotice(err instanceof ApiError ? err.message : "The invoice was not changed"))
            .finally(() => {
              setBusy(false);
              setConfirm(null);
            });
        }}
      />
    </div>
  );
}
