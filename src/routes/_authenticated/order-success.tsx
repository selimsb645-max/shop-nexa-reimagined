import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, ArrowLeft, Package, Clock, MapPin } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatPrice } from "@/utils/format";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";

export const Route = createFileRoute("/_authenticated/order-success")({
  ssr: false,
  component: OrderSuccessPage,
  head: () => ({ meta: [{ title: "Order Confirmed — ShopNexa" }] }),
});

function OrderSuccessPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        {/* Success header */}
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 grid h-20 w-20 place-items-center rounded-full bg-green-100">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold">Order Confirmed!</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Thank you for your purchase. Your order is being processed.
          </p>
        </div>

        {/* Order info */}
        <div className="mt-8 rounded-2xl border bg-background p-5 shadow-sm">
          <div className="flex items-center gap-3 border-b pb-4">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
              <Package className="h-6 w-6" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">What happens next?</h2>
              <p className="text-xs text-muted-foreground">Your order is being prepared for shipment</p>
            </div>
          </div>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>Estimated delivery: 2-5 business days</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span>You'll receive tracking updates via email and SMS</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            to="/orders"
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            <Package className="h-4 w-4" /> View My Orders
          </Link>
          <Link
            to="/shop"
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border px-6 py-3 text-sm font-medium transition hover:bg-muted"
          >
            Continue Shopping
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
