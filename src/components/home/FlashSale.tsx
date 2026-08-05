import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Zap, ArrowRight } from "lucide-react";
import { ProductCard, ProductCardSkeleton } from "@/components/product/ProductCard";
import type { Product } from "@/types/commerce";

function useCountdown(hours = 8) {
  const [mounted, setMounted] = useState(false);
  const [end] = useState(() => {
    // Deterministic per-day countdown so it doesn't reset on remount within the window.
    const now = new Date();
    const target = new Date(now);
    target.setHours(now.getHours() + hours, 0, 0, 0);
    return target.getTime();
  });
  const [remaining, setRemaining] = useState(() => Math.max(0, end - Date.now()));
  useEffect(() => {
    setMounted(true);
    setRemaining(Math.max(0, end - Date.now()));
    const t = setInterval(() => setRemaining(Math.max(0, end - Date.now())), 1000);
    return () => clearInterval(t);
  }, [end]);
  const h = Math.floor(remaining / 3_600_000);
  const m = Math.floor((remaining % 3_600_000) / 60_000);
  const s = Math.floor((remaining % 60_000) / 1000);
  const pad = (n: number) => n.toString().padStart(2, "0");
  // Render static zeros during SSR to avoid hydration mismatch; real values
  // appear after mount.
  if (!mounted) return { h: "00", m: "00", s: "00" };
  return { h: pad(h), m: pad(m), s: pad(s) };
}

export function FlashSale({
  products,
  loading,
}: {
  products: Product[] | undefined;
  loading: boolean;
}) {
  const { h, m, s } = useCountdown(8);
  const items = (products ?? [])
    .filter((p) => p.compareAtPrice && p.compareAtPrice > p.price)
    .slice(0, 6);

  if (!loading && items.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-3 py-5 md:px-4 md:py-6">
      <div className="overflow-hidden rounded-2xl border bg-gradient-to-r from-destructive/5 via-accent/5 to-transparent">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background/60 px-3 py-2.5 md:px-4 md:py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
              <Zap className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold leading-tight md:text-lg">Flash Sale</h2>
              <p className="text-[11px] text-muted-foreground">Limited time offers</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="hidden text-muted-foreground sm:inline">Ends in</span>
            {[h, m, s].map((v, i) => (
              <span
                key={i}
                className="rounded-md bg-foreground px-2 py-1 font-mono text-sm font-bold tabular-nums text-background"
              >
                {v}
              </span>
            ))}
          </div>
          <Link
            to="/shop"
            search={{ sort: "price-desc" as const }}
            className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            View All <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="p-3 md:p-4">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 md:gap-3 lg:grid-cols-6">
            {loading
              ? Array.from({ length: 6 }).map((_, i) => <ProductCardSkeleton key={i} />)
              : items.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </div>
      </div>
    </section>

  );
}
