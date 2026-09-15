import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { listAllOrders } from "@/services/firebase/adminOrders";
import type { AdminOrderRow } from "@/services/firebase/adminOrders";
import { Spinner } from "@/components/common/Spinner";
import { formatPrice, formatDateTime } from "@/utils/format";
import type { OrderStatus } from "@/types/commerce";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/_authenticated/admin/orders")({
  component: OrdersAdmin,
});

function OrdersAdmin() {
  const { t } = useI18n();
  const [rows, setRows] = useState<AdminOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | OrderStatus>("");

  useEffect(() => {
    (async () => {
      try {
        setRows(await listAllOrders());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status && r.status !== status) return false;
      if (
        term &&
        !`${r.id} ${r.shippingAddress.fullName} ${r.shippingAddress.phone}`
          .toLowerCase()
          .includes(term)
      )
        return false;
      return true;
    });
  }, [rows, q, status]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("admin.orders")}</h1>
        <p className="text-sm text-muted-foreground">{t("admin.allOrdersDesc")}</p>
      </div>
      <div className="rounded-lg border bg-background p-4">
        <div className="flex flex-wrap gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by order id, buyer, phone…"
            className="flex-1 min-w-[220px] rounded-md border bg-background px-3 py-2 text-sm"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "" | OrderStatus)}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="">{t("admin.allStatuses")}</option>
            <option value="pending">{t("admin.pending")}</option>
            <option value="confirmed">{t("admin.confirmed")}</option>
            <option value="processing">{t("admin.processing")}</option>
            <option value="shipped">{t("admin.shipped")}</option>
            <option value="delivered">{t("admin.delivered")}</option>
            <option value="cancelled">{t("admin.cancelled")}</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-lg border bg-background p-8 text-sm text-muted-foreground">
          <Spinner /> Loading orders…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border bg-background p-8 text-sm text-muted-foreground">
          No orders found.
        </div>
      ) : (
        <>
          {/* Mobile order cards */}
          <div className="space-y-3 lg:hidden">
            {filtered.map((o) => (
              <div key={o.id} className="rounded-lg border bg-background p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold">#{o.id.slice(0, 8)}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">{o.status}</span>
                </div>
                <div>
                  <div className="text-sm font-medium">{o.shippingAddress.fullName || "—"}</div>
                  <div className="text-xs text-muted-foreground">{o.shippingAddress.phone}</div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground border-t pt-2">
                  <div>
                    <span>{o.items.length} items</span> • <span className="capitalize">{o.payment.method.replace(/_/g, " ")} ({o.payment.status})</span>
                  </div>
                  <div>{formatDateTime(o.createdAt)}</div>
                </div>
                <div className="flex items-center justify-between gap-2 border-t pt-2">
                  <div className="font-medium text-sm">{formatPrice(o.total)}</div>
                  <Link
                    to="/admin/orders/$userId/$orderId"
                    params={{ userId: o.userId, orderId: o.id }}
                    className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                  >
                    Manage
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-lg border bg-background lg:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2">{t("admin.order")}</th>
                  <th className="px-3 py-2">{t("admin.buyer")}</th>
                  <th className="px-3 py-2">{t("admin.items")}</th>
                  <th className="px-3 py-2">{t("admin.total")}</th>
                  <th className="px-3 py-2">{t("admin.payment")}</th>
                  <th className="px-3 py-2">{t("admin.status")}</th>
                  <th className="px-3 py-2">{t("admin.placed")}</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((o) => (
                  <tr key={o.id}>
                    <td className="px-3 py-2 font-mono text-xs">#{o.id.slice(0, 8)}</td>
                    <td className="px-3 py-2">
                      <div className="text-sm">{o.shippingAddress.fullName || "—"}</div>
                      <div className="text-xs text-muted-foreground">{o.shippingAddress.phone}</div>
                    </td>
                    <td className="px-3 py-2 text-xs">{o.items.length}</td>
                    <td className="px-3 py-2 font-medium">{formatPrice(o.total)}</td>
                    <td className="px-3 py-2 text-xs capitalize">
                      {o.payment.method.replace(/_/g, " ")}
                      <div className="text-muted-foreground">{o.payment.status}</div>
                    </td>
                    <td className="px-3 py-2 capitalize">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{o.status}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {formatDateTime(o.createdAt)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        to="/admin/orders/$userId/$orderId"
                        params={{ userId: o.userId, orderId: o.id }}
                        className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                      >
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
