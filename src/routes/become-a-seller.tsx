import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Store,
  Users,
  LayoutDashboard,
  Package,
  ShoppingBag,
  Wallet,
  ClipboardCheck,
  ShieldCheck,
  Percent,
  HelpCircle,
  ArrowRight,
} from "lucide-react";
import { PublicInfoLayout, InfoCard, InfoHeading } from "@/components/common/PublicInfoLayout";

export const Route = createFileRoute("/become-a-seller")({
  ssr: false,
  component: BecomeASellerPage,
  head: () => ({
    meta: [
      { title: "Become a Seller — Aventa Shop" },
      {
        name: "description",
        content:
          "Start selling on Aventa Shop — reach more customers, manage products and orders, and grow your business.",
      },
    ],
  }),
});

const BENEFITS = [
  {
    icon: <Users className="h-6 w-6 text-orange-500" />,
    title: "Reach More Customers",
    text: "Put your products in front of thousands of shoppers across Bangladesh.",
  },
  {
    icon: <LayoutDashboard className="h-6 w-6 text-orange-500" />,
    title: "Seller Dashboard",
    text: "Manage everything from one place — products, orders, analytics and settings.",
  },
  {
    icon: <Package className="h-6 w-6 text-orange-500" />,
    title: "Product Management",
    text: "Add products with photos, pricing and stock — edit anytime.",
  },
  {
    icon: <ShoppingBag className="h-6 w-6 text-orange-500" />,
    title: "Order Management",
    text: "Get order alerts, update order status, and keep customers informed.",
  },
  {
    icon: <Wallet className="h-6 w-6 text-orange-500" />,
    title: "Seller Earnings",
    text: "Track your sales and request withdrawals from your settlements dashboard.",
  },
];

const HOW_IT_WORKS = [
  {
    icon: <ClipboardCheck className="h-5 w-5" />,
    label: "Register",
    text: "Create an account and apply as a seller",
  },
  {
    icon: <HelpCircle className="h-5 w-5" />,
    label: "Submit Information",
    text: "Provide your business details",
  },
  {
    icon: <ShieldCheck className="h-5 w-5" />,
    label: "Verification",
    text: "Our team verifies your business",
  },
  {
    icon: <Package className="h-5 w-5" />,
    label: "Add Products",
    text: "List your products with photos & prices",
  },
  {
    icon: <ShoppingBag className="h-5 w-5" />,
    label: "Receive Orders",
    text: "Customers start ordering your products",
  },
  {
    icon: <ArrowRight className="h-5 w-5" />,
    label: "Ship Products",
    text: "Pack and ship — we help you manage delivery",
  },
  {
    icon: <Wallet className="h-5 w-5" />,
    label: "Receive Earnings",
    text: "Withdraw your earnings after the hold period",
  },
];

function BecomeASellerPage() {
  return (
    <PublicInfoLayout title="Sell on Aventa Shop" subtitle="Start selling on Aventa Shop">
      {/* Hero */}
      <InfoCard className="mb-4 bg-gradient-to-br from-orange-500 to-orange-600 text-white">
        <div className="flex flex-col items-start gap-4">
          <h2 className="text-xl font-bold sm:text-2xl">Start Selling on Aventa Shop</h2>
          <p className="text-sm leading-relaxed text-white/85">
            No website needed. Register your business, list your products, and start receiving
            orders from customers all over the country — with full support from our platform.
          </p>
          <Link
            to="/seller/register"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-orange-600 transition hover:bg-orange-50 active:scale-[0.98]"
          >
            <Store className="h-4 w-4" /> Become a Seller
          </Link>
        </div>
      </InfoCard>

      {/* Why sell with us */}
      <InfoCard className="mb-4">
        <InfoHeading>Why Sell With Us?</InfoHeading>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((b) => (
            <div key={b.title} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <div className="mb-2">{b.icon}</div>
              <h3 className="text-sm font-semibold text-slate-800">{b.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{b.text}</p>
            </div>
          ))}
        </div>
      </InfoCard>

      {/* How selling works */}
      <InfoCard className="mb-4">
        <InfoHeading>How Selling Works</InfoHeading>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS.map((s, i) => (
            <div key={s.label} className="flex items-start gap-3 rounded-xl bg-slate-50 p-4">
              <span className="relative shrink-0">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-orange-50 text-orange-500">
                  {s.icon}
                </span>
                <span className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-orange-500 text-[10px] font-bold text-white">
                  {i + 1}
                </span>
              </span>
              <div>
                <h3 className="text-xs font-bold text-slate-800">{s.label}</h3>
                <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{s.text}</p>
              </div>
            </div>
          ))}
        </div>
      </InfoCard>

      {/* Requirements + Commission */}
      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <InfoCard>
          <InfoHeading icon={<ClipboardCheck className="h-5 w-5 text-orange-500" />}>
            Seller Requirements
          </InfoHeading>
          <ul className="space-y-1.5 text-sm text-slate-600">
            <li>• A Aventa Shop customer account</li>
            <li>• Your business name and contact details</li>
            <li>• Valid identity and business information for verification</li>
            <li>• Products you can reliably stock and ship</li>
          </ul>
        </InfoCard>
        <InfoCard>
          <InfoHeading icon={<Percent className="h-5 w-5 text-orange-500" />}>
            Commission Overview
          </InfoHeading>
          <p className="text-sm leading-relaxed text-slate-600">
            Aventa Shop charges a commission on each completed sale to run the platform — rates are
            category-based and shared with you during registration. There are no monthly fees to
            list your products.
          </p>
        </InfoCard>
      </div>

      {/* FAQ */}
      <InfoCard className="mb-4">
        <InfoHeading>Seller FAQ</InfoHeading>
        <div className="space-y-3">
          {[
            {
              q: "Is it free to join?",
              a: "Yes — registering and listing products is free. We only earn when you make a sale.",
            },
            {
              q: "When do I get paid?",
              a: "Your earnings accumulate in your settlements dashboard. After the standard hold period, you can request a withdrawal and our team processes it.",
            },
            {
              q: "Who handles delivery?",
              a: "Orders are managed through our delivery partners — you pack the product, and we take care of getting it to the customer.",
            },
          ].map((f) => (
            <div key={f.q} className="rounded-xl bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-800">{f.q}</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{f.a}</p>
            </div>
          ))}
        </div>
      </InfoCard>

      {/* CTAs */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          to="/seller/register"
          className="flex items-center justify-center gap-2 rounded-2xl bg-orange-500 px-6 py-4 text-sm font-bold text-white shadow-sm transition hover:bg-orange-600 active:scale-[0.98]"
        >
          <Store className="h-5 w-5" /> Become a Seller
        </Link>
        <Link
          to="/login"
          className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm font-bold text-slate-700 shadow-sm transition hover:border-orange-300 hover:text-orange-600"
        >
          Already a Seller? Login
        </Link>
      </div>
    </PublicInfoLayout>
  );
}
