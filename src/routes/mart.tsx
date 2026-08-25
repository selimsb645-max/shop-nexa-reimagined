import { createFileRoute, Link } from "@tanstack/react-router";
import { BackButton } from "@/components/common/BackButton";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import {
  ShoppingCart,
  Truck,
  Clock,
  ShieldCheck,
  Store,
  Leaf,
  Apple,
  Package,
  CheckCircle2,
} from "lucide-react";

export const Route = createFileRoute("/mart")({
  ssr: false,
  component: MartPage,
  head: () => ({
    meta: [
      { title: "AVENTA SHOP Mart — Daily Groceries & Essentials" },
      {
        name: "description",
        content:
          "AVENTA SHOP Mart delivers fresh groceries, daily essentials, and household items to your doorstep. Same-day delivery in Dhaka, fast nationwide shipping.",
      },
    ],
  }),
});

const MART_CATEGORIES = [
  { icon: <Apple className="h-6 w-6" />, title: "Fresh Produce", description: "Fruits, vegetables, and farm-fresh items delivered daily from local markets." },
  { icon: <Leaf className="h-6 w-6" />, title: "Groceries & Staples", description: "Rice, dal, oil, spices, and all your kitchen essentials at competitive prices." },
  { icon: <Package className="h-6 w-6" />, title: "Household Items", description: "Cleaning supplies, toiletries, and everyday household products you need." },
  { icon: <ShoppingCart className="h-6 w-6" />, title: "Snacks & Beverages", description: "Chips, biscuits, tea, coffee, juices, and your favorite snacks stocked fresh." },
];

const MART_FEATURES = [
  { icon: <Clock className="h-5 w-5" />, title: "Same-Day Delivery", description: "Order before 2 PM and get your groceries delivered the same day within Dhaka city limits." },
  { icon: <Truck className="h-5 w-5" />, title: "Fast Nationwide Shipping", description: "Outside Dhaka? Get your non-perishable groceries delivered within 2-3 business days." },
  { icon: <ShieldCheck className="h-5 w-5" />, title: "Freshness Guarantee", description: "Not happy with the freshness of your produce? Return it for a full refund — no questions asked." },
  { icon: <CheckCircle2 className="h-5 w-5" />, title: "Quality Checked", description: "Every item is checked for quality and expiry date before packing and shipping." },
];

const HOW_MART_WORKS = [
  { step: "1", title: "Browse & Select", description: "Shop from thousands of grocery and daily essential products on AVENTA SHOP Mart." },
  { step: "2", title: "Choose Delivery Slot", description: "Pick a convenient delivery slot during checkout. Same-day slots available for Dhaka." },
  { step: "3", title: "Get It Delivered", description: "Your order is carefully packed and delivered to your doorstep at your chosen time." },
];

function MartPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <div className="mb-4">
          <BackButton fallbackTo="/" label="Back" />
        </div>

        {/* Hero */}
        <div className="mb-8 rounded-2xl bg-gradient-to-r from-green-600 to-green-700 p-8 text-white">
          <div className="flex items-center gap-3">
            <Store className="h-8 w-8" />
            <h1 className="text-2xl font-bold">AVENTA SHOP Mart</h1>
          </div>
          <p className="mt-2 text-green-50">
            Your daily groceries and essentials delivered fresh to your doorstep. From farm produce
            to household supplies — shop everything you need in one place. Same-day delivery
            available in Dhaka.
          </p>
        </div>

        {/* Categories */}
        <h2 className="mb-4 text-xl font-bold text-foreground">What You Can Buy on Mart</h2>
        <div className="mb-8 grid gap-4 sm:grid-cols-2">
          {MART_CATEGORIES.map((cat, i) => (
            <div key={i} className="flex gap-4 rounded-2xl border bg-background p-5 shadow-sm">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-green-50 text-green-600">
                {cat.icon}
              </span>
              <div>
                <h3 className="text-base font-semibold text-foreground">{cat.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{cat.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* How It Works */}
        <h2 className="mb-4 text-xl font-bold text-foreground">How Mart Works</h2>
        <div className="mb-8 space-y-4">
          {HOW_MART_WORKS.map((item, i) => (
            <div key={i} className="flex gap-4 rounded-2xl border bg-background p-5 shadow-sm">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                {item.step}
              </span>
              <div>
                <h3 className="text-base font-semibold text-foreground">{item.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Features */}
        <h2 className="mb-4 text-xl font-bold text-foreground">Why Shop on Mart?</h2>
        <div className="mb-8 grid gap-4 sm:grid-cols-2">
          {MART_FEATURES.map((feature, i) => (
            <div key={i} className="flex gap-3 rounded-2xl border bg-background p-5 shadow-sm">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-green-50 text-green-600">
                {feature.icon}
              </span>
              <div>
                <h3 className="text-sm font-semibold text-foreground">{feature.title}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Delivery Zones */}
        <div className="mb-8 rounded-2xl border border-blue-100 bg-blue-50 p-5">
          <h2 className="mb-3 text-lg font-semibold text-foreground">Delivery Coverage</h2>
          <ol className="space-y-2 text-sm text-muted-foreground">
            <li>1. Dhaka city: Same-day delivery for orders placed before 2 PM.</li>
            <li>2. Dhaka suburbs (Savar, Gazipur, Narayanganj): Next-day delivery.</li>
            <li>3. All 64 districts: 2-3 business days for non-perishable items only.</li>
            <li>4. Fresh produce and perishables are available only in Dhaka and nearby areas.</li>
            <li>5. Free delivery on Mart orders above ৳800 within Dhaka city.</li>
          </ol>
        </div>

        {/* CTA */}
        <div className="rounded-2xl bg-primary/5 p-6 text-center">
          <h2 className="text-lg font-semibold text-foreground">Need groceries today?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Order before 2 PM for same-day delivery in Dhaka.
          </p>
          <Link
            to="/shop"
            className="mt-4 inline-flex items-center justify-center rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            Shop Mart
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
