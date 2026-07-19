import { Link } from "@tanstack/react-router";
import { ShoppingCart, Heart } from "lucide-react";
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

  return (
    <div className="group relative overflow-hidden rounded-lg border bg-card transition hover:shadow-md">
      <button
        onClick={() => void toggle(product)}
        aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
        className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-background/90 shadow hover:bg-background"
      >
        <Heart className={`h-4 w-4 ${wished ? "fill-destructive text-destructive" : ""}`} />
      </button>
      <Link
        to="/product/$slug"
        params={{ slug: product.slug }}
        className="block"
      >
        <div className="aspect-square overflow-hidden bg-muted">
          {product.images[0] ? (
            <img
              src={product.images[0]}
              alt={product.title}
              loading="lazy"
              className="h-full w-full object-cover transition group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
              No image
            </div>
          )}
        </div>
        <div className="p-3">
          <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-medium">{product.title}</h3>
          <div className="mt-1 flex items-baseline gap-2">
            <div className="text-lg font-bold text-primary">{formatPrice(product.price)}</div>
            {product.compareAtPrice && product.compareAtPrice > product.price && (
              <div className="text-xs text-muted-foreground line-through">
                {formatPrice(product.compareAtPrice)}
              </div>
            )}
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <Stars rating={product.rating} />
            <span className="text-xs text-muted-foreground">({product.reviewCount})</span>
          </div>
        </div>
      </Link>
      <div className="px-3 pb-3">
        <button
          onClick={() => !outOfStock && void add(product)}
          disabled={outOfStock}
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-primary py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
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
