import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Share2,
  Link2,
  Users,
  Percent,
  BarChart3,
  Wallet,
  ShieldCheck,
  Handshake,
  ArrowRight,
  Rocket,
} from "lucide-react";
import { PublicInfoLayout, InfoCard, InfoHeading } from "@/components/common/PublicInfoLayout";

export const Route = createFileRoute("/affiliate")({
  ssr: false,
  component: AffiliatePage,
  head: () => ({
    meta: [
      { title: "Affiliate Program — Aventa Shop" },
      {
        name: "description",
        content: "Share Aventa Shop products and earn commission with the affiliate program.",
      },
    ],
  }),
});

const HOW_IT_WORKS = [
  {
    icon: <Handshake className="h-5 w-5" />,
    label: "Join",
    text: "Apply to the affiliate program",
  },
  {
    icon: <Link2 className="h-5 w-5" />,
    label: "Get Your Link",
    text: "Receive your unique affiliate link",
  },
  {
    icon: <Share2 className="h-5 w-5" />,
    label: "Share",
    text: "Share products with your audience",
  },
  {
    icon: <Users className="h-5 w-5" />,
    label: "Customers Purchase",
    text: "People shop through your link",
  },
  {
    icon: <Wallet className="h-5 w-5" />,
    label: "Earn Commission",
    text: "Get paid for qualifying sales",
  },
];

function AffiliatePage() {
  return (
    <PublicInfoLayout title="Affiliate Program" subtitle="Share Products. Earn Rewards.">
      {/* Hero */}
      <InfoCard className="mb-4 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
        <div className="flex flex-col items-start gap-4">
          <span className="rounded-full bg-orange-500/20 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-orange-300">
            Earn With Us
          </span>
          <h2 className="text-xl font-bold sm:text-2xl">Turn Your Audience Into Earnings</h2>
          <p className="text-sm leading-relaxed text-white/80">
            If you create content, run a community, or simply love recommending good products — the
            Aventa Shop Affiliate Program lets you earn commission on sales you refer.
          </p>
          <Link
            to="/contact-us"
            className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-6 py-3 text-sm font-bold text-white transition hover:bg-orange-600 active:scale-[0.98]"
          >
            <Rocket className="h-4 w-4" /> Join Affiliate Program
          </Link>
        </div>
      </InfoCard>

      {/* How it works */}
      <InfoCard className="mb-4">
        <InfoHeading icon={<BarChart3 className="h-5 w-5 text-orange-500" />}>
          How It Works
        </InfoHeading>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {HOW_IT_WORKS.map((s, i) => (
            <div key={s.label} className="rounded-xl bg-slate-50 p-4 text-center">
              <div className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-orange-50 text-orange-500">
                {s.icon}
              </div>
              <p className="text-xs font-bold text-slate-800">
                {i + 1}. {s.label}
              </p>
              <p className="mt-1 text-[11px] leading-snug text-slate-500">{s.text}</p>
            </div>
          ))}
        </div>
      </InfoCard>

      {/* Benefits */}
      <InfoCard className="mb-4">
        <InfoHeading>Benefits</InfoHeading>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            {
              icon: <Percent className="h-6 w-6 text-orange-500" />,
              title: "Commission on Sales",
              text: "Earn a percentage of qualifying purchases made through your links.",
            },
            {
              icon: <BarChart3 className="h-6 w-6 text-orange-500" />,
              title: "Performance Tracking",
              text: "See your clicks, orders and earnings in your affiliate dashboard.",
            },
            {
              icon: <Wallet className="h-6 w-6 text-orange-500" />,
              title: "Simple Payouts",
              text: "Request a payout once you reach the minimum payout amount.",
            },
          ].map((b) => (
            <div key={b.title} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <div className="mb-2">{b.icon}</div>
              <h3 className="text-sm font-semibold text-slate-800">{b.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{b.text}</p>
            </div>
          ))}
        </div>
      </InfoCard>

      {/* Rules & eligibility */}
      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <InfoCard>
          <InfoHeading icon={<Users className="h-5 w-5 text-orange-500" />}>
            Eligible Products
          </InfoHeading>
          <p className="text-sm leading-relaxed text-slate-600">
            Most marketplace products are eligible for affiliate commission. Commission rates vary
            by product category and are confirmed when your affiliate account is approved.
          </p>
        </InfoCard>
        <InfoCard>
          <InfoHeading icon={<ShieldCheck className="h-5 w-5 text-orange-500" />}>
            Affiliate Rules
          </InfoHeading>
          <ul className="space-y-1.5 text-sm text-slate-600">
            <li>• No spam or misleading claims about products</li>
            <li>• No fake orders or self-referrals to farm commission</li>
            <li>• Commission is paid on delivered, non-returned orders only</li>
            <li>• Violating the rules can end your affiliate account</li>
          </ul>
        </InfoCard>
      </div>

      {/* Status + CTA */}
      <InfoCard className="mb-4 border-dashed">
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-sm font-semibold text-slate-700">Affiliate Dashboard — Coming Soon</p>
          <p className="text-xs leading-relaxed text-slate-500">
            We're building a dedicated dashboard for tracking links, orders and payouts. For now,
            affiliates receive monthly performance reports by email.
          </p>
        </div>
      </InfoCard>

      <Link
        to="/contact-us"
        className="flex items-center justify-center gap-2 rounded-2xl bg-orange-500 px-6 py-4 text-sm font-bold text-white shadow-sm transition hover:bg-orange-600 active:scale-[0.98]"
      >
        Apply Now <ArrowRight className="h-4 w-4" />
      </Link>
    </PublicInfoLayout>
  );
}
