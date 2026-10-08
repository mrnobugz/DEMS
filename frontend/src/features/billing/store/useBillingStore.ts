import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DatePreset, SummaryPreset } from "@/features/billing/lib/dates";

type BillingState = {
  invoiceQuery: string;
  invoiceStatus: string;
  invoicePreset: DatePreset;
  paymentQuery: string;
  paymentMethod: string;
  paymentPreset: DatePreset;
  summaryPreset: SummaryPreset;
  setInvoiceQuery: (value: string) => void;
  setInvoiceStatus: (value: string) => void;
  setInvoicePreset: (value: DatePreset) => void;
  setPaymentQuery: (value: string) => void;
  setPaymentMethod: (value: string) => void;
  setPaymentPreset: (value: DatePreset) => void;
  setSummaryPreset: (value: SummaryPreset) => void;
};

export const useBillingStore = create<BillingState>()(
  persist(
    (set) => ({
      invoiceQuery: "",
      invoiceStatus: "all",
      invoicePreset: "all",
      paymentQuery: "",
      paymentMethod: "all",
      paymentPreset: "month",
      summaryPreset: "month",
      setInvoiceQuery: (invoiceQuery) => set({ invoiceQuery }),
      setInvoiceStatus: (invoiceStatus) => set({ invoiceStatus }),
      setInvoicePreset: (invoicePreset) => set({ invoicePreset }),
      setPaymentQuery: (paymentQuery) => set({ paymentQuery }),
      setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
      setPaymentPreset: (paymentPreset) => set({ paymentPreset }),
      setSummaryPreset: (summaryPreset) => set({ summaryPreset }),
    }),
    { name: "demsta-billing" },
  ),
);

export const useInvoiceQuery = () => useBillingStore((state) => state.invoiceQuery);
export const useInvoiceStatus = () => useBillingStore((state) => state.invoiceStatus);
export const useInvoicePreset = () => useBillingStore((state) => state.invoicePreset);
export const usePaymentQuery = () => useBillingStore((state) => state.paymentQuery);
export const usePaymentMethod = () => useBillingStore((state) => state.paymentMethod);
export const usePaymentPreset = () => useBillingStore((state) => state.paymentPreset);
export const useSummaryPreset = () => useBillingStore((state) => state.summaryPreset);
