import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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

  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % total), 5000);
    return () => clearInterval(t);
  }, [total]);

  const s = slides[i];
  const Icon = s.icon;

  return (
    <section className="mx-auto max-w-7xl px-4 py-4 md:py-6">
      <div className={`relative overflow-hidden rounded-xl ${s.bg} transition-colors duration-500`}>
        <div key={i} className="grid animate-fade-in items-center gap-6 md:grid-cols-2">
          <div className="p-6 md:p-12">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-accent">
              <Icon className="h-4 w-4" /> {s.eyebrow}
            </div>
            <h1 className="text-3xl font-bold leading-tight md:text-5xl">
              {s.title}
              <br />
              <span className="text-primary">{s.highlight}</span>
            </h1>
            <p className="mt-3 text-sm text-muted-foreground md:text-base">{s.desc}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                to={s.cta.to}
                search={s.cta.search as never}
                className="rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow transition hover:opacity-90 active:scale-95"
              >
                {s.cta.label}
              </Link>
              <Link
                to="/shop"
                className="rounded-md border border-primary bg-background px-6 py-3 text-sm font-medium text-primary transition hover:bg-primary/5 active:scale-95"
              >
                Browse Categories
              </Link>
            </div>
          </div>
          <div className="relative hidden md:block">
            <img src={s.image} alt="" className="h-full max-h-[380px] w-full object-cover" />
            <div className="absolute right-6 top-6 flex h-24 w-24 flex-col items-center justify-center rounded-full bg-primary text-center text-primary-foreground shadow-lg md:h-28 md:w-28">
              <Tag className="h-4 w-4" />
              <span className="mt-1 text-[10px] font-semibold leading-tight">{s.badge}</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => setI((v) => (v - 1 + total) % total)}
          aria-label="Previous slide"
          className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 shadow transition hover:bg-background"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          onClick={() => setI((v) => (v + 1) % total)}
          aria-label="Next slide"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 shadow transition hover:bg-background"
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
          { icon: Zap, label: "Flash Sale", sub: "Ends soon", color: "text-destructive", to: "/shop" as const, search: { sort: "price-desc" as const } },
          { icon: Flame, label: "Today's Deals", sub: "Up to 70% off", color: "text-accent", to: "/shop" as const, search: {} },
          { icon: Tag, label: "Campaign", sub: "Weekly picks", color: "text-primary", to: "/shop" as const, search: {} },
          { icon: Sparkles, label: "Limited Time", sub: "Hurry up!", color: "text-green-600", to: "/shop" as const, search: {} },
        ].map((c) => (
          <Link
            key={c.label}
            to={c.to}
            search={c.search as never}
            className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-left transition hover:border-primary hover:shadow-md active:scale-[0.98]"
          >
            <c.icon className={`h-5 w-5 shrink-0 ${c.color}`} />
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
