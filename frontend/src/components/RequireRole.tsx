import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
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
  if (!user) return <Navigate to="/login" replace />;

  if (path && !canAccessPath(user.role, path)) {
    return <Navigate to={roleHomePath(user.role)} replace />;
  }
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={roleHomePath(user.role)} replace />;
  }
  return <>{children}</>;
}
