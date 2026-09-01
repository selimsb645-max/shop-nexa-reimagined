import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Zap,
  Flame,
  ArrowRight,
  Loader,
  Clock,
  ShoppingBag,
  Tag,
  Check,
  ShieldCheck,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  ArrowLeft,
  Flame as FlameIcon,
} from "lucide-react";
import { BackButton } from "@/components/common/BackButton";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { ProductCard, ProductCardSkeleton } from "@/components/product/ProductCard";
import { listProducts } from "@/services/firebase/products";
import { firebaseConfigured } from "@/services/firebase/config";
import type { Product } from "@/types/commerce";
import { buildMetaTags } from "@/lib/seo";

export const Route = createFileRoute("/flash-sales")({
  ssr: true,
  component: FlashSalesPage,
  head: () => ({
    meta: buildMetaTags({
      title: "Flash Sales — Mega Deals & Discounts on AVENTA SHOP",
      description: "AVENTA SHOP Flash Sales: Unbeatable mega discounts on electronics, fashion, home essentials and more! Limited quantities, hurry before stock runs out.",
      path: "/flash-sales",
      type: "website",
    }),
    scripts: [
      {
        type: "application/ld+json",
        children: jsonLdScript(
          collectionPageJsonLd({
            name: "Flash Sales — AVENTA SHOP",
            description:
              "Limited-time flash sale deals with mega discounts on electronics, fashion, home essentials and more at AVENTA SHOP.",
            path: "/flash-sales",
          }),
        ),
      },
      {
        type: "application/ld+json",
        children: jsonLdScript(
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Flash Sales", path: "/flash-sales" },
          ]),
        ),
      },
    ],
  }),
});

/**
 * Custom hook to manage the live countdown timer
 */
function useCountdown(targetTime: number) {
  const [timeLeft, setTimeLeft] = useState(() => calculateTimeLeft(targetTime));

  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = calculateTimeLeft(targetTime);
      setTimeLeft(remaining);
    }, 1000);

    return () => clearInterval(timer);
  }, [targetTime]);

  return timeLeft;
}

function calculateTimeLeft(targetTime: number) {
  const difference = Math.max(0, targetTime - Date.now());
  const seconds = Math.floor((difference / 1000) % 60);
  const minutes = Math.floor((difference / (1000 * 60)) % 60);
  const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
  const days = Math.floor(difference / (1000 * 60 * 60 * 24));

  return {
    total: difference,
    days,
    hours,
    minutes,
    seconds,
  };
}

function formatTwoDigits(num: number): string {
  return String(num).padStart(2, "0");
}

export function FlashSalesPage() {
  // Target flash sale end time (e.g. Midnight tonight or 12h cycle)
  const targetEndTime = useMemo(() => {
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    if (endOfDay.getTime() - now.getTime() < 3 * 60 * 60 * 1000) {
      endOfDay.setDate(endOfDay.getDate() + 1);
    }
    return endOfDay.getTime();
  }, []);

  const countdown = useCountdown(targetEndTime);

  // States
  const [visibleCount, setVisibleCount] = useState<number>(12);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [activeFilter, setActiveFilter] = useState<"all" | "mega" | "under1000" | "under2500">("all");
  const [sortBy, setSortBy] = useState<"discount-desc" | "price-asc" | "price-desc" | "popular">("discount-desc");
  const [toastText, setToastText] = useState<string | null>(null);

  // Query Products from Firebase
  const {
    data: rawProducts = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["products", "flash-sales-all"],
    queryFn: async () => {
      try {
        const prods = await listProducts();
        return prods || [];
      } catch (err) {
        console.warn("Failed to load flash sale products:", err);
        return [];
      }
    },
    enabled: firebaseConfigured !== false,
  });

  // Filter products where compareAtPrice > price (or oldPrice > price)
  const flashProducts = useMemo(() => {
    if (!Array.isArray(rawProducts)) return [];
    return rawProducts.filter((product: Product) => {
      if (!product || typeof product.price !== "number" || product.price <= 0) return false;
      const compareAt = product.compareAtPrice ?? (product as { oldPrice?: number }).oldPrice;
      return typeof compareAt === "number" && compareAt > product.price;
    });
  }, [rawProducts]);

  // Apply Sub-Filters and Sorting
  const filteredAndSortedProducts = useMemo(() => {
    let list = [...flashProducts];

    // Filter by Deal Type / Price Range
    if (activeFilter === "mega") {
      list = list.filter((p) => {
        const compareAt = p.compareAtPrice ?? (p as { oldPrice?: number }).oldPrice ?? p.price;
        const discount = Math.round(((compareAt - p.price) / compareAt) * 100);
        return discount >= 40;
      });
    } else if (activeFilter === "under1000") {
      list = list.filter((p) => p.price <= 1000);
    } else if (activeFilter === "under2500") {
      list = list.filter((p) => p.price <= 2500);
    }

    // Apply Sorting
    if (sortBy === "discount-desc") {
      list.sort((a, b) => {
        const compA = a.compareAtPrice ?? (a as { oldPrice?: number }).oldPrice ?? a.price;
        const compB = b.compareAtPrice ?? (b as { oldPrice?: number }).oldPrice ?? b.price;
        const discA = ((compA - a.price) / compA) * 100;
        const discB = ((compB - b.price) / compB) * 100;
        return discB - discA;
      });
    } else if (sortBy === "price-asc") {
      list.sort((a, b) => a.price - b.price);
    } else if (sortBy === "price-desc") {
      list.sort((a, b) => b.price - a.price);
    } else if (sortBy === "popular") {
      list.sort((a, b) => {
        const ratingA = a.rating ?? 0;
        const ratingB = b.rating ?? 0;
        return ratingB - ratingA;
      });
    }

    return list;
  }, [flashProducts, activeFilter, sortBy]);

  // Paginated List
  const displayedProducts = useMemo(() => {
    return filteredAndSortedProducts.slice(0, visibleCount);
  }, [filteredAndSortedProducts, visibleCount]);

  const hasMore = visibleCount < filteredAndSortedProducts.length;

  // Handlers
  const handleLoadMore = useCallback(() => {
    setIsLoadingMore(true);
    setTimeout(() => {
      setVisibleCount((prev) => prev + 12);
      setIsLoadingMore(false);
    }, 350);
  }, []);

  const handleAddToCart = useCallback((product: Product, _e: React.MouseEvent<HTMLButtonElement>) => {
    const name = product.title || (product as { name?: string }).name || "Item";
    setToastText(`Added "${name}" to cart!`);
    setTimeout(() => {
      setToastText(null);
    }, 3200);
  }, []);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col font-sans selection:bg-[#f57224] selection:text-white">
      {/* Top Header Bar */}
      <SiteHeader />

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 space-y-6">
        <div className="mb-3">
          <BackButton fallbackTo="/shop" label="Back" className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200 active:scale-95" />
        </div>
        {/* Breadcrumb Navigation */}
        <div className="flex items-center justify-between">
          <nav className="flex items-center gap-2 text-xs sm:text-sm text-slate-500">
            <Link to="/" className="hover:text-[#f57224] transition-colors flex items-center gap-1">
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Home</span>
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-semibold text-slate-800">Flash Sales</span>
          </nav>

          <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-white px-2.5 py-1 rounded-full border border-slate-200 shadow-sm">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>100% Genuine Products</span>
          </div>
        </div>

        {/* Hero Banner: Daraz-Style Flash Sale Banner */}
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#f57224] via-[#ea580c] to-[#dc2626] text-white shadow-xl p-5 sm:p-8 border border-orange-400/30">
          {/* Subtle Background Pattern */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.2),transparent_40%)] pointer-events-none" />
          <div className="absolute -right-12 -bottom-12 w-64 h-64 bg-yellow-400/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -left-12 -top-12 w-64 h-64 bg-red-900/20 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            {/* Banner Left Info */}
            <div className="space-y-3 max-w-xl">
              <div className="flex items-center gap-2 flex-wrap">
                {/* On Sale Now Badge */}
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0f172a] text-white text-xs font-bold uppercase tracking-wider shadow-md">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                  On Sale Now
                </span>

                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-md text-white text-xs font-medium border border-white/30">
                  <Flame className="w-3.5 h-3.5 text-yellow-300 fill-yellow-300 animate-pulse" />
                  <span>Limited Quantities</span>
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-inner">
                  <Zap className="w-8 h-8 sm:w-10 sm:h-10 text-yellow-300 fill-yellow-300 animate-bounce" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight uppercase drop-shadow-sm flex items-center gap-2">
                    Flash Sales
                  </h1>
                  <p className="text-xs sm:text-sm text-orange-100 font-medium mt-0.5">
                    Exclusive AVENTA SHOP Mega Deals • Up to 80% OFF
                  </p>
                </div>
              </div>
            </div>

            {/* Banner Right: Live Countdown Widget */}
            <div className="w-full md:w-auto bg-[#0f172a]/95 backdrop-blur-md rounded-xl p-4 sm:p-5 border border-white/10 shadow-2xl flex flex-col items-center md:items-end gap-2.5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-orange-400">
                <Clock className="w-4 h-4 animate-spin text-orange-400" style={{ animationDuration: "8s" }} />
                <span>Ends In</span>
              </div>

              <div className="flex items-center gap-2 text-white">
                {/* Hours Box */}
                <div className="flex flex-col items-center">
                  <div className="bg-gradient-to-b from-slate-800 to-slate-900 border border-slate-700 rounded-lg w-12 sm:w-14 h-12 sm:h-14 flex items-center justify-center text-xl sm:text-2xl font-black text-white shadow-inner font-mono">
                    {formatTwoDigits(countdown.hours)}
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mt-1">Hours</span>
                </div>

                <span className="text-xl font-bold text-orange-400 pb-4">:</span>

                {/* Minutes Box */}
                <div className="flex flex-col items-center">
                  <div className="bg-gradient-to-b from-slate-800 to-slate-900 border border-slate-700 rounded-lg w-12 sm:w-14 h-12 sm:h-14 flex items-center justify-center text-xl sm:text-2xl font-black text-white shadow-inner font-mono">
                    {formatTwoDigits(countdown.minutes)}
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mt-1">Mins</span>
                </div>

                <span className="text-xl font-bold text-orange-400 pb-4">:</span>

                {/* Seconds Box */}
                <div className="flex flex-col items-center">
                  <div className="bg-gradient-to-b from-slate-800 to-slate-900 border border-slate-700 rounded-lg w-12 sm:w-14 h-12 sm:h-14 flex items-center justify-center text-xl sm:text-2xl font-black text-amber-400 shadow-inner font-mono">
                    {formatTwoDigits(countdown.seconds)}
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mt-1">Secs</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Filter and Sort Toolbar */}
        <section className="bg-white rounded-xl p-3 sm:p-4 border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Quick Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            <button
              type="button"
              onClick={() => setActiveFilter("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-150 flex items-center gap-1.5 ${
                activeFilter === "all"
                  ? "bg-[#0f172a] text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              <span>All Deals ({flashProducts.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter("mega")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-150 flex items-center gap-1.5 ${
                activeFilter === "mega"
                  ? "bg-[#f57224] text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-yellow-300 fill-yellow-300" />
              <span>Mega Discounts (40%+ Off)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter("under1000")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-150 flex items-center gap-1.5 ${
                activeFilter === "under1000"
                  ? "bg-[#0f172a] text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <Tag className="w-3.5 h-3.5 text-emerald-400" />
              <span>Under ৳1,000</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter("under2500")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-150 flex items-center gap-1.5 ${
                activeFilter === "under2500"
                  ? "bg-[#0f172a] text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <Tag className="w-3.5 h-3.5 text-sky-400" />
              <span>Under ৳2,500</span>
            </button>
          </div>

          {/* Sort Selector */}
          <div className="flex items-center justify-between md:justify-end gap-2 border-t md:border-t-0 pt-2 md:pt-0 border-slate-100">
            <span className="text-xs text-slate-500 font-medium whitespace-nowrap">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "discount-desc" | "price-asc" | "price-desc" | "popular")}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#f57224] transition-all"
            >
              <option value="discount-desc">Highest Discount</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
              <option value="popular">Top Rated</option>
            </select>
          </div>
        </section>

        {/* Product Grid Area */}
        {isLoading ? (
          /* Loading Skeletons Grid: 2 cols mobile, 4 cols tablet, 6 cols desktop */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
            {Array.from({ length: 12 }).map((_, index) => (
              <ProductCardSkeleton key={index} />
            ))}
          </div>
        ) : isError ? (
          /* Error State */
          <div className="bg-white rounded-2xl border border-rose-100 p-8 text-center space-y-4 max-w-md mx-auto shadow-sm">
            <div className="w-12 h-12 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">Failed to load Flash Sales</h3>
              <p className="text-xs text-slate-500 mt-1">Please check your network connection and try again.</p>
            </div>
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#0f172a] text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>
        ) : filteredAndSortedProducts.length === 0 ? (
          /* Empty State when no products match flash sale filters */
          <div className="bg-white rounded-2xl border border-slate-200/80 p-10 sm:p-14 text-center space-y-4 max-w-lg mx-auto shadow-sm">
            <div className="relative w-16 h-16 bg-orange-50 text-[#f57224] rounded-full flex items-center justify-center mx-auto">
              <Zap className="w-8 h-8 fill-orange-400 text-[#f57224]" />
              <div className="absolute -bottom-1 -right-1 bg-amber-400 text-slate-900 text-[10px] font-black px-1.5 py-0.5 rounded-full border border-white">
                0
              </div>
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-800">No Flash Sale Products Available</h3>
              <p className="text-xs sm:text-sm text-slate-500 max-w-xs mx-auto">
                All current flash sale items are either sold out or do not match your filter settings.
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
              {activeFilter !== "all" && (
                <button
                  type="button"
                  onClick={() => setActiveFilter("all")}
                  className="w-full sm:w-auto px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
                >
                  Clear Filters
                </button>
              )}

              <Link
                to="/shop"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#f57224] hover:bg-orange-600 text-white text-xs font-bold rounded-lg transition-all shadow-md hover:shadow-lg"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Browse All Products</span>
              </Link>
            </div>
          </div>
        ) : (
          /* Product Grid: 2 cols mobile, 4 cols tablet, 6 cols desktop */
          <div className="space-y-8">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
              {displayedProducts.map((product) => (
                <div key={product.id} className="flex flex-col h-full">
                  <ProductCard product={product} onAddToCart={handleAddToCart} />
                  
                  {/* Daraz Flash Sale Simulated Stock Progress Bar */}
                  <div className="mt-1.5 bg-white p-2 rounded-lg border border-slate-100 shadow-2xs space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold">
                      <span className="text-[#f57224] flex items-center gap-0.5">
                        <FlameIcon className="w-3 h-3 fill-orange-500 text-orange-500" />
                        Selling Fast
                      </span>
                      <span>85% Sold</span>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-gradient-to-r from-amber-400 to-[#f57224] h-full rounded-full w-[85%]" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Load More Button */}
            {hasMore && (
              <div className="flex flex-col items-center justify-center pt-2 space-y-2">
                <p className="text-xs text-slate-500 font-medium">
                  Showing <span className="font-bold text-slate-800">{displayedProducts.length}</span> of{" "}
                  <span className="font-bold text-slate-800">{filteredAndSortedProducts.length}</span> flash deals
                </p>

                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-white border border-slate-300 hover:border-[#f57224] hover:text-[#f57224] text-slate-800 text-xs font-bold rounded-xl shadow-xs transition-all duration-200 active:scale-95 disabled:opacity-60"
                >
                  {isLoadingMore ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin text-[#f57224]" />
                      <span>Loading More Deals...</span>
                    </>
                  ) : (
                    <>
                      <span>Load More Flash Deals</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Floating Toast Notification */}
      {toastText && (
        <div className="fixed bottom-20 right-4 z-50 bg-[#0f172a] text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-2xl border border-slate-700 flex items-center gap-2.5 animate-in slide-in-from-bottom-5 duration-200">
          <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
            <Check className="w-3.5 h-3.5" />
          </div>
          <span>{toastText}</span>
        </div>
      )}

      {/* Footer and Mobile Nav */}
      <SiteFooter />
<MobileBottomNav />
    </div>
  );
}

export default FlashSalesPage;
