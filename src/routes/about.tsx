import { createFileRoute, Link } from "@tanstack/react-router";
import { BackButton } from "@/components/common/BackButton";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { Truck, ShieldCheck, Headphones, Tag, Store, Users } from "lucide-react";
import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/about")({
  ssr: true,
  component: AboutPage,
  head: () => ({
    ...seoHead({
      title: "About AVENTA SHOP — Online Shopping Marketplace in Bangladesh",
      description: "AVENTA SHOP is your one-stop online marketplace for electronics, fashion, groceries, and more — quality products at unbeatable prices across Bangladesh with fast delivery and secure payments.",
      path: "/about",
      type: "website",
    }),
  }),
});

const VALUES = [
  { icon: <Tag className="h-6 w-6" />, title: "Best Prices", description: "Unbeatable prices on thousands of products across every category." },
  { icon: <Truck className="h-6 w-6" />, title: "Fast Delivery", description: "Quick and reliable delivery across Bangladesh with free shipping over ৳500." },
  { icon: <ShieldCheck className="h-6 w-6" />, title: "Secure Shopping", description: "Your data and payments are protected with industry-standard security." },
  { icon: <Headphones className="h-6 w-6" />, title: "24/7 Support", description: "Our customer support team is always ready to help you with any questions." },
];

const STATS = [
  { value: "10K+", label: "Products" },
  { value: "50K+", label: "Happy Customers" },
  { value: "500+", label: "Sellers" },
  { value: "64", label: "Districts Covered" },
];

function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <div className="mb-4">
          <BackButton fallbackTo="/" label="Back" />
        </div>

        {/* Hero section */}
        <div className="mb-8 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 p-8 text-white">
          <h1 className="text-3xl font-bold">About AVENTA SHOP</h1>
          <p className="mt-3 text-orange-50">
            AVENTA SHOP is Bangladesh's growing online marketplace — your one-stop destination for
            electronics, fashion, groceries, home essentials, and more. We connect buyers and sellers
            across the country, bringing quality products at unbeatable prices right to your doorstep.
          </p>
        </div>

        {/* Stats */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {STATS.map((stat, i) => (
            <div key={i} className="rounded-2xl border bg-background p-5 text-center shadow-sm">
              <p className="text-2xl font-bold text-primary">{stat.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Values */}
        <h2 className="mb-4 text-xl font-bold text-foreground">Why Choose Us</h2>
        <div className="mb-8 grid gap-4 sm:grid-cols-2">
          {VALUES.map((value, i) => (
            <div key={i} className="flex gap-3 rounded-2xl border bg-background p-5 shadow-sm">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                {value.icon}
              </span>
              <div>
                <h3 className="text-base font-semibold text-foreground">{value.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{value.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Mission */}
        <div className="mb-8 rounded-2xl border bg-muted/30 p-6">
          <div className="mb-3 flex items-center gap-2">
            <Store className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Our Mission</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            To make online shopping simple, affordable, and accessible for everyone in Bangladesh.
            We empower local sellers with a platform to reach customers nationwide, while giving
            buyers a trusted marketplace with quality products, fair prices, and reliable delivery.
          </p>
        </div>

        {/* CTA */}
        <div className="rounded-2xl bg-primary/5 p-6 text-center">
          <div className="mb-3 flex items-center justify-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Join the AVENTA SHOP Family</h2>
          </div>
          <p className="text-sm text-muted-foreground">Whether you're a buyer or a seller, we've got you covered.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link
              to="/register"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
            >
              Sign Up
            </Link>
            <Link
              to="/seller/register"
              className="inline-flex items-center justify-center rounded-lg border bg-background px-6 py-2.5 text-sm font-medium text-foreground transition hover:bg-muted"
            >
              Become a Seller
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
