import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Sparkles, Flame, Tag, Zap } from "lucide-react";
import heroImg from "@/assets/hero.jpg";
import dealElectronics from "@/assets/deal-electronics.jpg";
import dealFashion from "@/assets/deal-fashion.jpg";

interface Slide {
  eyebrow: string;
  icon: typeof Sparkles;
  title: string;
  highlight: string;
  desc: string;
  cta: { label: string; to: string; search?: Record<string, string> };
  image: string;
  bg: string;
  badge: string;
}

const slides: Slide[] = [
  {
    eyebrow: "Best Quality, Best Price",
    icon: Sparkles,
    title: "Shop Smarter.",
    highlight: "Live Better.",
    desc: "Everything you need in one place. Top quality at unbeatable prices.",
    cta: { label: "Shop Now", to: "/shop" },
    image: heroImg,
    bg: "bg-blue-50",
    badge: "UP TO 70% OFF",
  },
  {
    eyebrow: "Flash Sale — Today Only",
    icon: Zap,
    title: "Electronics",
    highlight: "Mega Deals",
    desc: "Limited time offers on phones, laptops, audio and more.",
    cta: { label: "Grab Deals", to: "/shop", search: { category: "electronics" } },
    image: dealElectronics,
    bg: "bg-indigo-50",
    badge: "60% OFF",
  },
  {
    eyebrow: "Trending Now",
    icon: Flame,
    title: "Fashion Week",
    highlight: "New Season",
    desc: "Fresh drops from your favorite brands. Free delivery over $50.",
    cta: { label: "Explore Fashion", to: "/shop", search: { category: "fashion" } },
    image: dealFashion,
    bg: "bg-orange-50",
    badge: "NEW IN",
  },
];

export function PromoCarousel() {
  const [i, setI] = useState(0);
  const total = slides.length;
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % total), 5000);
    return () => clearInterval(t);
  }, [total]);

  const s = slides[i];
  const Icon = s.icon;

  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) < 40) return;
    setI((v) => (dx < 0 ? (v + 1) % total : (v - 1 + total) % total));
  };

  return (
    <section className="mx-auto max-w-7xl px-3 py-3 md:px-4 md:py-6">
      <div
        className={`relative overflow-hidden rounded-2xl ${s.bg} transition-colors duration-500`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        role="region"
        aria-label="Promotions"
      >
        <div key={i} className="grid animate-fade-in items-center gap-4 md:grid-cols-2 md:gap-6">
          <div className="px-5 py-6 md:p-10">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent md:text-sm">
              <Icon className="h-4 w-4 shrink-0" /> {s.eyebrow}
            </div>
            <h1 className="text-[26px] font-bold leading-[1.15] tracking-tight md:text-[42px]">
              {s.title}
              <br />
              <span className="text-primary">{s.highlight}</span>
            </h1>
            <p className="mt-2.5 max-w-md text-[13px] leading-relaxed text-muted-foreground md:text-base">
              {s.desc}
            </p>
            <div className="mt-4 flex flex-wrap gap-2.5 md:mt-5 md:gap-3">
              <Link
                to={s.cta.to}
                search={s.cta.search as never}
                className="ripple inline-flex min-h-12 items-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow transition hover:opacity-90 active:scale-95"
              >
                {s.cta.label}
              </Link>
              <Link
                to="/shop"
                className="ripple inline-flex min-h-12 items-center rounded-xl border border-primary bg-background px-6 text-sm font-semibold text-primary transition hover:bg-primary/5 active:scale-95"
              >
                Browse Categories
              </Link>
            </div>
          </div>
          <div className="relative hidden md:block">
            <img
              src={s.image}
              alt=""
              loading="eager"
              className="h-full max-h-[304px] w-full object-cover"
            />
            <div className="absolute right-6 top-6 flex h-24 w-24 flex-col items-center justify-center rounded-full bg-primary text-center text-primary-foreground shadow-lg">
              <Tag className="h-4 w-4" />
              <span className="mt-1 text-[10px] font-semibold leading-tight">{s.badge}</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => setI((v) => (v - 1 + total) % total)}
          aria-label="Previous slide"
          className="absolute left-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-background/80 p-2 shadow transition hover:bg-background md:block"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          onClick={() => setI((v) => (v + 1) % total)}
          aria-label="Next slide"
          className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-background/80 p-2 shadow transition hover:bg-background md:block"
        >
          <ChevronRight className="h-5 w-5" />
        </button>

        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
          {slides.map((_, idx) => (
            <button
              key={idx}
              aria-label={`Go to slide ${idx + 1}`}
              onClick={() => setI(idx)}
              className={`h-1.5 rounded-full transition-all ${
                idx === i ? "w-6 bg-primary" : "w-1.5 bg-primary/30"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Promo strip */}
      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          {
            icon: Zap,
            label: "Flash Sale",
            sub: "Ends soon",
            color: "text-destructive",
            to: "/shop" as const,
            search: { sort: "price-desc" as const },
          },
          {
            icon: Flame,
            label: "Today's Deals",
            sub: "Up to 70% off",
            color: "text-accent",
            to: "/shop" as const,
            search: {},
          },
          {
            icon: Tag,
            label: "Campaign",
            sub: "Weekly picks",
            color: "text-primary",
            to: "/shop" as const,
            search: {},
          },
          {
            icon: Sparkles,
            label: "Limited Time",
            sub: "Hurry up!",
            color: "text-green-600",
            to: "/shop" as const,
            search: {},
          },
        ].map((c) => (
          <Link
            key={c.label}
            to={c.to}
            search={c.search as never}
            className="ripple flex h-14 items-center gap-2.5 rounded-2xl border bg-card px-3 text-left transition hover:border-primary hover:shadow-md active:scale-[0.98]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
              <c.icon className={`h-[18px] w-[18px] ${c.color}`} />
            </span>
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold">{c.label}</div>
              <div className="truncate text-[10px] text-muted-foreground">{c.sub}</div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
