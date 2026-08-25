import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Headphones,
  MessageCircle,
  Mail,
  Phone,
  Clock,
  ChevronRight,
  HelpCircle,
} from "lucide-react";
import { BackButton } from "@/components/common/BackButton";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";

export const Route = createFileRoute("/help-center")({
  ssr: false,
  component: HelpCenterPage,
  head: () => ({
    meta: [
      { title: "Help Center — AVENTA SHOP" },
      { name: "description", content: "Answers about AVENTA SHOP shipping, returns, payments, orders and account support." },
      { property: "og:title", content: "Help Center — AVENTA SHOP" },
      { property: "og:description", content: "Shipping, returns, payments and account support answers." },
      { property: "og:url", content: "https://shop-nexa.lovable.app/help-center" },
    ],
    links: [{ rel: "canonical", href: "https://shop-nexa.lovable.app/help-center" }],
  }),

});

const HELP_CATEGORIES = [
  {
    icon: <MessageCircle className="h-6 w-6" />,
    title: "Orders & Delivery",
    description: "Track orders, delivery info, cancellations",
    link: "/support",
  },
  {
    icon: <Headphones className="h-6 w-6" />,
    title: "Returns & Refunds",
    description: "Return policy, refund status, exchanges",
    link: "/returns",
  },
  {
    icon: <Mail className="h-6 w-6" />,
    title: "Account & Security",
    description: "Login issues, password, verification",
    link: "/settings",
  },
  {
    icon: <ChevronRight className="h-6 w-6" />,
    title: "Payment & Wallet",
    description: "Payment methods, wallet balance, transactions",
    link: "/wallet",
  },
];

const FAQS = [
  { q: "How can I track my order?", a: "Go to Track Orders in your account to see real-time delivery tracking." },
  { q: "What is the return policy?", a: "You can request a return within 7 days of delivery for eligible products." },
  { q: "How do I use my wallet balance?", a: "Wallet balance can be used during checkout as a payment option." },
  { q: "How do I become a seller?", a: "Visit 'Become a Seller' from your account to start the registration process." },
  { q: "How do I use coupons?", a: "Go to the Coupons page to see available vouchers and apply them at checkout." },
];

function HelpCenterPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <div className="mb-4">
          <BackButton fallbackTo="/" label="Back" className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200 active:scale-95" />
        </div>
        <div className="mb-6 flex items-center gap-3">
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <HelpCircle className="h-6 w-6 text-primary" />
            Help Center
          </h1>
        </div>

        {/* Contact options */}
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          <Link
            to="/support"
            className="flex items-center gap-3 rounded-2xl border bg-background p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md"
          >
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
              <Headphones className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold">Customer Support</h3>
              <p className="text-xs text-muted-foreground">Open a support ticket</p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </Link>

        </div>

        {/* Help categories */}
        <div className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Browse Help Topics</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {HELP_CATEGORIES.map((cat, i) => (
              <Link
                key={i}
                to={cat.link}
                className="flex items-center gap-3 rounded-xl border bg-background p-4 shadow-sm transition hover:border-primary/40"
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  {cat.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold">{cat.title}</h3>
                  <p className="text-xs text-muted-foreground">{cat.description}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>

        {/* FAQs */}
        <div className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Frequently Asked Questions</h2>
          <div className="space-y-2">
            {FAQS.map((faq, i) => (
              <details key={i} className="group rounded-xl border bg-background p-4 shadow-sm">
                <summary className="flex cursor-pointer items-center justify-between text-sm font-semibold">
                  {faq.q}
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition group-open:rotate-90" />
                </summary>
                <p className="mt-2 text-sm text-muted-foreground">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>

        {/* Support hours */}
        <div className="flex items-center gap-3 rounded-xl bg-muted/30 p-4 text-sm text-muted-foreground">
          <Clock className="h-5 w-5 text-primary" />
          <span>Support available: Saturday - Thursday, 9:00 AM - 10:00 PM (BST)</span>
        </div>
      </main>
      <SiteFooter />
</div>
  );
}
