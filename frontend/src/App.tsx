import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { RequireRole } from "@/components/RequireRole";
import { useAuth } from "@/lib/auth";
import { roleHomePath } from "@/lib/nav";
import { AiAssistPage } from "@/pages/AiAssistPage";
import { BillingPage } from "@/pages/BillingPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { LoginPage } from "@/pages/LoginPage";
import { PatientDetailPage } from "@/pages/PatientDetailPage";
import { PatientsPage } from "@/pages/PatientsPage";
import { PortalHomePage } from "@/pages/PortalHomePage";
import { PortalLoginPage } from "@/pages/PortalLoginPage";
import { SchedulePage } from "@/pages/SchedulePage";
import { ReportsPage } from "@/pages/ReportsPage";
import { ClinicAdminPage } from "@/pages/department/ClinicAdminPage";
import { FrontDeskPage } from "@/pages/department/FrontClinicalPages";
import { HygienePage } from "@/pages/department/HygienePage";
import { MaxillofacialPage } from "@/pages/department/clinic/MaxillofacialPage";
import { OrthodonticPage } from "@/pages/department/clinic/OrthodonticPage";
import { PaediatricPage } from "@/pages/department/clinic/PaediatricPage";
import { RestorativeDeptPage } from "@/pages/department/clinic/RestorativeDeptPage";
import { ImagingPage } from "@/pages/department/ImagingPage";
import { InventoryPage } from "@/pages/department/InventoryPage";
import { LabPage } from "@/pages/department/LabPage";
import { OwnerPage } from "@/pages/department/OwnerPage";
import { PharmacyPage } from "@/pages/department/PharmacyPage";

function ProtectedLayout() {
  const token = useAuth((s) => s.accessToken);
  if (!token) return <Navigate to="/login" replace />;
  return <AppShell />;
}

function RoleHomeRedirect() {
  const role = useAuth((s) => s.user?.role);
  return <Navigate to={roleHomePath(role)} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/portal/login" element={<PortalLoginPage />} />
      <Route path="/portal" element={<PortalHomePage />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/home" element={<RoleHomeRedirect />} />
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
        <Route path="/billing" element={<BillingPage />} />
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
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}
