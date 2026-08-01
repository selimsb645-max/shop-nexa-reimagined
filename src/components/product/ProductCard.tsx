import { Link } from "@tanstack/react-router";
import { ShoppingCart, Heart, Store } from "lucide-react";
import { Stars } from "./Stars";
import { useCart } from "@/context/CartContext";
import { useWishlist } from "@/context/WishlistContext";
import { formatPrice } from "@/utils/format";
import type { Product } from "@/types/commerce";

/** Cloudinary-hosted images get width/quality/format transforms; others pass through. */
function optimizedSrc(url: string, width = 400) {
  if (!url.includes("res.cloudinary.com") || url.includes("/upload/f_")) return url;
  return url.replace("/upload/", `/upload/f_auto,q_auto,w_${width},c_limit/`);
}

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

  const img = product.images[0];

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg active:scale-[0.99]">
      {/* Badges */}
      <div className="pointer-events-none absolute left-2 top-2 z-10 flex flex-col gap-1">
        {discount > 0 && (
          <span className="rounded-md bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground shadow">
            -{discount}%
          </span>
        )}
        {outOfStock ? (
          <span className="rounded-md bg-foreground/80 px-1.5 py-0.5 text-[10px] font-semibold text-background">
            Out of stock
          </span>
        ) : lowStock ? (
          <span className="rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">
            Only {product.stock} left
          </span>
        ) : null}
      </div>

      <button
        onClick={() => void toggle(product)}
        aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
        className="absolute right-1.5 top-1.5 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-background/95 shadow transition hover:scale-110 hover:bg-background active:scale-90"
      >
        <Heart className={`h-[18px] w-[18px] transition ${wished ? "fill-destructive text-destructive" : ""}`} />
      </button>

      <Link to="/product/$slug" params={{ slug: product.slug }} className="block">
        <div className="aspect-square overflow-hidden bg-muted">
          {img ? (
            <img
              src={optimizedSrc(img)}
              srcSet={`${optimizedSrc(img, 300)} 300w, ${optimizedSrc(img, 600)} 600w`}
              sizes="(min-width: 1024px) 200px, 45vw"
              alt={product.title}
              width={400}
              height={400}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
              No image
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 p-2.5 md:p-3">
          <h3 className="line-clamp-2 min-h-[2.5rem] text-[13px] font-medium leading-tight group-hover:text-primary md:text-sm">
            {product.title}
          </h3>
          <div className="flex flex-wrap items-baseline gap-x-2">
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
              <Store className="h-3 w-3 shrink-0" />
              <span className="truncate">Marketplace seller</span>
            </div>
          )}
        </div>
      </Link>

      <div className="mt-auto px-2.5 pb-2.5 md:px-3 md:pb-3">
        <button
          onClick={() => !outOfStock && void add(product)}
          disabled={outOfStock}
          className="ripple flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-primary py-2 text-xs font-medium text-primary-foreground shadow-sm transition hover:opacity-90 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
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
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="skeleton aspect-square" />
      <div className="space-y-2 p-3">
        <div className="skeleton h-4 w-3/4 rounded" />
        <div className="skeleton h-4 w-1/2 rounded" />
        <div className="skeleton h-10 w-full rounded-xl" />
      </div>
    </div>
  );
}
