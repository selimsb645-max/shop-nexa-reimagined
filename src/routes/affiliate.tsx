import { createFileRoute, Link } from "@tanstack/react-router";
import { BackButton } from "@/components/common/BackButton";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import {
  Users,
  Share2,
  TrendingUp,
  Wallet,
  CheckCircle2,
  MousePointerClick,
  Gift,
} from "lucide-react";
import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/affiliate")({
  ssr: true,
  component: AffiliatePage,
  head: () => ({
    ...seoHead({
      title: "Affiliate Program — Earn Money with AVENTA SHOP",
      description: "Join the AVENTA SHOP Affiliate Program and earn commission by sharing products you love. Get your unique referral link, track clicks, and withdraw earnings via bKash or bank transfer.",
      path: "/affiliate",
      type: "website",
    }),
  }),
});

const HOW_IT_WORKS = [
  {
    icon: <Users className="h-6 w-6" />,
    title: "1. Sign Up",
    description:
      "Register for the AVENTA SHOP Affiliate Program with your account. It's free to join — no minimum follower count or website required.",
  },
  {
    icon: <Share2 className="h-6 w-6" />,
    title: "2. Share Your Link",
    description:
      "Get your unique affiliate referral link. Share it on Facebook, YouTube, Instagram, WhatsApp groups, blogs, or anywhere your audience is.",
  },
  {
    icon: <MousePointerClick className="h-6 w-6" />,
    title: "3. Earn Commissions",
    description:
      "When someone clicks your link and makes a purchase within 30 days, you earn a commission on the sale. Track everything from your dashboard.",
  },
  {
    icon: <Wallet className="h-6 w-6" />,
    title: "4. Withdraw Earnings",
    description:
      "Once you reach the ৳500 minimum withdrawal threshold, cash out via bKash, Nagad, or bank transfer. Payments are processed within 3-5 business days.",
  },
];

const BENEFITS = [
  { icon: <TrendingUp className="h-5 w-5" />, title: "Competitive Commissions", description: "Earn up to 10% commission on qualifying purchases, depending on the product category." },
  { icon: <Gift className="h-5 w-5" />, title: "Bonus Rewards", description: "Top-performing affiliates get exclusive bonus payouts and early access to promotions." },
  { icon: <CheckCircle2 className="h-5 w-5" />, title: "30-Day Cookie", description: "You get credit for any purchase made within 30 days of someone clicking your link." },
  { icon: <Wallet className="h-5 w-5" />, title: "Easy Withdrawals", description: "Cash out earnings via bKash, Nagad, or bank transfer once you reach ৳500." },
];

const COMMISSION_RATES = [
  { category: "Electronics & Gadgets", rate: "3% – 5%" },
  { category: "Fashion & Apparel", rate: "6% – 8%" },
  { category: "Beauty & Personal Care", rate: "8% – 10%" },
  { category: "Home & Kitchen", rate: "5% – 7%" },
  { category: "Groceries & Essentials", rate: "4% – 6%" },
  { category: "Other Categories", rate: "5% – 10%" },
];

function AffiliatePage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <div className="mb-4">
          <BackButton fallbackTo="/" label="Back" />
        </div>

        {/* Hero */}
        <div className="mb-8 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 p-8 text-white">
          <h1 className="text-2xl font-bold">AVENTA SHOP Affiliate Program</h1>
          <p className="mt-2 text-orange-50">
            Turn your influence into income. Share products you love with your audience and earn
            commissions on every qualifying sale. Free to join, easy to start.
          </p>
        </div>

        {/* How It Works */}
        <h2 className="mb-4 text-xl font-bold text-foreground">How It Works</h2>
        <div className="mb-8 space-y-4">
          {HOW_IT_WORKS.map((step, i) => (
            <div
              key={i}
              className="flex gap-4 rounded-2xl border bg-background p-5 shadow-sm"
            >
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                {step.icon}
              </span>
              <div>
                <h3 className="text-base font-semibold text-foreground">{step.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Commission Rates */}
        <h2 className="mb-4 text-xl font-bold text-foreground">Commission Rates by Category</h2>
        <div className="mb-8 overflow-hidden rounded-2xl border bg-background shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="px-5 py-3 text-left font-semibold text-foreground">Product Category</th>
                <th className="px-5 py-3 text-right font-semibold text-foreground">Commission Rate</th>
              </tr>
            </thead>
            <tbody>
              {COMMISSION_RATES.map((row, i) => (
                <tr key={i} className={i < COMMISSION_RATES.length - 1 ? "border-b" : ""}>
                  <td className="px-5 py-3 text-muted-foreground">{row.category}</td>
                  <td className="px-5 py-3 text-right font-medium text-primary">{row.rate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Benefits */}
        <h2 className="mb-4 text-xl font-bold text-foreground">Why Join?</h2>
        <div className="mb-8 grid gap-4 sm:grid-cols-2">
          {BENEFITS.map((benefit, i) => (
            <div key={i} className="flex gap-3 rounded-2xl border bg-background p-5 shadow-sm">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-green-50 text-green-600">
                {benefit.icon}
              </span>
              <div>
                <h3 className="text-sm font-semibold text-foreground">{benefit.title}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{benefit.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Rules */}
        <div className="mb-8 rounded-2xl border border-blue-100 bg-blue-50 p-5">
          <h2 className="mb-3 text-lg font-semibold text-foreground">Program Rules</h2>
          <ol className="space-y-2 text-sm text-muted-foreground">
            <li>1. Commissions apply only to completed (delivered and not returned) orders.</li>
            <li>2. Self-referrals are not allowed — you cannot earn commission on your own purchases.</li>
            <li>3. Minimum withdrawal amount is ৳500. Payments processed within 3-5 business days.</li>
            <li>4. Cookie duration is 30 days from the first click.</li>
            <li>5. AVENTA SHOP reserves the right to suspend accounts engaging in fraudulent or spammy referral practices.</li>
            <li>6. Commission rates may change — current rates are always visible in your affiliate dashboard.</li>
          </ol>
        </div>

        {/* CTA */}
        <div className="rounded-2xl bg-primary/5 p-6 text-center">
          <h2 className="text-lg font-semibold text-foreground">Ready to start earning?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Join the affiliate program today — it's free and takes 2 minutes.
          </p>
          <Link
            to="/register"
            className="mt-4 inline-flex items-center justify-center rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            Become an Affiliate
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
