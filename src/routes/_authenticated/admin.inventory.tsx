import { createFileRoute, Link } from "@tanstack/react-router";
import { NO_IMAGE_PLACEHOLDER } from "@/utils/noImage";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Package,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Boxes,
  Loader,
} from "lucide-react";
import { listAllProducts } from "@/services/firebase/products";
import { firebaseConfigured } from "@/services/firebase/config";
import { formatPrice } from "@/utils/format";
import type { Product } from "@/types/commerce";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/_authenticated/admin/inventory")({
  ssr: false,
  component: AdminInventoryPage,
  head: () => ({ meta: [{ title: "Inventory Management — AVENTA SHOP Admin" }] }),
});

function AdminInventoryPage() {
  const { t } = useI18n();
  const [filter, setFilter] = useState<"all" | "low" | "out">("all");

  const { data: products, isLoading } = useQuery({
    queryKey: ["products", "all"],
    queryFn: listAllProducts,
    enabled: firebaseConfigured,
  });

  const allProducts = products ?? [];
  const lowStock = allProducts.filter((p) => p.stock > 0 && p.stock <= 5);
  const outOfStock = allProducts.filter((p) => p.stock === 0);
  const totalValue = allProducts.reduce((sum, p) => sum + p.price * p.stock, 0);

  const filteredProducts =
    filter === "low" ? lowStock : filter === "out" ? outOfStock : allProducts;

  return (
    <div className="min-h-screen bg-muted/30">
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-6 flex items-center gap-3">
          <Link to="/admin" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Boxes className="h-6 w-6 text-primary" />
            Inventory Management
          </h1>
        </div>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            icon={<Package className="h-5 w-5" />}
            label="Total Products"
            value={String(allProducts.length)}
          />
          <StatCard
            icon={<AlertTriangle className="h-5 w-5" />}
            label="Low Stock"
            value={String(lowStock.length)}
            color="text-orange-500"
          />
          <StatCard
            icon={<TrendingDown className="h-5 w-5" />}
            label="Out of Stock"
            value={String(outOfStock.length)}
            color="text-red-500"
          />
          <StatCard
            icon={<TrendingUp className="h-5 w-5" />}
            label="Inventory Value"
            value={formatPrice(totalValue)}
          />
        </div>

        {/* Filter tabs */}
        <div className="mb-4 flex gap-2">
          {(["all", "low", "out"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                filter === f ? "bg-primary text-primary-foreground" : "border hover:bg-muted"
              }`}
            >
              {f === "all" ? "All Products" : f === "low" ? "Low Stock" : "Out of Stock"}
            </button>
          ))}
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="py-20 text-center">
            <Loader className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="rounded-2xl border bg-background py-16 text-center">
            <Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No products found</p>
          </div>
        ) : (
          <>
          <div className="space-y-3 md:hidden">
            {filteredProducts.map((product: Product) => (
              <div key={product.id} className="rounded-lg border bg-background p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <img
                    src={product.images[0] ?? NO_IMAGE_PLACEHOLDER}
                    alt={product.title}
                    className="h-10 w-10 shrink-0 rounded-lg object-cover"
                  />
                  <span className="min-w-0 truncate font-medium">{product.title}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {t("admin.price")}:{" "}
                    <span className="font-medium text-foreground">
                      {formatPrice(product.price)}
                    </span>
                  </span>
                  <span>
                    {t("admin.stock")}:{" "}
                    <span
                      className={`font-medium ${
                        product.stock === 0
                          ? "text-red-500"
                          : product.stock <= 5
                            ? "text-orange-500"
                            : ""
                      }`}
                    >
                      {product.stock}
                    </span>
                  </span>
                  <span className="break-all">{product.categorySlug}</span>
                </div>
                <div className="mt-2">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                      product.stock === 0
                        ? "bg-red-100 text-red-700"
                        : product.stock <= 5
                          ? "bg-orange-100 text-orange-700"
                          : "bg-green-100 text-green-700"
                    }`}
                  >
                    {product.stock === 0
                      ? "Out of Stock"
                      : product.stock <= 5
                        ? "Low Stock"
                        : "In Stock"}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden overflow-x-auto rounded-2xl border bg-background shadow-sm md:block">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs font-semibold text-muted-foreground">
                  <th className="p-3">{t("admin.product")}</th>
                  <th className="p-3">{t("admin.price")}</th>
                  <th className="p-3">{t("admin.stock")}</th>
                  <th className="p-3">{t("admin.status")}</th>
                  <th className="p-3">{t("admin.category")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product: Product) => (
                  <tr key={product.id} className="border-b text-sm last:border-b-0">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <img
                          src={product.images[0] ?? NO_IMAGE_PLACEHOLDER}
                          alt={product.title}
                          className="h-10 w-10 rounded-lg object-cover"
                        />
                        <span className="truncate font-medium">{product.title}</span>
                      </div>
                    </td>
                    <td className="p-3">{formatPrice(product.price)}</td>
                    <td className="p-3">
                      <span
                        className={`font-medium ${
                          product.stock === 0
                            ? "text-red-500"
                            : product.stock <= 5
                              ? "text-orange-500"
                              : ""
                        }`}
                      >
                        {product.stock}
                      </span>
                    </td>
                    <td className="p-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          product.stock === 0
                            ? "bg-red-100 text-red-700"
                            : product.stock <= 5
                              ? "bg-orange-100 text-orange-700"
                              : "bg-green-100 text-green-700"
                        }`}
                      >
                        {product.stock === 0
                          ? "Out of Stock"
                          : product.stock <= 5
                            ? "Low Stock"
                            : "In Stock"}
                      </span>
                    </td>
                    <td className="p-3 text-muted-foreground">{product.categorySlug}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
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
