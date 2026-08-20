import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { onSnapshot, doc } from "firebase/firestore";
import { getDb } from "@/services/firebase/config";
import { useEffect, useState } from "react";
import type { DeliveryTracking } from "@/services/firebase/deliveryTracking";
import { Truck, MapPin, Clock, Package, CheckCircle2, Loader } from "lucide-react";
import { ServicePageLayout } from "@/components/common/ServicePageLayout";
import { useAuth } from "@/context/AuthContext";
import { listOrdersForTracking } from "@/services/firebase/deliveryTracking";
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
    <ServicePageLayout title="Track Orders" subtitle="Live tracking for your shipments">
      {isLoading ? (
        <div className="py-20 text-center">
          <Loader className="mx-auto w-8 h-8 animate-spin text-slate-300" />
          <p className="mt-3 text-sm text-slate-400">Loading trackable orders...</p>
        </div>
      ) : !orders || orders.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-8 flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-full bg-orange-50 border-2 border-orange-100 flex items-center justify-center mb-4 text-[#f57224]">
            <Truck className="w-10 h-10 stroke-[1.5]" />
          </div>
          <h2 className="text-lg font-bold text-[#0f172a] mb-2">No trackable orders</h2>
          <p className="text-sm text-slate-500 mb-6 max-w-sm">
            Your shipped and delivered orders will appear here for live tracking.
          </p>
          <Link
            to="/orders"
            className="inline-flex items-center gap-2 bg-[#0f172a] hover:bg-slate-800 text-white font-bold py-3.5 px-8 rounded-xl transition-all shadow-md text-sm"
          >
            <Package className="w-4 h-4" />
            <span>View All Orders</span>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <TrackableOrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </ServicePageLayout>
  );
}

function TrackableOrderCard({ order }: { order: Order }) {
  const [tracking, setTracking] = useState<DeliveryTracking | null>(null);

  useEffect(() => {
    if (!firebaseConfigured) return;
    const unsub = onSnapshot(
      doc(getDb(), "orders", order.id, "tracking", "live"),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Record<string, unknown>;
          setTracking({
            orderId: order.id,
            deliveryPartnerName: (data.deliveryPartnerName as string) || null,
            estimatedDeliveryTime: (data.estimatedDeliveryTime as number) || null,
            currentLocation: (data.currentLocation as { lat: number; lng: number }) || null,
            notes: (data.notes as string[]) || [],
          } as DeliveryTracking);
        }
      },
    );
    return () => unsub();
  }, [order.id]);

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
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-4">
      {/* Order header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <span className="text-sm font-bold text-[#0f172a]">Order #{order.id.slice(0, 8).toUpperCase()}</span>
          <p className="text-xs text-slate-500">
            {order.items.length} item{order.items.length === 1 ? "" : "s"} • {formatPrice(order.total)}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-[10px] font-bold ${
          order.status === "delivered"
            ? "bg-emerald-100 text-emerald-700"
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
            className="h-14 w-14 shrink-0 rounded-lg object-cover border border-slate-200"
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
                    ? "bg-[#f57224] text-white"
                    : "bg-slate-100 text-slate-400"
                } ${isCurrent ? "ring-4 ring-orange-200" : ""}`}
              >
                {step.icon}
              </div>
              <span
                className={`mt-2 text-center text-[10px] font-medium ${
                  isCompleted ? "text-[#0f172a]" : "text-slate-400"
                }`}
              >
                {step.label}
              </span>
              {idx < steps.length - 1 && (
                <div
                  className={`absolute top-5 left-1/2 h-0.5 w-full ${
                    idx < currentStatusIndex ? "bg-[#f57224]" : "bg-slate-200"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Live tracking info */}
      {tracking && (
        <div className="mt-4 space-y-2 rounded-xl bg-slate-50 border border-slate-100 p-3">
          <div className="flex items-center gap-2 text-sm">
            <Truck className="h-4 w-4 text-[#f57224]" />
            <span className="font-semibold text-slate-700">{tracking.deliveryPartnerName || "Delivery partner assigned"}</span>
          </div>
          {tracking.estimatedDeliveryTime && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Clock className="h-4 w-4" />
              <span>
                ETA: {new Date(tracking.estimatedDeliveryTime).toLocaleString()}
              </span>
            </div>
          )}
          {tracking.currentLocation && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <MapPin className="h-4 w-4" />
              <span>
                Location: {tracking.currentLocation.lat.toFixed(4)}, {tracking.currentLocation.lng.toFixed(4)}
              </span>
            </div>
          )}
          {tracking.notes.length > 0 && (
            <div className="border-t border-slate-200 pt-2">
              {tracking.notes.slice(-3).map((note, i) => (
                <p key={i} className="text-xs text-slate-500">{note}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Order tracking events */}
      {order.tracking.length > 0 && (
        <div className="mt-3 space-y-1">
          {order.tracking.slice(-3).map((event, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full bg-[#f57224]" />
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
