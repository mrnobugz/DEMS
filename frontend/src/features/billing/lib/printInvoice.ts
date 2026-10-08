import { formatMoney } from "@/lib/i18n";
import { printHtmlDocument } from "@/lib/printRegistration";
import { formatWhen } from "@/features/billing/lib/dates";
import { invoiceBalance, methodLabel, type BillingInvoice } from "@/features/billing/types";

export function printInvoice(invoice: BillingInvoice, currency: string, locale: string) {
  const money = (amount: number) => formatMoney(amount, currency || invoice.currency || "TZS", locale);
  const lines = invoice.line_items
    .map(
      (line) =>
        `<tr><td>${escapeHtml(line.description)}${line.tooth_number ? ` (tooth ${escapeHtml(line.tooth_number)})` : ""}</td><td>${escapeHtml(line.line_kind || "")}</td><td style="text-align:right">${money(line.total)}</td></tr>`,
    )
    .join("");
  const payments = invoice.payments
    .map(
      (payment) =>
        `<tr><td>${escapeHtml(methodLabel(payment.method))} · ${formatWhen(payment.paid_at, "d MMM HH:mm")}</td><td style="text-align:right">${money(payment.amount)}</td></tr>`,
    )
    .join("");
  const patient = invoice.patient_name || "Patient";
  const html = `<!doctype html><html><head><title>Receipt ${escapeHtml(invoice.invoice_number)}</title>
    <style>
      body{font-family:Georgia,serif;padding:24px;color:#041e5c}
      h1{font-size:22px;margin:0 0 4px}
      .muted{color:#5a6b85;font-size:12px}
      table{width:100%;border-collapse:collapse;margin-top:16px}
      td,th{padding:6px 0;border-bottom:1px solid #e0edff;font-size:13px}
      .total{font-weight:700;font-size:16px}
    </style></head><body>
    <h1>DEMSTA Receipt</h1>
    <div class="muted">${escapeHtml(invoice.invoice_number)} · ${formatWhen(invoice.issued_at)}</div>
    <p><strong>${escapeHtml(patient)}</strong>${invoice.patient_code ? ` · ${escapeHtml(invoice.patient_code)}` : ""}</p>
    <table><thead><tr><th align="left">Item</th><th align="left">Kind</th><th align="right">Amount</th></tr></thead><tbody>${lines}</tbody></table>
    <table>
      <tr><td>Subtotal</td><td style="text-align:right">${money(invoice.subtotal)}</td></tr>
      <tr><td>Tax</td><td style="text-align:right">${money(invoice.tax)}</td></tr>
      <tr><td>Discount</td><td style="text-align:right">${money(invoice.discount)}</td></tr>
      <tr class="total"><td>Total</td><td style="text-align:right">${money(invoice.total)}</td></tr>
      <tr><td>Paid</td><td style="text-align:right">${money(invoice.amount_paid)}</td></tr>
      <tr><td>Adjustments</td><td style="text-align:right">${money(invoice.amount_adjusted || 0)}</td></tr>
      <tr><td>Balance</td><td style="text-align:right">${money(invoiceBalance(invoice))}</td></tr>
    </table>
    ${payments ? `<h3 style="margin-top:20px;font-size:14px">Payments</h3><table>${payments}</table>` : ""}
    </body></html>`;
  printHtmlDocument(html);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] || char);
}
