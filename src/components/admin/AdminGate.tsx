import type { ReactNode } from "react";
import { Lock, Crown } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { FullPageSpinner } from "@/components/common/Spinner";
import { AdminShell } from "./AdminShell";
import { hasPermission, hasAnyPermission, type AdminPermission } from "@/types/user";
import { Link } from "@tanstack/react-router";

interface Props {
  children: ReactNode;
  /** If provided, user must have at least one of these permissions */
  permissions?: AdminPermission[];
  /** If true, only super_admin can access */
  superAdminOnly?: boolean;
}

export function AdminGate({ children, permissions, superAdminOnly }: Props) {
  const { profile, loading } = useAuth();

  if (loading) return <FullPageSpinner />;

  // Must be admin
  if (profile?.role !== "admin") {
    return (
      <AdminShell>
        <AccessDenied
          icon={<Lock className="h-7 w-7" />}
          title="Admin access required"
          message="You don't have permission to access the Admin Panel."
        />
      </AdminShell>
    );
  }

  // Super admin only check
  if (superAdminOnly && profile.adminRole !== "super_admin") {
    return (
      <AdminShell>
        <AccessDenied
          icon={<Crown className="h-7 w-7" />}
          title="Super Admin access required"
          message="This area is restricted to the Super Admin only."
        />
      </AdminShell>
    );
  }

  // Permission check
  if (permissions && permissions.length > 0) {
    const isSuper = profile.adminRole === "super_admin";
    const hasAccess = isSuper || hasAnyPermission(profile, permissions);
    if (!hasAccess) {
      return (
        <AdminShell>
          <AccessDenied
            icon={<Lock className="h-7 w-7" />}
            title="Permission denied"
            message="You don't have the required permissions to access this section. Contact the Super Admin if you need access."
          />
        </AdminShell>
      );
    }
  }

  return <>{children}</>;
}

function AccessDenied({ icon, title, message }: { icon: ReactNode; title: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border bg-background py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </div>
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{message}</p>
      <Link to="/admin" className="mt-6 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
        Back to Dashboard
      </Link>
    </div>
  );
}
