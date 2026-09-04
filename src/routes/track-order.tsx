import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
  Search,
  Package,
  CheckCircle2,
  PackageCheck,
  Truck,
  Bike,
  Home,
  User,
  HelpCircle,
} from "lucide-react";
import { PublicInfoLayout, InfoCard, InfoHeading } from "@/components/common/PublicInfoLayout";
import { useAuth } from "@/context/AuthContext";

export const Route = createFileRoute("/track-order")({
  ssr: false,
  component: TrackOrderPage,
  head: () => ({
    meta: [
      { title: "Track Order — Aventa Shop" },
      {
        name: "description",
        content: "Track your Aventa Shop order status in real time using your tracking ID.",
      },
    ],
  }),
});

const FLOW = [
  { icon: <Package className="h-4 w-4" />, label: "Placed" },
  { icon: <CheckCircle2 className="h-4 w-4" />, label: "Confirmed" },
  { icon: <PackageCheck className="h-4 w-4" />, label: "Processing" },
  { icon: <Truck className="h-4 w-4" />, label: "Shipped" },
  { icon: <Bike className="h-4 w-4" />, label: "Out for Delivery" },
  { icon: <Home className="h-4 w-4" />, label: "Delivered" },
];

function TrackOrderPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [trackingId, setTrackingId] = useState("");

  const handleTrack = (e: React.FormEvent) => {
    e.preventDefault();
    const id = trackingId.trim();
    if (!id) {
      toast.error("Please enter your tracking or order ID.");
      return;
    }
    navigate({ to: "/track/$trackingId", params: { trackingId: id } });
  };

  return (
    <PublicInfoLayout title="Track Order" subtitle="Know exactly where your package is">
      {/* Track form */}
      <InfoCard className="mb-4">
        <InfoHeading icon={<Search className="h-5 w-5 text-orange-500" />}>
          Track Your Order
        </InfoHeading>
        <form onSubmit={handleTrack} className="flex flex-col gap-3 sm:flex-row">
          <input
            value={trackingId}
            onChange={(e) => setTrackingId(e.target.value)}
            placeholder="Enter your tracking ID or order ID"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
          />
          <button
            type="submit"
            className="shrink-0 rounded-xl bg-orange-500 px-6 py-3 text-sm font-bold text-white transition hover:bg-orange-600 active:scale-[0.98]"
          >
            Track Order
          </button>
        </form>
        <p className="mt-3 text-xs text-slate-400">
          Your tracking ID is included in your order confirmation. It usually looks like "SNX-...".
        </p>

        {!user && (
          <div className="mt-4 rounded-xl bg-slate-50 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <User className="h-4 w-4 text-orange-500" /> Have an Account?
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Sign in to see all your orders and their live status in one place.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                to="/login"
                className="rounded-lg bg-orange-500 px-5 py-2 text-xs font-bold text-white transition hover:bg-orange-600"
              >
                Login to Your Account
              </Link>
              <Link
                to="/track-orders"
                className="rounded-lg border border-slate-200 bg-white px-5 py-2 text-xs font-bold text-slate-700 transition hover:border-orange-300"
              >
                View My Orders
              </Link>
            </div>
          </div>
        )}
      </InfoCard>

      {/* Order flow */}
      <InfoCard className="mb-4">
        <InfoHeading>Order Status Journey</InfoHeading>
        <div className="flex flex-wrap items-center gap-2">
          {FLOW.map((f, i) => (
            <div key={f.label} className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
                <span className="text-orange-500">{f.icon}</span> {f.label}
              </span>
              {i < FLOW.length - 1 && <span className="text-slate-300">→</span>}
            </div>
          ))}
        </div>
      </InfoCard>

      {/* Help */}
      <Link
        to="/help-center"
        className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm font-bold text-slate-700 shadow-sm transition hover:border-orange-300 hover:text-orange-600"
      >
        <HelpCircle className="h-5 w-5" /> Trouble Tracking? Get Help
      </Link>
    </PublicInfoLayout>
  );
}
