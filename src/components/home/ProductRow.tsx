import { Link } from "@tanstack/react-router";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { ProductCard, ProductCardSkeleton } from "@/components/product/ProductCard";
import type { Product } from "@/types/commerce";

export function ProductRow({
  title,
  icon: Icon,
  accent,
  products,
  loading,
  emptyHint,
  linkTo = "/shop",
}: {
  title: string;
  icon?: LucideIcon;
  accent?: string;
  products: Product[] | undefined;
  loading: boolean;
  emptyHint?: string;
  linkTo?: "/shop";
}) {
  const items = products ?? [];
  if (!loading && items.length === 0 && !emptyHint) return null;

  return (
    <section className="mx-auto max-w-7xl px-3 py-5 animate-fade-up md:px-4 md:py-6">
      <div className="mb-3 flex items-center justify-between gap-3 md:mb-4">
        <div className="flex min-w-0 items-center gap-2">
          {Icon && (
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${accent ?? "bg-primary/10 text-primary"}`}
            >
              <Icon className="h-4 w-4" />
            </span>
          )}
          <h2 className="truncate text-lg font-bold md:text-2xl">{title}</h2>
        </div>
        <Link
          to={linkTo}
          className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          View All <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      {loading ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 md:gap-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      ) : items.length > 0 ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 md:gap-3 lg:grid-cols-6">
          {items.slice(0, 12).map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">
          {emptyHint}
        </div>
      )}
    </section>
  );
}
