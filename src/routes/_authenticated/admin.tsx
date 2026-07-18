import { createFileRoute } from "@tanstack/react-router";
import { Shield, Lock } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/context/AuthContext";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

function AdminPage() {
  const { profile } = useAuth();
  if (profile?.role !== "admin") {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center rounded-lg border bg-background py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Lock className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">Admin access required</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            You don't have permission to view this page.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div>
        <h1 className="text-2xl font-bold">Admin Panel</h1>
        <p className="text-sm text-muted-foreground">Manage users, sellers and platform settings</p>
      </div>
      <div className="mt-8 flex flex-col items-center justify-center rounded-lg border bg-background py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Shield className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-lg font-semibold">Platform overview</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          User management, seller approvals and moderation tools live here.
        </p>
      </div>
    </AppShell>
  );
}
