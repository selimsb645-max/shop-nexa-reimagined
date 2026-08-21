import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  DollarSign,
  ShoppingBag,
  Users,
  Store,
  Package,
  TrendingUp,
} from "lucide-react";
import { listAllOrders } from "@/services/firebase/adminOrders";
import { listUsers } from "@/services/firebase/adminUsers";
import { listAllSellers } from "@/services/firebase/adminSellers";
import { listAllProductsAdmin } from "@/services/firebase/adminProducts";
import { Spinner } from "@/components/common/Spinner";
import { formatPrice, formatDateTime } from "@/utils/format";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminDashboard,
});

function AdminDashboard() {

  const { t } = useI18n();  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalSales: 0,
    totalOrders: 0,
    totalUsers: 0,
    totalSellers: 0,
    approvedSellers: 0,
    pendingSellers: 0,
    totalProducts: 0,
    pendingProducts: 0,
  });
  const [recent, setRecent] = useState<
    Array<{
      id: string;
      total: number;
      status: string;
      createdAt: number;
      buyer: string;
      userId: string;
    }>
  >([]);

  useEffect(() => {
    (async () => {
      try {
        const [orders, users, sellers, products] = await Promise.all([
          listAllOrders(),
          listUsers(),
          listAllSellers(),
          listAllProductsAdmin(),
        ]);
        const validForSales = orders.filter((o) => o.status !== "cancelled");
        setStats({
          totalSales: validForSales.reduce((s, o) => s + o.total, 0),
          totalOrders: orders.length,
          totalUsers: users.length,
          totalSellers: sellers.length,
          approvedSellers: sellers.filter((s) => s.status === "approved").length,
          pendingSellers: sellers.filter((s) => s.status === "pending_review").length,
          totalProducts: products.length,
          pendingProducts: products.filter((p) => !p.approved).length,
        });
        setRecent(
          orders.slice(0, 10).map((o) => ({
            id: o.id,
            total: o.total,
            status: o.status,
            createdAt: o.createdAt,
            buyer: o.shippingAddress.fullName || "—",
            userId: o.userId,
          })),
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-background p-8 text-sm text-muted-foreground">
        <Spinner /> Loading dashboard…
      </div>
    );
  }

  const cards = [
    { icon: DollarSign, label: "Total Sales", value: formatPrice(stats.totalSales) },
    { icon: ShoppingBag, label: "Total Orders", value: String(stats.totalOrders) },
    { icon: Users, label: "Total Users", value: String(stats.totalUsers) },
    {
      icon: Store,
      label: "Total Sellers",
      value: `${stats.approvedSellers} approved / ${stats.totalSellers} total`,
    },
    {
      icon: Package,
      label: "Total Products",
      value: `${stats.totalProducts} (${stats.pendingProducts} pending approval)`,
    },
    {
      icon: TrendingUp,
      label: "Pending Seller Applications",
      value: String(stats.pendingSellers),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("admin.dashboard")}</h1>
        <p className="text-sm text-muted-foreground">
          Overview of your ShopNexa marketplace.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border bg-background p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                <c.icon className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">{c.label}</div>
                <div className="text-lg font-semibold">{c.value}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border bg-background">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{t("admin.recentOrders")}</h2>
          <Link to="/admin/orders" className="text-xs text-primary hover:underline">
            View all
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No orders yet.</div>
        ) : (
          <div className="divide-y">
            {recent.map((o) => (
              <div key={o.id} className="flex items-center gap-4 px-4 py-3 text-sm">
                <div className="flex-1 truncate">
                  <div className="font-medium">#{o.id.slice(0, 8)} · {o.buyer}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDateTime(o.createdAt)}
                  </div>
                </div>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">
                  {o.status}
                </span>
                <div className="w-24 text-right font-medium">{formatPrice(o.total)}</div>
                <Link
                  to="/admin/orders/$userId/$orderId"
                  params={{ userId: o.userId, orderId: o.id }}
                  className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                >
                  View
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
