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
  Zap,
  Flame,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { SiteHeader } from "@/components/layout/SiteHeader";
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
  icon: LucideIcon;
  bgColor: string;
  textColor: string;
}

// Default static categories for fallback/enrichment
const DEFAULT_CATEGORIES: CategoryItem[] = [
  { id: "electronics", name: "Electronics", slug: "electronics", icon: Smartphone, bgColor: "bg-blue-500/10", textColor: "text-blue-600" },
  { id: "fashion", name: "Fashion", slug: "fashion", icon: Shirt, bgColor: "bg-orange-500/10", textColor: "text-orange-600" },
  { id: "home-living", name: "Home & Living", slug: "home-living", icon: Sofa, bgColor: "bg-emerald-500/10", textColor: "text-emerald-600" },
  { id: "audio-acc", name: "Audio & Accessories", slug: "audio-accessories", icon: Headphones, bgColor: "bg-purple-500/10", textColor: "text-purple-600" },
  { id: "gaming", name: "Gaming & Tech", slug: "gaming", icon: Gamepad2, bgColor: "bg-indigo-500/10", textColor: "text-indigo-600" },
  { id: "groceries", name: "Fresh & Grocery", slug: "groceries", icon: Apple, bgColor: "bg-green-500/10", textColor: "text-green-600" },
  { id: "mother-baby", name: "Mother & Baby", slug: "mother-baby", icon: Baby, bgColor: "bg-pink-500/10", textColor: "text-pink-600" },
  { id: "offers-deals", name: "Special Offers", slug: "offers", icon: Tag, bgColor: "bg-rose-500/10", textColor: "text-rose-600" },
];

// Hero banner slide configuration
const HERO_SLIDES = [
  { id: "mega-sale", tag: "MEGA SALE • UP TO 70% OFF", title: "Shop Nexa Grand Shopping Festival", description: "Unbeatable discounts across thousands of top-tier electronics, fashion, and home lifestyle products.", ctaText: "Shop Mega Sale", ctaLink: "/flash-sales", gradient: "from-slate-900 via-slate-800 to-orange-600", badgeText: "HOT DEAL", badgeColor: "bg-orange-500 text-white" },
  { id: "electronics", tag: "TECH INNOVATION 2026", title: "Next-Gen Smartphones & Audio Gear", description: "Upgrade your lifestyle with noise-canceling headphones, smartwatches, and latest flagship gadgets.", ctaText: "Explore Electronics", ctaLink: "/shop", gradient: "from-slate-950 via-blue-950 to-slate-900", badgeText: "NEW ARRIVALS", badgeColor: "bg-blue-600 text-white" },
  { id: "fashion", tag: "SUMMER FASHION TRENDS", title: "Contemporary Styles & Streetwear", description: "Refresh your wardrobe with premium apparel, designer sneakers, and signature accessories.", ctaText: "Upgrade Wardrobe", ctaLink: "/shop", gradient: "from-slate-900 via-orange-950 to-slate-950", badgeText: "TRENDING", badgeColor: "bg-amber-500 text-slate-950 font-bold" },
];

function HomePage() {
  const { data: rawCategories, isLoading: categoriesLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => { try { return await listCategories(); } catch (err) { console.warn("Error fetching categories:", err); return []; } },
    enabled: firebaseConfigured,
  });

  const { data: featuredProducts = [], isLoading: featuredLoading } = useQuery({
    queryKey: ["products", "featured"],
    queryFn: async () => { try { return await listProducts({ featured: true }); } catch (err) { console.warn("Error fetching featured products:", err); return []; } },
    enabled: firebaseConfigured,
  });

  const { data: newestProducts = [], isLoading: newestLoading } = useQuery({
    queryKey: ["products", "newest"],
    queryFn: async () => { try { return await listProducts({ sort: "newest" }); } catch (err) { console.warn("Error fetching newest products:", err); return []; } },
    enabled: firebaseConfigured,
  });

  const { data: topRatedProducts = [], isLoading: topRatedLoading } = useQuery({
    queryKey: ["products", "top-rated"],
    queryFn: async () => { try { return await listProducts({ sort: "rating" }); } catch (err) { console.warn("Error fetching top-rated products:", err); return []; } },
    enabled: firebaseConfigured,
  });

  const { data: allProducts = [], isLoading: allProductsLoading } = useQuery({
    queryKey: ["products", "all"],
    queryFn: async () => { try { return await listProducts(); } catch (err) { console.warn("Error fetching all products:", err); return []; } },
    enabled: firebaseConfigured,
  });

  const isProductsLoading = featuredLoading || newestLoading || topRatedLoading || allProductsLoading;

  const justForYouPool = useMemo(() => {
    const map = new Map<string, Product>();
    const sources = [
      ...(Array.isArray(featuredProducts) ? featuredProducts : []),
      ...(Array.isArray(newestProducts) ? newestProducts : []),
      ...(Array.isArray(topRatedProducts) ? topRatedProducts : []),
      ...(Array.isArray(allProducts) ? allProducts : []),
    ];
    sources.forEach((item) => { if (item && item.id && !map.has(item.id)) { map.set(item.id, item); } });
    return Array.from(map.values());
  }, [featuredProducts, newestProducts, topRatedProducts, allProducts]);

  const flashSaleProducts = useMemo(() => {
    if (justForYouPool.length === 0) return [];
    const discounted = justForYouPool.filter((p) => p.compareAtPrice && p.compareAtPrice > p.price);
    return discounted.length >= 4 ? discounted.slice(0, 8) : justForYouPool.slice(0, 8);
  }, [justForYouPool]);

  const categoryList: CategoryItem[] = useMemo(() => {
    if (Array.isArray(rawCategories) && rawCategories.length > 0) {
      return rawCategories.map((cat, idx) => {
        const fallback = DEFAULT_CATEGORIES[idx % DEFAULT_CATEGORIES.length];
        return { id: cat.id || cat.slug || `cat-${idx}`, name: cat.name || "Category", slug: cat.slug || cat.name?.toLowerCase().replace(/\s+/g, "-") || "", icon: fallback.icon, bgColor: fallback.bgColor, textColor: fallback.textColor };
      });
    }
    return DEFAULT_CATEGORIES;
  }, [rawCategories]);

  const [visibleCount, setVisibleCount] = useState(12);
  const handleLoadMore = () => setVisibleCount((prev) => prev + 12);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
      {/* Unified header — logo, search, nav directly at top */}
      <SiteHeader />

      <main className="mx-auto max-w-7xl px-3 pb-16 sm:px-6 lg:px-8">
        {/* 1. Hero Carousel */}
        <section className="mt-3 sm:mt-4">
          <HeroCarousel />
        </section>

        {/* 2. Flash Sale Section */}
        <section className="mt-5 sm:mt-7">
          <FlashSaleSection products={flashSaleProducts} isLoading={isProductsLoading} />
        </section>

        {/* 3. Categories Grid */}
        <section className="mt-5 sm:mt-7">
          <CategoriesGrid categories={categoryList} isLoading={categoriesLoading} />
        </section>

        {/* 4. Promotional Banner */}
        <section className="mt-5 sm:mt-7">
          <PromotionalBanner />
        </section>

        {/* 5. 'Just For You' Product Grid */}
        <section className="mt-5 sm:mt-7">
          <JustForYouSection products={justForYouPool} visibleCount={visibleCount} isLoading={isProductsLoading} onLoadMore={handleLoadMore} />
        </section>

        {/* 6. Features strip */}
        <section className="mt-8 sm:mt-10">
          <FeaturesStrip />
        </section>
      </main>

      <SiteFooter />
      <WhatsAppFab />
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

  const nextSlide = useCallback(() => setCurrentIndex((prev) => (prev + 1) % HERO_SLIDES.length), []);
  const prevSlide = useCallback(() => setCurrentIndex((prev) => (prev - 1 + HERO_SLIDES.length) % HERO_SLIDES.length), []);

  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(nextSlide, 5000);
    return () => clearInterval(interval);
  }, [isPaused, nextSlide]);

  const handleTouchStart = (e: React.TouchEvent) => { setIsPaused(true); touchStartX.current = e.targetTouches[0].clientX; };
  const handleTouchMove = (e: React.TouchEvent) => { touchEndX.current = e.targetTouches[0].clientX; };
  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const distance = touchStartX.current - touchEndX.current;
    if (distance > 40) nextSlide(); else if (distance < -40) prevSlide();
    touchStartX.current = null; touchEndX.current = null; setIsPaused(false);
  };

  return (
    <div
      className="relative overflow-hidden rounded-xl sm:rounded-2xl shadow-lg sm:shadow-xl transition-all duration-300"
      onMouseEnter={() => setIsPaused(true)} onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
    >
      <div className="flex transition-transform duration-700 ease-out" style={{ transform: `translateX(-${currentIndex * 100}%)` }}>
        {HERO_SLIDES.map((slide) => (
          <div key={slide.id} className={`min-w-full relative bg-gradient-to-r ${slide.gradient} px-4 py-6 sm:px-12 sm:py-16 md:py-20 text-white flex flex-col justify-between overflow-hidden`}>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.1),transparent)] pointer-events-none" />
            <div className="absolute -right-16 -top-16 h-60 w-60 sm:h-80 sm:w-80 rounded-full bg-orange-500/20 blur-3xl pointer-events-none" />
            <div className="absolute -left-16 -bottom-16 h-60 w-60 sm:h-80 sm:w-80 rounded-full bg-blue-500/20 blur-3xl pointer-events-none" />
            <div className="relative z-10 max-w-2xl">
              <div className="flex items-center gap-2 mb-2 sm:mb-3">
                <span className={`inline-block rounded-full px-2.5 py-0.5 sm:px-3 sm:py-1 text-[10px] sm:text-xs font-extrabold uppercase tracking-wider ${slide.badgeColor}`}>{slide.badgeText}</span>
                <span className="text-[10px] sm:text-xs font-semibold tracking-wider text-orange-300 uppercase">{slide.tag}</span>
              </div>
              <h2 className="text-xl font-black tracking-tight sm:text-4xl md:text-5xl leading-tight drop-shadow-md">{slide.title}</h2>
              <p className="mt-2 sm:mt-3 text-xs sm:text-base text-slate-100 line-clamp-2 max-w-lg drop-shadow-sm">{slide.description}</p>
              <div className="mt-4 sm:mt-6 flex items-center gap-3 sm:gap-4">
                <Link to={slide.ctaLink} className="inline-flex items-center gap-1.5 sm:gap-2 rounded-lg sm:rounded-xl bg-orange-500 px-4 py-2 sm:px-6 sm:py-3 text-xs sm:text-sm font-bold text-white shadow-lg transition hover:bg-orange-600 active:scale-95">
                  {slide.ctaText} <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </Link>
                <Link to="/shop" className="hidden sm:inline-flex items-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20">Browse Catalog</Link>
              </div>
            </div>
          </div>
        ))}
      </div>
      {/* Smaller cleaner arrows */}
      <button type="button" onClick={prevSlide} aria-label="Previous Slide" className="absolute left-2 top-1/2 -translate-y-1/2 grid h-7 w-7 sm:h-10 sm:w-10 place-items-center rounded-full bg-slate-900/40 text-white backdrop-blur transition hover:bg-slate-900/70 focus:outline-none">
        <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
      </button>
      <button type="button" onClick={nextSlide} aria-label="Next Slide" className="absolute right-2 top-1/2 -translate-y-1/2 grid h-7 w-7 sm:h-10 sm:w-10 place-items-center rounded-full bg-slate-900/40 text-white backdrop-blur transition hover:bg-slate-900/70 focus:outline-none">
        <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
      </button>
      {/* Slide Indicators */}
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2 z-10">
        {HERO_SLIDES.map((_, index) => (
          <button key={index} type="button" onClick={() => setCurrentIndex(index)} aria-label={`Go to slide ${index + 1}`} className={`h-2 rounded-full transition-all duration-300 ${currentIndex === index ? "w-6 sm:w-8 bg-orange-500" : "w-2 bg-white/50 hover:bg-white/80"}`} />
        ))}
      </div>
    </div>
  );
}

/* ========================================================================== Flash Sale Section ========================================================================== */
function FlashSaleSection({ products, isLoading }: { products: Product[]; isLoading: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [timeLeft, setTimeLeft] = useState({ hours: 5, minutes: 42, seconds: 19 });

  useEffect(() => {
    if (isLoading || products.length === 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev.seconds > 0) return { ...prev, seconds: prev.seconds - 1 };
        if (prev.minutes > 0) return { ...prev, minutes: 59, seconds: 59 };
        if (prev.hours > 0) return { hours: prev.hours - 1, minutes: 59, seconds: 59 };
        return { hours: 12, minutes: 0, seconds: 0 };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isLoading, products.length]);

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) scrollRef.current.scrollBy({ left: direction === "left" ? -320 : 320, behavior: "smooth" });
  };

  // Empty state: no products and not loading
  if (!isLoading && products.length === 0) {
    return (
      <div className="rounded-xl sm:rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-orange-50 text-orange-500"><Zap className="h-5 w-5" /></div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">Flash Sale</h2>
            <p className="text-xs text-slate-500">Limited quantity deals refreshed daily</p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-10 sm:py-12 text-center">
          <div className="flex items-center justify-center h-16 w-16 rounded-full bg-orange-50 mb-3"><Flame className="h-8 w-8 text-orange-300" /></div>
          <p className="text-sm font-semibold text-slate-600">No Flash Sale Available Yet</p>
          <p className="text-xs text-slate-400 mt-1">Check back soon for exciting deals!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl sm:rounded-2xl border border-orange-500/20 bg-white p-3 sm:p-6 shadow-sm">
      {/* Flash Sale Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4 pb-3 sm:pb-4 border-b border-slate-100">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="flex items-center justify-center h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-orange-500 text-white shadow-md shadow-orange-500/30"><Zap className="h-5 w-5 sm:h-6 sm:w-6 fill-current animate-pulse" /></div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight">Flash Sale</h2>
              <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] sm:text-xs font-bold text-red-600"><Flame className="h-3 w-3 sm:h-3.5 w-3.5 fill-red-600" /> On Sale Now</span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-500">Limited quantity deals refreshed daily</p>
          </div>
        </div>
        {/* Countdown Timer — only when products exist */}
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline text-xs font-bold uppercase tracking-wider text-slate-500">Ends In:</span>
          <div className="flex items-center gap-1 sm:gap-1.5 font-mono">
            <CountdownBox value={timeLeft.hours} label="HRS" />
            <span className="font-bold text-slate-700">:</span>
            <CountdownBox value={timeLeft.minutes} label="MIN" />
            <span className="font-bold text-slate-700">:</span>
            <CountdownBox value={timeLeft.seconds} label="SEC" />
          </div>
        </div>
        {/* Shop All + scroll controls */}
        <div className="flex items-center gap-2">
          <Link to="/flash-sales" className="inline-flex items-center gap-1.5 rounded-lg border border-orange-500/40 bg-orange-50 px-3 sm:px-3.5 py-1.5 sm:py-2 text-[11px] sm:text-xs font-bold text-orange-600 transition hover:bg-orange-500 hover:text-white">Shop All <ArrowRight className="h-3 sm:h-3.5 w-3 sm:w-3.5" /></Link>
          <div className="hidden sm:flex items-center gap-1 ml-1 sm:ml-2">
            <button type="button" onClick={() => scroll("left")} aria-label="Scroll left" className="grid h-7 w-7 sm:h-8 sm:w-8 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100"><ChevronLeft className="h-3.5 sm:h-4 w-3.5 sm:w-4" /></button>
            <button type="button" onClick={() => scroll("right")} aria-label="Scroll right" className="grid h-7 w-7 sm:h-8 sm:w-8 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100"><ChevronRight className="h-3.5 sm:h-4 w-3.5 sm:w-4" /></button>
          </div>
        </div>
      </div>
      {/* Horizontal Scrollable Product List */}
      <div ref={scrollRef} className="mt-4 flex gap-3 sm:gap-4 overflow-x-auto pb-2 pt-1 scrollbar-none snap-x snap-mandatory">
        {isLoading ? Array.from({ length: 6 }).map((_, i) => (<div key={i} className="min-w-[180px] sm:min-w-[220px] max-w-[220px] shrink-0 snap-start"><ProductCardSkeleton /></div>))
        : products.map((product) => (<div key={product.id} className="min-w-[180px] sm:min-w-[220px] max-w-[220px] shrink-0 snap-start"><ProductCard product={product} /></div>))}
      </div>
    </div>
  );
}

function CountdownBox({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg bg-slate-900 px-2 py-0.5 sm:px-2.5 sm:py-1 text-white shadow-sm min-w-[32px] sm:min-w-[36px]">
      <span className="text-xs sm:text-sm font-extrabold tabular-nums">{String(value).padStart(2, "0")}</span>
      <span className="text-[8px] sm:text-[9px] font-medium text-slate-400">{label}</span>
    </div>
  );
}

/* ========================================================================== Categories Grid ========================================================================== */
function CategoriesGrid({ categories, isLoading }: { categories: CategoryItem[]; isLoading: boolean }) {
  return (
    <div className="rounded-xl sm:rounded-2xl bg-white p-3 sm:p-6 shadow-sm border border-slate-100">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2"><Tag className="h-5 w-5 text-orange-500" />Categories</h2>
          <p className="text-[11px] sm:text-xs text-slate-500">Explore items by popular categories</p>
        </div>
        <Link to="/shop" className="text-[11px] sm:text-xs font-bold text-orange-600 hover:underline flex items-center gap-1">All Categories <ChevronRight className="h-3.5 w-3.5" /></Link>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 sm:gap-4">
        {isLoading ? Array.from({ length: 8 }).map((_, i) => (<div key={i} className="flex flex-col items-center justify-center rounded-xl p-3 bg-slate-100 animate-pulse h-24 sm:h-28" />))
        : categories.map((cat) => {
          const IconComp = cat.icon || Smartphone;
          return (
            <Link key={cat.id} to="/shop" search={{ category: cat.slug }} className="group flex flex-col items-center justify-center rounded-xl border border-slate-100 p-2.5 sm:p-3.5 text-center transition-all duration-200 hover:-translate-y-1 hover:border-orange-200 hover:shadow-md bg-white h-24 sm:h-28">
              <div className={`grid h-11 w-11 sm:h-14 sm:w-14 place-items-center rounded-full ${cat.bgColor} ${cat.textColor} transition-transform duration-200 group-hover:scale-110`}><IconComp className="h-5 w-5 sm:h-7 sm:w-7" /></div>
              <span className="mt-2 text-[10px] sm:text-xs font-bold text-slate-800 line-clamp-1 group-hover:text-orange-600">{cat.name}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* ========================================================================== Promotional Banner ========================================================================== */
function PromotionalBanner() {
  return (
    <div className="relative overflow-hidden rounded-xl sm:rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-orange-600 p-5 sm:p-8 text-white shadow-lg sm:shadow-xl">
      <div className="absolute -right-10 -bottom-10 h-48 w-48 sm:h-64 sm:w-64 rounded-full bg-orange-500/30 blur-3xl pointer-events-none" />
      <div className="absolute right-1/3 -top-10 h-32 w-32 sm:h-40 sm:w-40 rounded-full bg-blue-500/20 blur-2xl pointer-events-none" />
      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
        <div className="max-w-xl">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/20 border border-orange-400/30 px-2.5 py-0.5 sm:px-3 sm:py-1 text-[10px] sm:text-xs font-bold text-orange-300"><Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-orange-400" />Shop Nexa App Exclusive</div>
          <h2 className="mt-2 sm:mt-3 text-xl sm:text-3xl font-black tracking-tight leading-snug">Get Extra 15% OFF + Free Shipping</h2>
          <p className="mt-1.5 sm:mt-2 text-[11px] sm:text-sm text-slate-300">Use promo code <span className="font-mono font-bold text-orange-400">NEXA15</span> at checkout on your first order.</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Link to="/shop" className="inline-flex items-center justify-center rounded-lg sm:rounded-xl bg-orange-500 px-5 py-2.5 sm:px-6 sm:py-3.5 text-xs sm:text-sm font-bold text-white shadow-lg transition hover:bg-orange-600 active:scale-95">Claim Discount Now</Link>
        </div>
      </div>
    </div>
  );
}

/* ========================================================================== Just For You Product Grid ========================================================================== */
function JustForYouSection({ products, visibleCount, isLoading, onLoadMore }: { products: Product[]; visibleCount: number; isLoading: boolean; onLoadMore: () => void }) {
  const displayedProducts = products.slice(0, visibleCount);
  const hasMore = visibleCount < products.length;
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2"><Sparkles className="h-5 w-5 sm:h-6 text-orange-500 fill-orange-500/20" />Just For You</h2>
          <p className="text-[11px] sm:text-xs text-slate-500">Personalized recommendations based on trending items</p>
        </div>
        <span className="text-[11px] sm:text-xs text-slate-400 font-medium">Showing {displayedProducts.length} of {products.length}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 sm:gap-4">
        {isLoading ? Array.from({ length: 12 }).map((_, i) => (<ProductCardSkeleton key={i} />)) : displayedProducts.map((product) => (<ProductCard key={product.id} product={product} />))}
      </div>
      {!isLoading && hasMore && (
        <div className="mt-6 sm:mt-8 text-center">
          <button type="button" onClick={onLoadMore} className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-orange-500 bg-white px-6 py-2.5 sm:px-8 sm:py-3 text-xs sm:text-sm font-bold text-orange-600 shadow-sm transition hover:bg-orange-500 hover:text-white active:scale-95">Load More Products</button>
        </div>
      )}
      {!isLoading && !hasMore && products.length > 0 && (<p className="mt-6 sm:mt-8 text-center text-xs font-semibold text-slate-400">You've explored all current recommendations!</p>)}
    </div>
  );
}

function ProductCardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm animate-pulse flex flex-col justify-between h-64 sm:h-72">
      <div className="h-32 sm:h-36 w-full rounded-lg bg-slate-200" />
      <div className="mt-3 space-y-2"><div className="h-3 w-3/4 rounded bg-slate-200" /><div className="h-3 w-1/2 rounded bg-slate-200" /></div>
      <div className="mt-4 flex items-center justify-between"><div className="h-4 w-1/3 rounded bg-slate-200" /><div className="h-7 w-14 sm:w-16 rounded-lg bg-slate-200" /></div>
    </div>
  );
}

/* ========================================================================== Features Strip ========================================================================== */
function FeaturesStrip() {
  const features = [
    { icon: Truck, title: "Free Delivery", description: "On orders over $50 across nationwide delivery routes", bgColor: "bg-blue-50 text-blue-600" },
    { icon: ShieldCheck, title: "100% Secure Payment", description: "Encrypted checkout & protected payment options", bgColor: "bg-emerald-50 text-emerald-600" },
    { icon: Package, title: "Easy 7-Day Returns", description: "Hassle-free return policy & quick refunds", bgColor: "bg-orange-50 text-orange-600" },
    { icon: Headset, title: "24/7 Customer Support", description: "Dedicated live assistance whenever you need help", bgColor: "bg-purple-50 text-purple-600" },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {features.map((item, idx) => {
        const Icon = item.icon;
        return (
          <div key={idx} className="flex items-center gap-3 sm:gap-4 rounded-xl sm:rounded-2xl border border-slate-100 bg-white p-3 sm:p-4 shadow-sm transition hover:shadow-md">
            <div className={`grid h-10 w-10 sm:h-12 sm:w-12 shrink-0 place-items-center rounded-xl ${item.bgColor}`}><Icon className="h-5 w-5 sm:h-6 sm:w-6" /></div>
            <div><h3 className="text-xs sm:text-sm font-bold text-slate-900">{item.title}</h3><p className="mt-0.5 text-[11px] sm:text-xs text-slate-500">{item.description}</p></div>
          </div>
        );
      })}
    </div>
  );
}
