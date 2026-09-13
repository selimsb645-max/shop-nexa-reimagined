/**
 * Pocket Storefront design: AVENTA SHOP's blue-and-orange desktop merchandising is
 * reflowed for thumb-friendly discovery, readable mobile cards, and swipeable rails.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Sparkles,
  ArrowRight,
  Truck,
  ShieldCheck,
  Package,
  Headset,
  Zap,
  Flame,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { CategoryShowcase, type ShowcaseCategory } from "@/components/home/CategoryShowcase";
import { CampaignHomeSection } from "@/components/campaigns/CampaignHomeSection";

import { seoHead, getSiteUrl } from "@/lib/seo";
import { ProductCard } from "@/components/product/ProductCard";
import { listCategories } from "@/services/firebase/categories";
import { listProducts } from "@/services/firebase/products";
import { firebaseConfigured } from "@/services/firebase/config";
import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import type { Product } from "@/types/commerce";

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({
    ...seoHead({
      title: "AVENTA SHOP — Online Shopping Marketplace in Bangladesh",
      description:
        "Discover amazing deals on electronics, fashion, grocery, beauty and home essentials on AVENTA SHOP. Fast delivery, secure payments, and free shipping over $50. Shop from verified sellers.",
      path: "/",
      type: "website",
      image: "/brand/aventa-shop-logo.png",
    }),
  }),
});

// Fallback categories used only when the category collection is unavailable.
// Names/slugs mirror the live category data source; visuals are resolved
// deterministically by @/lib/categoryVisuals.
const FALLBACK_CATEGORIES: ShowcaseCategory[] = [
  { id: "electronics", name: "Electronics & Gadgets", slug: "electronics" },
  { id: "fashion", name: "Fashion & Lifestyle", slug: "fashion" },
  { id: "home-living", name: "Home & Living", slug: "home-living" },
  { id: "health-beauty", name: "Beauty & Personal Care", slug: "health-beauty" },
  { id: "groceries", name: "Grocery & Essentials", slug: "groceries" },
  { id: "shoes", name: "Shoes & Footwear", slug: "shoes" },
  { id: "toys-kids", name: "Toys & Kids", slug: "toys-kids" },
  { id: "sports-outdoor", name: "Sports & Fitness", slug: "sports-outdoor" },
  { id: "automotive", name: "Automotive", slug: "automotive" },
  { id: "books-stationery", name: "Books & Stationery", slug: "books-stationery" },
];

// Hero banner slide configuration
const HERO_SLIDES = [
  {
    id: "shop-smarter",
    tag: "BEST QUALITY, BEST PRICE",
    title: "Shop Smarter. Live Better.",
    description: "Everything you need in one place. Top quality products at unbeatable prices.",
    ctaText: "Shop Now",
    ctaLink: "/shop",
    badgeText: "BIG SALE",
    badgeColor: "bg-[#1455c6] text-white",
    image: "/manus-storage/shopnexa-mobile-hero_00d53e24.jpg",
  },
  {
    id: "electronics",
    tag: "ELECTRONICS",
    title: "Better sound. Better everyday tech.",
    description: "Discover capable audio and mobile essentials selected for your next upgrade.",
    ctaText: "Explore Electronics",
    ctaLink: "/shop",
    image: "/manus-storage/shopnexa-tech-sale_10bd6408.jpg",
  },
  {
    id: "fashion",
    tag: "FASHION",
    title: "Find your next favourite look.",
    description: "Fresh styles, easy confidence, and wardrobe essentials for every day.",
    ctaText: "Shop Fashion",
    ctaLink: "/shop",
    image: "/manus-storage/shopnexa-fashion-sale_12251764.jpg",
  },
];

function HomePage() {
  const { data: rawCategories, isLoading: categoriesLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      try {
        return await listCategories();
      } catch (err) {
        console.warn("Error fetching categories:", err);
        return [];
      }
    },
    enabled: firebaseConfigured,
  });

  const { data: featuredProducts = [], isLoading: featuredLoading } = useQuery({
    queryKey: ["products", "featured"],
    queryFn: async () => {
      try {
        return await listProducts({ featured: true });
      } catch (err) {
        console.warn("Error fetching featured products:", err);
        return [];
      }
    },
    enabled: firebaseConfigured,
  });

  const { data: newestProducts = [], isLoading: newestLoading } = useQuery({
    queryKey: ["products", "newest"],
    queryFn: async () => {
      try {
        return await listProducts({ sort: "newest" });
      } catch (err) {
        console.warn("Error fetching newest products:", err);
        return [];
      }
    },
    enabled: firebaseConfigured,
  });

  const { data: topRatedProducts = [], isLoading: topRatedLoading } = useQuery({
    queryKey: ["products", "top-rated"],
    queryFn: async () => {
      try {
        return await listProducts({ sort: "rating" });
      } catch (err) {
        console.warn("Error fetching top-rated products:", err);
        return [];
      }
    },
    enabled: firebaseConfigured,
  });

  const { data: allProducts = [], isLoading: allProductsLoading } = useQuery({
    queryKey: ["products", "all"],
    queryFn: async () => {
      try {
        return await listProducts();
      } catch (err) {
        console.warn("Error fetching all products:", err);
        return [];
      }
    },
    enabled: firebaseConfigured,
  });

  const isProductsLoading =
    featuredLoading || newestLoading || topRatedLoading || allProductsLoading;

  const justForYouPool = useMemo(() => {
    const map = new Map<string, Product>();
    const sources = [
      ...(Array.isArray(featuredProducts) ? featuredProducts : []),
      ...(Array.isArray(newestProducts) ? newestProducts : []),
      ...(Array.isArray(topRatedProducts) ? topRatedProducts : []),
      ...(Array.isArray(allProducts) ? allProducts : []),
    ];
    sources.forEach((item) => {
      if (item && item.id && !map.has(item.id)) {
        map.set(item.id, item);
      }
    });
    return Array.from(map.values());
  }, [featuredProducts, newestProducts, topRatedProducts, allProducts]);

  const flashSaleProducts = useMemo(() => {
    // REAL deals only - products with a genuine price drop. The old code
    // silently padded the list with non-discounted products when fewer
    // than 4 deals existed, showing full-price items under a
    // "Flash Sale / On Sale Now" banner.
    return justForYouPool.filter((p) => p.compareAtPrice && p.compareAtPrice > p.price).slice(0, 8);
  }, [justForYouPool]);

  const categoryList: ShowcaseCategory[] = useMemo(() => {
    if (Array.isArray(rawCategories) && rawCategories.length > 0) {
      return rawCategories.map((cat, idx) => ({
        id: cat.id || cat.slug || `cat-${idx}`,
        name: cat.name || "Category",
        slug: cat.slug || cat.name?.toLowerCase().replace(/\s+/g, "-") || "",
      }));
    }
    return FALLBACK_CATEGORIES;
  }, [rawCategories]);

  const [visibleCount, setVisibleCount] = useState(12);
  const handleLoadMore = () => setVisibleCount((prev) => prev + 12);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
      {/* Unified header — logo, search, nav directly at top */}
      <SiteHeader />

      <main className="mx-auto max-w-7xl px-3 pb-28 sm:px-6 sm:pb-16 lg:px-8">
        <h1 className="sr-only">
          AVENTA SHOP — online shopping marketplace for electronics, fashion, grocery, beauty and
          home essentials in Bangladesh
        </h1>
        {/* 1. Hero Carousel */}

        <section className="mt-3 sm:mt-4">
          <HeroCarousel />
        </section>

        {/* 1a. Live Campaign strip — renders only when a campaign is
             ACTIVE (server-driven; disappears automatically on end). */}
        <CampaignHomeSection />

        {/* 2. Flash Sale Section */}
        <section className="mt-5 sm:mt-7">
          <FlashSaleSection products={flashSaleProducts} isLoading={isProductsLoading} />
        </section>

        {/* 3. Categories Grid */}
        <section className="mt-5 sm:mt-7">
          <CategoryShowcase categories={categoryList} isLoading={categoriesLoading} />
        </section>

        {/* 4. Promotional Banner */}
        <section className="mt-5 sm:mt-7">
          <PromotionalBanner />
        </section>

        {/* 5. 'Just For You' Product Grid */}
        <section className="mt-5 sm:mt-7">
          <JustForYouSection
            products={justForYouPool}
            visibleCount={visibleCount}
            isLoading={isProductsLoading}
            onLoadMore={handleLoadMore}
          />
        </section>

        {/* 6. Features strip */}
        <section className="mt-8 sm:mt-10">
          <FeaturesStrip />
        </section>
      </main>

      <SiteFooter />
      <MobileBottomNav />
    </div>
  );
}

/* ========================================================================== Hero Carousel ========================================================================== */
function HeroCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  const nextSlide = useCallback(
    () => setCurrentIndex((prev) => (prev + 1) % HERO_SLIDES.length),
    [],
  );
  const prevSlide = useCallback(
    () => setCurrentIndex((prev) => (prev - 1 + HERO_SLIDES.length) % HERO_SLIDES.length),
    [],
  );

  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(nextSlide, 5000);
    return () => clearInterval(interval);
  }, [isPaused, nextSlide]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsPaused(true);
    touchStartX.current = e.targetTouches[0].clientX;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };
  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const distance = touchStartX.current - touchEndX.current;
    if (distance > 40) nextSlide();
    else if (distance < -40) prevSlide();
    touchStartX.current = null;
    touchEndX.current = null;
    setIsPaused(false);
  };

  return (
    <div
      className="relative overflow-hidden rounded-xl sm:rounded-2xl shadow-lg sm:shadow-xl transition-all duration-300"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="flex transition-transform duration-700 ease-out"
        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
      >
        {HERO_SLIDES.map((slide) => (
          <div
            key={slide.id}
            className="min-w-full relative min-h-[330px] overflow-hidden bg-[#eaf1ff] px-5 py-7 sm:min-h-[400px] sm:px-12 sm:py-16 md:py-20"
          >
            <img
              src={slide.image}
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-[64%_center]"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#eaf1ff] via-[#eaf1ff]/95 via-40% to-[#eaf1ff]/10" />
            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#eaf1ff]/40 to-transparent" />
            <div className="relative z-10 flex h-full max-w-[58%] min-h-[276px] flex-col justify-center sm:max-w-md">
              <div className="mb-3 flex flex-col items-start gap-2 sm:mb-4 sm:flex-row sm:items-center">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#ff7a00] sm:text-xs">
                  {slide.tag}
                </span>
                {slide.badgeText && (
                  <span
                    className={`inline-block rounded-full px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wider shadow-sm sm:text-[10px] ${slide.badgeColor}`}
                  >
                    {slide.badgeText}
                  </span>
                )}
              </div>
              <h2 className="text-[28px] font-black leading-[0.98] tracking-[-0.05em] text-slate-950 sm:text-4xl md:text-5xl">
                {slide.title}
              </h2>
              <p className="mt-3 max-w-xs text-[11px] font-medium leading-relaxed text-slate-700 sm:mt-4 sm:text-base">
                {slide.description}
              </p>
              <div className="mt-5 flex items-center gap-3 sm:mt-6 sm:gap-4">
                <Link
                  to={slide.ctaLink}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-[#1455c6] px-4 py-2.5 text-xs font-bold text-white shadow-[0_8px_18px_rgba(20,85,198,0.22)] transition hover:bg-[#0f459f] active:scale-[0.97] sm:px-6 sm:text-sm"
                >
                  {slide.ctaText} <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </Link>
                <Link
                  to="/shop"
                  className="hidden min-h-11 items-center gap-2 rounded-lg border border-[#1455c6] bg-white/65 px-5 py-3 text-sm font-bold text-[#1455c6] backdrop-blur transition hover:bg-white sm:inline-flex"
                >
                  Browse Catalog
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
      {/* Smaller cleaner arrows */}
      <button
        type="button"
        onClick={prevSlide}
        aria-label="Previous Slide"
        className="absolute left-2 top-1/2 -translate-y-1/2 grid h-7 w-7 sm:h-10 sm:w-10 place-items-center rounded-full bg-slate-900/40 text-white backdrop-blur transition hover:bg-slate-900/70 focus:outline-none"
      >
        <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
      </button>
      <button
        type="button"
        onClick={nextSlide}
        aria-label="Next Slide"
        className="absolute right-2 top-1/2 -translate-y-1/2 grid h-7 w-7 sm:h-10 sm:w-10 place-items-center rounded-full bg-slate-900/40 text-white backdrop-blur transition hover:bg-slate-900/70 focus:outline-none"
      >
        <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
      </button>
      {/* Slide Indicators */}
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2 z-10">
        {HERO_SLIDES.map((_, index) => (
          <button
            key={index}
            type="button"
            onClick={() => setCurrentIndex(index)}
            aria-label={`Go to slide ${index + 1}`}
            className={`h-2 rounded-full transition-all duration-300 ${currentIndex === index ? "w-6 sm:w-8 bg-orange-500" : "w-2 bg-white/50 hover:bg-white/80"}`}
          />
        ))}
      </div>
    </div>
  );
}

/* ========================================================================== Flash Sale Section ========================================================================== */
function FlashSaleSection({ products, isLoading }: { products: Product[]; isLoading: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // REAL savings number computed from the actual discounted products
  // shown below - replaces the old fake "Ends In 5:42:19" countdown that
  // reset itself forever, implying a time-limited sale that never existed.
  const maxDiscountPct = useMemo(() => {
    let best = 0;
    for (const p of products) {
      if (p.compareAtPrice && p.compareAtPrice > p.price) {
        best = Math.max(best, Math.round(((p.compareAtPrice - p.price) / p.compareAtPrice) * 100));
      }
    }
    return best;
  }, [products]);

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current)
      scrollRef.current.scrollBy({ left: direction === "left" ? -320 : 320, behavior: "smooth" });
  };

  // Empty state: no products and not loading
  if (!isLoading && products.length === 0) {
    return (
      <div className="rounded-xl sm:rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-orange-50 text-orange-500">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
              Top Deals
            </h2>
            <p className="text-xs text-slate-500">Live price drops from sellers</p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-10 sm:py-12 text-center">
          <div className="flex items-center justify-center h-16 w-16 rounded-full bg-orange-50 mb-3">
            <Flame className="h-8 w-8 text-orange-300" />
          </div>
          <p className="text-sm font-semibold text-slate-600">No Discounted Products Right Now</p>
          <p className="text-xs text-slate-400 mt-1">
            When sellers drop their prices, the deals appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl sm:rounded-2xl border border-orange-500/20 bg-white p-3 sm:p-6 shadow-sm">
      {/* Flash Sale Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4 pb-3 sm:pb-4 border-b border-slate-100">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="flex items-center justify-center h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-orange-500 text-white shadow-md shadow-orange-500/30">
            <Zap className="h-5 w-5 sm:h-6 sm:w-6 fill-current animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight">
                Top Deals
              </h2>
              {maxDiscountPct > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] sm:text-xs font-bold text-red-600">
                  <Flame className="h-3 w-3 sm:h-3.5 w-3.5 fill-red-600" /> Up to {maxDiscountPct}%
                  off
                </span>
              )}
            </div>
            <p className="text-[11px] sm:text-xs text-slate-500">Live price drops from sellers</p>
          </div>
        </div>
        {/* Shop All + scroll controls */}
        <div className="flex items-center gap-2">
          <Link
            to="/flash-sales"
            className="inline-flex items-center gap-1.5 rounded-lg border border-orange-500/40 bg-orange-50 px-3 sm:px-3.5 py-1.5 sm:py-2 text-[11px] sm:text-xs font-bold text-orange-600 transition hover:bg-orange-500 hover:text-white"
          >
            Shop All <ArrowRight className="h-3 sm:h-3.5 w-3 sm:w-3.5" />
          </Link>
          <div className="hidden sm:flex items-center gap-1 ml-1 sm:ml-2">
            <button
              type="button"
              onClick={() => scroll("left")}
              aria-label="Scroll left"
              className="grid h-7 w-7 sm:h-8 sm:w-8 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100"
            >
              <ChevronLeft className="h-3.5 sm:h-4 w-3.5 sm:w-4" />
            </button>
            <button
              type="button"
              onClick={() => scroll("right")}
              aria-label="Scroll right"
              className="grid h-7 w-7 sm:h-8 sm:w-8 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100"
            >
              <ChevronRight className="h-3.5 sm:h-4 w-3.5 sm:w-4" />
            </button>
          </div>
        </div>
      </div>
      {/* Horizontal Scrollable Product List */}
      <div
        ref={scrollRef}
        className="mt-4 flex gap-3 sm:gap-4 overflow-x-auto pb-2 pt-1 scrollbar-none snap-x snap-mandatory"
      >
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="min-w-[180px] sm:min-w-[220px] max-w-[220px] shrink-0 snap-start"
              >
                <ProductCardSkeleton />
              </div>
            ))
          : products.map((product) => (
              <div
                key={product.id}
                className="min-w-[180px] sm:min-w-[220px] max-w-[220px] shrink-0 snap-start"
              >
                <ProductCard product={product} />
              </div>
            ))}
      </div>
    </div>
  );
}

/* Shop by Category now lives in @/components/home/CategoryShowcase */

/* ========================================================================== Promotional Banner ========================================================================== */
function PromotionalBanner() {
  return (
    <div className="relative overflow-hidden rounded-xl bg-[#eaf1ff] p-5 shadow-lg sm:rounded-2xl sm:p-8 sm:shadow-xl">
      <img
        src="/manus-storage/shopnexa-tech-sale_10bd6408.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-right"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-[#eaf1ff] via-[#eaf1ff]/95 to-[#eaf1ff]/20" />
      <div className="absolute -right-10 -bottom-10 h-48 w-48 sm:h-64 sm:w-64 rounded-full bg-orange-500/30 blur-3xl pointer-events-none" />
      <div className="absolute right-1/3 -top-10 h-32 w-32 sm:h-40 sm:w-40 rounded-full bg-blue-500/20 blur-2xl pointer-events-none" />
      <div className="relative z-10 flex flex-col justify-between gap-4 sm:gap-6 md:flex-row md:items-center">
        <div className="max-w-[62%] sm:max-w-xl">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#1455c6]/15 bg-white/80 px-2.5 py-0.5 text-[10px] font-bold text-[#1455c6] sm:px-3 sm:py-1 sm:text-xs">
            <Sparkles className="h-3 w-3 text-[#ff7a00] sm:h-3.5 sm:w-3.5" />
            AVENTA SHOP Rewards
          </div>
          <h2 className="mt-2 text-xl font-black leading-snug tracking-tight text-slate-950 sm:mt-3 sm:text-3xl">
            New here? Get reward points when you join
          </h2>
          <p className="mt-1.5 text-[11px] text-slate-700 sm:mt-2 sm:text-sm">
            Create a free account and receive welcome reward points you can redeem at checkout.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Link
            to="/register"
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#ff7a00] px-5 py-2.5 text-xs font-bold text-white shadow-lg transition hover:bg-[#e56500] active:scale-[0.97] sm:rounded-xl sm:px-6 sm:py-3.5 sm:text-sm"
          >
            Create Free Account
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ========================================================================== Just For You Product Grid ========================================================================== */
function JustForYouSection({
  products,
  visibleCount,
  isLoading,
  onLoadMore,
}: {
  products: Product[];
  visibleCount: number;
  isLoading: boolean;
  onLoadMore: () => void;
}) {
  const displayedProducts = products.slice(0, visibleCount);
  const hasMore = visibleCount < products.length;
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Sparkles className="h-5 w-5 sm:h-6 text-orange-500 fill-orange-500/20" />
            Just For You
          </h2>
          <p className="text-[11px] sm:text-xs text-slate-500">
            Personalized recommendations based on trending items
          </p>
        </div>
        <span className="text-[11px] sm:text-xs text-slate-400 font-medium">
          Showing {displayedProducts.length} of {products.length}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 sm:gap-4">
        {isLoading
          ? Array.from({ length: 12 }).map((_, i) => <ProductCardSkeleton key={i} />)
          : displayedProducts.map((product) => <ProductCard key={product.id} product={product} />)}
      </div>
      {!isLoading && hasMore && (
        <div className="mt-6 sm:mt-8 text-center">
          <button
            type="button"
            onClick={onLoadMore}
            className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-orange-500 bg-white px-6 py-2.5 sm:px-8 sm:py-3 text-xs sm:text-sm font-bold text-orange-600 shadow-sm transition hover:bg-orange-500 hover:text-white active:scale-95"
          >
            Load More Products
          </button>
        </div>
      )}
      {!isLoading && !hasMore && products.length > 0 && (
        <p className="mt-6 sm:mt-8 text-center text-xs font-semibold text-slate-400">
          You've explored all current recommendations!
        </p>
      )}
    </div>
  );
}

function ProductCardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm animate-pulse flex flex-col justify-between h-64 sm:h-72">
      <div className="h-32 sm:h-36 w-full rounded-lg bg-slate-200" />
      <div className="mt-3 space-y-2">
        <div className="h-3 w-3/4 rounded bg-slate-200" />
        <div className="h-3 w-1/2 rounded bg-slate-200" />
      </div>
      <div className="mt-4 flex items-center justify-between">
        <div className="h-4 w-1/3 rounded bg-slate-200" />
        <div className="h-7 w-14 sm:w-16 rounded-lg bg-slate-200" />
      </div>
    </div>
  );
}

/* ========================================================================== Features Strip ========================================================================== */
function FeaturesStrip() {
  const features = [
    {
      icon: Truck,
      title: "Free Delivery",
      description: "On eligible products when the seller covers the delivery charge",
      bgColor: "bg-blue-50 text-blue-600",
    },
    {
      icon: ShieldCheck,
      title: "100% Secure Payment",
      description: "Encrypted checkout & protected payment options",
      bgColor: "bg-emerald-50 text-emerald-600",
    },
    {
      icon: Package,
      title: "Easy 7-Day Returns",
      description: "Hassle-free return policy & quick refunds",
      bgColor: "bg-orange-50 text-orange-600",
    },
    {
      icon: Headset,
      title: "Customer Support",
      description: "Email, phone & help-center assistance for every order",
      bgColor: "bg-purple-50 text-purple-600",
    },
  ];
  return (
    <div className="-mr-3 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 pr-3 scrollbar-none sm:mr-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:pr-0 lg:grid-cols-4">
      {features.map((item, idx) => {
        const Icon = item.icon;
        return (
          <div
            key={idx}
            className="flex min-w-[256px] snap-start items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 shadow-sm transition hover:shadow-md sm:min-w-0 sm:gap-4 sm:rounded-2xl sm:p-4"
          >
            <div
              className={`grid h-10 w-10 sm:h-12 sm:w-12 shrink-0 place-items-center rounded-xl ${item.bgColor}`}
            >
              <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-slate-900">{item.title}</h3>
              <p className="mt-0.5 text-[11px] sm:text-xs text-slate-500">{item.description}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
