import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Heart, Loader, ShoppingBag, Trash2 } from "lucide-react";
import { ServicePageLayout } from "@/components/common/ServicePageLayout";
import { useAuth } from "@/context/AuthContext";
import { useWishlist } from "@/context/WishlistContext";
import { useCart } from "@/context/CartContext";
import { formatPrice } from "@/utils/format";
import { toast } from "sonner";
import type { Product } from "@/types/commerce";

export const Route = createFileRoute("/_authenticated/wishlist")({
  component: WishlistPage,
});

function WishlistPage() {
  const { user } = useAuth();
  const { items, remove, loading } = useWishlist();
  const { add } = useCart();
  const [removing, setRemoving] = useState<string | null>(null);

  const handleRemove = async (productId: string) => {
    setRemoving(productId);
    try {
      await remove(productId);
      toast.success("Removed from wishlist");
    } catch {
      toast.error("Could not remove item");
    } finally {
      setRemoving(null);
    }
  };

  const handleAddToCart = async (item: typeof items[number]) => {
    add(
      {
        id: item.productId,
        title: item.title,
        slug: item.slug || item.productId,
        shortDescription: "",
        description: "",
        brand: null,
        price: item.price,
        compareAtPrice: null,
        costPrice: null,
        tax: 0,
        images: item.image ? [item.image] : [],
        categoryId: "",
        categorySlug: "",
        subcategoryId: null,
        subcategorySlug: null,
        stock: 99,
        rating: 0,
        reviewCount: 0,
        tags: [],
        featured: false,
        sellerId: null,
        productIds: [],
        maxDiscount: null,
        createdAt: item.addedAt,
        updatedAt: item.addedAt,
      } as Product,
      1,
    );
    toast.success("Added to cart");
  };

  return (
    <ServicePageLayout title="My Wishlist" subtitle={`${items.length} saved item${items.length === 1 ? "" : "s"}`}>
      {loading ? (
        <div className="py-20 text-center">
          <Loader className="mx-auto h-8 w-8 animate-spin text-slate-300" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-gray-100 bg-white py-16 text-center shadow-sm">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-orange-50 text-[#f57224]">
            <Heart className="h-7 w-7" />
          </span>
          <h3 className="mt-4 text-base font-bold text-slate-800">Your wishlist is empty</h3>
          <p className="mt-1 max-w-xs text-sm text-slate-500">
            Save items you love and find them all here later.
          </p>
          <Link
            to="/shop"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#f57224] px-6 py-3 text-sm font-bold text-white shadow-md transition hover:bg-orange-600 active:scale-95"
          >
            <ShoppingBag className="h-4 w-4" /> Browse products
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((item) => (
            <div
              key={item.productId}
              className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
            >
              <div className="flex gap-3 p-4">
                <Link
                  to="/product/$slug"
                  params={{ slug: item.slug || item.productId }}
                  className="shrink-0"
                >
                  <img
                    src={item.image}
                    alt={item.title}
                    className="h-20 w-20 rounded-xl border border-gray-100 object-cover"
                  />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    to="/product/$slug"
                    params={{ slug: item.slug || item.productId }}
                    className="block truncate text-sm font-bold text-slate-800 hover:text-[#f57224]"
                  >
                    {item.title}
                  </Link>
                  <div className="mt-1 text-lg font-black text-[#f57224]">{formatPrice(item.price)}</div>
                </div>
                <button
                  onClick={() => void handleRemove(item.productId)}
                  disabled={removing === item.productId}
                  className="rounded-lg border border-slate-200 p-2 text-red-500 transition hover:bg-red-50 active:scale-95 disabled:opacity-50"
                >
                  {removing === item.productId ? (
                    <Loader className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
              <button
                onClick={() => void handleAddToCart(item)}
                className="w-full border-t border-gray-100 bg-slate-50 py-2.5 text-sm font-bold text-[#f57224] transition hover:bg-orange-50 active:scale-95"
              >
                Add to cart
              </button>
            </div>
          ))}
        </div>
      )}
    </ServicePageLayout>
  );
}
