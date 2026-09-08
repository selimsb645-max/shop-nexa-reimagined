import { createFileRoute, Link } from "@tanstack/react-router";
import { BackButton } from "@/components/common/BackButton";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import {
  Undo2,
  Clock,
  PackageCheck,
  XCircle,
  Truck,
  DollarSign,
  ArrowRight,
  Info,
  CheckCircle2,
} from "lucide-react";
import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/returns-policy")({
  ssr: true,
  component: ReturnsPolicyPage,
  head: () => ({
    ...seoHead({
      title: "Returns & Refunds Policy — AVENTA SHOP",
      description:
        "AVENTA SHOP return and refund policy — how to request a return, eligibility, timelines, and refund methods. Shop with confidence with our hassle-free returns.",
      path: "/returns-policy",
      type: "website",
    }),
  }),
});

const RETURN_STEPS = [
  {
    icon: <Undo2 className="h-6 w-6" />,
    title: "1. Submit a Return Request",
    description:
      "Go to your order history, select the order and item you want to return, choose a reason (damaged, wrong item, not as described, changed mind, quality issue, or other), and submit the request.",
  },
  {
    icon: <Clock className="h-6 w-6" />,
    title: "2. Await Approval",
    description:
      "Our team reviews your return request within 24 hours. You'll receive a notification once it's approved or if more information is needed.",
  },
  {
    icon: <Truck className="h-6 w-6" />,
    title: "3. Pickup or Drop-off",
    description:
      "Once approved, our delivery partner will pick up the item from your address. You'll get an SMS with the pickup date and time slot.",
  },
  {
    icon: <DollarSign className="h-6 w-6" />,
    title: "4. Refund Processed",
    description:
      "After the returned item passes quality inspection, your refund is processed to your original payment method or AVENTA SHOP wallet within 7-10 business days.",
  },
];

const ELIGIBLE = [
  "Electronics, fashion, home items, and most products can be returned within 7 days of delivery.",
  "Items must be in original condition with tags, accessories, and packaging intact.",
  "Wrong, damaged, or defective items can be returned free of charge.",
  "Products significantly not matching their description are eligible for full refund.",
];

const NOT_ELIGIBLE = [
  "Perishable goods (fresh food, groceries, and items with short shelf life).",
  "Innerwear, swimwear, and personal hygiene products for health and safety reasons.",
  "Products damaged by misuse, tampering, or improper handling by the customer.",
  "Digital products, gift cards, and vouchers once used or redeemed.",
];

const REFUND_METHODS = [
  {
    method: "Original Payment Method",
    time: "7-10 business days",
    note: "For card, mobile banking, and bank transfer payments.",
  },
  {
    method: "AVENTA SHOP Wallet",
    time: "1-2 business days",
    note: "Fastest option. Wallet refunds can be used immediately for new purchases.",
  },
  {
    method: "Bank Transfer",
    time: "7-10 business days",
    note: "For COD orders where the original payment was cash.",
  },
];

function ReturnsPolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <div className="mb-4">
          <BackButton fallbackTo="/" label="Back" />
        </div>

        {/* Hero */}
        <div className="mb-8 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 p-8 text-white">
          <h1 className="text-2xl font-bold">Returns & Refunds Policy</h1>
          <p className="mt-2 text-orange-50">
            We want you to love what you buy on AVENTA SHOP. If something isn't right, our return
            process makes it easy to get a replacement or your money back.
          </p>
        </div>

        {/* Quick Summary */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border bg-background p-4 text-center shadow-sm">
            <Clock className="mx-auto h-6 w-6 text-primary" />
            <p className="mt-2 text-lg font-bold text-foreground">7 Days</p>
            <p className="text-xs text-muted-foreground">Return Window</p>
          </div>
          <div className="rounded-2xl border bg-background p-4 text-center shadow-sm">
            <PackageCheck className="mx-auto h-6 w-6 text-primary" />
            <p className="mt-2 text-lg font-bold text-foreground">Free</p>
            <p className="text-xs text-muted-foreground">Pickup Service</p>
          </div>
          <div className="rounded-2xl border bg-background p-4 text-center shadow-sm">
            <DollarSign className="mx-auto h-6 w-6 text-primary" />
            <p className="mt-2 text-lg font-bold text-foreground">7-10 Days</p>
            <p className="text-xs text-muted-foreground">Refund Time</p>
          </div>
          <div className="rounded-2xl border bg-background p-4 text-center shadow-sm">
            <Undo2 className="mx-auto h-6 w-6 text-primary" />
            <p className="mt-2 text-lg font-bold text-foreground">Easy</p>
            <p className="text-xs text-muted-foreground">Online Process</p>
          </div>
        </div>

        {/* How to Return */}
        <h2 className="mb-4 text-xl font-bold text-foreground">How to Request a Return</h2>
        <div className="mb-8 space-y-4">
          {RETURN_STEPS.map((step, i) => (
            <div key={i} className="flex gap-4 rounded-2xl border bg-background p-5 shadow-sm">
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

        {/* Eligible / Not Eligible */}
        <div className="mb-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-green-100 bg-green-50 p-5">
            <div className="mb-3 flex items-center gap-2">
              <PackageCheck className="h-5 w-5 text-green-600" />
              <h3 className="text-base font-semibold text-foreground">Eligible for Return</h3>
            </div>
            <ul className="space-y-2">
              {ELIGIBLE.map((item, i) => (
                <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 mt-0.5" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-red-100 bg-red-50 p-5">
            <div className="mb-3 flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-600" />
              <h3 className="text-base font-semibold text-foreground">Not Eligible for Return</h3>
            </div>
            <ul className="space-y-2">
              {NOT_ELIGIBLE.map((item, i) => (
                <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                  <XCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Refund Methods */}
        <h2 className="mb-4 text-xl font-bold text-foreground">Refund Methods & Timelines</h2>
        <div className="mb-8 overflow-hidden rounded-2xl border bg-background shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="px-5 py-3 text-left font-semibold text-foreground">Refund Method</th>
                <th className="px-5 py-3 text-left font-semibold text-foreground">
                  Processing Time
                </th>
                <th className="px-5 py-3 text-left font-semibold text-foreground">Notes</th>
              </tr>
            </thead>
            <tbody>
              {REFUND_METHODS.map((row, i) => (
                <tr key={i} className={i < REFUND_METHODS.length - 1 ? "border-b" : ""}>
                  <td className="px-5 py-3 font-medium text-foreground">{row.method}</td>
                  <td className="px-5 py-3 text-primary">{row.time}</td>
                  <td className="px-5 py-3 text-muted-foreground">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Important Notes */}
        <div className="mb-8 rounded-2xl border border-blue-100 bg-blue-50 p-5">
          <div className="mb-3 flex items-center gap-2">
            <Info className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-foreground">Important Notes</h2>
          </div>
          <ol className="space-y-2 text-sm text-muted-foreground">
            <li>
              1. The 7-day return window starts from the date your order is marked "Delivered".
            </li>
            <li>
              2. For damaged or wrong items, contact support immediately at{" "}
              <a
                href="mailto:help.aventashop@gmail.com"
                className="text-primary underline underline-offset-2"
              >
                help.aventashop@gmail.com
              </a>{" "}
              with photos as evidence.
            </li>
            <li>
              3. Refunds to cards and mobile banking may take additional time depending on your bank
              or provider.
            </li>
            <li>
              4. Exchange is available for size or color variations in fashion items, subject to
              stock availability.
            </li>
            <li>
              5. AVENTA SHOP reserves the right to reject return requests that don't meet the
              eligibility criteria.
            </li>
          </ol>
        </div>

        {/* CTA — link to authenticated returns */}
        <div className="rounded-2xl bg-primary/5 p-6 text-center">
          <h2 className="text-lg font-semibold text-foreground">Need to return an item?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Log in to your account and start a return request from your order history.
          </p>
          <Link
            to="/returns"
            className="mt-4 inline-flex items-center gap-2 justify-center rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            Go to My Returns <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
