/**
 * Aventa Shop — Customer Order Tracking Page
 * Route: /track/:trackingId
 * Public page — anyone with the tracking ID can view order status.
 * Real-time: auto-updates when order status changes.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import {
  Package,
  CheckCircle2,
  Truck,
  Home,
  XCircle,
  Clock,
  Loader,
  Search,
  MapPin,
  User,
  Phone,
  ArrowLeft,
  PackageCheck,
  Bike,
  RotateCcw,
} from "lucide-react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { formatDateTime, formatDate, formatPrice } from "@/utils/format";
import {
  STATUS_LABELS,
  STATUS_SHORT,
  type TrackingOrderStatus,
  type StatusHistoryEntry,
  type TimelineStep,
} from "@/types/tracking";
import { FULFILLMENT_FLOW, getFlowIndex } from "@/lib/tracking-utils";

export const Route = createFileRoute("/track/$trackingId")({
  ssr: false,
  component: TrackingPage,
  head: () => ({ meta: [{ title: "Track Order — Aventa Shop" }] }),
});

const STATUS_ICONS: Record<TrackingOrderStatus, typeof Package> = {
  pending: Package,
  confirmed: CheckCircle2,
  processing: PackageCheck,
  packed: PackageCheck,
  shipped: Truck,
  out_for_delivery: Bike,
  delivered: Home,
  cancelled: XCircle,
  return_requested: RotateCcw,
  returned: RotateCcw,
};

const STATUS_COLORS: Record<TrackingOrderStatus, string> = {
  pending: "text-slate-500 bg-slate-100",
  confirmed: "text-blue-600 bg-blue-100",
  processing: "text-indigo-600 bg-indigo-100",
  packed: "text-violet-600 bg-violet-100",
  shipped: "text-purple-600 bg-purple-100",
  out_for_delivery: "text-amber-600 bg-amber-100",
  delivered: "text-emerald-600 bg-emerald-100",
  cancelled: "text-rose-600 bg-rose-100",
  return_requested: "text-orange-600 bg-orange-100",
  returned: "text-rose-600 bg-rose-100",
};

function TrackingPage() {
  const { trackingId } = Route.useParams() as { trackingId: string };
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<Record<string, unknown> | null>(null);
  const [history, setHistory] = useState<StatusHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!trackingId) return;
    let unsubOrder: (() => void) | null = null;
    let unsubHistory: (() => void) | null = null;

    async function load() {
      try {
        const { getTrackingBy } = await import("@/lib/order-tracking.functions");
        const result = (await getTrackingBy({ data: { trackingId } })) as {
          found: boolean;
          orderId: string;
          trackingId: string;
          currentStatus: string;
          history: Array<Record<string, unknown>>;
        };

        if (!result.found || !result.orderId) {
          setError("No order found with this tracking ID.");
          setLoading(false);
          return;
        }

        // Set initial history
        const hist = result.history.map((h) => ({
          id: String(h.id ?? ""),
          orderId: String(h.orderId ?? ""),
          trackingId: String(h.trackingId ?? ""),
          status: h.status as TrackingOrderStatus,
          previousStatus: (h.previousStatus as TrackingOrderStatus | null) ?? null,
          updatedBy: String(h.updatedBy ?? ""),
          updatedByRole: h.updatedByRole as StatusHistoryEntry["updatedByRole"],
          note: String(h.note ?? ""),
          timestamp: Number(h.timestamp ?? 0),
        }));
        setHistory(hist);

        // Real-time: subscribe to order doc and history
        const { getDb } = await import("@/services/firebase/config");
        const { collectionGroup, query, where, getDocs, onSnapshot, doc } =
          await import("firebase/firestore");
        const db = getDb();

        // Find the user's order by searching collectionGroup
        const snap = await getDocs(
          query(collectionGroup(db, "orders"), where("trackingId", "==", trackingId.toUpperCase())),
        );

        if (!snap.empty) {
          const orderDoc = snap.docs[0];
          const orderRef = orderDoc.ref;
          unsubOrder = onSnapshot(orderRef, (s) => {
            if (s.exists()) {
              setOrder({ id: s.id, ...(s.data() as Record<string, unknown>) });
            }
            setLoading(false);
          });
        } else {
          setLoading(false);
        }

        // Real-time history listener
        const { subscribeToStatusHistory } = await import("@/services/firebase/orderTracking");
        unsubHistory = subscribeToStatusHistory(trackingId, (entries) => {
          setHistory(entries);
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load tracking info.");
        setLoading(false);
      }
    }

    void load();
    return () => {
      if (unsubOrder) unsubOrder();
      if (unsubHistory) unsubHistory();
    };
  }, [trackingId]);

  const currentStatus: TrackingOrderStatus =
    (order?.["status"] as TrackingOrderStatus | undefined) ??
    (history.length > 0 ? history[history.length - 1].status : "pending");
  const trackingIdDisplay = (order?.["trackingId"] as string) ?? trackingId.toUpperCase();
  const orderDate = Number(order?.["createdAt"] ?? 0);
  const items = (order?.["items"] as Array<Record<string, unknown>>) ?? [];
  const total = Number(order?.["total"] ?? 0);
  const deliveryInfo = order?.["deliveryInfo"] as Record<string, unknown> | undefined;
  const expectedDelivery = Number(deliveryInfo?.["expectedDeliveryDate"] ?? 0);
  const agentName =
    deliveryInfo?.["deliveryAgentName"] != null ? String(deliveryInfo["deliveryAgentName"]) : null;
  const agentPhone =
    deliveryInfo?.["deliveryAgentPhone"] != null
      ? String(deliveryInfo["deliveryAgentPhone"])
      : null;

  const timeline: TimelineStep[] = useMemo(() => {
    const currentIdx = getFlowIndex(currentStatus);
    return FULFILLMENT_FLOW.map((status, idx) => {
      const entry = history.find((h) => h.status === status);
      const completed = currentIdx >= 0 && idx <= currentIdx && currentStatus !== "cancelled";
      const current = idx === currentIdx;
      return {
        status,
        label: STATUS_LABELS[status],
        completed,
        current,
        timestamp: entry?.timestamp ?? null,
        note: entry?.note ?? null,
      };
    });
  }, [history, currentStatus]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50">
        <SiteHeader />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader className="mx-auto w-8 h-8 animate-spin text-orange-400" />
            <p className="mt-3 text-sm text-slate-500">Loading tracking info...</p>
          </div>
        </div>
        <SiteFooter />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50">
        <SiteHeader />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-md w-full text-center">
            <Search className="mx-auto w-12 h-12 text-slate-300 mb-3" />
            <h2 className="text-lg font-bold text-slate-900 mb-2">Tracking ID Not Found</h2>
            <p className="text-sm text-slate-500 mb-6">
              {error || "We couldn't find an order with this tracking ID."}
            </p>
            <Link
              to="/orders"
              className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-6 rounded-xl transition text-sm"
            >
              <ArrowLeft className="w-4 h-4" /> Go to My Orders
            </Link>
          </div>
        </div>
        <SiteFooter />
      </div>
    );
  }

  const StatusIcon = STATUS_ICONS[currentStatus] ?? Package;
  const statusColor = STATUS_COLORS[currentStatus] ?? STATUS_COLORS.pending;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <SiteHeader />
      <main className="flex-1 mx-auto max-w-2xl w-full px-3 sm:px-6 py-4 pb-28 sm:pb-16">
        {/* Header */}
        <div className="mb-4">
          <Link
            to="/orders"
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 mb-3"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Orders
          </Link>
          <h1 className="text-xl font-black text-slate-900">Track Your Order</h1>
          <p className="text-sm text-slate-500 mt-1">
            Tracking ID: <span className="font-bold text-slate-700">{trackingIdDisplay}</span>
          </p>
        </div>

        {/* Current Status Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs text-slate-400">
                Order #{String(order.id).slice(0, 8).toUpperCase()}
              </div>
              {orderDate > 0 && (
                <div className="text-sm text-slate-600 mt-0.5">{formatDate(orderDate)}</div>
              )}
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${statusColor}`}
            >
              <StatusIcon className="w-4 h-4" /> {STATUS_LABELS[currentStatus]}
            </span>
          </div>
          {items.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {items.map((item, i) => (
                <img
                  key={i}
                  src={String(item["image"] ?? "")}
                  alt={String(item["title"] ?? "") as string}
                  className="h-14 w-14 shrink-0 rounded-lg object-cover border border-slate-200"
                />
              ))}
            </div>
          )}
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              {items.length} item{items.length > 1 ? "s" : ""}
            </span>
            <span className="text-lg font-black text-orange-500">{formatPrice(total)}</span>
          </div>
        </div>

        {Boolean(expectedDelivery > 0 || agentName !== null) && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-4">
            {expectedDelivery > 0 && (
              <div className="flex items-center gap-2 text-sm mb-2">
                <Clock className="w-4 h-4 text-orange-500" />
                <span className="text-slate-500">Expected Delivery:</span>
                <span className="font-bold text-slate-900">{formatDate(expectedDelivery)}</span>
              </div>
            )}
            {agentName && (
              <>
                <div className="flex items-center gap-2 text-sm mb-1">
                  <User className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-500">Delivery Agent:</span>
                  <span className="font-semibold text-slate-700">{agentName}</span>
                </div>
                {agentPhone && (
                  <a href={`tel:${agentPhone}`} className="flex items-center gap-2 text-sm">
                    <Phone className="w-4 h-4 text-slate-400" />
                    <span className="font-semibold text-blue-600">{agentPhone}</span>
                  </a>
                )}
              </>
            )}
          </div>
        )}

        {/* Tracking Timeline */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <h2 className="text-sm font-bold text-slate-900 mb-4">Tracking Timeline</h2>
          {currentStatus === "cancelled" ? (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-rose-50 border border-rose-100">
              <XCircle className="w-8 h-8 text-rose-500 shrink-0" />
              <div>
                <p className="font-bold text-rose-700">Order Cancelled</p>
                <p className="text-xs text-rose-500 mt-0.5">
                  {history.find((h) => h.status === "cancelled")?.note ??
                    "This order has been cancelled."}
                </p>
              </div>
            </div>
          ) : currentStatus === "return_requested" || currentStatus === "returned" ? (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-orange-50 border border-orange-100">
              <RotateCcw className="w-8 h-8 text-orange-500 shrink-0" />
              <div>
                <p className="font-bold text-orange-700">{STATUS_LABELS[currentStatus]}</p>
                <p className="text-xs text-orange-500 mt-0.5">
                  {history.find((h) => h.status === currentStatus)?.note ?? ""}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              {timeline.map((step, idx) => {
                const Icon = STATUS_ICONS[step.status] ?? Package;
                const isLast = idx === timeline.length - 1;
                return (
                  <div key={step.status} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className={`grid h-10 w-10 place-items-center rounded-full transition ${
                          step.completed
                            ? step.current
                              ? "bg-orange-500 text-white ring-4 ring-orange-100"
                              : "bg-orange-500 text-white"
                            : "bg-slate-100 text-slate-400"
                        }`}
                      >
                        {step.completed ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : (
                          <Icon className="w-5 h-5" />
                        )}
                      </div>
                      {!isLast && (
                        <div
                          className={`w-0.5 h-8 ${step.completed ? "bg-orange-500" : "bg-slate-200"}`}
                        />
                      )}
                    </div>
                    <div className={`pb-4 ${isLast ? "pb-0" : ""}`}>
                      <p
                        className={`text-sm font-semibold ${step.completed ? "text-slate-900" : "text-slate-400"}`}
                      >
                        {step.label}
                      </p>
                      {step.timestamp && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          {formatDateTime(step.timestamp)}
                        </p>
                      )}
                      {step.note && step.current && (
                        <p className="text-xs text-slate-400 mt-1">{step.note}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Full history log */}
          {history.length > 0 && (
            <div className="mt-5 pt-4 border-t border-slate-100">
              <h3 className="text-xs font-bold text-slate-500 uppercase mb-3">Full History</h3>
              <div className="space-y-2">
                {[...history].reverse().map((entry, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span
                      className={`mt-0.5 h-1.5 w-1.5 rounded-full shrink-0 ${
                        entry.status === "cancelled" ? "bg-rose-400" : "bg-orange-400"
                      }`}
                    />
                    <div className="flex-1">
                      <span className="font-semibold text-slate-700">
                        {STATUS_SHORT[entry.status]}
                      </span>
                      {entry.note && <span className="text-slate-500"> — {entry.note}</span>}
                      <span className="text-slate-400 ml-2">{formatDateTime(entry.timestamp)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Delivery Address */}
        {Boolean(order?.["shippingAddress"]) && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mt-4">
            <h2 className="text-sm font-bold text-slate-900 mb-2">Delivery Address</h2>
            <div className="flex items-start gap-2 text-sm text-slate-600">
              <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-slate-700">
                  {String((order["shippingAddress"] as Record<string, unknown>)["fullName"] ?? "")}
                </p>
                <p className="text-slate-500">
                  {String(
                    (order["shippingAddress"] as Record<string, unknown>)["addressLine"] ?? "",
                  )}
                </p>
                <p className="text-slate-500">
                  {String((order["shippingAddress"] as Record<string, unknown>)["city"] ?? "")}
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
      <SiteFooter />
      <MobileBottomNav />
    </div>
  );
}
