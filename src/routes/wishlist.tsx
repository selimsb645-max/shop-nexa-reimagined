import { createFileRoute, Link } from "@tanstack/react-router";
import { Heart, ShoppingCart, Trash2 } from "lucide-react";
import { TopBar, SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { WhatsAppFab } from "@/components/layout/SiteChrome";
import { Spinner } from "@/components/common/Spinner";
import { useAuth } from "@/context/AuthContext";
import { useWishlist } from "@/context/WishlistContext";
import { useCart } from "@/context/CartContext";
import { getProductById } from "@/services/firebase/products";
import { formatPrice } from "@/utils/format";
import { toast } from "sonner";

export const Route = createFileRoute("/wishlist")({
  ssr: false,
  component: WishlistPage,
  head: () => ({
    meta: [
      { title: "Your Wishlist — ShopNexa" },
      { name: "description", content: "Save products you love on ShopNexa and move them to your cart anytime." },
      { property: "og:title", content: "Your Wishlist — ShopNexa" },
      { property: "og:description", content: "Save products you love on ShopNexa." },
      { property: "og:url", content: "https://shop-nexa.lovable.app/wishlist" },
    ],
    links: [{ rel: "canonical", href: "https://shop-nexa.lovable.app/wishlist" }],
  }),
});


function WishlistPage() {
  const { user, loading: authLoading } = useAuth();
  const { items, loading, remove } = useWishlist();
  const { add } = useCart();

  const moveToCart = async (productId: string) => {
    const product = await getProductById(productId);
    if (!product) {
      toast.error("Product no longer available");
      await remove(productId);
      return;
    }
    if (product.stock <= 0) {
      toast.error("Out of stock");
      return;
    }
    await add(product, 1);
    await remove(productId);
  };

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold">My Wishlist</h1>

        {authLoading || loading ? (
          <div className="py-16 text-center"><Spinner /></div>
        ) : !user ? (
          <div className="rounded-lg border bg-card p-16 text-center">
            <Heart className="mx-auto h-12 w-12 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">Sign in to view your wishlist</h2>
            <Link
              to="/login"
              search={{ redirect: "/wishlist" }}
              className="mt-4 inline-block rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground"
            >
              Sign In
            </Link>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border bg-card p-16 text-center">
            <Heart className="mx-auto h-12 w-12 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">Your wishlist is empty</h2>
            <p className="mt-1 text-sm text-muted-foreground">Save products you love for later.</p>
            <Link to="/shop" className="mt-4 inline-block rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground">
              Browse Products
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <div key={item.productId} className="flex gap-4 rounded-lg border bg-card p-4">
                <Link to="/product/$slug" params={{ slug: item.slug }} className="shrink-0">
                  <img src={item.image} alt={item.title} className="h-24 w-24 rounded object-cover" />
                </Link>
                <div className="flex-1">
                  <Link to="/product/$slug" params={{ slug: item.slug }} className="line-clamp-2 font-medium hover:text-primary">
                    {item.title}
                  </Link>
                  <div className="mt-1 font-semibold text-primary">{formatPrice(item.price)}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => void moveToCart(item.productId)}
                      className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                    >
                      <ShoppingCart className="h-3.5 w-3.5" /> Add to Cart
                    </button>
                    <button
                      onClick={() => void remove(item.productId)}
                      className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs text-destructive hover:bg-muted"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <SiteFooter />
      <WhatsAppFab />
    </div>
  );
}
