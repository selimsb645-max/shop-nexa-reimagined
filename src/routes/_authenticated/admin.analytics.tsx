import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Users,
  Star,
  Package,
  Eye,
} from "lucide-react";
import { listAllProducts } from "@/services/firebase/products";
import { firebaseConfigured } from "@/services/firebase/config";
import { formatPrice } from "@/utils/format";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/_authenticated/admin/analytics")({
  ssr: false,
  component: AdminAnalyticsPage,
  head: () => ({ meta: [{ title: "Performance Analytics — AVENTA SHOP Admin" }] }),
});

function AdminAnalyticsPage() {

  const { t } = useI18n();  const { data: products } = useQuery({
    queryKey: ["products", "all"],
    queryFn: listAllProducts,
    enabled: firebaseConfigured,
  });

  const allProducts = products ?? [];
  const totalProducts = allProducts.length;
  const avgRating = allProducts.length > 0
    ? (allProducts.reduce((sum, p) => sum + p.rating, 0) / allProducts.length).toFixed(1)
    : "0";
  const totalReviews = allProducts.reduce((sum, p) => sum + p.reviewCount, 0);
  const totalStockValue = allProducts.reduce((sum, p) => sum + p.price * p.stock, 0);
  const featuredCount = allProducts.filter((p) => p.featured).length;

  // Top rated products
  const topRated = [...allProducts]
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 5);

  // Top reviewed products
  const topReviewed = [...allProducts]
    .sort((a, b) => b.reviewCount - a.reviewCount)
    .slice(0, 5);

  // Category breakdown
  const categoryMap = allProducts.reduce((acc, p) => {
    acc[p.categorySlug] = (acc[p.categorySlug] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const categories = Object.entries(categoryMap).sort((a, b) => b[1] - a[1]);

  return (
    <div className="min-h-screen bg-muted/30">
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-6 flex items-center gap-3">
          <Link to="/admin" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <TrendingUp className="h-6 w-6 text-primary" />
            Performance Analytics
          </h1>
        </div>

        {/* Stats grid */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard icon={<Package className="h-5 w-5" />} label="Total Products" value={String(totalProducts)} />
          <StatCard icon={<Star className="h-5 w-5" />} label="Avg Rating" value={avgRating} />
          <StatCard icon={<Eye className="h-5 w-5" />} label="Total Reviews" value={String(totalReviews)} />
          <StatCard icon={<DollarSign className="h-5 w-5" />} label="Stock Value" value={formatPrice(totalStockValue)} />
          <StatCard icon={<ShoppingCart className="h-5 w-5" />} label="Featured" value={String(featuredCount)} />
          <StatCard icon={<Users className="h-5 w-5" />} label="Categories" value={String(categories.length)} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Top Rated Products */}
          <div className="rounded-2xl border bg-background p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold">{t("admin.topRatedProducts")}</h2>
            {topRated.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No data available</p>
            ) : (
              <div className="space-y-2">
                {topRated.map((product, i) => (
                  <div key={product.id} className="flex items-center gap-3">
                    <span className="w-6 text-sm font-bold text-muted-foreground">#{i + 1}</span>
                    <img src={product.images[0] ?? ""} alt={product.title} className="h-10 w-10 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1">
                      <Link to="/product/$slug" params={{ slug: product.slug }} className="block truncate text-sm font-medium hover:text-primary">
                        {product.title}
                      </Link>
                      <div className="flex items-center gap-1">
                        <Star className="h-3 w-3 fill-orange-400 text-orange-400" />
                        <span className="text-xs text-muted-foreground">{product.rating} ({product.reviewCount} reviews)</span>
                      </div>
                    </div>
                    <span className="text-sm font-medium">{formatPrice(product.price)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Most Reviewed Products */}
          <div className="rounded-2xl border bg-background p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold">{t("admin.mostReviewedProducts")}</h2>
            {topReviewed.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No data available</p>
            ) : (
              <div className="space-y-2">
                {topReviewed.map((product, i) => (
                  <div key={product.id} className="flex items-center gap-3">
                    <span className="w-6 text-sm font-bold text-muted-foreground">#{i + 1}</span>
                    <img src={product.images[0] ?? ""} alt={product.title} className="h-10 w-10 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1">
                      <Link to="/product/$slug" params={{ slug: product.slug }} className="block truncate text-sm font-medium hover:text-primary">
                        {product.title}
                      </Link>
                      <span className="text-xs text-muted-foreground">{product.reviewCount} reviews</span>
                    </div>
                    <span className="text-sm font-medium">{formatPrice(product.price)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="mt-4 rounded-2xl border bg-background p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold">{t("admin.productsByCategory")}</h2>
          {categories.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No data available</p>
          ) : (
            <div className="space-y-2">
              {categories.map(([cat, count]) => (
                <div key={cat} className="flex items-center gap-3">
                  <span className="w-32 truncate text-sm font-medium capitalize">{cat}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(count / totalProducts) * 100}%` }}
                    />
                  </div>
                  <span className="w-10 text-right text-sm font-medium">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-background p-4 shadow-sm">
      <div className="mb-1 text-primary">{icon}</div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}
