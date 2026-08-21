import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  CheckCircle2,
  Package,
  MapPin,
  ArrowRight,
  ShoppingBag,
  Truck,
  Box,
  Send,
  Home,
  Copy,
  Sparkles,
  Gift,
} from "lucide-react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { WhatsAppFab } from "@/components/layout/SiteChrome";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { useAuth } from "@/context/AuthContext";
import { getOrder } from "@/services/firebase/orders";
import { formatPrice } from "@/utils/format";
import { toast } from "sonner";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/_authenticated/order-success")({
  ssr: false,
  component: OrderSuccessPage,
  head: () => ({ meta: [{ title: "Order Confirmed — Shop Nexa" }] }),
  validateSearch: (s: Record<string, unknown>): { orderId?: string } => ({
    orderId: typeof s.orderId === "string" ? s.orderId : undefined,
  }),
});

// Order timeline steps
const TIMELINE_STEPS = [
  { status: "pending", label: "Order Placed", icon: CheckCircle2 },
  { status: "confirmed", label: "Confirmed", icon: Package },
  { status: "processing", label: "Packed", icon: Box },
  { status: "shipped", label: "Shipped", icon: Send },
  { status: "delivered", label: "Delivered", icon: Home },
];

function OrderSuccessPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const orderId = search.orderId || "";
interface OrderData {
  status?: string;
  total?: number;
  payment?: { method?: string };
}

  const [order, setOrder] = useState<OrderData | null>(null);
  const [_loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user || !orderId) {
      setLoading(false);
      return;
    }
    getOrder(user.uid, orderId)
      .then((data) => setOrder(data))
      .catch(() => setOrder(null))
      .finally(() => setLoading(false));
  }, [user, orderId]);

  const handleCopyId = () => {
    navigator.clipboard?.writeText(orderId);
    setCopied(true);
    toast.success("Order ID copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  // Estimated delivery
  const estimatedDelivery = (() => {
    const now = new Date();
    const min = new Date(now);
    min.setDate(now.getDate() + 3);
    const max = new Date(now);
    max.setDate(now.getDate() + 5);
    return `${min.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })} - ${max.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })}`;
  })();

  // Current timeline step
  const currentStepIndex = order
    ? TIMELINE_STEPS.findIndex((s) => s.status === order.status)
    : 0;
  const activeStep = currentStepIndex >= 0 ? currentStepIndex : 0;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 font-sans antialiased">
      <SiteHeader />

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6 sm:py-10 pb-32 lg:pb-10">
        {/* Success Hero */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="relative mb-4">
            <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-500" />
            </div>
            <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-[#f57224] flex items-center justify-center animate-bounce">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#0f172a] tracking-tight">
            Order Placed Successfully!
          </h1>
          <p className="mt-2 text-sm text-slate-500 max-w-md">
            Thank you for shopping with Shop Nexa. Your order is being processed
            and will be delivered soon.
          </p>
        </div>

        {/* Order Info Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden mb-5">
          {/* Order ID */}
          <div className="bg-gradient-to-r from-[#0f172a] to-slate-800 px-5 py-4 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase text-slate-300 font-medium tracking-wide">
                  Order ID
                </p>
                <p className="text-lg font-bold tracking-wide">
                  #{orderId || "N/A"}
                </p>
              </div>
              <button
                onClick={handleCopyId}
                className="bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                {copied ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{t("orderSuccess.copied")}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>{t("orderSuccess.copy")}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Delivery estimate */}
          <div className="p-5">
            <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-100">
              <div className="w-12 h-12 rounded-xl bg-orange-50 text-[#f57224] flex items-center justify-center flex-shrink-0">
                <Truck className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-slate-500">{t("orderSuccess.estimatedDelivery")}</p>
                <p className="text-lg font-bold text-[#0f172a]">
                  {estimatedDelivery}
                </p>
                <p className="text-xs text-slate-400">
                  You'll get tracking updates via notification
                </p>
              </div>
            </div>

            {/* Order total */}
            {order && (
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100">
                <span className="text-sm text-slate-500">{t("orderSuccess.orderTotal")}</span>
                <span className="text-lg font-black text-[#f57224]">
                  {formatPrice(order.total ?? 0)}
                </span>
              </div>
            )}

            {/* Payment method */}
            {order && (
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100">
                <span className="text-sm text-slate-500">{t("orderSuccess.paymentMethod")}</span>
                <span className="text-sm font-semibold text-[#0f172a] capitalize">
                  {order.payment?.method === "cash_on_delivery"
                    ? "Cash on Delivery"
                    : order.payment?.method === "card"
                    ? "Card"
                    : order.payment?.method === "mobile_banking"
                    ? "Mobile Banking"
                    : order.payment?.method || "COD"}
                </span>
              </div>
            )}

            {/* Reward info */}
            {order && (
              <div className="bg-orange-50/50 rounded-lg p-3 flex items-center gap-2">
                <Gift className="w-4 h-4 text-[#f57224] flex-shrink-0" />
                <p className="text-xs text-slate-600">
                  You'll earn{" "}
                  <span className="font-bold text-[#f57224]">
                    +{Math.floor((order.total || 0))} reward points
                  </span>{" "}
                  and{" "}
                  <span className="font-bold text-[#f57224]">
                    {formatPrice((order.total || 0) * 0.01)} cashback
                  </span>{" "}
                  when this order is delivered!
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Order Timeline */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-5 mb-5">
          <h3 className="text-sm font-bold text-[#0f172a] mb-4 flex items-center gap-2">
            <Package className="w-4 h-4 text-[#f57224]" />
            Order Timeline
          </h3>
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-5 top-5 bottom-5 w-0.5 bg-slate-200" />

            {TIMELINE_STEPS.map((step, i) => {
              const Icon = step.icon;
              const isDone = i <= activeStep;
              const isActive = i === activeStep;
              return (
                <div key={step.status} className="relative flex items-center gap-3 mb-5 last:mb-0">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 z-10 transition-all ${
                      isDone
                        ? "bg-[#f57224] text-white"
                        : "bg-slate-100 text-slate-300"
                    } ${isActive ? "ring-4 ring-orange-100" : ""}`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p
                      className={`text-sm font-bold ${
                        isDone ? "text-[#0f172a]" : "text-slate-400"
                      }`}
                    >
                      {step.label}
                    </p>
                    {isActive && (
                      <p className="text-xs text-[#f57224] font-medium">
                        Current status
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() =>
              navigate({ to: "/track-orders" })
            }
            className="flex-1 flex items-center justify-center gap-2 bg-[#0f172a] hover:bg-slate-800 text-white font-bold py-3.5 px-6 rounded-xl transition-all shadow-md text-sm"
          >
            <Truck className="w-4 h-4" />
            <span>{t("orderSuccess.trackOrder")}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
          <Link
            to="/shop"
            className="flex-1 flex items-center justify-center gap-2 bg-white border-2 border-slate-200 hover:border-[#f57224] text-[#0f172a] font-bold py-3.5 px-6 rounded-xl transition-all text-sm"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Continue Shopping</span>
          </Link>
        </div>

        {/* Delivery info note */}
        <div className="mt-5 flex items-start gap-2 text-xs text-slate-400 bg-slate-50 rounded-lg p-3">
          <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <p>
            Your order will be delivered to your registered address. For any
            changes, contact Shop Nexa Support within 1 hour of placing the
            order.
          </p>
        </div>
      </main>

      <SiteFooter />
      <WhatsAppFab />
      <MobileBottomNav />
    </div>
  );
}

export default OrderSuccessPage;
