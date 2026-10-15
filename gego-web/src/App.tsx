import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { MarketingLayout } from "./components/MarketingLayout";
import { PortalLayout } from "./components/PortalLayout";
import { useI18n } from "./i18n/LanguageProvider";
import { usePortal } from "./lib/portalStore";
import { AboutPage } from "./pages/AboutPage";
import { AppointmentPage } from "./pages/AppointmentPage";
import { BookDemoPage } from "./pages/BookDemoPage";
import { ContactPage } from "./pages/ContactPage";
import { DocArticlePage, DocsPage } from "./pages/DocsPage";
import { HomePage } from "./pages/HomePage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PlansPage } from "./pages/PlansPage";
import { PromotionsPage } from "./pages/PromotionsPage";
import { ServicesPage } from "./pages/ServicesPage";
import { BillingPage } from "./pages/portal/BillingPage";
import { ClinicPage } from "./pages/portal/ClinicPage";
import { DashboardPage } from "./pages/portal/DashboardPage";
import { InvoiceDetailPage, InvoicesPage } from "./pages/portal/InvoicesPage";
import { PortalLoginPage } from "./pages/portal/LoginPage";
import { NotificationsPage } from "./pages/portal/NotificationsPage";
import { SupportPage } from "./pages/portal/SupportPage";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function PortalMissing() {
  const { m } = useI18n();
  return <p className="panel p-6">{m.portal.missing}</p>;
}

function RequirePortal() {
  const portal = usePortal();
  if (!portal.session) return <Navigate to="/portal/login" replace />;
  return <PortalLayout />;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<MarketingLayout />}>
          <Route index element={<HomePage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="services" element={<ServicesPage />} />
          <Route path="docs" element={<DocsPage />} />
          <Route path="docs/:slug" element={<DocArticlePage />} />
          <Route path="plans" element={<PlansPage />} />
          <Route path="promotions" element={<PromotionsPage />} />
          <Route path="appointment" element={<AppointmentPage />} />
          <Route path="demo" element={<BookDemoPage />} />
          <Route path="contact" element={<ContactPage />} />
        </Route>
        <Route path="portal/login" element={<PortalLoginPage />} />
        <Route path="portal" element={<RequirePortal />}>
          <Route index element={<DashboardPage />} />
          <Route path="invoices" element={<InvoicesPage />} />
          <Route path="invoices/:invoiceId" element={<InvoiceDetailPage />} />
          <Route path="billing" element={<BillingPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="support" element={<SupportPage />} />
          <Route path="clinic" element={<ClinicPage />} />
          <Route path="*" element={<PortalMissing />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}
