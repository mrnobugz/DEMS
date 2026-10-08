export type BillingLine = {
  id: string;
  description: string;
  tooth_number?: string | null;
  quantity: number;
  unit_price: number;
  total: number;
  procedure_code?: string | null;
  line_kind?: string;
  charge_status?: string;
};

export type BillingPayment = {
  id: string;
  invoice_id?: string;
  invoice_number?: string;
  patient_id?: string;
  patient_name?: string;
  patient_code?: string;
  amount: number;
  method: string;
  payer_type?: string;
  insurer?: string | null;
  paid_at: string;
  reference?: string | null;
  currency?: string;
};

export type BillingClaimLink = {
  id: string;
  claim_number: string;
  status: string;
};

export type BillingInvoice = {
  id: string;
  patient_id: string;
  patient_name?: string | null;
  patient_code?: string | null;
  invoice_number: string;
  status: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  amount_paid: number;
  amount_adjusted?: number;
  balance?: number;
  outstanding?: boolean;
  is_overdue?: boolean;
  currency: string;
  notes?: string | null;
  issued_at?: string | null;
  due_at?: string | null;
  line_items: BillingLine[];
  payments: BillingPayment[];
  claims?: BillingClaimLink[];
};

export type MonthRevenue = { month: string; amount: number };
export type MethodTotal = { method: string; amount: number; count: number };

export type InvoiceBrief = {
  id: string;
  invoice_number: string;
  patient_id: string;
  patient_name: string;
  patient_code: string;
  status: string;
  total: number;
  amount_paid: number;
  balance: number;
  currency: string;
  issued_at?: string | null;
  is_overdue: boolean;
};

export type BillingSummary = {
  currency: string;
  period_start: string;
  period_end: string;
  previous_period_start: string;
  previous_period_end: string;
  revenue_this_month: number;
  revenue_last_month: number;
  outstanding_count: number;
  outstanding_amount: number;
  overdue_count: number;
  overdue_amount: number;
  paid_this_month: number;
  revenue_by_month: MonthRevenue[];
  payment_methods: MethodTotal[];
  recent_invoices: InvoiceBrief[];
  recent_payments: BillingPayment[];
};

export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "mobile_money", label: "Mobile money" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "insurance", label: "Insurance" },
  { value: "other", label: "Other" },
] as const;

export const LINE_KINDS = [
  { value: "procedure", label: "Procedure" },
  { value: "consultation", label: "Consultation" },
  { value: "drug", label: "Pharmacy" },
  { value: "lab", label: "Lab" },
  { value: "imaging", label: "Imaging" },
  { value: "supply", label: "Supply" },
  { value: "service", label: "Service" },
] as const;

export function invoiceBalance(invoice: {
  status?: string;
  total: number;
  amount_paid: number;
  amount_adjusted?: number;
  balance?: number;
}) {
  if (invoice.status === "void" || invoice.status === "refunded") return 0;
  if (typeof invoice.balance === "number") return invoice.balance;
  return Math.max(invoice.total - invoice.amount_paid - (invoice.amount_adjusted || 0), 0);
}

export function methodLabel(method: string) {
  return PAYMENT_METHODS.find((row) => row.value === method)?.label || method.replaceAll("_", " ");
}
