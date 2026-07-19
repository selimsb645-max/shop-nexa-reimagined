import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Package } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Spinner } from "@/components/common/Spinner";
import { useAuth } from "@/context/AuthContext";
import { listOrders } from "@/services/firebase/orders";
import { formatDateTime, formatPrice } from "@/utils/format";

export const Route = createFileRoute("/_authenticated/orders")({
  component: OrdersPage,
});

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-blue-100 text-blue-800",
  processing: "bg-indigo-100 text-indigo-800",
  shipped: "bg-purple-100 text-purple-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

function OrdersPage() {
  const { user } = useAuth();
  const { data: orders, isLoading } = useQuery({
    queryKey: ["orders", user?.uid],
    queryFn: () => listOrders(user!.uid),
    enabled: !!user,
  });

  return (
    <AppShell>
      <div>
        <h1 className="text-2xl font-bold">My Orders</h1>
        <p className="text-sm text-muted-foreground">Track and manage your purchases</p>
      </div>

      {isLoading ? (
        <div className="mt-8 py-16 text-center"><Spinner /></div>
      ) : !orders || orders.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-lg border bg-background py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Package className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">No orders yet</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            When you place an order, it will appear here so you can track shipping and history.
          </p>
          <Link to="/shop" className="mt-4 rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            Start Shopping
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {orders.map((o) => (
            <Link
              key={o.id}
              to="/order/$orderId"
              params={{ orderId: o.id }}
              className="block rounded-lg border bg-background p-4 hover:border-primary hover:shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">Order #{o.id.slice(0, 8).toUpperCase()}</div>
                  <div className="mt-0.5 text-sm">{formatDateTime(o.createdAt)}</div>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${STATUS_STYLE[o.status] ?? "bg-muted"}`}>
                  {o.status}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <div className="flex -space-x-2">
                  {o.items.slice(0, 4).map((it) => (
                    <img key={it.productId} src={it.image} alt="" className="h-10 w-10 rounded-full border-2 border-background object-cover" />
                  ))}
                  {o.items.length > 4 && (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-background bg-muted text-xs font-semibold">
                      +{o.items.length - 4}
                    </div>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">
                  {o.items.length} item{o.items.length === 1 ? "" : "s"}
                </div>
                <div className="ml-auto text-lg font-bold text-primary">{formatPrice(o.total)}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
