import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  MapPin,
  Package,
  Truck,
  CheckCircle2,
  XCircle,
  Clock,
  Loader,
} from "lucide-react";
import { toast } from "sonner";
import { SellerGate } from "@/components/seller/SellerGate";
import { Spinner } from "@/components/common/Spinner";
import { getSellerOrder, updateSellerOrderStatus } from "@/services/firebase/sellerOrders";
import { createNotification } from "@/services/firebase/sellers";
import { formatDateTime, formatPrice } from "@/utils/format";
import type { SellerOrder, SellerOrderStatus } from "@/types/seller";
import { mapFirebaseError } from "@/utils/errors";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/i18n";
import { getNextValidStatuses, isValidTransition, canCancel } from "@/lib/tracking-utils";
import type { TrackingOrderStatus } from "@/types/tracking";

export const Route = createFileRoute("/_authenticated/seller/orders/$orderId")({
  component: () => <SellerGate>{(profile) => <OrderDetail sellerId={profile.uid} />}</SellerGate>,
});

function toTrackingStatus(s: SellerOrderStatus): TrackingOrderStatus {
  const map: Record<SellerOrderStatus, TrackingOrderStatus> = {
    pending: "pending",
    confirmed: "confirmed",
    processing: "processing",
    shipped: "shipped",
    delivered: "delivered",
    cancelled: "cancelled",
    returned: "returned",
  };
  return map[s] ?? "pending";
}

function OrderDetail({ sellerId }: { sellerId: string }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { orderId } = useParams({ from: "/_authenticated/seller/orders/$orderId" });
  const [order, setOrder] = useState<SellerOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [nextStatus, setNextStatus] = useState<SellerOrderStatus>("processing");
  const [note, setNote] = useState("");
  const [courierName, setCourierName] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const o = await getSellerOrder(sellerId, orderId);
      setOrder(o);
      if (o) {
        const validNext = getNextValidStatuses(toTrackingStatus(o.status));
        const sellerValid = validNext.filter((s) =>
          ["processing", "shipped", "delivered", "cancelled"].includes(s),
        );
        const suggest = sellerValid[0]
          ? ((sellerValid[0] === "processing"
              ? "processing"
              : sellerValid[0] === "shipped"
                ? "shipped"
                : sellerValid[0] === "delivered"
                  ? "delivered"
                  : sellerValid[0] === "cancelled"
                    ? "cancelled"
                    : "processing") as SellerOrderStatus)
          : "processing";
        setNextStatus(suggest);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [sellerId, orderId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-background p-8 text-sm text-muted-foreground">
        <Spinner /> Loading order...
      </div>
    );
  }
  if (!order) {
    return (
      <div className="rounded-lg border bg-background p-8 text-sm text-muted-foreground">
        Order not found.
      </div>
    );
  }

  const validNext = getNextValidStatuses(toTrackingStatus(order.status));
  const validSellerNext = validNext.filter((s) =>
    ["processing", "shipped", "delivered", "cancelled"].includes(s),
  ) as unknown as SellerOrderStatus[];
  const canUpdate =
    validSellerNext.length > 0 && order.status !== "cancelled" && order.status !== "delivered";

  const onUpdate = async () => {
    // Validate transition
    if (!isValidTransition(toTrackingStatus(order.status), toTrackingStatus(nextStatus))) {
      toast.error(`Invalid transition: ${order.status} → ${nextStatus}`);
      return;
    }
    // Confirm critical actions
    if (
      nextStatus === "delivered" &&
      !confirm("Mark this order as delivered? This will start the settlement hold period.")
    )
      return;
    if (
      nextStatus === "cancelled" &&
      !confirm("Cancel this order? This will reverse all settlement entries.")
    )
      return;

    setSaving(true);
    try {
      const idToken = user ? await user.getIdToken() : undefined;
      const courier =
        nextStatus === "shipped" && courierName
          ? {
              name: courierName,
              trackingNumber: trackingNumber || undefined,
              trackingUrl: trackingUrl || undefined,
            }
          : undefined;
      await updateSellerOrderStatus(sellerId, order.id, nextStatus, note, idToken, courier);
      try {
        await createNotification(sellerId, {
          type: "new_order",
          title: `Order #${order.id.slice(0, 8)} → ${nextStatus}`,
          message: note || `Status updated to ${nextStatus}`,
          link: `/seller/orders/${order.id}`,
        });
      } catch {
        /* Non-fatal */
      }
      toast.success(t("seller.orderUpdated"));
      setNote("");
      setCourierName("");
      setTrackingNumber("");
      setTrackingUrl("");
      await load();
    } catch (err) {
      toast.error(mapFirebaseError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to="/seller/orders"
          className="flex h-9 w-9 items-center justify-center rounded-md border hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Order #{order.id.slice(0, 8)}</h1>
          <p className="text-sm text-muted-foreground">Placed {formatDateTime(order.createdAt)}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {/* Items */}
          <div className="rounded-lg border bg-background">
            <div className="border-b p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Package className="h-4 w-4" /> Items ({order.items.length})
              </div>
            </div>
            <div className="divide-y">
              {order.items.map((it) => (
                <div key={it.productId} className="flex items-center gap-3 p-4">
                  <img
                    src={it.image || "/placeholder.svg"}
                    alt=""
                    className="h-14 w-14 rounded-md object-cover"
                  />
                  <div className="min-0 flex-1">
                    <div className="truncate font-medium">{it.title}</div>
                    <div className="text-xs text-muted-foreground">
                      Qty {it.quantity} · {formatPrice(it.price)}
                    </div>
                  </div>
                  <div className="text-sm font-semibold">{formatPrice(it.subtotal)}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t p-4 text-sm">
              <span className="text-muted-foreground">{t("order.subtotal")}</span>
              <span className="font-semibold">{formatPrice(order.subtotal)}</span>
            </div>
          </div>

          {/* Shipping address */}
          <div className="rounded-lg border bg-background p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <MapPin className="h-4 w-4" /> Shipping address
            </div>
            <div className="text-sm">
              <div className="font-medium">{order.shippingAddress.fullName}</div>
              <div className="text-muted-foreground">{order.shippingAddress.phone}</div>
              <div className="mt-1">
                {order.shippingAddress.addressLine}, {order.shippingAddress.city},{" "}
                {order.shippingAddress.postalCode}, {order.shippingAddress.country}
              </div>
              {order.shippingAddress.notes && (
                <div className="mt-2 rounded-md bg-muted p-2 text-xs">
                  Note: {order.shippingAddress.notes}
                </div>
              )}
            </div>
          </div>

          {/* Full Tracking History */}
          <div className="rounded-lg border bg-background">
            <div className="border-b p-4 text-sm font-semibold">{t("seller.trackingHistory")}</div>
            <ol className="divide-y">
              {order.tracking
                .slice()
                .reverse()
                .map((t, i) => (
                  <li key={i} className="flex items-start gap-3 p-4 text-sm">
                    <div
                      className={`mt-1 h-2 w-2 rounded-full ${
                        t.status === "cancelled"
                          ? "bg-rose-500"
                          : t.status === "delivered"
                            ? "bg-emerald-500"
                            : "bg-primary"
                      }`}
                    />
                    <div className="flex-1">
                      <div className="font-medium capitalize">{t.status.replace(/_/g, " ")}</div>
                      <div className="text-xs text-muted-foreground">{t.note}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">{formatDateTime(t.at)}</div>
                  </li>
                ))}
            </ol>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="rounded-lg border bg-background p-4 text-sm">
            <div className="mb-3 font-semibold">{t("seller.customer")}</div>
            <div className="font-medium">{order.buyerName}</div>
            <div className="text-muted-foreground">{order.buyerEmail ?? "—"}</div>
          </div>

          <div className="rounded-lg border bg-background p-4 text-sm">
            <div className="mb-3 font-semibold">{t("seller.payment")}</div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("seller.method")}</span>
              <span className="capitalize">{order.paymentMethod.replace(/_/g, " ")}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-muted-foreground">{t("seller.status")}</span>
              <span className="capitalize">{order.paymentStatus}</span>
            </div>
          </div>

          {/* Update Status */}
          {canUpdate ? (
            <div className="rounded-lg border bg-background p-4">
              <div className="mb-3 text-sm font-semibold">{t("seller.updateStatus")}</div>
              <label className="mb-2 block text-xs font-medium">{t("seller.updateStatus")}</label>
              <div className="mb-3 grid grid-cols-2 gap-2">
                {(["processing", "shipped", "delivered", "cancelled"] as SellerOrderStatus[]).map(
                  (s) => {
                    const valid = isValidTransition(
                      toTrackingStatus(order.status),
                      toTrackingStatus(s),
                    );
                    return (
                      <button
                        key={s}
                        onClick={() => valid && setNextStatus(s)}
                        disabled={!valid}
                        className={`rounded-md border px-3 py-2.5 text-xs font-semibold transition-all ${
                          !valid
                            ? "border-slate-100 text-slate-300 cursor-not-allowed"
                            : nextStatus === s
                              ? s === "cancelled"
                                ? "border-rose-500 bg-rose-50 text-rose-600"
                                : "border-primary bg-primary/5 text-primary"
                              : s === "cancelled"
                                ? "border-slate-200 text-slate-500 hover:border-rose-200"
                                : "border-slate-200 text-slate-500 hover:border-slate-300"
                        }`}
                      >
                        {s === "processing" ? (
                          <Package className="mb-1 inline h-4 w-4" />
                        ) : s === "shipped" ? (
                          <Truck className="mb-1 inline h-4 w-4" />
                        ) : s === "delivered" ? (
                          <CheckCircle2 className="mb-1 inline h-4 w-4" />
                        ) : (
                          <XCircle className="mb-1 inline h-4 w-4" />
                        )}
                        <br />
                        {s === "processing" ? "Processing" : s.charAt(0).toUpperCase() + s.slice(1)}
                      </button>
                    );
                  },
                )}
              </div>

              {nextStatus === "shipped" && (
                <div className="mb-3 rounded-md bg-blue-50 border border-blue-100 p-3">
                  <p className="mb-2 text-xs font-semibold text-blue-700">
                    Courier Info (for customer tracking)
                  </p>
                  <input
                    type="text"
                    value={courierName}
                    onChange={(e) => setCourierName(e.target.value)}
                    placeholder="Courier name (e.g. Steadfast, RedX)"
                    className="mb-2 w-full rounded-md border border-blue-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400"
                  />
                  <input
                    type="text"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    placeholder={t("seller.trackingNumber")}
                    className="mb-2 w-full rounded-md border border-blue-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400"
                  />
                  <input
                    type="text"
                    value={trackingUrl}
                    onChange={(e) => setTrackingUrl(e.target.value)}
                    placeholder="Tracking URL (optional)"
                    className="w-full rounded-md border border-blue-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400"
                  />
                </div>
              )}

              <label className="mb-1 block text-xs font-medium">Note (optional)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={300}
                placeholder="Add a customer-facing note..."
                className="mb-3 w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-primary"
              />

              <button
                onClick={onUpdate}
                disabled={saving || nextStatus === order.status}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {saving && <Spinner />} Update order
              </button>
            </div>
          ) : (
            <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground text-center">
              {order.status === "cancelled"
                ? "This order has been cancelled."
                : "This order has been delivered."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
