import { createFileRoute } from "@tanstack/react-router";
import { Package } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";

export const Route = createFileRoute("/_authenticated/orders")({
  component: OrdersPage,
});

function OrdersPage() {
  return (
    <AppShell>
      <div>
        <h1 className="text-2xl font-bold">My Orders</h1>
        <p className="text-sm text-muted-foreground">Track and manage your purchases</p>
      </div>
      <div className="mt-8 flex flex-col items-center justify-center rounded-lg border bg-background py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Package className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-lg font-semibold">No orders yet</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          When you place an order, it will appear here so you can track shipping and history.
        </p>
      </div>
    </AppShell>
  );
}
