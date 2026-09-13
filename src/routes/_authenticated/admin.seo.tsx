import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Search, BarChart3, TrendingUp, Eye, Loader } from "lucide-react";
import { listAllProducts } from "@/services/firebase/products";
import { firebaseConfigured } from "@/services/firebase/config";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/_authenticated/admin/seo")({
  ssr: false,
  component: AdminSEOPage,
  head: () => ({ meta: [{ title: "SEO Management — AVENTA SHOP Admin" }] }),
});

function AdminSEOPage() {
  const { t } = useI18n();
  const { data: products, isLoading } = useQuery({
    queryKey: ["products", "all"],
    queryFn: listAllProducts,
    enabled: firebaseConfigured,
  });

  const allProducts = products ?? [];
  const productsWithImages = allProducts.filter((p) => p.images.length > 0);
  const productsWithDescriptions = allProducts.filter((p) => p.description.length > 50);
  const productsWithTags = allProducts.filter((p) => p.tags.length > 0);
  const productsWithComparePrice = allProducts.filter((p) => p.compareAtPrice !== null);

  const seoScore =
    allProducts.length > 0
      ? Math.round(
          (productsWithImages.length / allProducts.length) * 30 +
            (productsWithDescriptions.length / allProducts.length) * 30 +
            (productsWithTags.length / allProducts.length) * 20 +
            (productsWithComparePrice.length / allProducts.length) * 20,
        )
      : 0;

  return (
    <div className="min-h-screen bg-muted/30">
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-6 flex items-center gap-3">
          <Link to="/admin" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Search className="h-6 w-6 text-primary" />
            SEO Management
          </h1>
        </div>

        {/* SEO Score */}
        <div className="mb-6 rounded-2xl border bg-background p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground">
                {t("admin.overallSeoScore")}
              </h2>
              <p className="text-3xl font-bold">{seoScore}/100</p>
            </div>
            <div
              className={`grid h-16 w-16 place-items-center rounded-full text-2xl font-bold ${
                seoScore >= 70
                  ? "bg-green-100 text-green-600"
                  : seoScore >= 40
                    ? "bg-orange-100 text-orange-600"
                    : "bg-red-100 text-red-600"
              }`}
            >
              {seoScore >= 70 ? "A" : seoScore >= 40 ? "C" : "F"}
            </div>
          </div>
        </div>

        {/* SEO Stats */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            icon={<Eye className="h-5 w-5" />}
            label="Has Images"
            value={`${productsWithImages.length}/${allProducts.length}`}
          />
          <StatCard
            icon={<BarChart3 className="h-5 w-5" />}
            label="Has Descriptions"
            value={`${productsWithDescriptions.length}/${allProducts.length}`}
          />
          <StatCard
            icon={<Search className="h-5 w-5" />}
            label="Has Tags"
            value={`${productsWithTags.length}/${allProducts.length}`}
          />
          <StatCard
            icon={<TrendingUp className="h-5 w-5" />}
            label="Has Compare Price"
            value={`${productsWithComparePrice.length}/${allProducts.length}`}
          />
        </div>

        {/* Products SEO table */}
        {isLoading ? (
          <div className="py-20 text-center">
            <Loader className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border bg-background shadow-sm">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs font-semibold text-muted-foreground">
                  <th className="p-3">{t("admin.product")}</th>
                  <th className="p-3">{t("admin.images")}</th>
                  <th className="p-3">{t("admin.descLength")}</th>
                  <th className="p-3">{t("admin.tags")}</th>
                  <th className="p-3">{t("admin.slug")}</th>
                  <th className="p-3">{t("admin.seoScore")}</th>
                </tr>
              </thead>
              <tbody>
                {allProducts.slice(0, 20).map((product) => {
                  let score = 0;
                  if (product.images.length > 0) score += 30;
                  if (product.description.length > 50) score += 30;
                  if (product.tags.length > 0) score += 20;
                  if (product.compareAtPrice !== null) score += 20;
                  return (
                    <tr key={product.id} className="border-b text-sm last:border-b-0">
                      <td className="p-3">
                        <Link
                          to="/product/$slug"
                          params={{ slug: product.slug }}
                          className="truncate font-medium hover:text-primary"
                        >
                          {product.title}
                        </Link>
                      </td>
                      <td className="p-3">
                        <span
                          className={product.images.length > 0 ? "text-green-500" : "text-red-500"}
                        >
                          {product.images.length > 0 ? "✓" : "✗"}
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground">{product.description.length}</td>
                      <td className="p-3 text-muted-foreground">{product.tags.length}</td>
                      <td className="p-3 text-muted-foreground">{product.slug}</td>
                      <td className="p-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${
                            score >= 80
                              ? "bg-green-100 text-green-700"
                              : score >= 50
                                ? "bg-orange-100 text-orange-700"
                                : "bg-red-100 text-red-700"
                          }`}
                        >
                          {score}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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
