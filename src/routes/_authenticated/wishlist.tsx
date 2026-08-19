import { createFileRoute, Link } from "@tanstack/react-router";
import { Heart, Trash2, ShoppingBag } from "lucide-react";
import { useWishlist } from "@/context/WishlistContext";
import { useCart } from "@/context/CartContext";
import { PageHeader } from "@/components/common/PageHeader";
import { Spinner } from "@/components/common/Spinner";
import { formatPrice } from "@/utils/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/wishlist")({
  component: WishlistPage,
});

function WishlistPage() {
  const { items, loading, remove } = useWishlist();
  const { add } = useCart();

  const handleAddToCart = async (item: typeof items[number]) => {
    add({ id: item.productId, title: item.title, price: item.price, image: item.image, qty: 1 });
    toast.success("Added to cart");
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24 md:pb-6">
      <PageHeader title="My Wishlist" subtitle={`${items.length} item${items.length !== 1 ? "s" : ""}`} />

      <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
        {loading ? (
          <div className="flex items-center gap-2 py-12 text-sm text-gray-500">
            <Spinner /> Loading wishlist...
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
            <div className="grid h-20 w-20 place-items-center rounded-full bg-gray-100">
              <Heart className="h-10 w-10 text-gray-300" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-700">Your wishlist is empty</h2>
              <p className="mt-1 text-xs text-gray-500">Save items you love and find them here later.</p>
            </div>
            <Link
              to="/shop"
              className="rounded-xl bg-orange-500 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-orange-600 active:scale-95"
            >
              Browse Products
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {items.map((item) => (
              <div
                key={item.productId}
                className="flex gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm"
              >
                <Link to="/shop/$slug" params={{ slug: item.slug || item.productId }} className="shrink-0">
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.title}
                      className="h-20 w-20 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="grid h-20 w-20 place-items-center rounded-xl bg-gray-100">
                      <ShoppingBag className="h-8 w-8 text-gray-300" />
                    </div>
                  )}
                </Link>
                <div className="flex min-w-0 flex-1 flex-col justify-between">
                  <Link to="/shop/$slug" params={{ slug: item.slug || item.productId }}>
                    <h3 className="line-clamp-2 text-sm font-medium text-gray-800">{item.title}</h3>
                  </Link>
                  <p className="text-sm font-bold text-orange-500">{formatPrice(item.price)}</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleAddToCart(item)}
                      className="flex-1 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-orange-600 active:scale-95"
                    >
                      Add to Cart
                    </button>
                    <button
                      onClick={() => remove(item.productId)}
                      className="grid h-8 w-8 place-items-center rounded-lg bg-gray-100 text-gray-500 transition hover:bg-red-50 hover:text-red-500 active:scale-95"
                      aria-label="Remove from wishlist"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
