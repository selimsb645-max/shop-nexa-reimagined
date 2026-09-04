import { createFileRoute, Link } from "@tanstack/react-router";
import {
  UserPlus,
  LogIn,
  Search,
  Eye,
  ShoppingCart,
  CreditCard,
  MapPin,
  Wallet,
  PackageCheck,
  Truck,
  Home,
  HelpCircle,
  Mail,
  ArrowRight,
} from "lucide-react";
import { PublicInfoLayout, InfoCard, InfoHeading } from "@/components/common/PublicInfoLayout";

export const Route = createFileRoute("/how-to-buy")({
  ssr: false,
  component: HowToBuyPage,
  head: () => ({
    meta: [
      { title: "How to Buy — Aventa Shop" },
      {
        name: "description",
        content:
          "A step-by-step guide to shopping on Aventa Shop — from account creation to receiving your order.",
      },
    ],
  }),
});

const STEPS = [
  {
    icon: <UserPlus className="h-5 w-5" />,
    title: "Create an Account",
    text: "Sign up with your email or Google account. It takes less than a minute.",
  },
  {
    icon: <LogIn className="h-5 w-5" />,
    title: "Log In",
    text: "Sign in to your account to access your cart, wishlist and orders.",
  },
  {
    icon: <Search className="h-5 w-5" />,
    title: "Find Your Product",
    text: "Browse categories or use search to find exactly what you need.",
  },
  {
    icon: <Eye className="h-5 w-5" />,
    title: "Check Product Details",
    text: "Read the description, compare prices and check seller ratings and reviews.",
  },
  {
    icon: <ShoppingCart className="h-5 w-5" />,
    title: "Add to Cart",
    text: "Add products to your cart — you can keep shopping or checkout right away.",
  },
  {
    icon: <CreditCard className="h-5 w-5" />,
    title: "Checkout",
    text: "Review your order, apply coupons, and confirm the items in your cart.",
  },
  {
    icon: <MapPin className="h-5 w-5" />,
    title: "Enter Delivery Information",
    text: "Choose a saved address or add a new one with your district and phone number.",
  },
  {
    icon: <Wallet className="h-5 w-5" />,
    title: "Choose Payment Method",
    text: "Pay online, with wallet balance, or choose cash on delivery if available.",
  },
  {
    icon: <PackageCheck className="h-5 w-5" />,
    title: "Place Order",
    text: "Confirm your order — you'll get an order ID and tracking number.",
  },
  {
    icon: <Truck className="h-5 w-5" />,
    title: "Track Your Order",
    text: "Follow your order in real time from packing to out for delivery.",
  },
  {
    icon: <Home className="h-5 w-5" />,
    title: "Receive Your Product",
    text: "Check the package on delivery, then enjoy — and rate your experience!",
  },
];

function HowToBuyPage() {
  return (
    <PublicInfoLayout title="How to Buy" subtitle="Shopping on Aventa Shop in easy steps">
      <InfoCard className="mb-4">
        <InfoHeading>From Sign Up to Delivery</InfoHeading>
        <p className="text-sm leading-relaxed text-slate-600">
          New to online shopping? No problem. Here's the complete journey — from creating your
          account to receiving your product at your door.
        </p>
      </InfoCard>

      {/* Steps */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        {STEPS.map((s, i) => (
          <div
            key={s.title}
            className="flex items-start gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm"
          >
            <div className="relative shrink-0">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-orange-50 text-orange-500">
                {s.icon}
              </span>
              <span className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-orange-500 text-[10px] font-bold text-white">
                {i + 1}
              </span>
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-800">{s.title}</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{s.text}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Help CTAs */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          to="/help-center"
          className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm font-bold text-slate-700 shadow-sm transition hover:border-orange-300 hover:text-orange-600"
        >
          <HelpCircle className="h-5 w-5" /> Visit Help Center
        </Link>
        <Link
          to="/contact-us"
          className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm font-bold text-slate-700 shadow-sm transition hover:border-orange-300 hover:text-orange-600"
        >
          <Mail className="h-5 w-5" /> Contact Support
        </Link>
      </div>

      <Link
        to="/shop"
        className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-orange-500 px-6 py-4 text-sm font-bold text-white shadow-sm transition hover:bg-orange-600 active:scale-[0.98]"
      >
        Ready to Shop <ArrowRight className="h-4 w-4" />
      </Link>
    </PublicInfoLayout>
  );
}
