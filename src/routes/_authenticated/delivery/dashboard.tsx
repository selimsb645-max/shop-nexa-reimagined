/**
 * Aventa Shop — Delivery Agent Dashboard
 * Route: /delivery/dashboard
 *
 * Shows assigned orders with customer info, address, COD amount,
 * current status. Allows agent to update to OUT_FOR_DELIVERY or DELIVERED.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Package,
  Truck,
  CheckCircle2,
  Loader,
  ArrowLeft,
  MapPin,
  Phone,
  User,
  DollarSign,
  Clock,
  Bike,
  Home,
  XCircle,
} from "lucide-react";
import { ServicePageLayout } from "@/components/common/ServicePageLayout";
import { useAuth } from "@/context/AuthContext";
import { firebaseConfigured, getDb } from "@/services/firebase/config";
import { subscribeToAgentOrders, updateOrderStatusServer } from "@/services/firebase/orderTracking";
import { formatDateTime, formatDate, formatPrice } from "@/utils/format";
import { mapFirebaseError } from "@/utils/errors";
import type { TrackingOrderStatus } from "@/types/tracking";
import { canDeliveryAgentSet, STATUS_LABELS } from "@/lib/tracking-utils";

export const Route = createFileRoute("/_authenticated/delivery/dashboard")({
  ssr: false,
  component: DeliveryDashboardPage,
  head: () => ({ meta: [{ title: "Delivery Dashboard — Aventa Shop" }] }),
});

interface AgentOrder {
  id: string;
  userId: string;
  items: Array<{ title: string; image: string; quantity: number; price: number }>;
  total: number;
  status: string;
  trackingId?: string;
  shippingAddress: {
    fullName: string;
    phone: string;
    addressLine: string;
    city: string;
    postalCode: string;
  };
  payment: { method: string; status: string };
  deliveryInfo?: { expectedDeliveryDate?: number; deliveryAgentName?: string };
  createdAt: number;
}

function DeliveryDashboardPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<AgentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !firebaseConfigured) {
      setLoading(false);
      return;
    }
    // Check if user is a delivery agent
    import("firebase/firestore").then(({ doc, getDoc }) => {
      getDoc(doc(getDb(), "deliveryAgents", user.uid)).then((snap) => {
        if (!snap.exists()) {
          setLoading(false);
          return;
        }
        // Subscribe to agent's assigned orders
        const unsub = subscribeToAgentOrders(user.uid, (rawOrders) => {
          setOrders(rawOrders as unknown as AgentOrder[]);
          setLoading(false);
        });
        return () => unsub();
      });
    });
  }, [user]);

  const handleUpdate = async (orderId: string, newStatus: TrackingOrderStatus) => {
    if (!user) return;
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    if (!canDeliveryAgentSet(order.status as TrackingOrderStatus, newStatus)) {
      toast.error(`Cannot transition from ${order.status} to ${newStatus}`);
      return;
    }
    if (newStatus === "delivered" && !confirm("Mark this order as delivered?")) return;
    setUpdating(orderId);
    try {
      const idToken = await user.getIdToken();
      await updateOrderStatusServer({ idToken, orderId, newStatus });
      toast.success(`Order marked as ${newStatus.replace(/_/g, " ")}`);
    } catch (err) {
      toast.error(mapFirebaseError(err));
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return (
      <ServicePageLayout title="Delivery Dashboard" backTo="/account">
        <div className="py-20 text-center">
          <Loader className="mx-auto w-8 h-8 animate-spin text-slate-300" />
          <p className="mt-3 text-sm text-slate-400">Loading assigned orders...</p>
        </div>
      </ServicePageLayout>
    );
  }

  if (orders.length === 0) {
    return (
      <ServicePageLayout title="Delivery Dashboard" backTo="/account">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-8 flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-full bg-orange-50 border-2 border-orange-100 flex items-center justify-center mb-4 text-[#f57224]">
            <Package className="w-10 h-10 stroke-[1.5]" />
          </div>
          <h2 className="text-lg font-bold text-[#0f172a] mb-2">No Assigned Orders</h2>
          <p className="text-sm text-slate-500 mb-6 max-w-sm">
            Orders assigned to you will appear here. Contact your admin if you haven't been assigned
            any deliveries.
          </p>
        </div>
      </ServicePageLayout>
    );
  }

  return (
    <ServicePageLayout
      title="Delivery Dashboard"
      subtitle={`${orders.length} assigned order${orders.length > 1 ? "s" : ""}`}
      backTo="/account"
    >
      <div className="space-y-4">
        {orders.map((order) => {
          const codAmount = order.payment?.method === "cash_on_delivery" ? order.total : 0;
          const canOutForDelivery = canDeliveryAgentSet(
            order.status as TrackingOrderStatus,
            "out_for_delivery",
          );
          const canDeliver = canDeliveryAgentSet(order.status as TrackingOrderStatus, "delivered");
          const expectedDate = order.deliveryInfo?.expectedDeliveryDate ?? 0;

          return (
            <div
              key={order.id}
              className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-4"
            >
              {/* Order header */}
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-sm font-bold text-slate-900">
                    Order #{order.id.slice(0, 8).toUpperCase()}
                  </span>
                  {order.trackingId && (
                    <p className="text-xs text-slate-500 mt-0.5">Tracking: {order.trackingId}</p>
                  )}
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-[10px] font-bold ${
                    order.status === "delivered"
                      ? "bg-emerald-100 text-emerald-700"
                      : order.status === "out_for_delivery"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {STATUS_LABELS[order.status as TrackingOrderStatus] ?? order.status}
                </span>
              </div>

              {/* Customer info */}
              <div className="space-y-1.5 mb-3 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2 text-sm">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-semibold text-slate-700">
                    {order.shippingAddress?.fullName ?? "—"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <a href={`tel:${order.shippingAddress?.phone}`} className="text-blue-600">
                    {order.shippingAddress?.phone}
                  </a>
                </div>
                <div className="flex items-start gap-2 text-sm text-slate-600">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5" />
                  <span>
                    {order.shippingAddress?.addressLine}, {order.shippingAddress?.city}
                  </span>
                </div>
              </div>

              {/* Order amount + COD */}
              <div className="flex items-center gap-4 mb-3">
                <div>
                  <span className="text-xs text-slate-400 block">Order Amount</span>
                  <span className="text-sm font-bold text-slate-700">
                    {formatPrice(order.total ?? 0)}
                  </span>
                </div>
                {codAmount > 0 && (
                  <div>
                    <span className="text-xs text-slate-400 block">COD Amount</span>
                    <span className="text-sm font-bold text-orange-500">
                      {formatPrice(codAmount)}
                    </span>
                  </div>
                )}
                {expectedDate > 0 && (
                  <div>
                    <span className="text-xs text-slate-400 block">Expected</span>
                    <span className="text-sm font-semibold text-slate-600">
                      {formatDate(expectedDate)}
                    </span>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              {order.status !== "delivered" && order.status !== "cancelled" && (
                <div className="flex gap-2 pt-2 border-t border-slate-100">
                  {canOutForDelivery && (
                    <button
                      onClick={() => handleUpdate(order.id, "out_for_delivery")}
                      disabled={updating === order.id}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold py-2.5 px-3 rounded-xl border border-amber-200 transition text-sm disabled:opacity-50"
                    >
                      <Bike className="w-4 h-4" /> Out for Delivery
                    </button>
                  )}
                  {canDeliver && (
                    <button
                      onClick={() => handleUpdate(order.id, "delivered")}
                      disabled={updating === order.id}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold py-2.5 px-3 rounded-xl border border-emerald-200 transition text-sm disabled:opacity-50"
                    >
                      {updating === order.id ? (
                        <Loader className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                      Mark Delivered
                    </button>
                  )}
                </div>
              )}

              {order.status === "delivered" && (
                <div className="flex items-center gap-2 text-sm text-emerald-600 font-semibold pt-2 border-t border-slate-100">
                  <CheckCircle2 className="w-4 h-4" /> Delivered successfully
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ServicePageLayout>
  );
}
