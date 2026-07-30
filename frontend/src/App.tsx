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
import { SchedulePage } from "@/pages/SchedulePage";
import { ReportsPage } from "@/pages/ReportsPage";
import { ClinicAdminPage } from "@/pages/department/ClinicAdminPage";
import {
  ClinicalHomePage,
  FrontDeskPage,
} from "@/pages/department/FrontClinicalPages";
import { HygienePage } from "@/pages/department/HygienePage";
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
        <Route
          path="/clinical"
          element={
            <RequireRole path="/clinical">
              <ClinicalHomePage />
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
