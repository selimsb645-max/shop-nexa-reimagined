import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  TrendingUp,
  DollarSign,
  Users,
  ShoppingBag,
  Star,
  Package,
  Loader,
  Crown,
} from "lucide-react";
import { listAllProducts } from "@/services/firebase/products";
import { firebaseConfigured } from "@/services/firebase/config";
import { formatPrice } from "@/utils/format";
import type { Product } from "@/types/commerce";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/_authenticated/seller/insights")({
  ssr: false,
  component: SellerInsightsPage,
  head: () => ({ meta: [{ title: "Seller Insights — Aventa Shop" }] }),
});

function SellerInsightsPage() {
  const { t } = useI18n();
  const { data: products, isLoading } = useQuery({
    queryKey: ["products", "all"],
    queryFn: listAllProducts,
    enabled: firebaseConfigured,
  });

  // Filter to seller's products (would use sellerId in production)
  const sellerProducts = (products ?? []).filter((p) => p.sellerId);
  const totalProducts = sellerProducts.length;
  const totalStock = sellerProducts.reduce((sum, p) => sum + p.stock, 0);
  const totalValue = sellerProducts.reduce((sum, p) => sum + p.price * p.stock, 0);
  const avgRating =
    sellerProducts.length > 0
      ? (sellerProducts.reduce((sum, p) => sum + p.rating, 0) / sellerProducts.length).toFixed(1)
      : "0";
  const totalReviews = sellerProducts.reduce((sum, p) => sum + p.reviewCount, 0);
  const lowStock = sellerProducts.filter((p) => p.stock <= 5);
  const topSellers = [...sellerProducts].sort((a, b) => b.reviewCount - a.reviewCount).slice(0, 5);

  return (
    <div className="min-h-screen bg-muted/30">
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-6 flex items-center gap-3">
          <Link to="/seller" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <TrendingUp className="h-6 w-6 text-primary" />
            Seller Insights
          </h1>
        </div>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard
            icon={<Package className="h-5 w-5" />}
            label="Products"
            value={String(totalProducts)}
          />
          <StatCard
            icon={<ShoppingBag className="h-5 w-5" />}
            label="Total Stock"
            value={String(totalStock)}
          />
          <StatCard
            icon={<DollarSign className="h-5 w-5" />}
            label="Stock Value"
            value={formatPrice(totalValue)}
          />
          <StatCard icon={<Star className="h-5 w-5" />} label="Avg Rating" value={avgRating} />
          <StatCard
            icon={<Users className="h-5 w-5" />}
            label="Reviews"
            value={String(totalReviews)}
          />
          <StatCard
            icon={<Crown className="h-5 w-5" />}
            label="Low Stock"
            value={String(lowStock.length)}
            color="text-orange-500"
          />
        </div>

        {/* Top products */}
        <div className="rounded-2xl border bg-background p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold">{t("seller.topPerforming")}</h2>
          {isLoading ? (
            <div className="py-12 text-center">
              <Loader className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : topSellers.length === 0 ? (
            <div className="py-12 text-center">
              <Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No products yet</p>
              <Link
                to="/seller/products/new"
                className="mt-3 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                Add Your First Product
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {topSellers.map((product, i) => (
                <div
                  key={product.id}
                  className="flex items-center gap-3 rounded-xl bg-muted/30 p-3"
                >
                  <span className="w-6 text-sm font-bold text-muted-foreground">#{i + 1}</span>
                  <img
                    src={product.images[0] ?? ""}
                    alt={product.title}
                    className="h-12 w-12 rounded-lg object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      to="/product/$slug"
                      params={{ slug: product.slug }}
                      className="block truncate text-sm font-medium hover:text-primary"
                    >
                      {product.title}
                    </Link>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-0.5">
                        <Star className="h-3 w-3 fill-orange-400 text-orange-400" />
                        {product.rating}
                      </span>
                      <span>•</span>
                      <span>{product.reviewCount} reviews</span>
                      <span>•</span>
                      <span>{product.stock} in stock</span>
                    </div>
                  </div>
                  <span className="text-sm font-semibold">{formatPrice(product.price)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Low stock alerts */}
        {lowStock.length > 0 && (
          <div className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 p-5">
            <h2 className="mb-3 text-sm font-semibold text-orange-700">
              {t("seller.lowStockAlerts")}
            </h2>
            <div className="space-y-2">
              {lowStock.map((product: Product) => (
                <div key={product.id} className="flex items-center gap-3 rounded-lg bg-white p-3">
                  <img
                    src={product.images[0] ?? ""}
                    alt={product.title}
                    className="h-10 w-10 rounded-lg object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{product.title}</span>
                  </div>
                  <span
                    className={`text-sm font-bold ${product.stock === 0 ? "text-red-500" : "text-orange-500"}`}
                  >
                    {product.stock} left
                  </span>
                  <Link
                    to="/seller/products"
                    className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                  >
                    Restock
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color = "text-primary",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="rounded-2xl border bg-background p-4 shadow-sm">
      <div className={`mb-1 ${color}`}>{icon}</div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}
