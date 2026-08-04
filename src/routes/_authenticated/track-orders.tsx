import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Truck, MapPin, Clock, Package, CheckCircle2, Loader } from "lucide-react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { WhatsAppFab } from "@/components/layout/SiteChrome";
import { useAuth } from "@/context/AuthContext";
import { listOrdersForTracking } from "@/services/firebase/deliveryTracking";
import { getDeliveryTracking, type DeliveryTracking } from "@/services/firebase/deliveryTracking";
import { firebaseConfigured } from "@/services/firebase/config";
import { formatPrice } from "@/utils/format";
import type { Order } from "@/types/commerce";

export const Route = createFileRoute("/_authenticated/track-orders")({
  ssr: false,
  component: TrackOrdersPage,
  head: () => ({ meta: [{ title: "Track Orders — ShopNexa" }] }),
});

function TrackOrdersPage() {
  const { user } = useAuth();
  const { data: orders, isLoading } = useQuery({
    queryKey: ["orders", "trackable", user?.uid],
    queryFn: () => listOrdersForTracking(user!.uid),
    enabled: !!user && firebaseConfigured,
  });

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <div className="mb-6 flex items-center gap-3">
          <Link to="/account" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Truck className="h-6 w-6 text-primary" />
            Track Orders
          </h1>
        </div>

        {isLoading ? (
          <div className="py-20 text-center">
            <Loader className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !orders || orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border bg-muted/30 py-20 text-center">
            <Truck className="mb-4 h-12 w-12 text-muted-foreground/40" />
            <h2 className="text-lg font-semibold">No trackable orders</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Your shipped and delivered orders will appear here
            </p>
            <Link
              to="/orders"
              className="mt-4 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground"
            >
              View All Orders
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <TrackableOrderCard key={order.id} order={order} />
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
      <WhatsAppFab />
    </div>
  );
}

function TrackableOrderCard({ order }: { order: Order }) {
  const { data: tracking } = useQuery({
    queryKey: ["deliveryTracking", order.id],
    queryFn: () => getDeliveryTracking(order.id),
    enabled: firebaseConfigured,
    refetchInterval: 30_000,
  });

  const steps = [
    { status: "pending", icon: <Package className="h-5 w-5" />, label: "Order Placed" },
    { status: "confirmed", icon: <CheckCircle2 className="h-5 w-5" />, label: "Confirmed" },
    { status: "shipped", icon: <Truck className="h-5 w-5" />, label: "Shipped" },
    { status: "delivered", icon: <CheckCircle2 className="h-5 w-5" />, label: "Delivered" },
  ];

  const currentStatusIndex = steps.findIndex(
    (s) => s.status === order.status,
  );

  return (
    <div className="rounded-2xl border bg-background p-4 shadow-sm">
      {/* Order header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold">Order #{order.id.slice(0, 8)}</span>
          <p className="text-xs text-muted-foreground">
            {order.items.length} item{order.items.length === 1 ? "" : "s"} • {formatPrice(order.total)}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${
          order.status === "delivered"
            ? "bg-green-100 text-green-700"
            : "bg-blue-100 text-blue-700"
        }`}>
          {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
        </span>
      </div>

      {/* Items preview */}
      <div className="mb-4 flex gap-2 overflow-x-auto">
        {order.items.map((item) => (
          <img
            key={item.productId}
            src={item.image}
            alt={item.title}
            className="h-14 w-14 shrink-0 rounded-lg object-cover"
          />
        ))}
      </div>

      {/* Tracking timeline */}
      <div className="relative flex justify-between">
        {steps.map((step, idx) => {
          const isCompleted = idx <= currentStatusIndex;
          const isCurrent = idx === currentStatusIndex;
          return (
            <div key={step.status} className="flex flex-1 flex-col items-center">
              <div
                className={`relative z-10 grid h-10 w-10 place-items-center rounded-full transition ${
                  isCompleted
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                } ${isCurrent ? "ring-4 ring-primary/20" : ""}`}
              >
                {step.icon}
              </div>
              <span
                className={`mt-2 text-center text-[10px] font-medium ${
                  isCompleted ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {step.label}
              </span>
              {idx < steps.length - 1 && (
                <div
                  className={`absolute top-5 left-1/2 h-0.5 w-full ${
                    idx < currentStatusIndex ? "bg-primary" : "bg-muted"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Live tracking info */}
      {tracking && (
        <div className="mt-4 space-y-2 rounded-xl bg-muted/30 p-3">
          <div className="flex items-center gap-2 text-sm">
            <Truck className="h-4 w-4 text-primary" />
            <span className="font-medium">{tracking.deliveryPartnerName || "Delivery partner assigned"}</span>
          </div>
          {tracking.estimatedDeliveryTime && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>
                ETA: {new Date(tracking.estimatedDeliveryTime).toLocaleString()}
              </span>
            </div>
          )}
          {tracking.currentLocation && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span>
                Location: {tracking.currentLocation.lat.toFixed(4)}, {tracking.currentLocation.lng.toFixed(4)}
              </span>
            </div>
          )}
          {tracking.notes.length > 0 && (
            <div className="border-t pt-2">
              {tracking.notes.slice(-3).map((note, i) => (
                <p key={i} className="text-xs text-muted-foreground">{note}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Order tracking events */}
      {order.tracking.length > 0 && (
        <div className="mt-3 space-y-1">
          {order.tracking.slice(-3).map((event, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span>{event.note}</span>
              <span className="ml-auto">
                {new Date(event.at).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
