import { createFileRoute, Link } from "@tanstack/react-router";
import { BackButton } from "@/components/common/BackButton";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import {
  Package,
  Truck,
  MapPin,
  CheckCircle2,
  Clock,
  ArrowRight,
  Search,
  Info,
} from "lucide-react";

export const Route = createFileRoute("/track-orders-info")({
  ssr: false,
  component: TrackOrdersInfoPage,
  head: () => ({
    meta: [
      { title: "Track Your Order — AVENTA SHOP" },
      {
        name: "description",
        content:
          "Track your AVENTA SHOP order in real-time. Learn how order tracking works, delivery stages, and how to check your order status.",
      },
    ],
  }),
});

const DELIVERY_STAGES = [
  {
    icon: <Package className="h-6 w-6" />,
    stage: "Order Placed",
    description: "Your order has been placed and is awaiting seller confirmation. You'll receive an SMS confirmation.",
  },
  {
    icon: <CheckCircle2 className="h-6 w-6" />,
    stage: "Confirmed",
    description: "The seller has confirmed your order and is preparing it for dispatch. Payment status is verified.",
  },
  {
    icon: <Package className="h-6 w-6" />,
    stage: "Processing",
    description: "Your order is being packed and labeled for shipping. You'll be notified once it's dispatched.",
  },
  {
    icon: <Truck className="h-6 w-6" />,
    stage: "Shipped",
    description: "Your package has left the seller's warehouse and is on its way to the nearest delivery hub.",
  },
  {
    icon: <Truck className="h-6 w-6" />,
    stage: "Out for Delivery",
    description: "Your package is with the delivery rider and will arrive today. Keep your phone available for the delivery call.",
  },
  {
    icon: <MapPin className="h-6 w-6" />,
    stage: "Delivered",
    description: "Your order has been delivered. Please verify the package contents before confirming receipt.",
  },
];

function TrackOrdersInfoPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <div className="mb-4">
          <BackButton fallbackTo="/" label="Back" />
        </div>

        {/* Hero */}
        <div className="mb-8 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 p-8 text-white">
          <h1 className="text-2xl font-bold">Track Your Order</h1>
          <p className="mt-2 text-orange-50">
            Stay updated on your delivery from the moment you place your order until it arrives at
            your doorstep. Real-time tracking is available for all AVENTA SHOP orders.
          </p>
        </div>

        {/* How to Track */}
        <h2 className="mb-4 text-xl font-bold text-foreground">How to Track Your Order</h2>
        <div className="mb-8 space-y-4">
          <div className="flex gap-4 rounded-2xl border bg-background p-5 shadow-sm">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Search className="h-6 w-6" />
            </span>
            <div>
              <h3 className="text-base font-semibold text-foreground">Method 1: Use Your Order ID</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Send your Order ID to us via WhatsApp or chat, and we'll provide your order status instantly.
                Your Order ID is included in the SMS and email confirmation you received after placing your order.
              </p>
            </div>
          </div>
          <div className="flex gap-4 rounded-2xl border bg-background p-5 shadow-sm">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Package className="h-6 w-6" />
            </span>
            <div>
              <h3 className="text-base font-semibold text-foreground">Method 2: Check Order History</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Log in to your AVENTA SHOP account and go to "My Orders" or "Track Orders" to see
                real-time delivery status and tracking updates for all your purchases.
              </p>
            </div>
          </div>
        </div>

        {/* Delivery Stages */}
        <h2 className="mb-4 text-xl font-bold text-foreground">Order Delivery Stages</h2>
        <div className="mb-8 space-y-4">
          {DELIVERY_STAGES.map((stage, i) => (
            <div key={i} className="flex gap-4">
              <div className="flex flex-col items-center">
                <span
                  className={`grid h-12 w-12 place-items-center rounded-xl ${
                    i === 0
                      ? "bg-primary text-primary-foreground"
                      : "bg-primary/10 text-primary"
                  }`}
                >
                  {stage.icon}
                </span>
                {i < DELIVERY_STAGES.length - 1 && (
                  <span className="mt-1 w-px flex-1 bg-border" style={{ minHeight: "20px" }} />
                )}
              </div>
              <div className="flex-1 pb-4">
                <h3 className="text-base font-semibold text-foreground">{stage.stage}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{stage.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Delivery Timeframes */}
        <div className="mb-8 rounded-2xl border border-blue-100 bg-blue-50 p-5">
          <div className="mb-3 flex items-center gap-2">
            <Info className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-foreground">Estimated Delivery Times</h2>
          </div>
          <ol className="space-y-2 text-sm text-muted-foreground">
            <li>1. Dhaka city: 1-2 business days from dispatch.</li>
            <li>2. Dhaka suburbs (Savar, Gazipur, Narayanganj): 2-3 business days.</li>
            <li>3. Other districts: 3-7 business days depending on location.</li>
            <li>4. Mart (groceries) same-day delivery in Dhaka for orders before 2 PM.</li>
            <li>5. Delivery times may vary during sales, holidays, and adverse weather conditions.</li>
          </ol>
        </div>

        {/* CTA */}
        <div className="rounded-2xl bg-primary/5 p-6 text-center">
          <h2 className="text-lg font-semibold text-foreground">Want to track your order now?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Log in to view your order history and real-time delivery status.
          </p>
          <Link
            to="/_authenticated/track-orders"
            className="mt-4 inline-flex items-center gap-2 justify-center rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            Track My Orders <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
