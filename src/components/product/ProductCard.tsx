import React, { useState, useCallback } from 'react';
import { Link } from '@tanstack/react-router';
import { Heart, Star, ShoppingCart } from 'lucide-react';
import type { Product } from '@/types/commerce';
import { Truck } from 'lucide-react';
import { getOptimizedImageUrl, getResponsiveSrcSet } from "@/services/cloudinary";
import { formatPrice } from '@/utils/format';
import { useWishlist } from '@/context/WishlistContext';

type ProductCardProduct = Partial<Product> & {
  images?: Array<string | { url?: string; src?: string }>;
  imageUrl?: string;
  thumbnail?: string;
  oldPrice?: number;
  discount?: number;
  ratings?: number;
  reviewCount?: number;
  reviewsCount?: number;
  ratingsCount?: number;
  location?: string;
  sellerLocation?: string;
  seller?: { location?: string };
  name?: string;
};


export interface ProductCardProps {
  product: Product;
  onAddToCart?: (product: Product, e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  showLocation?: boolean;
}

export interface ProductCardCompactProps {
  product: Product;
  onAddToCart?: (product: Product, e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  soldCount?: number;
  totalStock?: number;
}

export interface ProductCardSkeletonProps {
  className?: string;
}

/**
 * Helper to safely extract main image URL from product object
 */
function getProductImage(product: Partial<Product>): string {
  const p = product as ProductCardProduct;
  if (typeof product.images?.[0] === 'string' && product.images?.[0]) return product.images?.[0];
  if (Array.isArray(p.images) && p.images.length > 0) {
    const firstImg = p.images[0];
    if (typeof firstImg === 'string') return firstImg;
    if (firstImg && typeof (firstImg as { url?: string }).url === 'string') return (firstImg as { url?: string }).url ?? "";
  }
  if (typeof p.imageUrl === 'string' && p.imageUrl) {
    return p.imageUrl;
  }
  if (typeof p.thumbnail === 'string' && p.thumbnail) {
    return p.thumbnail;
  }
  return 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMDAgMzAwIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI2YzZjRmNiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzljYTNhZiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg==';
}

/**
 * Helper to compute discount percentage format "-XX%"
 */
function getDiscountPercentage(price: number, originalPrice?: number, discount?: number): number {
  if (typeof discount === 'number' && discount > 0) {
    return Math.round(discount);
  }
  if (typeof originalPrice === 'number' && originalPrice > price) {
    return Math.round(((originalPrice - price) / originalPrice) * 100);
  }
  return 0;
}

/**
 * Standard Daraz-style Full Product Card Component
 */
export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onAddToCart,
  className = '',
  showLocation = true,
}) => {
  const [imageError, setImageError] = useState(false);
  const { has: isInWishlist, toggle: toggleWishlist } = useWishlist();

  const isWishlisted = isInWishlist ? isInWishlist(String(product.id)) : false;

  const p = product as ProductCardProduct;
  const originalPrice = product.compareAtPrice ?? p.oldPrice;
  const discountPct = getDiscountPercentage(product.price, originalPrice, p.discount);
  const imageUrl = imageError ? 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMDAgMzAwIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI2YzZjRmNiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzljYTNhZiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg==' : getProductImage(product);
  const rating = product.rating ?? p.ratings ?? 0;
  const reviewCount = p.reviewCount ?? p.reviewsCount ?? p.ratingsCount ?? 0;
  const location = p.location ?? p.sellerLocation ?? p.seller?.location ?? 'Dhaka';

  const handleWishlistClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (toggleWishlist) {
        toggleWishlist(product);
      }
    },
    [toggleWishlist, product]
  );

  const handleAddToCartClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (onAddToCart) {
        onAddToCart(product, e);
      }
    },
    [onAddToCart, product]
  );

  const productIdStr = String(product.id);

  return (
    <div
      className={`group relative bg-white rounded-lg shadow-sm hover:shadow-md transition-all duration-200 border border-slate-100 flex flex-col h-full overflow-hidden select-none ${className}`}
    >
      <Link
        to="/product/$slug"
        params={{ slug: String(product.slug || product.id) }}
        className="flex flex-col h-full text-inherit no-underline focus:outline-none focus:ring-2 focus:ring-orange-500 rounded-lg"
      >
        {/* Image Container */}
        <div className="relative w-full aspect-square overflow-hidden bg-slate-50 rounded-t-lg">
          <img
            src={imageUrl}
            srcSet={getResponsiveSrcSet(getProductImage(product), [200, 300, 400, 600])}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            alt={product.title || p.name || 'Product image'}
            onError={() => setImageError(true)}
            loading="lazy"
            className="w-full h-full object-cover rounded-t-lg group-hover:scale-105 transition-transform duration-300 ease-in-out"
          />

          {/* Discount Badge */}
          {discountPct > 0 && (
            <div className="absolute top-2 left-2 z-10 bg-[#f57224] text-white text-[11px] font-bold px-1.5 py-0.5 rounded shadow-sm pointer-events-none">
              -{discountPct}%
            </div>
          )}

          {/* Free Delivery Badge */}
          {(product as ProductCardProduct).freeDelivery && (
            <div className="absolute bottom-2 left-2 z-10 bg-emerald-600 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded shadow-sm flex items-center gap-0.5 pointer-events-none">
              <Truck className="w-2.5 h-2.5" /> Free Delivery
            </div>
          )}

          {/* Free Delivery Badge */}
          {(product as ProductCardProduct).freeDelivery && (
            <div className="absolute bottom-2 left-2 z-10 bg-emerald-600 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded shadow-sm flex items-center gap-0.5 pointer-events-none">
              <Truck className="w-2.5 h-2.5" /> Free Delivery
            </div>
          )}

          {/* Wishlist Heart Icon Toggle */}
          <button
            type="button"
            onClick={handleWishlistClick}
            aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
            className={`absolute top-2 right-2 z-10 p-1.5 rounded-full bg-white/80 hover:bg-white backdrop-blur-sm shadow-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-rose-400 ${
              isWishlisted ? 'text-rose-500 hover:text-rose-600' : 'text-slate-500 hover:text-rose-500'
            }`}
          >
            <Heart
              className={`w-4 h-4 transition-transform active:scale-125 ${
                isWishlisted ? 'fill-rose-500 text-rose-500' : 'fill-none'
              }`}
            />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-3 flex flex-col flex-1 justify-between bg-white">
          <div>
            {/* Title */}
            <h3 className="text-sm font-medium text-slate-800 group-hover:text-[#f57224] transition-colors line-clamp-2 leading-snug h-10 mb-1.5 overflow-hidden">
              {product.title || p.name || 'Untitled Product'}
            </h3>

            {/* Price Row */}
            <div className="flex items-baseline gap-1.5 flex-wrap my-1">
              <span className="text-lg font-bold text-[#0f172a] tracking-tight">
                {formatPrice(product.price)}
              </span>
              {originalPrice && originalPrice > product.price && (
                <span className="text-xs text-slate-400 line-through font-normal">
                  {formatPrice(originalPrice)}
                </span>
              )}
            </div>

            {/* Rating Row */}
            <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
              <div className="flex items-center text-amber-400">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                <span className="ml-1 text-xs font-semibold text-slate-700">
                  {rating > 0 ? rating.toFixed(1) : '4.5'}
                </span>
              </div>
              <span className="text-xs text-slate-400">({reviewCount})</span>
            </div>
          </div>

          {/* Location / Seller */}
          {showLocation && (
            <div className="mt-2 text-xs text-slate-400 truncate">
              {location}
            </div>
          )}
        </div>
      </Link>

      {/* Add to Cart Button (Appears on Hover at Bottom) */}
      <div className="p-2 pt-0 bg-white opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <button
          type="button"
          onClick={handleAddToCartClick}
          className="w-full bg-[#0f172a] hover:bg-slate-800 active:bg-slate-900 text-white text-xs font-medium py-2 px-3 rounded flex items-center justify-center gap-1.5 transition-colors duration-150 shadow-sm"
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          <span>Add to Cart</span>
        </button>
      </div>
    </div>
  );
};

/**
 * Compact Variant for Flash Sale Horizontal Scroll
 */
export const ProductCardCompact: React.FC<ProductCardCompactProps> = ({
  product,
  onAddToCart,
  className = '',
  soldCount,
  totalStock,
}) => {
  const [imageError, setImageError] = useState(false);
  const { has: isInWishlist, toggle: toggleWishlist } = useWishlist();

  const isWishlisted = isInWishlist ? isInWishlist(String(product.id)) : false;

  const p = product as ProductCardProduct;
  const originalPrice = product.compareAtPrice ?? p.oldPrice;
  const discountPct = getDiscountPercentage(product.price, originalPrice, p.discount);
  const imageUrl = imageError ? 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMDAgMzAwIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI2YzZjRmNiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzljYTNhZiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg==' : getProductImage(product);

  const handleWishlistClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (toggleWishlist) {
        toggleWishlist(product);
      }
    },
    [toggleWishlist, product]
  );

  const handleAddToCartClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (onAddToCart) {
        onAddToCart(product, e);
      }
    },
    [onAddToCart, product]
  );

  const productIdStr = String(product.id);
  const soldPercent =
    soldCount && totalStock && totalStock > 0
      ? Math.min(100, Math.round((soldCount / totalStock) * 100))
      : null;

  return (
    <div
      className={`group relative w-36 sm:w-40 flex-shrink-0 bg-white rounded-lg shadow-sm hover:shadow-md transition-all duration-200 border border-slate-100 flex flex-col overflow-hidden select-none ${className}`}
    >
      <Link
        to="/product/$slug"
        params={{ slug: String(product.slug || product.id) }}
        className="flex flex-col h-full text-inherit no-underline focus:outline-none"
      >
        {/* Compact Square Image */}
        <div className="relative w-full aspect-square overflow-hidden bg-slate-50 rounded-t-lg">
          <img
            src={imageUrl}
            srcSet={getResponsiveSrcSet(getProductImage(product), [160, 200, 320])}
            sizes="160px"
            alt={product.title || p.name || 'Product image'}
            onError={() => setImageError(true)}
            loading="lazy"
            className="w-full h-full object-cover rounded-t-lg group-hover:scale-105 transition-transform duration-300"
          />

          {/* Discount Badge */}
          {discountPct > 0 && (
            <div className="absolute top-1.5 left-1.5 z-10 bg-[#f57224] text-white text-[10px] font-bold px-1 py-0.5 rounded shadow-sm pointer-events-none">
              -{discountPct}%
            </div>
          )}

          {/* Wishlist Heart Icon */}
          <button
            type="button"
            onClick={handleWishlistClick}
            aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
            className={`absolute top-1.5 right-1.5 z-10 p-1 rounded-full bg-white/80 hover:bg-white backdrop-blur-sm shadow-sm transition-all duration-200 ${
              isWishlisted ? 'text-rose-500' : 'text-slate-500 hover:text-rose-500'
            }`}
          >
            <Heart
              className={`w-3.5 h-3.5 ${
                isWishlisted ? 'fill-rose-500 text-rose-500' : 'fill-none'
              }`}
            />
          </button>
        </div>

        {/* Compact Body */}
        <div className="p-2 flex flex-col justify-between flex-1 bg-white">
          <div>
            <h4 className="text-xs font-medium text-slate-800 group-hover:text-[#f57224] transition-colors line-clamp-2 h-8 leading-tight mb-1">
              {product.title || p.name || 'Untitled Product'}
            </h4>

            <div className="flex flex-col">
              <span className="text-sm font-bold text-[#0f172a] leading-none">
                {formatPrice(product.price)}
              </span>
              {originalPrice && originalPrice > product.price && (
                <span className="text-[10px] text-slate-400 line-through mt-0.5">
                  {formatPrice(originalPrice)}
                </span>
              )}
            </div>
          </div>

          {/* Sold Stock Progress Bar for Flash Sale */}
          {soldPercent !== null && (
            <div className="mt-2">
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-[#f57224] h-full rounded-full"
                  style={{ width: `${soldPercent}%` }}
                />
              </div>
              <div className="text-[9px] text-slate-400 mt-0.5 font-medium">
                {soldPercent}% sold
              </div>
            </div>
          )}
        </div>
      </Link>

      {/* Quick Add Button on Hover */}
      <div className="p-1.5 pt-0 bg-white opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <button
          type="button"
          onClick={handleAddToCartClick}
          className="w-full bg-[#0f172a] hover:bg-slate-800 text-white text-[10px] font-semibold py-1.5 px-2 rounded flex items-center justify-center gap-1 transition-colors"
        >
          <ShoppingCart className="w-3 h-3" />
          <span>Add</span>
        </button>
      </div>
    </div>
  );
};

/**
 * Skeleton Loading Component with Pulse Animation
 */
export const ProductCardSkeleton: React.FC<ProductCardSkeletonProps> = ({
  className = '',
}) => {
  return (
    <div
      className={`bg-white rounded-lg shadow-sm border border-slate-100 flex flex-col h-full overflow-hidden animate-pulse ${className}`}
    >
      {/* Square Image Placeholder */}
      <div className="relative w-full aspect-square bg-slate-200 rounded-t-lg">
        {/* Discount Badge Skeleton */}
        <div className="absolute top-2 left-2 w-10 h-4 bg-slate-300 rounded" />
        {/* Heart Icon Skeleton */}
        <div className="absolute top-2 right-2 w-7 h-7 bg-slate-300 rounded-full" />
      </div>

      {/* Content Skeleton */}
      <div className="p-3 flex flex-col flex-1 justify-between gap-2">
        <div className="space-y-2">
          {/* Title Lines */}
          <div className="h-3.5 bg-slate-200 rounded w-full" />
          <div className="h-3.5 bg-slate-200 rounded w-3/4" />

          {/* Price Skeleton */}
          <div className="flex items-center gap-2 pt-2">
            <div className="h-5 bg-slate-300 rounded w-20" />
            <div className="h-3 bg-slate-200 rounded w-12" />
          </div>

          {/* Rating Skeleton */}
          <div className="flex items-center gap-1 pt-1">
            <div className="h-3 bg-slate-200 rounded w-16" />
            <div className="h-3 bg-slate-200 rounded w-8" />
          </div>
        </div>

        {/* Location Skeleton */}
        <div className="h-3 bg-slate-200 rounded w-16 mt-2" />
      </div>
    </div>
  );
};

export default ProductCard;
