import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, ShoppingBag } from "lucide-react";
import { SellerGate } from "@/components/seller/SellerGate";
import { Spinner } from "@/components/common/Spinner";
import { listSellerOrders } from "@/services/firebase/sellerOrders";
import { formatPrice, formatDateTime } from "@/utils/format";
import type { SellerOrder, SellerOrderStatus } from "@/types/seller";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/_authenticated/seller/orders/")({
  component: () => <SellerGate>{(profile) => <OrdersPage sellerId={profile.uid} />}</SellerGate>,
});

const STATUS_OPTIONS: Array<{ v: "all" | SellerOrderStatus; label: string }> = [
  { v: "all", label: "All" },
  { v: "pending", label: "Pending" },
  { v: "confirmed", label: "Confirmed" },
  { v: "processing", label: "Processing" },
  { v: "shipped", label: "Shipped" },
  { v: "delivered", label: "Delivered" },
  { v: "cancelled", label: "Cancelled" },
];

function OrdersPage({ sellerId }: { sellerId: string }) {
  const { t } = useI18n();
  const [orders, setOrders] = useState<SellerOrder[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | SellerOrderStatus>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const o = await listSellerOrders(sellerId);
        if (!cancelled) setOrders(o);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sellerId]);

  const filtered = useMemo(() => {
    if (!orders) return [];
    const query = q.trim().toLowerCase();
    return orders.filter((o) => {
      if (status !== "all" && o.status !== status) return false;
      if (query) {
        const hay = `${o.id} ${o.buyerName} ${o.buyerEmail ?? ""}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [orders, q, status]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("seller.orders")}</h1>
        <p className="text-sm text-muted-foreground">
          Fulfil orders and update customers on shipping.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-background p-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search order id, buyer name/email"
            className="w-full rounded-md border px-9 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.v} value={s.v}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-lg border bg-background p-8 text-sm text-muted-foreground">
          <Spinner /> Loading orders...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border bg-background py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <ShoppingBag className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">
            {orders?.length === 0 ? "No orders yet" : "No orders match your filters"}
          </h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            When customers buy your products, orders appear here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-background">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">{t("seller.order")}</th>
                <th className="px-4 py-3 text-left">{t("seller.buyer")}</th>
                <th className="px-4 py-3 text-right">{t("seller.items")}</th>
                <th className="px-4 py-3 text-right">{t("seller.total")}</th>
                <th className="px-4 py-3 text-left">{t("seller.status")}</th>
                <th className="px-4 py-3 text-left">{t("seller.placed")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((o) => (
                <tr key={o.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link
                      to="/seller/orders/$orderId"
                      params={{ orderId: o.id }}
                      className="font-medium text-primary hover:underline"
                    >
                      #{o.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{o.buyerName}</div>
                    <div className="text-xs text-muted-foreground">{o.buyerEmail ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-right">{o.items.length}</td>
                  <td className="px-4 py-3 text-right">{formatPrice(o.subtotal)}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={o.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDateTime(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: SellerOrderStatus }) {
  const map: Record<SellerOrderStatus, string> = {
    pending: "bg-muted text-foreground",
    confirmed: "bg-blue-500/10 text-blue-600",
    processing: "bg-primary/10 text-primary",
    shipped: "bg-accent/10 text-accent",
    delivered: "bg-green-500/10 text-green-600",
    cancelled: "bg-destructive/10 text-destructive",
    returned: "bg-amber-500/10 text-amber-600",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${map[status]}`}>
      {status}
    </span>
  );
}
