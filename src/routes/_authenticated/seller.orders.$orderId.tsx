import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  MapPin,
  Package,
  Truck,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { SellerGate } from "@/components/seller/SellerGate";
import { Spinner } from "@/components/common/Spinner";
import {
  getSellerOrder,
  updateSellerOrderStatus,
} from "@/services/firebase/sellerOrders";
import { createNotification } from "@/services/firebase/sellers";
import { formatDateTime, formatPrice } from "@/utils/format";
import type { SellerOrder, SellerOrderStatus } from "@/types/seller";
import { mapFirebaseError } from "@/utils/errors";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/_authenticated/seller/orders/$orderId")({
  component: () => (
    <SellerGate>{(profile) => <OrderDetail sellerId={profile.uid} />}</SellerGate>
  ),
});

const STATUS_FLOW: SellerOrderStatus[] = [
  "confirmed",
  "processing",
  "shipped",
  "delivered",
];

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
        const idx = STATUS_FLOW.indexOf(o.status);
        const suggest =
          o.status === "cancelled" || o.status === "delivered"
            ? o.status
            : STATUS_FLOW[Math.min(idx + 1, STATUS_FLOW.length - 1)];
        setNextStatus(suggest);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const onUpdate = async () => {
    setSaving(true);
    try {
      // Get ID token for settlement server function
      const idToken = user ? await user.getIdToken() : undefined;

      const courier = nextStatus === "shipped" && courierName
        ? { name: courierName, trackingNumber: trackingNumber || undefined, trackingUrl: trackingUrl || undefined }
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
        // Non-fatal.
      }
      toast.success(t("seller.orderUpdated"));
      setNote("");
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
          <p className="text-sm text-muted-foreground">
            Placed {formatDateTime(order.createdAt)}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
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

          <div className="rounded-lg border bg-background">
            <div className="border-b p-4 text-sm font-semibold">{t("seller.trackingHistory")}</div>
            <ol className="divide-y">
              {order.tracking
                .slice()
                .reverse()
                .map((t, i) => (
                  <li key={i} className="flex items-start gap-3 p-4 text-sm">
                    <div className="mt-1 h-2 w-2 rounded-full bg-primary" />
                    <div className="flex-1">
                      <div className="font-medium capitalize">{t.status}</div>
                      <div className="text-xs text-muted-foreground">{t.note}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDateTime(t.at)}
                    </div>
                  </li>
                ))}
            </ol>
          </div>
        </div>

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

          <div className="rounded-lg border bg-background p-4">
            <div className="mb-3 text-sm font-semibold">Update status</div>
            {/* Quick action buttons */}
            <label className="mb-2 block text-xs font-medium">Update status</label>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => setNextStatus("processing")}
                className={`rounded-md border px-3 py-2.5 text-xs font-semibold transition-all ${
                  nextStatus === "processing"
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-slate-200 text-slate-500 hover:border-slate-300"
                }`}
              >
                <Package className="mb-1 inline h-4 w-4" />
                <br />Packed
              </button>
              <button
                onClick={() => setNextStatus("shipped")}
                className={`rounded-md border px-3 py-2.5 text-xs font-semibold transition-all ${
                  nextStatus === "shipped"
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-slate-200 text-slate-500 hover:border-slate-300"
                }`}
              >
                <Truck className="mb-1 inline h-4 w-4" />
                <br />Shipped
              </button>
              <button
                onClick={() => setNextStatus("delivered")}
                className={`rounded-md border px-3 py-2.5 text-xs font-semibold transition-all ${
                  nextStatus === "delivered"
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-slate-200 text-slate-500 hover:border-slate-300"
                }`}
              >
                <CheckCircle2 className="mb-1 inline h-4 w-4" />
                <br />Delivered
              </button>
              <button
                onClick={() => setNextStatus("cancelled")}
                className={`rounded-md border px-3 py-2.5 text-xs font-semibold transition-all ${
                  nextStatus === "cancelled"
                    ? "border-rose-500 bg-rose-50 text-rose-600"
                    : "border-slate-200 text-slate-500 hover:border-rose-200"
                }`}
              >
                <XCircle className="mb-1 inline h-4 w-4" />
                <br />Cancel
              </button>
            </div>
            {nextStatus === "shipped" && (
              <div className="mb-3 rounded-md bg-blue-50 border border-blue-100 p-3">
                <p className="mb-2 text-xs font-semibold text-blue-700">Courier Info (for customer tracking)</p>
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
              placeholder={nextStatus === "shipped" ? "Out for delivery..." : "Add a note..."}
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
        </div>
      </div>
    </div>
  );
}
