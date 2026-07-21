import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { FullPageSpinner } from "@/components/common/Spinner";
import { AdminShell } from "./AdminShell";

interface Props {
  children: ReactNode;
}

export function AdminGate({ children }: Props) {
  const { profile, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (profile?.role !== "admin") {
    return (
      <AdminShell>
        <div className="flex flex-col items-center justify-center rounded-lg border bg-background py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Lock className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">Admin access required</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            You don't have permission to access the Super Admin Panel.
          </p>
        </div>
      </AdminShell>
    );
  }
  return <>{children}</>;
}
