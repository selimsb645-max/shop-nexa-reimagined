import { Link } from "@tanstack/react-router";
import { ShoppingCart, Heart, Store } from "lucide-react";
import { Stars } from "./Stars";
import { useCart } from "@/context/CartContext";
import { useWishlist } from "@/context/WishlistContext";
import { formatPrice } from "@/utils/format";
import type { Product } from "@/types/commerce";

export function ProductCard({ product }: { product: Product }) {
  const { add } = useCart();
  const { has, toggle } = useWishlist();
  const wished = has(product.id);
  const outOfStock = product.stock <= 0;
  const lowStock = !outOfStock && product.stock <= 5;

  const discount =
    product.compareAtPrice && product.compareAtPrice > product.price
      ? Math.round((1 - product.price / product.compareAtPrice) * 100)
      : 0;

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-lg border bg-card transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg">
      {/* Badges */}
      <div className="pointer-events-none absolute left-2 top-2 z-10 flex flex-col gap-1">
        {discount > 0 && (
          <span className="rounded bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground shadow">
            -{discount}%
          </span>
        )}
        {outOfStock ? (
          <span className="rounded bg-foreground/80 px-1.5 py-0.5 text-[10px] font-semibold text-background">
            Out of stock
          </span>
        ) : lowStock ? (
          <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">
            Only {product.stock} left
          </span>
        ) : null}
      </div>

      <button
        onClick={() => void toggle(product)}
        aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
        className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-background/95 shadow transition hover:scale-110 hover:bg-background active:scale-95"
      >
        <Heart className={`h-4 w-4 transition ${wished ? "fill-destructive text-destructive" : ""}`} />
      </button>

      <Link to="/product/$slug" params={{ slug: product.slug }} className="block">
        <div className="aspect-square overflow-hidden bg-muted">
          {product.images[0] ? (
            <img
              src={product.images[0]}
              alt={product.title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
              No image
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 p-3">
          <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-medium group-hover:text-primary">
            {product.title}
          </h3>
          <div className="flex items-baseline gap-2">
            <div className="text-base font-bold text-primary md:text-lg">{formatPrice(product.price)}</div>
            {product.compareAtPrice && product.compareAtPrice > product.price && (
              <div className="text-xs text-muted-foreground line-through">
                {formatPrice(product.compareAtPrice)}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Stars rating={product.rating} />
            <span className="text-[11px] text-muted-foreground">
              ({product.reviewCount}{product.reviewCount > 0 ? " sold" : ""})
            </span>
          </div>
          {product.sellerId && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Store className="h-3 w-3" />
              <span className="truncate">Marketplace seller</span>
            </div>
          )}
        </div>
      </Link>

      <div className="mt-auto px-3 pb-3">
        <button
          onClick={() => !outOfStock && void add(product)}
          disabled={outOfStock}
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-primary py-2 text-xs font-medium text-primary-foreground shadow-sm transition hover:opacity-90 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          {outOfStock ? "Out of stock" : "Add to Cart"}
        </button>
      </div>
    </div>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="aspect-square animate-pulse bg-muted" />
      <div className="space-y-2 p-3">
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
        <div className="h-8 w-full animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}
