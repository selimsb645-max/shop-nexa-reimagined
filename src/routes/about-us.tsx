import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Store,
  Target,
  Eye,
  ShoppingBag,
  Laptop,
  Home,
  Sparkles,
  ShieldCheck,
  Truck,
  Headphones,
  Users,
  ArrowRight,
} from "lucide-react";
import { PublicInfoLayout, InfoCard, InfoHeading } from "@/components/common/PublicInfoLayout";

export const Route = createFileRoute("/about-us")({
  ssr: false,
  component: AboutUsPage,
  head: () => ({
    meta: [
      { title: "About Us — Aventa Shop" },
      {
        name: "description",
        content:
          "Learn what Aventa Shop is, our mission, and the value we create for customers and sellers.",
      },
    ],
  }),
});

const VALUES = [
  {
    icon: <ShoppingBag className="h-6 w-6 text-orange-500" />,
    title: "Wide Product Selection",
    text: "Thousands of products across fashion, electronics, grocery and beauty — all in one marketplace.",
  },
  {
    icon: <Store className="h-6 w-6 text-orange-500" />,
    title: "Seller Marketplace",
    text: "Trusted local sellers list their products and grow their business on our platform.",
  },
  {
    icon: <ShieldCheck className="h-6 w-6 text-orange-500" />,
    title: "Secure Shopping",
    text: "Verified sellers, protected payments, and a fair return policy for every order.",
  },
  {
    icon: <Truck className="h-6 w-6 text-orange-500" />,
    title: "Order Tracking",
    text: "Follow your order in real time from the moment it is placed until it reaches your door.",
  },
  {
    icon: <Headphones className="h-6 w-6 text-orange-500" />,
    title: "Customer Support",
    text: "Our support team is ready to help you with orders, returns, payments and anything else.",
  },
  {
    icon: <Sparkles className="h-6 w-6 text-orange-500" />,
    title: "Rewards & Savings",
    text: "Earn reward points, use coupons and wallet balance to save on every purchase.",
  },
];

function AboutUsPage() {
  return (
    <PublicInfoLayout title="About Us" subtitle="Shop • Sell • Grow">
      {/* Who We Are */}
      <InfoCard className="mb-4">
        <InfoHeading icon={<Store className="h-5 w-5 text-orange-500" />}>Who We Are</InfoHeading>
        <p className="text-sm leading-relaxed text-slate-600">
          Aventa Shop is a multi-vendor e-commerce marketplace that brings customers and sellers
          together on one trusted platform. Instead of a single store, Aventa Shop hosts products
          from many verified sellers across Bangladesh — giving you a huge selection, competitive
          prices, and one convenient place to shop.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          For sellers, we provide the tools to open an online store, manage products and orders, and
          grow a business without building a website from scratch. For customers, we provide a
          secure shopping experience with real order tracking, protected payments and dedicated
          support.
        </p>
      </InfoCard>

      {/* Mission & Vision */}
      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <InfoCard>
          <InfoHeading icon={<Target className="h-5 w-5 text-orange-500" />}>
            Our Mission
          </InfoHeading>
          <p className="text-sm leading-relaxed text-slate-600">
            To make online shopping easy, safe and rewarding for every household in Bangladesh —
            while giving sellers of every size a fair platform to reach more customers.
          </p>
        </InfoCard>
        <InfoCard>
          <InfoHeading icon={<Eye className="h-5 w-5 text-orange-500" />}>Our Vision</InfoHeading>
          <p className="text-sm leading-relaxed text-slate-600">
            To become the most trusted online marketplace in the country — where anyone can find
            what they need, and any honest seller can build a sustainable business.
          </p>
        </InfoCard>
      </div>

      {/* What We Offer */}
      <InfoCard className="mb-4">
        <InfoHeading>What We Offer</InfoHeading>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            {
              icon: <ShoppingBag className="h-5 w-5 text-orange-500" />,
              label: "Fashion & Lifestyle",
            },
            {
              icon: <Laptop className="h-5 w-5 text-orange-500" />,
              label: "Electronics & Gadgets",
            },
            {
              icon: <Home className="h-5 w-5 text-orange-500" />,
              label: "Grocery & Home Essentials",
            },
            {
              icon: <Sparkles className="h-5 w-5 text-orange-500" />,
              label: "Beauty & Personal Care",
            },
          ].map((c) => (
            <div key={c.label} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
              {c.icon}
              <span className="text-sm font-medium text-slate-700">{c.label}</span>
            </div>
          ))}
        </div>
      </InfoCard>

      {/* Why Choose */}
      <InfoCard className="mb-4">
        <InfoHeading>Why Choose Aventa Shop</InfoHeading>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {VALUES.map((v) => (
            <div key={v.title} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <div className="mb-2">{v.icon}</div>
              <h3 className="text-sm font-semibold text-slate-800">{v.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{v.text}</p>
            </div>
          ))}
        </div>
      </InfoCard>

      {/* Marketplace Ecosystem */}
      <InfoCard className="mb-4">
        <InfoHeading icon={<Users className="h-5 w-5 text-orange-500" />}>
          Marketplace Ecosystem
        </InfoHeading>
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-4">
          <span className="rounded-xl bg-orange-50 px-5 py-3 text-sm font-semibold text-orange-600">
            Customer
          </span>
          <ArrowRight className="h-4 w-4 rotate-90 text-slate-400 sm:rotate-0" />
          <span className="rounded-xl bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-700">
            Aventa Shop
          </span>
          <ArrowRight className="h-4 w-4 rotate-90 text-slate-400 sm:rotate-0" />
          <span className="rounded-xl bg-blue-50 px-5 py-3 text-sm font-semibold text-blue-600">
            Seller
          </span>
        </div>
        <p className="mt-4 text-center text-xs leading-relaxed text-slate-500">
          Customers order through Aventa Shop. We verify sellers, process orders centrally, track
          every delivery, and make sure sellers are paid fairly for what they sell.
        </p>
      </InfoCard>

      {/* Commitment */}
      <InfoCard className="mb-4">
        <InfoHeading>Our Commitment</InfoHeading>
        <p className="text-sm leading-relaxed text-slate-600">
          Every order matters to us. We are committed to honest product listings, transparent
          pricing, on-time support responses, and a fair resolution process if something goes wrong.
          Your trust is what this marketplace is built on.
        </p>
      </InfoCard>

      {/* CTAs */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          to="/shop"
          className="flex items-center justify-center gap-2 rounded-2xl bg-orange-500 px-6 py-4 text-sm font-bold text-white shadow-sm transition hover:bg-orange-600 active:scale-[0.98]"
        >
          <ShoppingBag className="h-5 w-5" /> Start Shopping
        </Link>
        <Link
          to="/become-a-seller"
          className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm font-bold text-slate-700 shadow-sm transition hover:border-orange-300 hover:text-orange-600 active:scale-[0.98]"
        >
          <Store className="h-5 w-5" /> Become a Seller
        </Link>
      </div>
    </PublicInfoLayout>
  );
}
