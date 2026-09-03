/**
 * Pocket Storefront design: AVENTA SHOP's blue-and-orange desktop merchandising is
 * reflowed for thumb-friendly discovery, readable mobile cards, and swipeable rails.
 */
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
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { buildMetaTags, getSiteUrl } from "@/lib/seo";
import { ProductCard } from "@/components/product/ProductCard";
import { listCategories } from "@/services/firebase/categories";
import { listProducts } from "@/services/firebase/products";
import { firebaseConfigured } from "@/services/firebase/config";
import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import type { Product } from "@/types/commerce";

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({
    meta: buildMetaTags({
      title: "AVENTA SHOP — Online Shopping Marketplace in Bangladesh",
      description: "Discover amazing deals on electronics, fashion, grocery, beauty and home essentials on AVENTA SHOP. Fast delivery, secure payments, and free shipping over $50. Shop from verified sellers.",
      path: "/",
      type: "website",
      image: "/brand/aventa-shop-logo.png",
    }),
  }),
});

// Category definition interface for display
interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  icon: LucideIcon;
  gradient: string;
  color: string;
  iconBg: string;
  image?: string;
}

// Default static categories for fallback/enrichment
const DEFAULT_CATEGORIES: CategoryItem[] = [
  { id: "fashion", name: "Fashion", slug: "fashion", icon: Shirt, gradient: "from-orange-400 to-orange-500", color: "text-blue-600", iconBg: "bg-blue-50", image: "/categories/fashion.jpg" },
  { id: "electronics", name: "Electronics", slug: "electronics", icon: Smartphone, gradient: "from-blue-500 to-blue-600", color: "text-violet-600", iconBg: "bg-violet-50", image: "/categories/electronics.jpg" },
  { id: "groceries", name: "Fresh & Grocery", slug: "groceries", icon: Apple, gradient: "from-green-400 to-green-600", color: "text-green-600", iconBg: "bg-green-50", image: "/categories/grocery.jpg" },
  { id: "beauty", name: "Beauty", slug: "beauty", icon: Sparkles, gradient: "from-pink-400 to-pink-600", color: "text-pink-500", iconBg: "bg-pink-50", image: "/categories/beauty.jpg" },
  { id: "home-living", name: "Home & Kitchen", slug: "home-living", icon: Sofa, gradient: "from-emerald-400 to-emerald-600", color: "text-sky-600", iconBg: "bg-sky-50", image: "/categories/home-kitchen.jpg" },
  { id: "audio-acc", name: "Accessories", slug: "audio-accessories", icon: Headphones, gradient: "from-purple-500 to-purple-700", color: "text-slate-700", iconBg: "bg-slate-100", image: "/categories/accessories.jpg" },
  { id: "gaming", name: "Gaming", slug: "gaming", icon: Gamepad2, gradient: "from-indigo-500 to-indigo-700", color: "text-slate-900", iconBg: "bg-slate-100", image: "/categories/gaming.jpg" },
  { id: "mother-baby", name: "Baby & Kids", slug: "mother-baby", icon: Baby, gradient: "from-pink-400 to-pink-600", color: "text-rose-500", iconBg: "bg-rose-50", image: "/categories/baby-kids.jpg" },
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
    tag: "ELECTRONICS SALE",
    title: "Better sound. Better everyday tech.",
    description: "Discover capable audio and mobile essentials selected for your next upgrade.",
    ctaText: "Explore Electronics",
    ctaLink: "/shop",
    badgeText: "UP TO 60% OFF",
    badgeColor: "bg-[#1455c6] text-white",
    image: "/manus-storage/shopnexa-tech-sale_10bd6408.jpg",
  },
  {
    id: "fashion",
    tag: "FASHION SALE",
    title: "Find your next favourite look.",
    description: "Fresh styles, easy confidence, and wardrobe essentials for every day.",
    ctaText: "Shop Fashion",
    ctaLink: "/shop",
    badgeText: "UP TO 70% OFF",
    badgeColor: "bg-[#ff7a00] text-white",
    image: "/manus-storage/shopnexa-fashion-sale_12251764.jpg",
  },
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
          AVENTA SHOP — online shopping marketplace for electronics, fashion, grocery, beauty and home essentials in Bangladesh
        </h1>
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
          <CategoryShowcase categories={categoryList} isLoading={categoriesLoading} />
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
          <div key={slide.id} className="min-w-full relative min-h-[330px] overflow-hidden bg-[#eaf1ff] px-5 py-7 sm:min-h-[400px] sm:px-12 sm:py-16 md:py-20">
            <img src={slide.image} alt="" className="absolute inset-0 h-full w-full object-cover object-[64%_center]" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#eaf1ff] via-[#eaf1ff]/95 via-40% to-[#eaf1ff]/10" />
            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#eaf1ff]/40 to-transparent" />
            <div className="relative z-10 flex h-full max-w-[58%] min-h-[276px] flex-col justify-center sm:max-w-md">
              <div className="mb-3 flex flex-col items-start gap-2 sm:mb-4 sm:flex-row sm:items-center">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#ff7a00] sm:text-xs">{slide.tag}</span>
                <span className={`inline-block rounded-full px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wider shadow-sm sm:text-[10px] ${slide.badgeColor}`}>{slide.badgeText}</span>
              </div>
              <h2 className="text-[28px] font-black leading-[0.98] tracking-[-0.05em] text-slate-950 sm:text-4xl md:text-5xl">{slide.title}</h2>
              <p className="mt-3 max-w-xs text-[11px] font-medium leading-relaxed text-slate-700 sm:mt-4 sm:text-base">{slide.description}</p>
              <div className="mt-5 flex items-center gap-3 sm:mt-6 sm:gap-4">
                <Link to={slide.ctaLink} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-[#1455c6] px-4 py-2.5 text-xs font-bold text-white shadow-[0_8px_18px_rgba(20,85,198,0.22)] transition hover:bg-[#0f459f] active:scale-[0.97] sm:px-6 sm:text-sm">
                  {slide.ctaText} <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </Link>
                <Link to="/shop" className="hidden min-h-11 items-center gap-2 rounded-lg border border-[#1455c6] bg-white/65 px-5 py-3 text-sm font-bold text-[#1455c6] backdrop-blur transition hover:bg-white sm:inline-flex">Browse Catalog</Link>
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

/* Shop by Category now lives in @/components/home/CategoryShowcase */


/* ========================================================================== Promotional Banner ========================================================================== */
function PromotionalBanner() {
  return (
    <div className="relative overflow-hidden rounded-xl bg-[#eaf1ff] p-5 shadow-lg sm:rounded-2xl sm:p-8 sm:shadow-xl">
      <img src="/manus-storage/shopnexa-tech-sale_10bd6408.jpg" alt="" className="absolute inset-0 h-full w-full object-cover object-right" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#eaf1ff] via-[#eaf1ff]/95 to-[#eaf1ff]/20" />
      <div className="absolute -right-10 -bottom-10 h-48 w-48 sm:h-64 sm:w-64 rounded-full bg-orange-500/30 blur-3xl pointer-events-none" />
      <div className="absolute right-1/3 -top-10 h-32 w-32 sm:h-40 sm:w-40 rounded-full bg-blue-500/20 blur-2xl pointer-events-none" />
      <div className="relative z-10 flex flex-col justify-between gap-4 sm:gap-6 md:flex-row md:items-center">
        <div className="max-w-[62%] sm:max-w-xl">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#1455c6]/15 bg-white/80 px-2.5 py-0.5 text-[10px] font-bold text-[#1455c6] sm:px-3 sm:py-1 sm:text-xs"><Sparkles className="h-3 w-3 text-[#ff7a00] sm:h-3.5 sm:w-3.5" />AVENTA SHOP App Exclusive</div>
          <h2 className="mt-2 text-xl font-black leading-snug tracking-tight text-slate-950 sm:mt-3 sm:text-3xl">Get Extra 15% OFF + Free Shipping</h2>
          <p className="mt-1.5 text-[11px] text-slate-700 sm:mt-2 sm:text-sm">Use promo code <span className="font-mono font-bold text-[#ff7a00]">AVEN10</span> at checkout on your first order.</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Link to="/shop" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#ff7a00] px-5 py-2.5 text-xs font-bold text-white shadow-lg transition hover:bg-[#e56500] active:scale-[0.97] sm:rounded-xl sm:px-6 sm:py-3.5 sm:text-sm">Claim Discount Now</Link>
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
      <div className="-mr-3 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 pr-3 scrollbar-none sm:mr-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:pr-0 lg:grid-cols-4">
      {features.map((item, idx) => {
        const Icon = item.icon;
        return (
          <div key={idx} className="flex min-w-[256px] snap-start items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 shadow-sm transition hover:shadow-md sm:min-w-0 sm:gap-4 sm:rounded-2xl sm:p-4">
            <div className={`grid h-10 w-10 sm:h-12 sm:w-12 shrink-0 place-items-center rounded-xl ${item.bgColor}`}><Icon className="h-5 w-5 sm:h-6 sm:w-6" /></div>
            <div><h3 className="text-xs sm:text-sm font-bold text-slate-900">{item.title}</h3><p className="mt-0.5 text-[11px] sm:text-xs text-slate-500">{item.description}</p></div>
          </div>
        );
      })}
    </div>
  );
}
