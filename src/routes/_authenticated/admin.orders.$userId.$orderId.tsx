import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import {
  cancelOrderAdmin,
  getAdminOrder,
  updateOrderStatusAdmin,
} from "@/services/firebase/adminOrders";
import { logActivity } from "@/services/firebase/adminLogs";
import { useAuth } from "@/context/AuthContext";
import { Spinner } from "@/components/common/Spinner";
import { formatPrice, formatDateTime } from "@/utils/format";
import { mapFirebaseError } from "@/utils/errors";
import type { Order, OrderStatus } from "@/types/commerce";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/_authenticated/admin/orders/$userId/$orderId")({
  component: OrderDetailAdmin,
});

const STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
];

function OrderDetailAdmin() {

  const { t } = useI18n();  const { user } = useAuth();
  const { userId, orderId } = useParams({
    from: "/_authenticated/admin/orders/$userId/$orderId",
  });
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<OrderStatus>("pending");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const o = await getAdminOrder(userId, orderId);
      setOrder(o);
      if (o) setStatus(o.status);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, [userId, orderId]);

  const save = async () => {
    if (!user || !order) return;
    setSaving(true);
    try {
      const idToken = await user.getIdToken();
      await updateOrderStatusAdmin(userId, orderId, status, note);
      await logActivity(
        { uid: user.uid, email: user.email },
        "order.status_update",
        orderId,
        `${order.status} -> ${status}`,
      );
      toast.success(t("admin.orderUpdated"));
      setNote("");
      await refresh();
    } catch (err) {
      toast.error(mapFirebaseError(err));
    } finally {
      setSaving(false);
    }
  };

  const cancel = async () => {
    if (!user) return;
    const reason = prompt("Cancellation reason:") ?? "";
    if (!confirm("Cancel this order? This will reverse all seller settlements.")) return;
    setSaving(true);
    try {
      const idToken = await user.getIdToken();
      await cancelOrderAdmin(userId, orderId, reason, idToken);
      await logActivity({ uid: user.uid, email: user.email }, "order.cancel", orderId, reason);
      toast.success(t("admin.orderCancelledReversed"));
      await refresh();
    } catch (err) {
      toast.error(mapFirebaseError(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-background p-8 text-sm text-muted-foreground">
        <Spinner /> Loading order…
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to="/admin/orders"
          className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Link>
        <div>
          <h1 className="text-xl font-bold">Order #{order.id.slice(0, 8)}</h1>
          <p className="text-xs text-muted-foreground">Placed {formatDateTime(order.createdAt)}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border bg-background p-4 md:col-span-2">
          <h2 className="mb-3 text-sm font-semibold">{t("admin.items")}</h2>
          <div className="divide-y">
            {order.items.map((it) => (
              <div key={it.productId} className="flex items-center gap-3 py-2 text-sm">
                <img src={it.image} alt="" className="h-12 w-12 rounded-md object-cover" />
                <div className="flex-1">
                  <div className="font-medium">{it.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatPrice(it.price)} × {it.quantity}
                  </div>
                </div>
                <div className="font-medium">{formatPrice(it.subtotal)}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-1 border-t pt-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("admin.subtotal")}</span>
              <span>{formatPrice(order.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("admin.discount")}</span>
              <span>-{formatPrice(order.discount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("admin.shipping")}</span>
              <span>{formatPrice(order.shipping)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>{t("admin.total")}</span>
              <span>{formatPrice(order.total)}</span>
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-lg border bg-background p-4 text-sm">
            <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              Shipping
            </h3>
            <div className="font-medium">{order.shippingAddress.fullName}</div>
            <div>{order.shippingAddress.phone}</div>
            <div>{order.shippingAddress.addressLine}</div>
            <div>
              {order.shippingAddress.city}, {order.shippingAddress.postalCode}
            </div>
            <div>{order.shippingAddress.country}</div>
            {order.shippingAddress.notes && (
              <div className="mt-1 text-xs text-muted-foreground">
                Note: {order.shippingAddress.notes}
              </div>
            )}
          </div>
          <div className="rounded-lg border bg-background p-4 text-sm">
            <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              Payment
            </h3>
            <div className="capitalize">{order.payment.method.replace(/_/g, " ")}</div>
            <div className="text-xs text-muted-foreground">
              Status: <span className="capitalize">{order.payment.status}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-background p-4">
        <h2 className="mb-3 text-sm font-semibold">{t("admin.updateStatus")}</h2>
        <div className="flex flex-wrap gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as OrderStatus)}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            className="flex-1 min-w-[200px] rounded-md border bg-background px-3 py-2 text-sm"
          />
          <button
            onClick={save}
            disabled={saving || status === order.status}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          {order.status !== "cancelled" && (
            <button
              onClick={cancel}
              disabled={saving}
              className="rounded-md border border-destructive px-4 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              Cancel order
            </button>
          )}
        </div>
        {order.status !== "cancelled" && (
          <p className="mt-2 text-xs text-muted-foreground">
            Cancelling will reverse all seller settlements for this order.
          </p>
        )}
      </div>

      <div className="rounded-lg border bg-background p-4">
        <h2 className="mb-3 text-sm font-semibold">{t("admin.tracking")}</h2>
        <ol className="space-y-2 text-sm">
          {order.tracking.map((t, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="mt-1 h-2 w-2 rounded-full bg-primary" />
              <div>
                <div className="font-medium capitalize">{t.status}</div>
                <div className="text-xs text-muted-foreground">{t.note}</div>
                <div className="text-xs text-muted-foreground">{formatDateTime(t.at)}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
