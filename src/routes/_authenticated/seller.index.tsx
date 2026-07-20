import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  DollarSign,
  Package,
  ShoppingBag,
  TrendingUp,
  Plus,
  Eye,
} from "lucide-react";
import { SellerGate } from "@/components/seller/SellerGate";
import { Spinner } from "@/components/common/Spinner";
import { listSellerProducts } from "@/services/firebase/sellerProducts";
import { listSellerOrders } from "@/services/firebase/sellerOrders";
import { countUnreadNotifications } from "@/services/firebase/sellers";
import { formatPrice } from "@/utils/format";
import type { Product } from "@/types/commerce";
import type { SellerOrder } from "@/types/seller";

export const Route = createFileRoute("/_authenticated/seller/")({
  component: () => <SellerGate>{(profile) => <Dashboard sellerId={profile.uid} />}</SellerGate>,
});

function Dashboard({ sellerId }: { sellerId: string }) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [orders, setOrders] = useState<SellerOrder[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [p, o, n] = await Promise.all([
          listSellerProducts(sellerId),
          listSellerOrders(sellerId),
          countUnreadNotifications(sellerId),
        ]);
        if (cancelled) return;
        setProducts(p);
        setOrders(o);
        setUnread(n);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sellerId]);

  const stats = useMemo(() => {
    if (!products || !orders) return null;
    const totalEarnings = orders
      .filter((o) => o.status !== "cancelled")
      .reduce((s, o) => s + o.subtotal, 0);
    const pending = orders.filter((o) => o.status === "pending").length;
    const lowStock = products.filter((p) => p.stock > 0 && p.stock <= 5).length;
    const outOfStock = products.filter((p) => p.stock === 0).length;
    return { totalEarnings, pending, lowStock, outOfStock };
  }, [products, orders]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Overview of your storefront performance
          </p>
        </div>
        <Link
          to="/seller/products/new"
          className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Add product
        </Link>
      </div>

      {loading || !stats ? (
        <div className="flex items-center gap-2 rounded-lg border bg-background p-8 text-sm text-muted-foreground">
          <Spinner /> Loading dashboard...
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={<DollarSign className="h-5 w-5" />}
              label="Gross earnings"
              value={formatPrice(stats.totalEarnings)}
              accent="bg-primary/10 text-primary"
            />
            <StatCard
              icon={<ShoppingBag className="h-5 w-5" />}
              label="Total orders"
              value={String(orders?.length ?? 0)}
              accent="bg-accent/10 text-accent"
            />
            <StatCard
              icon={<Package className="h-5 w-5" />}
              label="Products"
              value={String(products?.length ?? 0)}
              accent="bg-blue-500/10 text-blue-600"
            />
            <StatCard
              icon={<TrendingUp className="h-5 w-5" />}
              label="Pending orders"
              value={String(stats.pending)}
              accent="bg-orange-500/10 text-orange-600"
            />
          </div>

          {(stats.lowStock > 0 || stats.outOfStock > 0 || unread > 0) && (
            <div className="grid gap-3 sm:grid-cols-3">
              {stats.outOfStock > 0 && (
                <Alert
                  tone="destructive"
                  title={`${stats.outOfStock} out of stock`}
                  body="Replenish inventory to keep selling."
                  link={{ to: "/seller/products", label: "Manage" }}
                />
              )}
              {stats.lowStock > 0 && (
                <Alert
                  tone="warning"
                  title={`${stats.lowStock} low stock`}
                  body="Fewer than 5 units remaining."
                  link={{ to: "/seller/products", label: "Review" }}
                />
              )}
              {unread > 0 && (
                <Alert
                  tone="info"
                  title={`${unread} unread notification${unread > 1 ? "s" : ""}`}
                  body="You have new activity on your shop."
                  link={{ to: "/seller/notifications", label: "Open" }}
                />
              )}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-lg border bg-background">
              <div className="flex items-center justify-between border-b p-4">
                <h2 className="font-semibold">Recent orders</h2>
                <Link to="/seller/orders" className="text-sm text-primary hover:underline">
                  View all
                </Link>
              </div>
              <div className="divide-y">
                {orders && orders.length === 0 && (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    No orders yet.
                  </div>
                )}
                {orders?.slice(0, 5).map((o) => (
                  <Link
                    key={o.id}
                    to="/seller/orders/$orderId"
                    params={{ orderId: o.id }}
                    className="flex items-center justify-between gap-3 p-4 hover:bg-muted/50"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        #{o.id.slice(0, 8)} · {o.buyerName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(o.createdAt).toLocaleString()} ·{" "}
                        {o.items.length} item{o.items.length > 1 ? "s" : ""}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold">
                        {formatPrice(o.subtotal)}
                      </div>
                      <StatusChip status={o.status} />
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            <div className="rounded-lg border bg-background">
              <div className="flex items-center justify-between border-b p-4">
                <h2 className="font-semibold">Top products</h2>
                <Link to="/seller/products" className="text-sm text-primary hover:underline">
                  Manage
                </Link>
              </div>
              <div className="divide-y">
                {products && products.length === 0 && (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    You haven't listed any products yet.
                  </div>
                )}
                {products
                  ?.slice()
                  .sort((a, b) => b.rating - a.rating)
                  .slice(0, 5)
                  .map((p) => (
                    <div key={p.id} className="flex items-center gap-3 p-3">
                      <img
                        src={p.images[0] || "/placeholder.svg"}
                        alt=""
                        className="h-12 w-12 rounded-md object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{p.title}</div>
                        <div className="text-xs text-muted-foreground">
                          Stock: {p.stock} · {formatPrice(p.price)}
                        </div>
                      </div>
                      <Link
                        to="/product/$slug"
                        params={{ slug: p.slug }}
                        className="flex h-8 w-8 items-center justify-center rounded-md border hover:bg-muted"
                        title="View"
                      >
                        <Eye className="h-4 w-4" />
                      </Link>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <div className={`flex h-9 w-9 items-center justify-center rounded-md ${accent}`}>
        {icon}
      </div>
      <div className="mt-3 text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function Alert({
  tone,
  title,
  body,
  link,
}: {
  tone: "destructive" | "warning" | "info";
  title: string;
  body: string;
  link: { to: string; label: string };
}) {
  const toneCls =
    tone === "destructive"
      ? "border-destructive/40 bg-destructive/5"
      : tone === "warning"
        ? "border-orange-400/40 bg-orange-50 dark:bg-orange-950/20"
        : "border-primary/30 bg-primary/5";
  return (
    <div className={`rounded-lg border p-4 ${toneCls}`}>
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{body}</div>
      <Link to={link.to} className="mt-2 inline-block text-xs font-medium text-primary hover:underline">
        {link.label} →
      </Link>
    </div>
  );
}

function StatusChip({ status }: { status: SellerOrder["status"] }) {
  const map: Record<SellerOrder["status"], string> = {
    pending: "bg-muted text-foreground",
    confirmed: "bg-blue-500/10 text-blue-600",
    processing: "bg-primary/10 text-primary",
    shipped: "bg-accent/10 text-accent",
    delivered: "bg-green-500/10 text-green-600",
    cancelled: "bg-destructive/10 text-destructive",
  };
  return (
    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${map[status]}`}>
      {status}
    </span>
  );
}
