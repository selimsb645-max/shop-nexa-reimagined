import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, Package, Truck, Home, XCircle } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Spinner } from "@/components/common/Spinner";
import { useAuth } from "@/context/AuthContext";
import { getOrder } from "@/services/firebase/orders";
import { formatDateTime, formatPrice } from "@/utils/format";
import type { OrderStatus } from "@/types/commerce";

export const Route = createFileRoute("/_authenticated/order/$orderId")({
  component: OrderDetailPage,
});

const FLOW: { key: OrderStatus; label: string; icon: typeof Package }[] = [
  { key: "pending", label: "Order Placed", icon: CheckCircle2 },
  { key: "confirmed", label: "Confirmed", icon: CheckCircle2 },
  { key: "processing", label: "Processing", icon: Package },
  { key: "shipped", label: "Shipped", icon: Truck },
  { key: "delivered", label: "Delivered", icon: Home },
];

function stepIndex(status: OrderStatus): number {
  const idx = FLOW.findIndex((s) => s.key === status);
  return idx < 0 ? 0 : idx;
}

function OrderDetailPage() {
  const { orderId } = Route.useParams();
  const { user } = useAuth();
  const { data: order, isLoading } = useQuery({
    queryKey: ["order", user?.uid, orderId],
    queryFn: () => getOrder(user!.uid, orderId),
    enabled: !!user,
  });

  if (isLoading) return <AppShell><div className="py-16 text-center"><Spinner /></div></AppShell>;
  if (!order) {
    return (
      <AppShell>
        <div className="rounded-lg border bg-background p-16 text-center">
          <h2 className="text-lg font-semibold">Order not found</h2>
          <Link to="/orders" className="mt-4 inline-block text-sm text-primary hover:underline">
            Back to orders
          </Link>
        </div>
      </AppShell>
    );
  }

  const cancelled = order.status === "cancelled";
  const currentStep = stepIndex(order.status);

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <Link to="/orders" className="text-xs text-muted-foreground hover:text-primary">← All orders</Link>
          <h1 className="mt-1 text-2xl font-bold">Order #{order.id.slice(0, 8).toUpperCase()}</h1>
          <p className="text-sm text-muted-foreground">Placed {formatDateTime(order.createdAt)}</p>
        </div>
      </div>

      <div className="mb-6 rounded-lg border bg-background p-6">
        <h2 className="mb-6 font-semibold">Order Tracking</h2>
        {cancelled ? (
          <div className="flex items-center gap-3 rounded-md bg-red-50 p-4 text-red-800">
            <XCircle className="h-6 w-6" />
            <div>
              <div className="font-semibold">Order Cancelled</div>
              <div className="text-sm">This order has been cancelled.</div>
            </div>
          </div>
        ) : (
          <div className="relative flex justify-between">
            <div className="absolute left-4 right-4 top-4 h-0.5 bg-muted" />
            <div
              className="absolute left-4 top-4 h-0.5 bg-primary transition-all"
              style={{ width: `calc(${(currentStep / (FLOW.length - 1)) * 100}% - ${currentStep === FLOW.length - 1 ? 0 : 16}px)` }}
            />
            {FLOW.map((step, i) => {
              const done = i <= currentStep;
              const Icon = done ? step.icon : Circle;
              return (
                <div key={step.key} className="relative z-10 flex flex-col items-center gap-2">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full ${done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className={`text-center text-[11px] font-medium ${done ? "" : "text-muted-foreground"}`}>
                    {step.label}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {order.tracking.length > 0 && (
          <div className="mt-8 space-y-2 border-t pt-4">
            {order.tracking.slice().reverse().map((t, i) => (
              <div key={i} className="flex justify-between text-sm">
                <div>
                  <span className="font-medium capitalize">{t.status}</span>
                  <span className="text-muted-foreground"> — {t.note}</span>
                </div>
                <div className="text-xs text-muted-foreground">{formatDateTime(t.at)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="rounded-lg border bg-background p-5">
          <h2 className="mb-4 font-semibold">Items</h2>
          <div className="space-y-3">
            {order.items.map((it) => (
              <div key={it.productId} className="flex gap-3">
                <Link to="/product/$slug" params={{ slug: it.slug }} className="shrink-0">
                  <img src={it.image} alt="" className="h-16 w-16 rounded object-cover" />
                </Link>
                <div className="flex-1">
                  <Link to="/product/$slug" params={{ slug: it.slug }} className="text-sm font-medium hover:text-primary">
                    {it.title}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {formatPrice(it.price)} × {it.quantity}
                  </div>
                </div>
                <div className="text-sm font-semibold">{formatPrice(it.subtotal)}</div>
              </div>
            ))}
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-lg border bg-background p-5">
            <h3 className="mb-3 font-semibold">Shipping Address</h3>
            <div className="text-sm">
              <div className="font-medium">{order.shippingAddress.fullName}</div>
              <div className="text-muted-foreground">{order.shippingAddress.phone}</div>
              <div className="mt-1">{order.shippingAddress.addressLine}</div>
              <div>{order.shippingAddress.city}, {order.shippingAddress.postalCode}</div>
              <div>{order.shippingAddress.country}</div>
            </div>
          </div>
          <div className="rounded-lg border bg-background p-5">
            <h3 className="mb-3 font-semibold">Payment</h3>
            <div className="text-sm capitalize">{order.payment.method.replace(/_/g, " ")}</div>
            <div className="text-xs capitalize text-muted-foreground">Status: {order.payment.status}</div>
          </div>
          <div className="rounded-lg border bg-background p-5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatPrice(order.subtotal)}</span>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Discount{order.couponCode ? ` (${order.couponCode})` : ""}</span>
                <span>-{formatPrice(order.discount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Shipping</span>
              <span>{order.shipping === 0 ? "Free" : formatPrice(order.shipping)}</span>
            </div>
            <div className="mt-3 flex justify-between border-t pt-3 text-base font-semibold">
              <span>Total</span>
              <span className="text-primary">{formatPrice(order.total)}</span>
            </div>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
