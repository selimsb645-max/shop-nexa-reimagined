import { createFileRoute } from "@tanstack/react-router";
import { Store, Lock } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/context/AuthContext";

export const Route = createFileRoute("/_authenticated/seller")({
  component: SellerPage,
});

function SellerPage() {
  const { profile } = useAuth();
  const allowed = profile?.role === "seller" || profile?.role === "admin";

  if (!allowed) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center rounded-lg border bg-background py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Lock className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">Seller access required</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Your account isn't registered as a seller yet. Contact ShopNexa support to request
            seller access and start listing products.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div>
        <h1 className="text-2xl font-bold">Seller Panel</h1>
        <p className="text-sm text-muted-foreground">Manage your listings and shop</p>
      </div>
      <div className="mt-8 flex flex-col items-center justify-center rounded-lg border bg-background py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Store className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-lg font-semibold">Your storefront is ready</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Product listings, inventory and order management will appear here.
        </p>
      </div>
    </AppShell>
  );
}
