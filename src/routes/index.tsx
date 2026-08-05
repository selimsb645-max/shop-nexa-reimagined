import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Sparkles,
  ArrowRight,
  Shirt,
  Smartphone,
  Apple,
  Sofa,
  Headphones,
  Gamepad2,
  Baby,
  Tag,
  Truck,
  ShieldCheck,
  Package,
  Headset,
  Award,
  Zap,
  Flame,
  Star,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { SiteHeader, TopBar } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { WhatsAppFab } from "@/components/layout/SiteChrome";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { ProductCard } from "@/components/product/ProductCard";
import { listCategories } from "@/services/firebase/categories";
import { listProducts } from "@/services/firebase/products";
import { firebaseConfigured } from "@/services/firebase/config";
import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import type { Product } from "@/types/commerce";

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({
    meta: [
      { title: "Shop Nexa — Online Shopping Marketplace" },
      {
        name: "description",
        content:
          "Discover amazing deals, electronics, fashion, and home essentials on Shop Nexa. Fast delivery and secure payments.",
      },
    ],
  }),
});

// Category definition interface for display
interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  icon: React.ComponentType<{ className?: string }>;
  bgColor: string;
  textColor: string;
}

// Default static categories for fallback/enrichment
const DEFAULT_CATEGORIES: CategoryItem[] = [
  {
    id: "electronics",
    name: "Electronics",
    slug: "electronics",
    icon: Smartphone,
    bgColor: "bg-blue-500/10",
    textColor: "text-blue-600",
  },
  {
    id: "fashion",
    name: "Fashion",
    slug: "fashion",
    icon: Shirt,
    bgColor: "bg-orange-500/10",
    textColor: "text-orange-600",
  },
  {
    id: "home-living",
    name: "Home & Living",
    slug: "home-living",
    icon: Sofa,
    bgColor: "bg-emerald-500/10",
    textColor: "text-emerald-600",
  },
  {
    id: "audio-acc",
    name: "Audio & Accessories",
    slug: "audio-accessories",
    icon: Headphones,
    bgColor: "bg-purple-500/10",
    textColor: "text-purple-600",
  },
  {
    id: "gaming",
    name: "Gaming & Tech",
    slug: "gaming",
    icon: Gamepad2,
    bgColor: "bg-indigo-500/10",
    textColor: "text-indigo-600",
  },
  {
    id: "groceries",
    name: "Fresh & Grocery",
    slug: "groceries",
    icon: Apple,
    bgColor: "bg-green-500/10",
    textColor: "text-green-600",
  },
  {
    id: "mother-baby",
    name: "Mother & Baby",
    slug: "mother-baby",
    icon: Baby,
    bgColor: "bg-pink-500/10",
    textColor: "text-pink-600",
  },
  {
    id: "offers-deals",
    name: "Special Offers",
    slug: "offers",
    icon: Tag,
    bgColor: "bg-rose-500/10",
    textColor: "text-rose-600",
  },
];

// Hero banner slide configuration
const HERO_SLIDES = [
  {
    id: "mega-sale",
    tag: "MEGA SALE • UP TO 70% OFF",
    title: "Shop Nexa Grand Shopping Festival",
    description: "Unbeatable discounts across thousands of top-tier electronics, fashion, and home lifestyle products.",
    ctaText: "Shop Mega Sale",
    ctaLink: "/flash-sales",
    gradient: "from-slate-900 via-slate-800 to-orange-600",
    badgeText: "HOT DEAL",
    badgeColor: "bg-orange-500 text-white",
  },
  {
    id: "electronics",
    tag: "TECH INNOVATION 2026",
    title: "Next-Gen Smartphones & Audio Gear",
    description: "Upgrade your lifestyle with noise-canceling headphones, smartwatches, and latest flagship gadgets.",
    ctaText: "Explore Electronics",
    ctaLink: "/shop",
    gradient: "from-slate-950 via-blue-950 to-slate-900",
    badgeText: "NEW ARRIVALS",
    badgeColor: "bg-blue-600 text-white",
  },
  {
    id: "fashion",
    tag: "SUMMER FASHION TRENDS",
    title: "Contemporary Styles & Streetwear",
    description: "Refresh your wardrobe with premium apparel, designer sneakers, and signature accessories.",
    ctaText: "Upgrade Wardrobe",
    ctaLink: "/shop",
    gradient: "from-slate-900 via-orange-950 to-slate-950",
    badgeText: "TRENDING",
    badgeColor: "bg-amber-500 text-slate-950 font-bold",
  },
];

function HomePage() {
  // Query 1: Categories
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

  // Query 2: Featured Products
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

  // Query 3: Newest Products
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

  // Query 4: Top Rated Products
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

  // Query 5: All Products fallback pool
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

  // Combine into deduplicated 'Just For You' product pool
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

  // Flash Sale items (pick top 8 from pool)
  const flashSaleProducts = useMemo(() => {
    if (justForYouPool.length === 0) return [];
    // Prioritize products with compareAtPrice or pick first 8
    const discounted = justForYouPool.filter(
      (p) => p.compareAtPrice && p.compareAtPrice > p.price
    );
    return discounted.length >= 4
      ? discounted.slice(0, 8)
      : justForYouPool.slice(0, 8);
  }, [justForYouPool]);

  // Category mapping
  const categoryList: CategoryItem[] = useMemo(() => {
    if (
      Array.isArray(rawCategories) &&
      rawCategories.length > 0
    ) {
      return rawCategories.map((cat, idx) => {
        const fallback = DEFAULT_CATEGORIES[idx % DEFAULT_CATEGORIES.length];
        return {
          id: cat.id || cat.slug || `cat-${idx}`,
          name: cat.name || "Category",
          slug: cat.slug || cat.name?.toLowerCase().replace(/\s+/g, "-") || "",
          icon: fallback.icon,
          bgColor: fallback.bgColor,
          textColor: fallback.textColor,
        };
      });
    }
    return DEFAULT_CATEGORIES;
  }, [rawCategories]);

  // Just For You pagination state
  const [visibleCount, setVisibleCount] = useState(12);

  const handleLoadMore = () => {
    setVisibleCount((prev) => prev + 12);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
      {/* Top Header bar */}
      <TopBar />
      <SiteHeader />

      <main className="mx-auto max-w-7xl px-3 pb-16 sm:px-6 lg:px-8">
        {/* 1. Hero Carousel */}
        <section className="mt-4">
          <HeroCarousel />
        </section>

        {/* 2. Flash Sale Section */}
        <section className="mt-8">
          <FlashSaleSection
            products={flashSaleProducts}
            isLoading={isProductsLoading}
          />
        </section>

        {/* 3. Categories Grid */}
        <section className="mt-10">
          <CategoriesGrid
            categories={categoryList}
            isLoading={categoriesLoading}
          />
        </section>

        {/* 4. Promotional Banner */}
        <section className="mt-10">
          <PromotionalBanner />
        </section>

        {/* 5. 'Just For You' Product Grid */}
        <section className="mt-10">
          <JustForYouSection
            products={justForYouPool}
            visibleCount={visibleCount}
            isLoading={isProductsLoading}
            onLoadMore={handleLoadMore}
          />
        </section>

        {/* 6. Features strip */}
        <section className="mt-12">
          <FeaturesStrip />
        </section>
      </main>

      {/* Footer & Floating Chrome */}
      <SiteFooter />
      <WhatsAppFab />
      <MobileBottomNav />
    </div>
  );
}

/* ==========================================================================
   1. Hero Carousel Component
   ========================================================================== */
function HeroCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % HERO_SLIDES.length);
  }, []);

  const prevSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + HERO_SLIDES.length) % HERO_SLIDES.length);
  }, []);

  // Auto-rotate 5s
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(nextSlide, 5000);
    return () => clearInterval(interval);
  }, [isPaused, nextSlide]);

  // Touch Swipe Handlers
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
    const minSwipeDistance = 40;

    if (distance > minSwipeDistance) {
      nextSlide();
    } else if (distance < -minSwipeDistance) {
      prevSlide();
    }

    touchStartX.current = null;
    touchEndX.current = null;
    setIsPaused(false);
  };

  return (
    <div
      className="relative overflow-hidden rounded-2xl shadow-xl transition-all duration-300"
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
            className={`min-w-full relative bg-gradient-to-r ${slide.gradient} px-6 py-12 sm:px-12 sm:py-16 md:py-20 text-white flex flex-col justify-between overflow-hidden`}
          >
            {/* Background Decorative Pattern */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.1),transparent)] pointer-events-none" />
            <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full bg-orange-500/20 blur-3xl pointer-events-none" />
            <div className="absolute -left-20 -bottom-20 h-80 w-80 rounded-full bg-blue-500/20 blur-3xl pointer-events-none" />

            <div className="relative z-10 max-w-2xl">
              <div className="flex items-center gap-2 mb-3">
                <span
                  className={`inline-block rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-wider ${slide.badgeColor}`}
                >
                  {slide.badgeText}
                </span>
                <span className="text-xs font-semibold tracking-wider text-orange-300 uppercase">
                  {slide.tag}
                </span>
              </div>

              <h2 className="text-2xl font-black tracking-tight sm:text-4xl md:text-5xl leading-tight">
                {slide.title}
              </h2>

              <p className="mt-3 text-sm sm:text-base text-slate-200 line-clamp-2 max-w-lg">
                {slide.description}
              </p>

              <div className="mt-6 flex items-center gap-4">
                <Link
                  to={slide.ctaLink}
                  className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-6 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-orange-600 active:scale-95"
                >
                  {slide.ctaText}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/shop"
                  className="hidden sm:inline-flex items-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
                >
                  Browse Catalog
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Slide Navigation Controls */}
      <button
        type="button"
        onClick={prevSlide}
        aria-label="Previous Slide"
        className="absolute left-3 top-1/2 -translate-y-1/2 grid h-10 w-10 place-items-center rounded-full bg-slate-900/40 text-white backdrop-blur transition hover:bg-slate-900/70 focus:outline-none"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>

      <button
        type="button"
        onClick={nextSlide}
        aria-label="Next Slide"
        className="absolute right-3 top-1/2 -translate-y-1/2 grid h-10 w-10 place-items-center rounded-full bg-slate-900/40 text-white backdrop-blur transition hover:bg-slate-900/70 focus:outline-none"
      >
        <ChevronRight className="h-6 w-6" />
      </button>

      {/* Slide Indicators */}
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2 z-10">
        {HERO_SLIDES.map((_, index) => (
          <button
            key={index}
            type="button"
            onClick={() => setCurrentIndex(index)}
            aria-label={`Go to slide ${index + 1}`}
            className={`h-2.5 rounded-full transition-all duration-300 ${
              currentIndex === index
                ? "w-8 bg-orange-500"
                : "w-2.5 bg-white/50 hover:bg-white/80"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

/* ==========================================================================
   2. Flash Sale Section Component
   ========================================================================== */
function FlashSaleSection({
  products,
  isLoading,
}: {
  products: Product[];
  isLoading: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Countdown timer state
  const [timeLeft, setTimeLeft] = useState({
    hours: 5,
    minutes: 42,
    seconds: 19,
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev.seconds > 0) return { ...prev, seconds: prev.seconds - 1 };
        if (prev.minutes > 0) return { ...prev, minutes: 59, seconds: 59 };
        if (prev.hours > 0)
          return { hours: prev.hours - 1, minutes: 59, seconds: 59 };
        return { hours: 12, minutes: 0, seconds: 0 };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = direction === "left" ? -320 : 320;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  return (
    <div className="rounded-2xl border border-orange-500/20 bg-white p-4 sm:p-6 shadow-sm">
      {/* Flash Sale Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-orange-500 text-white shadow-md shadow-orange-500/30">
            <Zap className="h-6 w-6 fill-current animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Flash Sale
              </h2>
              <span className="flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-600">
                <Flame className="h-3.5 w-3.5 fill-red-600" /> On Sale Now
              </span>
            </div>
            <p className="text-xs text-slate-500">Limited quantity deals refreshed daily</p>
          </div>
        </div>

        {/* Countdown Timer */}
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline text-xs font-bold uppercase tracking-wider text-slate-500">
            Ends In:
          </span>
          <div className="flex items-center gap-1.5 font-mono">
            <CountdownBox value={timeLeft.hours} label="HRS" />
            <span className="font-bold text-slate-700">:</span>
            <CountdownBox value={timeLeft.minutes} label="MIN" />
            <span className="font-bold text-slate-700">:</span>
            <CountdownBox value={timeLeft.seconds} label="SEC" />
          </div>
        </div>

        {/* Shop All Button & Controls */}
        <div className="flex items-center gap-2">
          <Link
            to="/flash-sales"
            className="inline-flex items-center gap-1.5 rounded-lg border border-orange-500/40 bg-orange-50 px-3.5 py-2 text-xs font-bold text-orange-600 transition hover:bg-orange-500 hover:text-white"
          >
            Shop All
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <div className="hidden sm:flex items-center gap-1 ml-2">
            <button
              type="button"
              onClick={() => scroll("left")}
              aria-label="Scroll left"
              className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => scroll("right")}
              aria-label="Scroll right"
              className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Horizontal Scrollable Product List */}
      <div
        ref={scrollRef}
        className="mt-5 flex gap-4 overflow-x-auto pb-2 pt-1 scrollbar-none snap-x snap-mandatory"
      >
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="min-w-[200px] sm:min-w-[220px] max-w-[220px] shrink-0 snap-start"
              >
                <ProductCardSkeleton />
              </div>
            ))
          : products.length > 0
          ? products.map((product) => (
              <div
                key={product.id}
                className="min-w-[200px] sm:min-w-[220px] max-w-[220px] shrink-0 snap-start"
              >
                <ProductCard product={product} />
              </div>
            ))
          : (
            <div className="w-full py-8 text-center text-sm text-slate-500">
              No flash sale products currently available.
            </div>
          )}
      </div>
    </div>
  );
}

function CountdownBox({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg bg-slate-900 px-2.5 py-1 text-white shadow-sm min-w-[36px]">
      <span className="text-sm font-extrabold tabular-nums">
        {String(value).padStart(2, "0")}
      </span>
      <span className="text-[9px] font-medium text-slate-400">{label}</span>
    </div>
  );
}

/* ==========================================================================
   3. Categories Grid Component
   ========================================================================== */
function CategoriesGrid({
  categories,
  isLoading,
}: {
  categories: CategoryItem[];
  isLoading: boolean;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 sm:p-6 shadow-sm border border-slate-100">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Tag className="h-5 w-5 text-orange-500" />
            Categories
          </h2>
          <p className="text-xs text-slate-500">Explore items by popular categories</p>
        </div>
        <Link
          to="/shop"
          className="text-xs font-bold text-orange-600 hover:underline flex items-center gap-1"
        >
          All Categories <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 sm:gap-4">
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="flex flex-col items-center justify-center rounded-xl p-4 bg-slate-100 animate-pulse h-28"
              />
            ))
          : categories.map((cat) => {
              const IconComp = cat.icon || Smartphone;
              return (
                <Link
                  key={cat.id}
                  to="/shop"
                  search={{ category: cat.slug }}
                  className="group flex flex-col items-center rounded-xl border border-slate-100 p-3.5 text-center transition-all duration-200 hover:-translate-y-1 hover:border-orange-200 hover:shadow-md bg-white"
                >
                  <div
                    className={`grid h-14 w-14 place-items-center rounded-full ${cat.bgColor} ${cat.textColor} transition-transform duration-200 group-hover:scale-110`}
                  >
                    <IconComp className="h-7 w-7" />
                  </div>
                  <span className="mt-2.5 text-xs font-bold text-slate-800 line-clamp-1 group-hover:text-orange-600">
                    {cat.name}
                  </span>
                </Link>
              );
            })}
      </div>
    </div>
  );
}

/* ==========================================================================
   4. Promotional Banner Component
   ========================================================================== */
function PromotionalBanner() {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-orange-600 p-6 sm:p-8 text-white shadow-xl">
      {/* Decorative Glows */}
      <div className="absolute -right-10 -bottom-10 h-64 w-64 rounded-full bg-orange-500/30 blur-3xl pointer-events-none" />
      <div className="absolute right-1/3 -top-10 h-40 w-40 rounded-full bg-blue-500/20 blur-2xl pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="max-w-xl">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/20 border border-orange-400/30 px-3 py-1 text-xs font-bold text-orange-300">
            <Sparkles className="h-3.5 w-3.5 text-orange-400" />
            Shop Nexa App Exclusive
          </div>
          <h2 className="mt-3 text-2xl sm:text-3xl font-black tracking-tight leading-snug">
            Get Extra 15% OFF + Free Shipping
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-slate-300">
            Use promo code <span className="font-mono font-bold text-orange-400">NEXA15</span> at checkout on your first order.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Link
            to="/shop"
            className="inline-flex items-center justify-center rounded-xl bg-orange-500 px-6 py-3.5 text-sm font-bold text-white shadow-lg transition hover:bg-orange-600 active:scale-95"
          >
            Claim Discount Now
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   5. 'Just For You' Product Grid Component
   ========================================================================== */
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
      {/* Heading */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-orange-500 fill-orange-500/20" />
            Just For You
          </h2>
          <p className="text-xs text-slate-500">
            Personalized recommendations based on trending items
          </p>
        </div>
        <span className="text-xs text-slate-400 font-medium">
          Showing {displayedProducts.length} of {products.length}
        </span>
      </div>

      {/* Grid: 2 cols mobile, 4 cols tablet, 6 cols desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
        {isLoading
          ? Array.from({ length: 12 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))
          : displayedProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
      </div>

      {/* Load More Button */}
      {!isLoading && hasMore && (
        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={onLoadMore}
            className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-orange-500 bg-white px-8 py-3 text-sm font-bold text-orange-600 shadow-sm transition hover:bg-orange-500 hover:text-white active:scale-95"
          >
            Load More Products
          </button>
        </div>
      )}

      {!isLoading && !hasMore && products.length > 0 && (
        <p className="mt-8 text-center text-xs font-semibold text-slate-400">
          You've explored all current recommendations!
        </p>
      )}
    </div>
  );
}

/* Skeleton loader for product card */
function ProductCardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm animate-pulse flex flex-col justify-between h-72">
      <div className="h-36 w-full rounded-lg bg-slate-200" />
      <div className="mt-3 space-y-2">
        <div className="h-3 w-3/4 rounded bg-slate-200" />
        <div className="h-3 w-1/2 rounded bg-slate-200" />
      </div>
      <div className="mt-4 flex items-center justify-between">
        <div className="h-4 w-1/3 rounded bg-slate-200" />
        <div className="h-7 w-16 rounded-lg bg-slate-200" />
      </div>
    </div>
  );
}

/* ==========================================================================
   6. Features Strip Component
   ========================================================================== */
function FeaturesStrip() {
  const features = [
    {
      icon: Truck,
      title: "Free Delivery",
      description: "On orders over $50 across nationwide delivery routes",
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
      title: "24/7 Customer Support",
      description: "Dedicated live assistance whenever you need help",
      bgColor: "bg-purple-50 text-purple-600",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {features.map((item, idx) => {
        const Icon = item.icon;
        return (
          <div
            key={idx}
            className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition hover:shadow-md"
          >
            <div
              className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${item.bgColor}`}
            >
              <Icon className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">{item.title}</h3>
              <p className="mt-0.5 text-xs text-slate-500">{item.description}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
