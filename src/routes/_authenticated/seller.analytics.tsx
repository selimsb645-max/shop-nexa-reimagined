import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { DollarSign, ShoppingBag, TrendingUp, Package } from "lucide-react";
import { SellerGate } from "@/components/seller/SellerGate";
import { Spinner } from "@/components/common/Spinner";
import { listSellerOrders } from "@/services/firebase/sellerOrders";
import { listSellerProducts } from "@/services/firebase/sellerProducts";
import { formatPrice } from "@/utils/format";
import type { SellerOrder } from "@/types/seller";
import type { Product } from "@/types/commerce";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/_authenticated/seller/analytics")({
  component: () => (
    <SellerGate>{(profile) => <AnalyticsPage sellerId={profile.uid} />}</SellerGate>
  ),
});

function AnalyticsPage({ sellerId }: { sellerId: string }) {
  const { t } = useI18n();
  const [orders, setOrders] = useState<SellerOrder[] | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [range, setRange] = useState<7 | 30 | 90>(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [o, p] = await Promise.all([
          listSellerOrders(sellerId),
          listSellerProducts(sellerId),
        ]);
        if (cancelled) return;
        setOrders(o);
        setProducts(p);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sellerId]);

  const stats = useMemo(() => {
    if (!orders || !products) return null;
    const since = Date.now() - range * 24 * 60 * 60 * 1000;
    const inRange = orders.filter((o) => o.createdAt >= since && o.status !== "cancelled");
    const revenue = inRange.reduce((s, o) => s + o.subtotal, 0);
    const orderCount = inRange.length;
    const itemsSold = inRange.reduce(
      (s, o) => s + o.items.reduce((n, i) => n + i.quantity, 0),
      0,
    );
    const avgOrder = orderCount ? revenue / orderCount : 0;

    // Sales by day
    const byDay = new Map<string, number>();
    for (let i = range - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      byDay.set(d.toISOString().slice(0, 10), 0);
    }
    inRange.forEach((o) => {
      const key = new Date(o.createdAt).toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + o.subtotal);
    });
    const series = Array.from(byDay.entries()).map(([date, value]) => ({ date, value }));

    // Top products by units sold
    const perProduct = new Map<string, { title: string; qty: number; revenue: number }>();
    inRange.forEach((o) =>
      o.items.forEach((it) => {
        const prev = perProduct.get(it.productId) ?? { title: it.title, qty: 0, revenue: 0 };
        prev.qty += it.quantity;
        prev.revenue += it.subtotal;
        perProduct.set(it.productId, prev);
      }),
    );
    const topProducts = Array.from(perProduct.entries())
      .sort((a, b) => b[1].qty - a[1].qty)
      .slice(0, 5);

    return { revenue, orderCount, itemsSold, avgOrder, series, topProducts };
  }, [orders, products, range]);

  const maxSeries = stats ? Math.max(1, ...stats.series.map((s) => s.value)) : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("seller.analytics")}</h1>
          <p className="text-sm text-muted-foreground">
            Sales performance and product insights
          </p>
        </div>
        <div className="flex rounded-md border bg-background p-1 text-sm">
          {[7, 30, 90].map((n) => (
            <button
              key={n}
              onClick={() => setRange(n as 7 | 30 | 90)}
              className={`rounded px-3 py-1 ${
                range === n ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              {n}d
            </button>
          ))}
        </div>
      </div>

      {loading || !stats ? (
        <div className="flex items-center gap-2 rounded-lg border bg-background p-8 text-sm text-muted-foreground">
          <Spinner /> Loading analytics...
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon={<DollarSign className="h-5 w-5" />} label="Revenue" value={formatPrice(stats.revenue)} />
            <Stat icon={<ShoppingBag className="h-5 w-5" />} label="Orders" value={String(stats.orderCount)} />
            <Stat icon={<Package className="h-5 w-5" />} label="Items sold" value={String(stats.itemsSold)} />
            <Stat icon={<TrendingUp className="h-5 w-5" />} label="Avg. order" value={formatPrice(stats.avgOrder)} />
          </div>

          <div className="rounded-lg border bg-background p-5">
            <h2 className="mb-4 text-sm font-semibold">{t("seller.revenueOverTime")}</h2>
            <div className="flex h-40 items-end gap-1">
              {stats.series.map((d) => (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-primary/70"
                    style={{ height: `${(d.value / maxSeries) * 100}%`, minHeight: 2 }}
                    title={`${d.date}: ${formatPrice(d.value)}`}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
              <span>{stats.series[0]?.date}</span>
              <span>{stats.series[stats.series.length - 1]?.date}</span>
            </div>
          </div>

          <div className="rounded-lg border bg-background">
            <div className="border-b p-4 text-sm font-semibold">{t("seller.bestSelling")}</div>
            {stats.topProducts.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No sales in this period.
              </div>
            ) : (
              <div className="divide-y">
                {stats.topProducts.map(([id, s]) => (
                  <div key={id} className="flex items-center justify-between p-4 text-sm">
                    <div className="font-medium">{s.title}</div>
                    <div className="text-right">
                      <div className="font-semibold">{formatPrice(s.revenue)}</div>
                      <div className="text-xs text-muted-foreground">{s.qty} units</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="mt-3 text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
