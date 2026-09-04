import { createFileRoute, Link } from "@tanstack/react-router";
import {
  RotateCcw,
  CheckCircle2,
  XCircle,
  Package,
  Truck,
  Search,
  Wallet,
  Store,
  HelpCircle,
  ClipboardCheck,
} from "lucide-react";
import { PublicInfoLayout, InfoCard, InfoHeading } from "@/components/common/PublicInfoLayout";

export const Route = createFileRoute("/returns-refunds")({
  ssr: false,
  component: ReturnsRefundsPage,
  head: () => ({
    meta: [
      { title: "Returns & Refunds — Aventa Shop" },
      {
        name: "description",
        content: "Aventa Shop return policy, return process and refund information.",
      },
    ],
  }),
});

const PROCESS = [
  {
    icon: <RotateCcw className="h-5 w-5" />,
    label: "Request",
    text: "Open your order and request a return",
  },
  {
    icon: <ClipboardCheck className="h-5 w-5" />,
    label: "Review",
    text: "Our team reviews your request",
  },
  {
    icon: <Truck className="h-5 w-5" />,
    label: "Pickup / Drop-off",
    text: "We arrange pickup or a drop-off point",
  },
  {
    icon: <Search className="h-5 w-5" />,
    label: "Inspection",
    text: "The returned product is inspected",
  },
  { icon: <Wallet className="h-5 w-5" />, label: "Refund", text: "Your refund is issued" },
];

const STEPS = [
  "Login to your account",
  "Open My Orders and select the order",
  "Tap 'Request Return'",
  "Select a reason and describe the issue",
  "Submit — we'll take it from there",
];

function ReturnsRefundsPage() {
  return (
    <PublicInfoLayout
      title="Returns & Refunds"
      subtitle="Our policy, process and refund information"
    >
      {/* Policy */}
      <InfoCard className="mb-4">
        <InfoHeading icon={<RotateCcw className="h-5 w-5 text-orange-500" />}>
          Return Policy
        </InfoHeading>
        <p className="text-sm leading-relaxed text-slate-600">
          We want you to be happy with every purchase. If something isn't right, you can request a
          return from your account after delivery.
        </p>

        <h3 className="mt-4 flex items-center gap-2 text-sm font-bold text-slate-800">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Eligible for Return
        </h3>
        <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
          <li>• Products delivered damaged, defective or not as described</li>
          <li>• Wrong item received</li>
          <li>• Quality issues with the delivered product</li>
        </ul>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">
          Return requests should be submitted soon after delivery — while the product is unused,
          with tags and original packaging where applicable.
        </p>

        <h3 className="mt-4 flex items-center gap-2 text-sm font-bold text-slate-800">
          <XCircle className="h-4 w-4 text-rose-500" /> Not Eligible
        </h3>
        <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
          <li>• Products damaged after delivery by the customer</li>
          <li>• Items missing original packaging, accessories or free gifts</li>
          <li>• Hygiene-sensitive items that have been opened or used</li>
        </ul>
      </InfoCard>

      {/* How to Request */}
      <InfoCard className="mb-4">
        <InfoHeading icon={<Package className="h-5 w-5 text-orange-500" />}>
          How to Request a Return
        </InfoHeading>
        <ol className="space-y-2.5">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-orange-500 text-xs font-bold text-white">
                {i + 1}
              </span>
              <span className="text-sm text-slate-700">{s}</span>
            </li>
          ))}
        </ol>
        <Link
          to="/returns"
          className="mt-4 inline-block rounded-xl bg-orange-500 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-orange-600"
        >
          Open My Returns
        </Link>
      </InfoCard>

      {/* Process flow */}
      <InfoCard className="mb-4">
        <InfoHeading>Return Process</InfoHeading>
        <div className="grid gap-3 sm:grid-cols-5">
          {PROCESS.map((p, i) => (
            <div key={p.label} className="rounded-xl bg-slate-50 p-4 text-center">
              <div className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-orange-50 text-orange-500">
                {p.icon}
              </div>
              <p className="text-xs font-bold text-slate-800">
                {i + 1}. {p.label}
              </p>
              <p className="mt-1 text-[11px] leading-snug text-slate-500">{p.text}</p>
            </div>
          ))}
        </div>
      </InfoCard>

      {/* Refund info */}
      <InfoCard className="mb-4">
        <InfoHeading icon={<Wallet className="h-5 w-5 text-orange-500" />}>
          Refund Information
        </InfoHeading>
        <div className="space-y-2.5 text-sm text-slate-600">
          <p>
            Approved refunds are credited to your Aventa Shop wallet balance, which you can use for
            future purchases or withdraw.
          </p>
          <p>Refund processing starts after the returned product passes inspection.</p>
          <p>
            If a refund fails to reach you, our support team will work with you until it's resolved
            — you keep your order and refund records in your account as proof.
          </p>
        </div>
      </InfoCard>

      {/* Seller-specific */}
      <InfoCard className="mb-4">
        <InfoHeading icon={<Store className="h-5 w-5 text-orange-500" />}>For Sellers</InfoHeading>
        <p className="text-sm leading-relaxed text-slate-600">
          Sellers are notified when a return is requested on their order. Keep product listings
          honest and accurate — items delivered not-as-described are the most common reason for
          approved returns, and repeated issues can affect your seller standing.
        </p>
      </InfoCard>

      {/* FAQ hint + CTA */}
      <Link
        to="/help-center"
        className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm font-bold text-slate-700 shadow-sm transition hover:border-orange-300 hover:text-orange-600"
      >
        <HelpCircle className="h-5 w-5" /> More Questions? Help Center
      </Link>
    </PublicInfoLayout>
  );
}
