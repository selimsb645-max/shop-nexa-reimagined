import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { MapPin, Store, PackageX, Loader, Star, ChevronRight } from "lucide-react";
import { BackButton } from "@/components/common/BackButton";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { ProductCard } from "@/components/product/ProductCard";
import { listAllProducts } from "@/services/firebase/products";
import { getPublicStoreBySlug, type PublicStoreData } from "@/lib/store.functions";
import { formatPrice } from "@/utils/format";
import type { Product } from "@/types/commerce";

export const Route = createFileRoute("/store/$slug")({
  ssr: false,
  component: StorePage,
  head: () => ({
    meta: [
      { title: "Store — AVENTA SHOP" },
      { name: "description", content: "Browse products from this AVENTA SHOP seller store." },
    ],
  }),
});

function StorePage() {
  const { slug } = Route.useParams();
  const [store, setStore] = useState<PublicStoreData | null | undefined>(undefined);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(12);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setStore(undefined);
      setProducts(null);
      setVisibleCount(12);
      try {
        const s = await getPublicStoreBySlug({ data: { slug } });
        if (cancelled) return;
        if (!s) {
          setStore(null);
          setLoading(false);
          return;
        }
        setStore(s);

        // Load products by this seller (products are publicly readable)
        const all = await listAllProducts();
        if (cancelled) return;
        const sellerProducts = all.filter((p) => p.sellerId === s.uid);
        setProducts(sellerProducts);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load store. Please try again.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Update SEO dynamically when store loads
  useEffect(() => {
    if (!store) return;
    document.title = `${store.shopName} — AVENTA SHOP Store`;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute(
        "content",
        store.description
          ? `${store.description.slice(0, 155)}`
          : `Browse products from ${store.shopName} on AVENTA SHOP.`,
      );
    }
  }, [store]);

  const visibleProducts = useMemo(() => {
    if (!products) return [];
    return products.slice(0, visibleCount);
  }, [products, visibleCount]);

  // --- Loading ---
  if (loading) {
    return (
      <>
        <SiteHeader />
        <div className="flex items-center justify-center py-32">
          <div className="flex flex-col items-center gap-3">
            <Loader className="w-8 h-8 animate-spin text-slate-300" />
            <p className="text-sm text-slate-400">Loading store…</p>
          </div>
        </div>
        <SiteFooter />
      </>
    );
  }

  // --- Error ---
  if (error) {
    return (
      <>
        <SiteHeader />
        <div className="flex flex-col items-center justify-center py-32 px-4">
          <div className="max-w-md text-center">
            <h1 className="text-xl font-bold text-slate-800">Something went wrong</h1>
            <p className="mt-2 text-sm text-slate-500">{error}</p>
            <Link
              to="/shop"
              className="mt-6 inline-flex items-center gap-1.5 bg-[#f57224] hover:bg-orange-600 text-white font-bold py-3 px-6 rounded-xl text-sm transition-colors"
            >
              Continue Shopping <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
        <SiteFooter />
        <MobileBottomNav />
      </>
    );
  }

  // --- Store Not Found ---
  if (store === null) {
    return (
      <>
        <SiteHeader />
        <div className="flex flex-col items-center justify-center py-32 px-4">
          <div className="max-w-md text-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <Store className="w-8 h-8 text-slate-400" />
            </div>
            <h1 className="text-xl font-bold text-slate-800">Store not found</h1>
            <p className="mt-2 text-sm text-slate-500">
              This store doesn't exist or is no longer available on AVENTA SHOP.
            </p>
            <Link
              to="/shop"
              className="mt-6 inline-flex items-center gap-1.5 bg-[#f57224] hover:bg-orange-600 text-white font-bold py-3 px-6 rounded-xl text-sm transition-colors"
            >
              Browse All Products <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
        <SiteFooter />
        <MobileBottomNav />
      </>
    );
  }

  // --- Store Page ---
  if (!store || !products) return null;

  return (
    <>
      <SiteHeader />

      {/* Back navigation */}
      <div className="max-w-7xl mx-auto px-4 pt-4">
        <BackButton fallbackTo="/shop" label="Back" className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200 active:scale-95" />
      </div>

      {/* Store Banner / Header */}
      <div className="relative">
        {/* Banner background */}
        <div className="h-40 sm:h-52 bg-gradient-to-r from-slate-800 to-slate-900 relative overflow-hidden">
          {store.bannerUrl && (
            <img
              src={store.bannerUrl}
              alt={store.shopName}
              className="w-full h-full object-cover opacity-60"
            />
          )}
        </div>

        {/* Store info card — overlapping banner */}
        <div className="max-w-6xl mx-auto px-4 -mt-16 relative z-10">
          <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              {/* Logo */}
              <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center flex-shrink-0 overflow-hidden border-2 border-white shadow-md">
                {store.logoUrl ? (
                  <img
                    src={store.logoUrl}
                    alt={store.shopName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Store className="w-10 h-10 text-slate-400" />
                )}
              </div>

              {/* Store details */}
              <div className="flex-1 min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-[#0f172a]">{store.shopName}</h1>
                {store.description && (
                  <p className="mt-1 text-sm text-slate-500 line-clamp-2">{store.description}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                  {store.city && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      {store.city}
                      {store.area ? `, ${store.area}` : ""}
                      {store.country ? `, ${store.country}` : ""}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <PackageX className="w-3.5 h-3.5" />
                    {products.length} {products.length === 1 ? "product" : "products"}
                  </span>
                </div>
              </div>

              {/* Shop link */}
              <Link
                to="/shop"
                className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium text-[#f57224] hover:underline whitespace-nowrap"
              >
                All Stores <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Products Grid */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-[#0f172a]">Products from {store.shopName}</h2>
          <span className="text-sm text-slate-400">
            {products.length} item{products.length !== 1 ? "s" : ""}
          </span>
        </div>

        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center bg-white rounded-2xl border border-slate-200 py-20 px-4 text-center">
            <PackageX className="w-12 h-12 text-slate-200 mb-3" />
            <p className="text-sm font-medium text-slate-500">No products available yet</p>
            <p className="text-xs text-slate-400 mt-1">
              This store hasn't listed any products for sale.
            </p>
            <Link
              to="/shop"
              className="mt-6 inline-flex items-center gap-1.5 bg-[#f57224] hover:bg-orange-600 text-white font-bold py-3 px-6 rounded-xl text-sm transition-colors"
            >
              Browse All Products <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
              {visibleProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>

            {/* Load More */}
            {visibleCount < products.length && (
              <div className="flex justify-center mt-8">
                <button
                  onClick={() => setVisibleCount((c) => c + 12)}
                  className="bg-white border border-slate-200 hover:border-slate-300 text-slate-600 font-medium py-3 px-8 rounded-xl text-sm transition-colors"
                >
                  Load More ({products.length - visibleCount} remaining)
                </button>
              </div>
            )}
          </>
        )}
      </div>
<SiteFooter />
      <MobileBottomNav />
    </>
  );
}
