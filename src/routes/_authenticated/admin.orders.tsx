import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { listAllOrders } from "@/services/firebase/adminOrders";
import type { AdminOrderRow } from "@/services/firebase/adminOrders";
import { Spinner } from "@/components/common/Spinner";
import { formatPrice, formatDateTime } from "@/utils/format";
import type { OrderStatus } from "@/types/commerce";

export const Route = createFileRoute("/_authenticated/admin/orders")({
  component: OrdersAdmin,
});

function OrdersAdmin() {
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
        <h1 className="text-2xl font-bold">Orders</h1>
        <p className="text-sm text-muted-foreground">All customer orders across the marketplace.</p>
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
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="processing">Processing</option>
            <option value="shipped">Shipped</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-background">
        {loading ? (
          <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
            <Spinner /> Loading orders…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-sm text-muted-foreground">No orders found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Buyer</th>
                <th className="px-3 py-2">Items</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2">Payment</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Placed</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((o) => (
                <tr key={o.id}>
                  <td className="px-3 py-2 font-mono text-xs">#{o.id.slice(0, 8)}</td>
                  <td className="px-3 py-2">
                    <div className="text-sm">{o.shippingAddress.fullName || "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {o.shippingAddress.phone}
                    </div>
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
        )}
      </div>
    </div>
  );
}
