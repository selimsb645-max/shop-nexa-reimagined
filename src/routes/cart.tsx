import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Minus, Plus, Trash2, ShoppingBag, Tag, X } from "lucide-react";
import { toast } from "sonner";
import { TopBar, SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { WhatsAppFab } from "@/components/layout/SiteChrome";
import { Spinner } from "@/components/common/Spinner";
import { useCart } from "@/context/CartContext";
import { formatPrice } from "@/utils/format";
import { validateCoupon, CouponError } from "@/services/firebase/coupons";
import { computeShipping } from "@/services/firebase/orders";
import type { Coupon } from "@/types/commerce";

export const Route = createFileRoute("/cart")({
  ssr: false,
  component: CartPage,
  head: () => ({
    meta: [
      { title: "Your Cart — ShopNexa" },
      { name: "description", content: "Review the items in your ShopNexa cart, apply coupons and checkout securely." },
      { property: "og:title", content: "Your Cart — ShopNexa" },
      { property: "og:description", content: "Review your ShopNexa cart and checkout securely." },
      { property: "og:url", content: "https://shop-nexa.lovable.app/cart" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "https://shop-nexa.lovable.app/cart" }],
  }),
});


function CartPage() {
  const { items, subtotal, updateQty, remove } = useCart();
  const [code, setCode] = useState("");
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<{ coupon: Coupon; discount: number } | null>(null);

  const discount = applied?.discount ?? 0;
  const shipping = items.length ? computeShipping(subtotal - discount) : 0;
  const total = Math.max(0, subtotal - discount + shipping);

  const apply = async () => {
    if (!code.trim()) return;
    setApplying(true);
    try {
      const res = await validateCoupon(code, subtotal);
      setApplied(res);
      toast.success(`Coupon applied: -${formatPrice(res.discount)}`);
    } catch (err) {
      if (err instanceof CouponError) toast.error(err.message);
      else toast.error("Could not validate coupon");
      setApplied(null);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <SiteHeader />

      <div className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold">Shopping Cart</h1>

        {items.length === 0 ? (
          <div className="rounded-lg border bg-card p-16 text-center">
            <ShoppingBag className="mx-auto h-14 w-14 text-muted-foreground" />
            <h2 className="mt-4 text-xl font-semibold">Your cart is empty</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Add some products to get started.
            </p>
            <Link
              to="/shop"
              className="mt-6 inline-block rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Continue Shopping
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.productId} className="flex gap-4 rounded-lg border bg-card p-4">
                  <Link to="/product/$slug" params={{ slug: item.slug }} className="shrink-0">
                    <img src={item.image} alt={item.title} className="h-24 w-24 rounded object-cover" />
                  </Link>
                  <div className="flex-1">
                    <Link
                      to="/product/$slug"
                      params={{ slug: item.slug }}
                      className="font-medium hover:text-primary"
                    >
                      {item.title}
                    </Link>
                    <div className="mt-1 text-sm text-primary font-semibold">
                      {formatPrice(item.price)}
                    </div>
                    <div className="mt-3 flex items-center gap-4">
                      <div className="flex items-center rounded-md border">
                        <button
                          onClick={() => void updateQty(item.productId, item.quantity - 1)}
                          className="px-2 py-1 hover:bg-muted"
                          aria-label="Decrease"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-10 text-center text-sm">{item.quantity}</span>
                        <button
                          onClick={() => void updateQty(item.productId, item.quantity + 1)}
                          disabled={item.quantity >= item.stock}
                          className="px-2 py-1 hover:bg-muted disabled:opacity-40"
                          aria-label="Increase"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <button
                        onClick={() => void remove(item.productId)}
                        className="flex items-center gap-1 text-xs text-destructive hover:underline"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Remove
                      </button>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">
                      {formatPrice(item.price * item.quantity)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <aside className="h-fit rounded-lg border bg-card p-5">
              <h2 className="text-lg font-semibold">Order Summary</h2>

              <div className="mt-4">
                <label className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Tag className="h-4 w-4" /> Coupon Code
                </label>
                {applied ? (
                  <div className="flex items-center justify-between rounded-md bg-green-50 px-3 py-2 text-sm">
                    <span className="font-semibold text-green-700">{applied.coupon.code}</span>
                    <button
                      onClick={() => {
                        setApplied(null);
                        setCode("");
                      }}
                      className="text-green-700 hover:text-green-900"
                      aria-label="Remove coupon"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      placeholder="Enter code"
                      className="flex-1 rounded-md border px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                    <button
                      onClick={() => void apply()}
                      disabled={applying || !code.trim()}
                      className="flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                    >
                      {applying && <Spinner />} Apply
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-5 space-y-2 border-t pt-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatPrice(subtotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount</span>
                    <span>-{formatPrice(discount)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shipping</span>
                  <span>{shipping === 0 ? "Free" : formatPrice(shipping)}</span>
                </div>
                <div className="flex justify-between border-t pt-3 text-base font-semibold">
                  <span>Total</span>
                  <span className="text-primary">{formatPrice(total)}</span>
                </div>
              </div>

              <Link
                to="/checkout"
                search={applied ? { code: applied.coupon.code } : {}}
                className="mt-5 flex w-full items-center justify-center rounded-md bg-accent py-3 text-sm font-semibold text-accent-foreground hover:opacity-90"
              >
                Proceed to Checkout
              </Link>
              <Link
                to="/shop"
                className="mt-2 flex w-full items-center justify-center py-2 text-sm text-primary hover:underline"
              >
                Continue Shopping
              </Link>
            </aside>
          </div>
        )}
      </div>

      <SiteFooter />
      <WhatsAppFab />
    </div>
  );
}
