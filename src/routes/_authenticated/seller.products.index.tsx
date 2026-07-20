import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Edit2, Plus, Search, Trash2, Package } from "lucide-react";
import { toast } from "sonner";
import { SellerGate } from "@/components/seller/SellerGate";
import { Spinner } from "@/components/common/Spinner";
import {
  deleteSellerProduct,
  listSellerProducts,
  setProductStatus,
} from "@/services/firebase/sellerProducts";
import { mapFirebaseError } from "@/utils/errors";
import { formatPrice } from "@/utils/format";
import type { Product } from "@/types/commerce";

export const Route = createFileRoute("/_authenticated/seller/products/")({
  component: () => (
    <SellerGate>{(profile) => <ProductsPage sellerId={profile.uid} />}</SellerGate>
  ),
});

function ProductsPage({ sellerId }: { sellerId: string }) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "published" | "archived">(
    "all",
  );

  const refresh = async () => {
    setLoading(true);
    try {
      setProducts(await listSellerProducts(sellerId));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerId]);

  const filtered = useMemo(() => {
    if (!products) return [];
    const query = q.trim().toLowerCase();
    return products.filter((p) => {
      if (statusFilter !== "all" && (p.status ?? "published") !== statusFilter) return false;
      if (query) {
        const hay = `${p.title} ${p.sku ?? ""} ${p.tags.join(" ")}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [products, q, statusFilter]);

  const onDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      await deleteSellerProduct(sellerId, id);
      toast.success("Product deleted");
      void refresh();
    } catch (err) {
      toast.error(mapFirebaseError(err));
    }
  };

  const onToggleStatus = async (p: Product) => {
    const next = (p.status ?? "published") === "published" ? "draft" : "published";
    try {
      await setProductStatus(sellerId, p.id, next);
      toast.success(next === "published" ? "Product published" : "Moved to draft");
      void refresh();
    } catch (err) {
      toast.error(mapFirebaseError(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-sm text-muted-foreground">Manage your listings and inventory.</p>
        </div>
        <Link
          to="/seller/products/new"
          className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Add product
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-background p-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title, SKU, tags"
            className="w-full rounded-md border px-9 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="all">All statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-lg border bg-background p-8 text-sm text-muted-foreground">
          <Spinner /> Loading products...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border bg-background py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Package className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">
            {products?.length === 0 ? "No products yet" : "No products match your filters"}
          </h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {products?.length === 0
              ? "Add your first product to start selling on ShopNexa."
              : "Try clearing your search or status filter."}
          </p>
          {products?.length === 0 && (
            <Link
              to="/seller/products/new"
              className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Add product
            </Link>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-background">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Product</th>
                <th className="px-4 py-3 text-left">SKU</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((p) => {
                const status = p.status ?? "published";
                return (
                  <tr key={p.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={p.images[0] || "/placeholder.svg"}
                          alt=""
                          className="h-10 w-10 rounded-md object-cover"
                        />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{p.title}</div>
                          <div className="text-xs text-muted-foreground">/{p.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.sku || "—"}</td>
                    <td className="px-4 py-3 text-right">{formatPrice(p.price)}</td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={
                          p.stock === 0
                            ? "text-destructive"
                            : p.stock <= 5
                              ? "text-orange-600"
                              : ""
                        }
                      >
                        {p.stock}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onToggleStatus(p)}
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          status === "published"
                            ? "bg-green-500/10 text-green-600"
                            : status === "draft"
                              ? "bg-muted text-muted-foreground"
                              : "bg-destructive/10 text-destructive"
                        }`}
                      >
                        {status}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Link
                          to="/seller/products/$id/edit"
                          params={{ id: p.id }}
                          className="flex h-8 w-8 items-center justify-center rounded-md border hover:bg-muted"
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Link>
                        <button
                          onClick={() => onDelete(p.id, p.title)}
                          className="flex h-8 w-8 items-center justify-center rounded-md border text-destructive hover:bg-destructive/10"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
