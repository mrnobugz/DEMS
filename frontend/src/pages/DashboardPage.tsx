import { Navigate } from "react-router-dom";
import { MODULES_DASHBOARD_PATH } from "@/lib/nav";

/** Legacy `/` stats page — every role now lands on the modules dashboard. */
export function DashboardPage() {
  return <Navigate to={MODULES_DASHBOARD_PATH} replace />;
}
