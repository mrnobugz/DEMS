import { Outlet } from "react-router-dom";
import { BillingNav } from "@/features/billing/components/BillingNav";

export function BillingLayout() {
  return (
    <div className="billing-shell clin-shell space-y-3">
      <header className="clin-head">
        <div>
          <h2 className="font-display text-xl font-bold text-brand-900">Billing</h2>
          <p className="text-sm text-muted">One patient ledger for clinical, pharmacy, lab, and imaging charges.</p>
        </div>
      </header>
      <BillingNav />
      <Outlet />
    </div>
  );
}
