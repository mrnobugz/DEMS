import { NavLink } from "react-router-dom";

const LINKS = [
  { to: "/billing", label: "Overview", end: true },
  { to: "/billing/invoices", label: "Invoices", end: false },
  { to: "/billing/payments", label: "Payments", end: false },
  { to: "/billing/notifications", label: "Notifications", end: false },
];

export function BillingNav() {
  return (
    <nav className="admin-tabs" aria-label="Billing">
      {LINKS.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.end}
          className={({ isActive }) => `admin-tab inline-flex items-center ${isActive ? "admin-tab--on" : ""}`}
        >
          {link.label}
        </NavLink>
      ))}
    </nav>
  );
}
