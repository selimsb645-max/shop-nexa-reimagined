import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, GitCompare, X, Check } from "lucide-react";
import { BackButton } from "@/components/common/BackButton";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { getProductForComparison, type ComparedProduct } from "@/services/firebase/productComparison";
import { listAllProducts } from "@/services/firebase/products";
import { firebaseConfigured } from "@/services/firebase/config";
import { formatPrice } from "@/utils/format";
import type { Product } from "@/types/commerce";
import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/compare")({
  ssr: true,
  component: ComparePage,
  head: () => ({
    ...seoHead({
      title: "Compare Products Side by Side — AVENTA SHOP",
      description: "Compare products side by side on AVENTA SHOP. Compare prices, specifications, ratings, and features to make the best buying decision.",
      path: "/compare",
      type: "website",
    }),
  }),

});

function ComparePage() {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { data: allProducts } = useQuery({
    queryKey: ["products", "all"],
    queryFn: listAllProducts,
    enabled: firebaseConfigured,
  });

  const comparedProducts = useQuery({
    queryKey: ["compare", selectedIds],
    queryFn: async () => {
      const results = await Promise.all(
        selectedIds.map((id) => getProductForComparison(id)),
      );
      return results.filter((p): p is ComparedProduct => p !== null);
    },
    enabled: firebaseConfigured && selectedIds.length > 0,
  });

  const toggleProduct = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : prev.length < 4 ? [...prev, id] : prev,
    );
  };

  const removeProduct = (id: string) => {
    setSelectedIds((prev) => prev.filter((p) => p !== id));
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-3">
          <BackButton fallbackTo="/shop" label="Back" className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200 active:scale-95" />
        </div>
        <div className="mb-6 flex items-center gap-3">
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <GitCompare className="h-6 w-6 text-primary" />
            Compare Products
          </h1>
        </div>

        {selectedIds.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border bg-muted/30 py-20 text-center">
            <GitCompare className="mb-4 h-12 w-12 text-muted-foreground/40" />
            <h2 className="text-lg font-semibold">No products selected</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Select up to 4 products to compare
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="w-32 border-b p-3 text-left text-sm font-semibold text-muted-foreground">
                    Specification
                  </th>
                  {comparedProducts.data?.map((product) => (
                    <th key={product.id} className="border-b p-3 text-left">
                      <div className="relative">
                        <button
                          onClick={() => removeProduct(product.id)}
                          aria-label={`Remove ${product.title} from comparison`}
                          className="absolute right-0 top-0 grid h-6 w-6 place-items-center rounded-full bg-muted text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
                        >
                          <X className="h-4 w-4" />
                        </button>
                        <img
                          src={product.images[0] ?? ""}
                          alt={product.title}
                          className="mb-2 aspect-square w-full rounded-lg object-cover"
                        />
                        <Link
                          to="/product/$slug"
                          params={{ slug: product.slug }}
                          className="block truncate text-sm font-semibold hover:text-primary"
                        >
                          {product.title}
                        </Link>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <CompareRow label="Price" products={comparedProducts.data ?? []} render={(p) => formatPrice(p.price)} />
                <CompareRow label="Original Price" products={comparedProducts.data ?? []} render={(p) => p.compareAtPrice ? formatPrice(p.compareAtPrice) : "—"} />
                <CompareRow label="Rating" products={comparedProducts.data ?? []} render={(p) => `${p.rating} ★ (${p.reviewCount})`} />
                <CompareRow label="Stock" products={comparedProducts.data ?? []} render={(p) => p.stock > 0 ? `${p.stock} available` : "Out of stock"} />
                <CompareRow label="Category" products={comparedProducts.data ?? []} render={(p) => p.categorySlug} />
                <CompareRow label="Tags" products={comparedProducts.data ?? []} render={(p) => p.tags.join(", ") || "—"} />
                <CompareRow label="Colors" products={comparedProducts.data ?? []} render={(p) => p.colors?.join(", ") || "—"} />
                <CompareRow label="Sizes" products={comparedProducts.data ?? []} render={(p) => p.sizes?.join(", ") || "—"} />
              </tbody>
            </table>
          </div>
        )}

        {/* Product Selection */}
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
            Select products to compare ({selectedIds.length}/4)
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {(allProducts ?? []).slice(0, 20).map((product: Product) => {
              const isSelected = selectedIds.includes(product.id);
              return (
                <button
                  key={product.id}
                  onClick={() => toggleProduct(product.id)}
                  className={`flex items-center gap-2 rounded-xl border p-3 text-left transition ${
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "hover:border-primary/40"
                  }`}
                >
                  <img
                    src={product.images[0] ?? ""}
                    alt={product.title}
                    className="h-12 w-12 shrink-0 rounded-lg object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{product.title}</span>
                    <span className="block text-xs text-muted-foreground">{formatPrice(product.price)}</span>
                  </span>
                  {isSelected && (
                    <Check className="h-5 w-5 shrink-0 text-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </main>
      <SiteFooter />
</div>
  );
}

function CompareRow({
  label,
  products,
  render,
}: {
  label: string;
  products: ComparedProduct[];
  render: (p: ComparedProduct) => string;
}) {
  return (
    <tr className="border-b">
      <td className="w-32 p-3 text-sm font-medium text-muted-foreground">{label}</td>
      {products.length === 0 ? (
        <td className="p-3 text-sm text-muted-foreground/40">—</td>
      ) : (
        products.map((product) => (
          <td key={product.id} className="p-3 text-sm">
            {render(product)}
          </td>
        ))
      )}
    </tr>
  );
}
