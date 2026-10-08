import { Navigate } from "react-router-dom";
import { Spinner } from "@/components/ui/accordion";
import { useAuth } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { canAccessPath, roleHomePath } from "@/lib/nav";

export function RequireRole({
  roles,
  children,
  path,
}: {
  roles?: string[];
  path?: string;
  children: React.ReactNode;
}) {
  const user = useAuth((s) => s.user);
  const token = useAuth((s) => s.accessToken);

  if (!user) {
    if (token) {
      return (
        <div className="grid min-h-[40vh] place-items-center">
          <Spinner label={t("loadingWorkspace")} />
        </div>
      );
    }
    return <Navigate to="/login" replace />;
  }

  if (path && !canAccessPath(user.role, path, user.effective_permissions)) {
    return <Navigate to={roleHomePath(user.role)} replace />;
  }
  if (roles && !roles.includes(user.role)) {
    if (path && canAccessPath(user.role, path, user.effective_permissions)) {
      return <>{children}</>;
    }
    return <Navigate to={roleHomePath(user.role)} replace />;
  }
  return <>{children}</>;
}
