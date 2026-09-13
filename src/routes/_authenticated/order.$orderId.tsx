import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Circle,
  Package,
  Truck,
  Home,
  XCircle,
  ArrowLeft,
  Loader,
  MapPin,
  CreditCard,
  Store,
  Gift,
  Wallet,
  Bike,
  PackageCheck,
} from "lucide-react";
import { ServicePageLayout } from "@/components/common/ServicePageLayout";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/i18n/I18nContext";
import type { TranslationKeys } from "@/i18n/types";
import { getOrder } from "@/services/firebase/orders";
import { formatDateTime, formatPrice } from "@/utils/format";
import { firebaseConfigured } from "@/services/firebase/config";
import type { Order, OrderStatus } from "@/types/commerce";

export const Route = createFileRoute("/_authenticated/order/$orderId")({
  ssr: false,
  component: OrderDetailPage,
  head: () => ({ meta: [{ title: "Order Details — AVENTA SHOP" }] }),
});

const FLOW: {
  key: OrderStatus | "out_for_delivery";
  labelKey: keyof TranslationKeys;
  descKey: keyof TranslationKeys;
  icon: typeof Package;
}[] = [
  {
    key: "confirmed",
    labelKey: "orders.orderConfirmed",
    descKey: "orders.orderConfirmedDesc",
    icon: CheckCircle2,
  },
  {
    key: "processing",
    labelKey: "orders.packed",
    descKey: "orders.packedDesc",
    icon: PackageCheck,
  },
  { key: "shipped", labelKey: "orders.shipped", descKey: "orders.shippedDesc", icon: Truck },
  {
    key: "out_for_delivery",
    labelKey: "orders.outForDelivery",
    descKey: "orders.outForDeliveryDesc",
    icon: Bike,
  },
  { key: "delivered", labelKey: "orders.delivered", descKey: "orders.deliveredDesc", icon: Home },
];

function stepIndex(status: OrderStatus): number {
  // Check if any tracking event has "out_for_delivery"
  // This is handled separately via tracking events
  const idx = FLOW.findIndex((s) => s.key === status);
  return idx < 0 ? 0 : idx;
}

function isOutForDelivery(order: ExtendedOrder): boolean {
  return order.tracking?.some((t) => /out for delivery/i.test(t.note)) ?? false;
}

type ExtendedOrder = Order & { rewardDiscount?: number; walletUsed?: number };

function OrderDetailPage() {
  const { orderId } = Route.useParams();
  const { user } = useAuth();
  const { t } = useI18n();
  const { data: rawOrder, isLoading } = useQuery({
    queryKey: ["order", user?.uid, orderId],
    queryFn: () => getOrder(user!.uid, orderId),
    enabled: !!user && firebaseConfigured,
  });

  if (isLoading) {
    return (
      <ServicePageLayout title={t("orders.orderDetails")} backTo="/orders">
        <div className="py-20 text-center">
          <Loader className="mx-auto w-8 h-8 animate-spin text-slate-300" />
          <p className="mt-3 text-sm text-slate-400">{t("orders.loadingDetails")}</p>
        </div>
      </ServicePageLayout>
    );
  }

  if (!rawOrder) {
    return (
      <ServicePageLayout title={t("orders.orderDetails")} backTo="/orders">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-8 text-center">
          <Package className="mx-auto w-12 h-12 text-slate-300 mb-3" />
          <h2 className="text-lg font-bold text-[#0f172a]">{t("orders.notFound")}</h2>
          <p className="text-sm text-slate-500 mb-5">{t("orders.notFoundHint")}</p>
          <Link
            to="/orders"
            className="inline-flex items-center gap-2 bg-[#0f172a] hover:bg-slate-800 text-white font-bold py-3 px-6 rounded-xl text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t("orders.backToOrders")}</span>
          </Link>
        </div>
      </ServicePageLayout>
    );
  }

  const order = rawOrder as ExtendedOrder;
  const cancelled = order.status === "cancelled";
  const outForDelivery = isOutForDelivery(order);
  // If shipped + out for delivery tracking note, show that step
  const currentStep = outForDelivery ? 3 : stepIndex(order.status);

  return (
    <ServicePageLayout
      title={`Order #${order.id.slice(0, 8).toUpperCase()}`}
      subtitle={t("orders.placedOn", { date: formatDateTime(order.createdAt) })}
      backTo="/orders"
    >
      {/* Order Header */}
      <div className="mb-5 bg-white rounded-xl shadow-sm border border-slate-200/80 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#0f172a] tracking-tight">
              Order #{order.id.slice(0, 8).toUpperCase()}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {t("orders.placedOn", { date: formatDateTime(order.createdAt) })}
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold capitalize ${
              cancelled
                ? "bg-rose-100 text-rose-700"
                : order.status === "delivered"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-amber-100 text-amber-700"
            }`}
          >
            {order.status}
          </span>
        </div>
      </div>

      {/* Tracking Timeline */}
      <div className="mb-5 bg-white rounded-xl shadow-sm border border-slate-200/80 p-5">
        <h2 className="text-sm font-bold text-[#0f172a] mb-5 flex items-center gap-2">
          <Truck className="w-4 h-4 text-[#f57224]" />
          {t("orders.orderTracking")}
        </h2>

        {cancelled ? (
          <div className="flex items-center gap-3 rounded-lg bg-rose-50 p-4 text-rose-800 border border-rose-100">
            <XCircle className="w-6 h-6 flex-shrink-0" />
            <div>
              <div className="font-bold text-sm">{t("orders.orderCancelledTitle")}</div>
              <div className="text-xs text-rose-600">{t("orders.orderCancelledHint")}</div>
            </div>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-5 top-5 bottom-5 w-0.5 bg-slate-200" />
            <div
              className="absolute left-5 top-5 w-0.5 bg-[#f57224] transition-all"
              style={{
                height: `calc(${(currentStep / (FLOW.length - 1)) * 100}% - 20px)`,
              }}
            />

            {FLOW.map((step, i) => {
              const done = i <= currentStep;
              const isActive = i === currentStep;
              const Icon = done ? step.icon : Circle;
              return (
                <div key={step.key} className="relative flex items-center gap-3 mb-5 last:mb-0">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 z-10 transition-all ${
                      done ? "bg-[#f57224] text-white" : "bg-slate-100 text-slate-300"
                    } ${isActive ? "ring-4 ring-orange-100" : ""}`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p
                      className={`text-sm font-bold ${done ? "text-[#0f172a]" : "text-slate-400"}`}
                    >
                      {t(step.labelKey)}
                    </p>
                    {isActive && (
                      <p className="text-xs text-[#f57224] font-medium mt-0.5">{t(step.descKey)}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Courier info */}
        {order.courierInfo?.name && (
          <div className="mt-4 rounded-lg bg-blue-50 border border-blue-100 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Truck className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-bold text-blue-900">{t("orders.courierInfo")}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-blue-600">{t("orders.courier")}:</span>{" "}
                <span className="font-semibold text-blue-900">{order.courierInfo.name}</span>
              </div>
              {order.courierInfo.trackingNumber && (
                <div>
                  <span className="text-blue-600">{t("orders.trackingHash")}:</span>{" "}
                  <span className="font-mono font-semibold text-blue-900">
                    {order.courierInfo.trackingNumber}
                  </span>
                </div>
              )}
              {order.courierInfo.estimatedDays && (
                <div>
                  <span className="text-blue-600">{t("orders.eta")}:</span>{" "}
                  <span className="font-semibold text-blue-900">
                    {order.courierInfo.estimatedDays} days
                  </span>
                </div>
              )}
              {order.courierInfo.trackingUrl && (
                <div>
                  <a
                    href={order.courierInfo.trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 font-semibold underline"
                  >
                    {t("orders.trackOnSite")}
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tracking history */}
        {order.tracking && order.tracking.length > 0 && (
          <div className="mt-5 pt-4 border-t border-slate-100 space-y-2">
            {order.tracking
              .slice()
              .reverse()
              .map((t, i) => (
                <div key={i} className="flex items-start justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold capitalize text-slate-700">{t.status}</span>
                    <span className="text-slate-400">— {t.note}</span>
                  </div>
                  <span className="text-slate-400 flex-shrink-0">{formatDateTime(t.at)}</span>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Content Grid */}
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* Items */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200/80 p-5">
          <h2 className="text-sm font-bold text-[#0f172a] mb-4 flex items-center gap-2">
            <Package className="w-4 h-4 text-[#f57224]" />
            Order Items
          </h2>
          <div className="space-y-3">
            {order.items.map((it) => (
              <div
                key={it.productId}
                className="flex gap-3 pb-3 border-b border-slate-100 last:border-0 last:pb-0"
              >
                <Link to="/product/$slug" params={{ slug: it.slug }} className="shrink-0">
                  <div className="w-16 h-16 rounded-lg overflow-hidden bg-slate-100">
                    {it.image ? (
                      <img src={it.image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="w-5 h-5 text-slate-300" />
                      </div>
                    )}
                  </div>
                </Link>
                <div className="flex-1 min-w-0">
                  <Link
                    to="/product/$slug"
                    params={{ slug: it.slug }}
                    className="text-sm font-semibold text-slate-800 hover:text-[#f57224] transition-colors line-clamp-2"
                  >
                    {it.title}
                  </Link>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {formatPrice(it.price)} × {it.quantity}
                  </p>
                </div>
                <span className="text-sm font-bold text-[#0f172a] flex-shrink-0">
                  {formatPrice(it.subtotal)}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Sidebar */}
        <aside className="space-y-4">
          {/* Shipping Address */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200/80 p-5">
            <h3 className="text-sm font-bold text-[#0f172a] mb-3 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#f57224]" />
              Shipping Address
            </h3>
            <div className="text-sm text-slate-600">
              <p className="font-bold text-[#0f172a]">{order.shippingAddress.fullName}</p>
              <p className="text-slate-500">{order.shippingAddress.phone}</p>
              <p className="mt-1">{order.shippingAddress.addressLine}</p>
              <p>
                {order.shippingAddress.city}
                {order.shippingAddress.postalCode ? `, ${order.shippingAddress.postalCode}` : ""}
              </p>
              <p>{order.shippingAddress.country}</p>
            </div>
          </div>

          {/* Payment */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200/80 p-5">
            <h3 className="text-sm font-bold text-[#0f172a] mb-3 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[#f57224]" />
              Payment
            </h3>
            <div className="text-sm">
              <p className="font-semibold text-[#0f172a] capitalize">
                {order.payment.method.replace(/_/g, " ")}
              </p>
              <p className="text-xs text-slate-500 capitalize mt-0.5">
                Status: {order.payment.status}
              </p>
            </div>
          </div>

          {/* Order Summary */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200/80 p-5">
            <h3 className="text-sm font-bold text-[#0f172a] mb-3 flex items-center gap-2">
              <Store className="w-4 h-4 text-[#f57224]" />
              Order Summary
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">{t("order.subtotal")}</span>
                <span className="font-semibold text-[#0f172a]">{formatPrice(order.subtotal)}</span>
              </div>
              {order.discount > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Discount{order.couponCode ? ` (${order.couponCode})` : ""}</span>
                  <span className="font-semibold">-{formatPrice(order.discount)}</span>
                </div>
              )}
              {!!order.rewardDiscount && order.rewardDiscount > 0 && (
                <div className="flex justify-between text-purple-600">
                  <span className="flex items-center gap-1">
                    <Gift className="w-3 h-3" />
                    Reward Points
                  </span>
                  <span className="font-semibold">-{formatPrice(order.rewardDiscount)}</span>
                </div>
              )}
              {!!order.walletUsed && order.walletUsed > 0 && (
                <div className="flex justify-between text-[#f57224]">
                  <span className="flex items-center gap-1">
                    <Wallet className="w-3 h-3" />
                    Wallet
                  </span>
                  <span className="font-semibold">-{formatPrice(order.walletUsed)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">{t("order.shipping")}</span>
                <span className="font-semibold text-[#0f172a]">
                  {order.shipping === 0 ? "FREE" : formatPrice(order.shipping)}
                </span>
              </div>
              {!!order.tax && order.tax > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">{order.taxLabel || "Tax"}</span>
                  <span className="font-semibold text-[#0f172a]">+{formatPrice(order.tax)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-3 mt-2">
                <span className="text-base font-bold text-[#0f172a]">Grand Total</span>
                <span className="text-lg font-black text-[#f57224]">
                  {formatPrice(order.total)}
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </ServicePageLayout>
  );
}
