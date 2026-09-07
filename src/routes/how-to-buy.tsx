import { createFileRoute } from "@tanstack/react-router";
import { BackButton } from "@/components/common/BackButton";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { ShoppingCart, Search, CreditCard, Truck, PackageCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/how-to-buy")({
  ssr: true,
  component: HowToBuyPage,
  head: () => ({
    ...seoHead({
      title: "How to Buy on AVENTA SHOP — Shopping Guide",
      description: "Learn how to shop on AVENTA SHOP — search products, add to cart, checkout securely, and get your products delivered fast. Complete step-by-step buying guide.",
      path: "/how-to-buy",
      type: "website",
    }),
  }),
});

const STEPS = [
  {
    icon: <Search className="h-6 w-6" />,
    title: "Search & Browse",
    description: "Browse categories or use the search bar to find products. Filter by price, brand, and ratings to find exactly what you need.",
  },
  {
    icon: <ShoppingCart className="h-6 w-6" />,
    title: "Add to Cart",
    description: "Click 'Add to Cart' on any product. You can continue shopping or go to your cart to review items before checkout.",
  },
  {
    icon: <CreditCard className="h-6 w-6" />,
    title: "Checkout & Payment",
    description: "Select your delivery address, choose a payment method (Cash on Delivery, Card, or Mobile Banking), and place your order.",
  },
  {
    icon: <Truck className="h-6 w-6" />,
    title: "Track Your Order",
    description: "Once your order is confirmed, you can track its status in real-time from 'Track Orders' in your account.",
  },
  {
    icon: <PackageCheck className="h-6 w-6" />,
    title: "Receive & Enjoy",
    description: "Get your products delivered to your doorstep. Enjoy quality products at unbeatable prices from AVENTA SHOP.",
  },
];

function HowToBuyPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <div className="mb-4">
          <BackButton fallbackTo="/" label="Back" />
        </div>
        <h1 className="mb-2 text-2xl font-bold text-foreground">How to Buy on AVENTA SHOP</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Shopping on AVENTA SHOP is easy. Follow these simple steps to get started.
        </p>

        <div className="space-y-4">
          {STEPS.map((step, i) => (
            <div
              key={i}
              className="flex gap-4 rounded-2xl border bg-background p-5 shadow-sm"
            >
              <div className="flex flex-col items-center">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
                  {step.icon}
                </span>
                {i < STEPS.length - 1 && (
                  <span className="mt-2 w-px flex-1 bg-border" />
                )}
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-foreground">
                  {i + 1}. {step.title}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-2xl bg-primary/5 p-6 text-center">
          <h2 className="text-lg font-semibold text-foreground">Ready to start shopping?</h2>
          <p className="mt-1 text-sm text-muted-foreground">Explore thousands of products at unbeatable prices.</p>
          <Link
            to="/shop"
            className="mt-4 inline-flex items-center justify-center rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            Start Shopping
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
