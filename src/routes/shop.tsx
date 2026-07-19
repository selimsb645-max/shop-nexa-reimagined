import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { Search as SearchIcon } from "lucide-react";
import { TopBar, SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { WhatsAppFab } from "@/components/layout/SiteChrome";
import { ProductCard, ProductCardSkeleton } from "@/components/product/ProductCard";
import { listCategories } from "@/services/firebase/categories";
import { filterAndSort, listAllProducts } from "@/services/firebase/products";
import { firebaseConfigured } from "@/services/firebase/config";

const sortSchema = z.enum(["newest", "price-asc", "price-desc", "rating"]);

const shopSearchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  category: fallback(z.string(), "").default(""),
  minPrice: fallback(z.number(), 0).default(0),
  maxPrice: fallback(z.number(), 0).default(0),
  minRating: fallback(z.number(), 0).default(0),
  sort: fallback(sortSchema, "newest").default("newest"),
});

export const Route = createFileRoute("/shop")({
  ssr: false,
  validateSearch: zodValidator(shopSearchSchema),
  component: ShopPage,
  head: () => ({
    meta: [
      { title: "Shop All Products — ShopNexa" },
      { name: "description", content: "Browse thousands of products across every category on ShopNexa." },
      { property: "og:title", content: "Shop All Products — ShopNexa" },
      { property: "og:description", content: "Browse thousands of products across every category on ShopNexa." },
    ],
  }),
});

function ShopPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/shop" });

  const productsQuery = useQuery({
    queryKey: ["products", "all"],
    queryFn: listAllProducts,
    enabled: firebaseConfigured,
  });
  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: listCategories,
    enabled: firebaseConfigured,
  });

  const filtered = useMemo(() => {
    if (!productsQuery.data) return [];
    return filterAndSort(productsQuery.data, {
      q: search.q || undefined,
      categorySlug: search.category || undefined,
      minPrice: search.minPrice > 0 ? search.minPrice : undefined,
      maxPrice: search.maxPrice > 0 ? search.maxPrice : undefined,
      minRating: search.minRating > 0 ? search.minRating : undefined,
      sort: search.sort,
    });
  }, [productsQuery.data, search]);

  const update = (patch: Partial<typeof search>) =>
    navigate({ search: (prev: typeof search) => ({ ...prev, ...patch }) });

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <SiteHeader />

      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-bold">Shop</h1>
            <p className="text-sm text-muted-foreground">
              {productsQuery.isLoading ? "Loading products..." : `${filtered.length} product${filtered.length === 1 ? "" : "s"}`}
              {search.q && ` for "${search.q}"`}
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="sort" className="text-muted-foreground">Sort:</label>
            <select
              id="sort"
              value={search.sort}
              onChange={(e) => update({ sort: e.target.value as z.infer<typeof sortSchema> })}
              className="rounded-md border px-3 py-2 outline-none"
            >
              <option value="newest">Newest</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
              <option value="rating">Top Rated</option>
            </select>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-[240px_1fr]">
          <aside className="space-y-6">
            <div className="rounded-lg border bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold">Search</h3>
              <div className="flex items-center gap-2 rounded-md border px-3">
                <SearchIcon className="h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={search.q}
                  onChange={(e) => update({ q: e.target.value })}
                  placeholder="Search products"
                  className="w-full py-2 text-sm outline-none"
                />
              </div>
            </div>

            <div className="rounded-lg border bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold">Categories</h3>
              <div className="space-y-2 text-sm">
                <button
                  onClick={() => update({ category: "" })}
                  className={`block w-full text-left hover:text-primary ${
                    !search.category ? "font-semibold text-primary" : ""
                  }`}
                >
                  All
                </button>
                {categoriesQuery.data?.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => update({ category: c.slug })}
                    className={`block w-full text-left hover:text-primary ${
                      search.category === c.slug ? "font-semibold text-primary" : ""
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold">Price</h3>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={search.minPrice || ""}
                  onChange={(e) => update({ minPrice: Number(e.target.value) || 0 })}
                  placeholder="Min"
                  className="w-full rounded-md border px-2 py-1.5 text-sm outline-none"
                />
                <span className="text-muted-foreground">–</span>
                <input
                  type="number"
                  min={0}
                  value={search.maxPrice || ""}
                  onChange={(e) => update({ maxPrice: Number(e.target.value) || 0 })}
                  placeholder="Max"
                  className="w-full rounded-md border px-2 py-1.5 text-sm outline-none"
                />
              </div>
            </div>

            <div className="rounded-lg border bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold">Minimum Rating</h3>
              <div className="space-y-1 text-sm">
                {[0, 3, 4, 4.5].map((r) => (
                  <label key={r} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="rating"
                      checked={search.minRating === r}
                      onChange={() => update({ minRating: r })}
                    />
                    {r === 0 ? "Any" : `${r}+ stars`}
                  </label>
                ))}
              </div>
            </div>

            <button
              onClick={() =>
                navigate({ search: { q: "", category: "", minPrice: 0, maxPrice: 0, minRating: 0, sort: "newest" } })
              }
              className="w-full rounded-md border py-2 text-sm hover:bg-muted"
            >
              Reset Filters
            </button>
          </aside>

          <div>
            {productsQuery.isLoading ? (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <ProductCardSkeleton key={i} />
                ))}
              </div>
            ) : filtered.length ? (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                {filtered.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border bg-card p-16 text-center">
                <SearchIcon className="mx-auto h-10 w-10 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-semibold">No products found</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try adjusting your filters or search terms.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <SiteFooter />
      <WhatsAppFab />
    </div>
  );
}
