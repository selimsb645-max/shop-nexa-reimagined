import { createFileRoute, Link } from "@tanstack/react-router";
import { BackButton } from "@/components/common/BackButton";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import {
  CreditCard,
  Smartphone,
  Wallet,
  Landmark,
  ShieldCheck,
  CheckCircle2,
  Info,
} from "lucide-react";
import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/digital-payments")({
  ssr: true,
  component: DigitalPaymentsPage,
  head: () => ({
    ...seoHead({
      title: "Digital Payment Methods — AVENTA SHOP Secure Payments",
      description: "Pay your way on AVENTA SHOP — Cash on Delivery, bKash, Nagad, Rocket, credit/debit cards, and bank transfers. Secure, fast, and trusted payment options.",
      path: "/digital-payments",
      type: "website",
    }),
  }),
});

const PAYMENT_METHODS = [
  {
    icon: <Smartphone className="h-6 w-6" />,
    title: "Mobile Banking (bKash, Nagad, Rocket)",
    description:
      "Pay instantly using bKash, Nagad, or Rocket. Enter your mobile number at checkout, confirm the OTP sent to your phone, and your payment is processed in seconds. No cash handling required.",
    badge: "Most Popular",
  },
  {
    icon: <CreditCard className="h-6 w-6" />,
    title: "Credit / Debit Card",
    description:
      "Visa, Mastercard, and local bank cards are accepted. Your card details are processed through SSL-encrypted, PCI-DSS compliant payment gateways. We never store your card number on our servers.",
    badge: "Secure",
  },
  {
    icon: <Wallet className="h-6 w-6" />,
    title: "AVENTA SHOP Wallet",
    description:
      "Use your AVENTA SHOP wallet balance for instant checkout. Top up your wallet via bKash, Nagad, or bank transfer. Wallet payments are processed immediately with no extra charge.",
    badge: "Instant",
  },
  {
    icon: <Landmark className="h-6 w-6" />,
    title: "Bank Transfer",
    description:
      "Transfer the order amount to our designated bank account and share the transaction reference number with our support team. Your order is confirmed once the payment is verified (usually within 1-2 business hours).",
    badge: null,
  },
  {
    icon: <Wallet className="h-6 w-6" />,
    title: "Cash on Delivery (COD)",
    description:
      "Pay in cash when your order arrives at your doorstep. Available for orders up to ৳30,000. No advance payment needed. A small COD fee of ৳30 may apply for orders below ৳500.",
    badge: "COD",
  },
];

const SECURITY_FEATURES = [
  {
    icon: <ShieldCheck className="h-5 w-5" />,
    title: "SSL/TLS Encryption",
    description: "All payment transactions are encrypted with 256-bit SSL/TLS technology.",
  },
  {
    icon: <ShieldCheck className="h-5 w-5" />,
    title: "PCI-DSS Compliant",
    description: "Our payment partners are PCI-DSS Level 1 certified — the highest security standard.",
  },
  {
    icon: <CheckCircle2 className="h-5 w-5" />,
    title: "No Card Storage",
    description: "We never store your card number, CVV, or PIN on our servers. Payments are processed directly by certified payment gateways.",
  },
  {
    icon: <ShieldCheck className="h-5 w-5" />,
    title: "Fraud Protection",
    description: "Every transaction is monitored by automated fraud detection systems. Suspicious activity is flagged and blocked automatically.",
  },
];

function DigitalPaymentsPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <div className="mb-4">
          <BackButton fallbackTo="/" label="Back" />
        </div>

        {/* Hero */}
        <div className="mb-8 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 p-8 text-white">
          <h1 className="text-2xl font-bold">Digital Payments on AVENTA SHOP</h1>
          <p className="mt-2 text-orange-50">
            Choose from multiple secure payment methods at checkout. Whether you prefer mobile
            banking, cards, wallet, or cash on delivery — we've made paying simple and safe.
          </p>
        </div>

        {/* Payment Methods */}
        <h2 className="mb-4 text-xl font-bold text-foreground">Available Payment Methods</h2>
        <div className="mb-8 space-y-4">
          {PAYMENT_METHODS.map((method, i) => (
            <div
              key={i}
              className="flex gap-4 rounded-2xl border bg-background p-5 shadow-sm"
            >
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                {method.icon}
              </span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-foreground">{method.title}</h3>
                  {method.badge && (
                    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                      {method.badge}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{method.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Security */}
        <h2 className="mb-4 text-xl font-bold text-foreground">Payment Security</h2>
        <div className="mb-8 grid gap-4 sm:grid-cols-2">
          {SECURITY_FEATURES.map((feature, i) => (
            <div key={i} className="flex gap-3 rounded-2xl border bg-background p-5 shadow-sm">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-green-50 text-green-600">
                {feature.icon}
              </span>
              <div>
                <h3 className="text-sm font-semibold text-foreground">{feature.title}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Important Notes */}
        <div className="mb-8 rounded-2xl border border-blue-100 bg-blue-50 p-5">
          <div className="mb-3 flex items-center gap-2">
            <Info className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-foreground">Important Notes</h2>
          </div>
          <ol className="space-y-2 text-sm text-muted-foreground">
            <li>1. For mobile banking, make sure your account has sufficient balance before confirming payment.</li>
            <li>2. Keep your payment confirmation SMS or transaction reference for your records.</li>
            <li>3. Refunds for digital payments are processed to the original payment method within 7-10 business days.</li>
            <li>4. Wallet top-ups are non-refundable but can be used for any purchase on AVENTA SHOP.</li>
            <li>5. COD orders below ৳500 may incur a ৳30 cash handling fee.</li>
          </ol>
        </div>

        {/* FAQ */}
        <h2 className="mb-4 text-xl font-bold text-foreground">Frequently Asked Questions</h2>
        <div className="mb-8 space-y-2">
          {[
            {
              q: "Is it safe to use my card on AVENTA SHOP?",
              a: "Yes. Your card details are processed through SSL-encrypted, PCI-DSS certified payment gateways. We never store your card number, CVV, or PIN.",
            },
            {
              q: "What should I do if my mobile banking payment fails?",
              a: "If the amount is deducted but the order shows unpaid, wait 5-10 minutes for auto-verification. If it still shows unpaid, contact support with your transaction ID and we'll resolve it within 24 hours.",
            },
            {
              q: "Can I pay with someone else's mobile banking account?",
              a: "Yes, you can use any bKash, Nagad, or Rocket account to pay. Just enter the mobile number at checkout and confirm the OTP sent to that number.",
            },
            {
              q: "How do I top up my AVENTA SHOP wallet?",
              a: "Go to your account > Wallet > Top Up. Choose bKash, Nagad, or bank transfer, enter the amount, and follow the instructions.",
            },
            {
              q: "Is there any extra charge for using digital payment?",
              a: "No. There are no extra charges for using bKash, Nagad, Rocket, card, or wallet payments. Only COD orders below ৳500 have a ৳30 fee.",
            },
          ].map((faq, i) => (
            <details key={i} className="group rounded-xl border bg-background p-4 shadow-sm">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">
                {faq.q}
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">{faq.a}</p>
            </details>
          ))}
        </div>

        {/* CTA */}
        <div className="rounded-2xl bg-primary/5 p-6 text-center">
          <h2 className="text-lg font-semibold text-foreground">Ready to shop?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse thousands of products and pay your way.
          </p>
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
