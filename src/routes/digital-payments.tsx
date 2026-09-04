import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Banknote,
  Smartphone,
  CreditCard,
  Wallet,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  HelpCircle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { PublicInfoLayout, InfoCard, InfoHeading } from "@/components/common/PublicInfoLayout";

export const Route = createFileRoute("/digital-payments")({
  ssr: false,
  component: DigitalPaymentsPage,
  head: () => ({
    meta: [
      { title: "Digital Payments — Aventa Shop" },
      {
        name: "description",
        content: "Payment methods available on Aventa Shop, how to pay, and payment security.",
      },
    ],
  }),
});

const METHODS = [
  {
    icon: <Banknote className="h-6 w-6 text-orange-500" />,
    title: "Cash on Delivery",
    status: "Available",
    text: "Pay in cash when your order arrives at your door. Inspect first, pay after — the classic, trusted way to shop.",
  },
  {
    icon: <Smartphone className="h-6 w-6 text-orange-500" />,
    title: "Mobile Banking",
    status: "Available",
    text: "Pay with your mobile financial services account (bKash, Nagad, Rocket) during checkout.",
  },
  {
    icon: <CreditCard className="h-6 w-6 text-orange-500" />,
    title: "Credit / Debit Card",
    status: "Available",
    text: "Pay with Visa, Mastercard or other major cards — a convenient option for card holders.",
  },
  {
    icon: <Wallet className="h-6 w-6 text-orange-500" />,
    title: "Aventa Shop Wallet",
    status: "Available",
    text: "Use your wallet balance — from refunds or top-ups — to pay for orders, fully or partially.",
  },
  {
    icon: <Sparkles className="h-6 w-6 text-orange-500" />,
    title: "Reward Points",
    status: "Available",
    text: "Redeem reward points earned from your orders for instant discounts at checkout.",
  },
];

function DigitalPaymentsPage() {
  return (
    <PublicInfoLayout title="Digital Payments" subtitle="Pay the way that suits you">
      {/* Available methods */}
      <InfoCard className="mb-4">
        <InfoHeading icon={<CheckCircle2 className="h-5 w-5 text-orange-500" />}>
          Available Payment Methods
        </InfoHeading>
        <div className="grid gap-3 sm:grid-cols-2">
          {METHODS.map((m) => (
            <div key={m.title} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <div className="mb-2 flex items-center justify-between">
                {m.icon}
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600">
                  {m.status}
                </span>
              </div>
              <h3 className="text-sm font-bold text-slate-800">{m.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{m.text}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
          <Clock className="h-4 w-4 shrink-0" />
          <span>
            Automated online payment gateway integration is coming soon — currently online payments
            are confirmed by our team after checkout.
          </span>
        </div>
      </InfoCard>

      {/* How to pay */}
      <InfoCard className="mb-4">
        <InfoHeading>How to Pay</InfoHeading>
        <ol className="space-y-2.5 text-sm text-slate-600">
          <li className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-orange-500 text-[10px] font-bold text-white">
              1
            </span>
            Choose your products and proceed to checkout
          </li>
          <li className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-orange-500 text-[10px] font-bold text-white">
              2
            </span>
            Apply wallet balance, coupons or reward points if you have them
          </li>
          <li className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-orange-500 text-[10px] font-bold text-white">
              3
            </span>
            Select your payment method and confirm the order
          </li>
          <li className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-orange-500 text-[10px] font-bold text-white">
              4
            </span>
            For digital payments, follow the instructions shown after you place the order
          </li>
        </ol>
      </InfoCard>

      {/* Security */}
      <InfoCard className="mb-4">
        <InfoHeading icon={<ShieldCheck className="h-5 w-5 text-orange-500" />}>
          Payment Security
        </InfoHeading>
        <ul className="space-y-1.5 text-sm text-slate-600">
          <li>• All orders and payment records are processed through our secure platform</li>
          <li>
            • We never ask for your passwords, OTPs or PINs — anyone who does is not from Aventa
            Shop
          </li>
          <li>
            • Refunds for cancelled or returned orders are credited to your Aventa Shop wallet
          </li>
        </ul>
      </InfoCard>

      {/* Payment failed */}
      <InfoCard className="mb-4">
        <InfoHeading icon={<AlertCircle className="h-5 w-5 text-amber-500" />}>
          Payment Failed?
        </InfoHeading>
        <div className="space-y-2 text-sm text-slate-600">
          <p>
            If your payment fails or you're unsure whether it went through, don't worry — your money
            is safe.
          </p>
          <p>
            Check your order status in My Orders first. If the order was created, our team will
            confirm your payment. If it wasn't created, simply place the order again.
          </p>
          <p>
            For any payment dispute, contact support with your order ID and payment receipt — we'll
            resolve it for you.
          </p>
        </div>
      </InfoCard>

      {/* CTA */}
      <Link
        to="/contact-us"
        className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm font-bold text-slate-700 shadow-sm transition hover:border-orange-300 hover:text-orange-600"
      >
        <HelpCircle className="h-5 w-5" /> Payment Question? Contact Support
      </Link>
    </PublicInfoLayout>
  );
}
