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
    <section className="mx-auto max-w-7xl px-4 py-6 animate-fade-in">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {Icon && (
            <span className={`flex h-8 w-8 items-center justify-center rounded-full ${accent ?? "bg-primary/10 text-primary"}`}>
              <Icon className="h-4 w-4" />
            </span>
          )}
          <h2 className="text-xl font-bold md:text-2xl">{title}</h2>
        </div>
        <Link to={linkTo} className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          View All <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <ProductCardSkeleton key={i} />)}
        </div>
      ) : items.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {items.slice(0, 12).map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      ) : (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          {emptyHint}
        </div>
      )}
    </section>
  );
}
