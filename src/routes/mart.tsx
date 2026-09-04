import { createFileRoute, Link } from "@tanstack/react-router";
import { ShoppingBag, Sparkles, ArrowRight, Zap, Star, Store } from "lucide-react";
import { PublicInfoLayout, InfoCard, InfoHeading } from "@/components/common/PublicInfoLayout";

export const Route = createFileRoute("/mart")({
  ssr: false,
  component: MartPage,
  head: () => ({
    meta: [
      { title: "Aventa Shop Mart — Curated Essentials" },
      {
        name: "description",
        content:
          "Aventa Shop Mart — hand-picked everyday essentials, best sellers and deals across the marketplace.",
      },
    ],
  }),
});

const MART_SECTIONS = [
  {
    icon: <Sparkles className="h-6 w-6 text-orange-500" />,
    title: "New Arrivals",
    text: "Fresh products added to the marketplace every week.",
    to: "/shop",
    params: {},
  },
  {
    icon: <Star className="h-6 w-6 text-orange-500" />,
    title: "Best Sellers",
    text: "The products customers keep coming back for.",
    to: "/shop",
    params: {},
  },
  {
    icon: <Zap className="h-6 w-6 text-orange-500" />,
    title: "Deals",
    text: "Limited-time offers and flash sale picks.",
    to: "/flash-sales",
    params: {},
  },
];

function MartPage() {
  return (
    <PublicInfoLayout title="Aventa Shop Mart" subtitle="Curated picks for everyday life">
      {/* Hero */}
      <InfoCard className="mb-4 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
        <div className="flex flex-col items-start gap-4">
          <span className="rounded-full bg-orange-500/20 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-orange-300">
            Curated Store
          </span>
          <h2 className="text-xl font-bold sm:text-2xl">Hand-picked products, marketplace trust</h2>
          <p className="text-sm leading-relaxed text-white/80">
            Aventa Shop Mart brings together the best of the marketplace — everyday essentials,
            popular picks and great deals, all in one curated section. Every Mart product is sold
            and shipped by verified sellers with full order tracking and buyer protection.
          </p>
          <Link
            to="/shop"
            className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-6 py-3 text-sm font-bold text-white transition hover:bg-orange-600 active:scale-[0.98]"
          >
            <ShoppingBag className="h-4 w-4" /> Shop Mart Picks
          </Link>
        </div>
      </InfoCard>

      {/* Sections */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {MART_SECTIONS.map((s) => (
          <Link
            key={s.title}
            to={s.to}
            className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:border-orange-200 hover:shadow-md"
          >
            <div className="mb-3">{s.icon}</div>
            <h3 className="text-sm font-bold text-slate-800">{s.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{s.text}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-orange-500">
              Browse <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        ))}
      </div>

      {/* What makes it Mart */}
      <InfoCard className="mb-4">
        <InfoHeading icon={<Store className="h-5 w-5 text-orange-500" />}>
          What is Aventa Shop Mart?
        </InfoHeading>
        <p className="text-sm leading-relaxed text-slate-600">
          The main marketplace lists products from every verified seller. Mart is our curated layer
          on top — a selection focused on everyday essentials: grocery and home goods, personal
          care, and dependable best sellers. No confusion, just good products you can trust, backed
          by the same secure checkout, delivery tracking and return policy as the rest of Aventa
          Shop.
        </p>
      </InfoCard>

      {/* CTA */}
      <Link
        to="/shop"
        className="flex items-center justify-center gap-2 rounded-2xl bg-orange-500 px-6 py-4 text-sm font-bold text-white shadow-sm transition hover:bg-orange-600 active:scale-[0.98]"
      >
        <ShoppingBag className="h-5 w-5" /> Browse All Products
      </Link>
    </PublicInfoLayout>
  );
}
