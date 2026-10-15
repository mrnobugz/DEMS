import { api } from "@/lib/api";
import type { Page, Patient } from "@/lib/types";
import type { BillingInvoice, BillingPayment, BillingSummary } from "@/features/billing/types";

function query(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export function fetchSummary(range: { from?: string; to?: string }) {
  return api<BillingSummary>(`/api/v1/billing/summary${query({ from: range.from, to: range.to })}`);
}

export function fetchInvoices(filters: { q?: string; status?: string; issued_from?: string; issued_to?: string }) {
  return api<BillingInvoice[]>(
    `/api/v1/billing/invoices${query({
      q: filters.q,
      status: filters.status,
      issued_from: filters.issued_from,
      issued_to: filters.issued_to,
    })}`,
  );
}

export function fetchInvoice(id: string) {
  return api<BillingInvoice>(`/api/v1/billing/invoices/${id}`);
}

export function fetchPayments(filters: { q?: string; method?: string; from?: string; to?: string }) {
  return api<BillingPayment[]>(`/api/v1/billing/payments${query(filters)}`);
}

export function createInvoice(body: {
  patient_id: string;
  tax: number;
  discount: number;
  notes?: string;
  line_items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    line_kind: string;
    procedure_code?: string;
  }>;
}) {
  return api<BillingInvoice>("/api/v1/billing/invoices", {
    method: "POST",
    body: JSON.stringify({ ...body, idempotency_key: crypto.randomUUID() }),
  });
}

export function recordPayment(invoiceId: string, body: { amount: number; method: string; reference?: string }) {
  return api<BillingInvoice>(`/api/v1/billing/invoices/${invoiceId}/payments`, {
    method: "POST",
    body: JSON.stringify({ ...body, idempotency_key: crypto.randomUUID() }),
  });
}

export function writeOffInvoice(invoiceId: string, amount: number) {
  return api<BillingInvoice>(`/api/v1/billing/invoices/${invoiceId}/adjustments`, {
    method: "POST",
    body: JSON.stringify({ amount, kind: "write_off" }),
  });
}

export function voidInvoice(invoiceId: string) {
  return api<BillingInvoice>(`/api/v1/billing/invoices/${invoiceId}/void`, { method: "POST" });
}

export function searchPatients(q: string) {
  return api<Page<Patient>>(`/api/v1/patients?limit=20&q=${encodeURIComponent(q)}`);
}

export type FeeScheduleOption = {
  id: string;
  code: string;
  label: string;
  category: string;
  unit_price: number;
  currency: string;
  billable: boolean;
  is_active: boolean;
  catalog_kind?: string | null;
};

export function fetchFeeSchedule(active = true) {
  return api<FeeScheduleOption[]>(
    `/api/v1/billing/fee-schedule${query({ billable: "true", active: active ? "true" : undefined })}`,
  );
}
