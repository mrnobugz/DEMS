import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { RequireRole } from "@/components/RequireRole";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { User } from "@/lib/types";
import { MODULES_DASHBOARD_PATH } from "@/lib/nav";
import { AiAssistPage } from "@/pages/AiAssistPage";
import { BillingLayout } from "@/features/billing/pages/BillingLayout";
import { InvoiceDetailPage } from "@/features/billing/pages/InvoiceDetailPage";
import { InvoicesPage } from "@/features/billing/pages/InvoicesPage";
import { NotificationsPage } from "@/features/billing/pages/NotificationsPage";
import { OverviewPage } from "@/features/billing/pages/OverviewPage";
import { PaymentsPage } from "@/features/billing/pages/PaymentsPage";
import { LoginPage } from "@/pages/LoginPage";
import { ModulesDashboardPage } from "@/pages/ModulesDashboardPage";
import { PatientDetailPage } from "@/pages/PatientDetailPage";
import { PatientsPage } from "@/pages/PatientsPage";
import { PortalHomePage } from "@/pages/PortalHomePage";
import { PortalLoginPage } from "@/pages/PortalLoginPage";
import { SchedulePage } from "@/pages/SchedulePage";
import { ReportsPage } from "@/pages/ReportsPage";
import { ClinicAdminPage } from "@/pages/department/ClinicAdminPage";
import { FrontDeskPage, FrontDeskRegisterPage } from "@/pages/department/FrontClinicalPages";
import { HygienePage } from "@/pages/department/HygienePage";
import { VitalSignsPage } from "@/pages/department/VitalSignsPage";
import { ClinicalRecordsPage } from "@/pages/department/ClinicalRecordsPage";
import { MaxillofacialPage } from "@/pages/department/clinic/MaxillofacialPage";
import { OrthodonticPage } from "@/pages/department/clinic/OrthodonticPage";
import { PaediatricPage } from "@/pages/department/clinic/PaediatricPage";
import { RestorativeDeptPage } from "@/pages/department/clinic/RestorativeDeptPage";
import { ImagingPage } from "@/pages/department/ImagingPage";
import { InventoryPage } from "@/pages/department/InventoryPage";
import { LabPage } from "@/pages/department/LabPage";
import { OwnerPage } from "@/pages/department/OwnerPage";
import { PharmacyPage } from "@/pages/department/PharmacyPage";
import { RequisitionsPage } from "@/pages/department/RequisitionsPage";

function ProtectedLayout() {
  const token = useAuth((s) => s.accessToken);
  const [hydrated, setHydrated] = useState(() => useAuth.persist.hasHydrated());

  useEffect(() => {
    setHydrated(useAuth.persist.hasHydrated());
    return useAuth.persist.onFinishHydration(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated || !token) return;
    let cancelled = false;
    api<User>("/api/v1/auth/me")
      .then((user) => {
        if (cancelled) return;
        const { accessToken, refreshToken, setSession } = useAuth.getState();
        if (accessToken && refreshToken) setSession(accessToken, refreshToken, user);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [hydrated, token]);

  if (!hydrated) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--demsta-canvas)] text-sm text-muted" role="status">
        Loading session…
      </div>
    );
  }
  if (!token) return <Navigate to="/login" replace />;
  return <AppShell />;
}

export default function App() {
  return (
    <TooltipProvider>
    <Toaster />
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/portal/login" element={<PortalLoginPage />} />
      <Route path="/portal" element={<PortalHomePage />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<Navigate to={MODULES_DASHBOARD_PATH} replace />} />
        <Route path="/home" element={<Navigate to={MODULES_DASHBOARD_PATH} replace />} />
        <Route path="/dashboard/modules" element={<ModulesDashboardPage />} />
        <Route
          path="/owner"
          element={
            <RequireRole roles={["super_admin"]}>
              <OwnerPage />
            </RequireRole>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireRole path="/admin">
              <ClinicAdminPage />
            </RequireRole>
          }
        />
        <Route
          path="/front-desk"
          element={
            <RequireRole path="/front-desk">
              <FrontDeskPage />
            </RequireRole>
          }
        />
        <Route
          path="/front-desk/register"
          element={
            <RequireRole path="/front-desk">
              <FrontDeskRegisterPage />
            </RequireRole>
          }
        />
        <Route path="/clinical" element={<Navigate to="/clinical/restorative" replace />} />
        <Route path="/clinic/restorative" element={<Navigate to="/clinical/restorative" replace />} />
        <Route path="/clinic/maxillofacial" element={<Navigate to="/clinical/maxillofacial" replace />} />
        <Route path="/clinic/orthodontic" element={<Navigate to="/clinical/orthodontic" replace />} />
        <Route path="/clinic/paediatric" element={<Navigate to="/clinical/paediatric" replace />} />
        <Route
          path="/clinical/restorative"
          element={
            <RequireRole path="/clinical/restorative">
              <RestorativeDeptPage />
            </RequireRole>
          }
        />
        <Route
          path="/clinical/maxillofacial"
          element={
            <RequireRole path="/clinical/maxillofacial">
              <MaxillofacialPage />
            </RequireRole>
          }
        />
        <Route
          path="/clinical/orthodontic"
          element={
            <RequireRole path="/clinical/orthodontic">
              <OrthodonticPage />
            </RequireRole>
          }
        />
        <Route
          path="/clinical/paediatric"
          element={
            <RequireRole path="/clinical/paediatric">
              <PaediatricPage />
            </RequireRole>
          }
        />
        <Route
          path="/hygiene"
          element={
            <RequireRole path="/hygiene">
              <HygienePage />
            </RequireRole>
          }
        />
        <Route
          path="/vitals"
          element={
            <RequireRole path="/vitals">
              <VitalSignsPage />
            </RequireRole>
          }
        />
        <Route
          path="/clinical-records"
          element={
            <RequireRole path="/clinical-records">
              <ClinicalRecordsPage />
            </RequireRole>
          }
        />
        <Route
          path="/imaging"
          element={
            <RequireRole path="/imaging">
              <ImagingPage />
            </RequireRole>
          }
        />
        <Route
          path="/lab"
          element={
            <RequireRole path="/lab">
              <LabPage />
            </RequireRole>
          }
        />
        <Route
          path="/pharmacy"
          element={
            <RequireRole path="/pharmacy">
              <PharmacyPage />
            </RequireRole>
          }
        />
        <Route
          path="/requisitions"
          element={
            <RequireRole path="/requisitions">
              <RequisitionsPage />
            </RequireRole>
          }
        />
        <Route
          path="/inventory"
          element={
            <RequireRole path="/inventory">
              <InventoryPage />
            </RequireRole>
          }
        />
        <Route path="/patients" element={<PatientsPage />} />
        <Route path="/patients/:id" element={<PatientDetailPage />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/billing" element={<BillingLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path="invoices" element={<InvoicesPage />} />
          <Route path="invoices/:invoiceId" element={<InvoiceDetailPage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
        </Route>
        <Route
          path="/reports"
          element={
            <RequireRole path="/reports">
              <ReportsPage />
            </RequireRole>
          }
        />
        <Route path="/ai" element={<AiAssistPage />} />
      </Route>
      <Route path="*" element={<Navigate to={MODULES_DASHBOARD_PATH} replace />} />
    </Routes>
    </TooltipProvider>
  );
}
