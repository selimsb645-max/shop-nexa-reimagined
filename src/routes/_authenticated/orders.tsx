import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Package,
  ChevronRight,
  ShoppingBag,
  Truck,
  Clock,
  CheckCircle2,
  Loader,
  MapPin,
  Bike,
  XCircle,
  PackageCheck,
  RotateCcw,
} from "lucide-react";
import { ServicePageLayout } from "@/components/common/ServicePageLayout";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/i18n/I18nContext";
import { listOrders } from "@/services/firebase/orders";
import { formatDateTime, formatPrice, formatDate } from "@/utils/format";
import { firebaseConfigured } from "@/services/firebase/config";
import type { Order, OrderStatus } from "@/types/commerce";

export const Route = createFileRoute("/_authenticated/orders")({
  ssr: false,
  component: OrdersPage,
  head: () => ({ meta: [{ title: "My Orders — Aventa Shop" }] }),
});

const STATUS_CONFIG: Record<string, { labelKey: string; color: string; icon: typeof Package }> = {
  pending: { labelKey: "orders.pending", color: "bg-amber-100 text-amber-700", icon: Clock },
  confirmed: {
    labelKey: "account.confirmed",
    color: "bg-blue-100 text-blue-700",
    icon: CheckCircle2,
  },
  processing: {
    labelKey: "account.processing",
    color: "bg-indigo-100 text-indigo-700",
    icon: Package,
  },
  packed: {
    labelKey: "account.packed",
    color: "bg-violet-100 text-violet-700",
    icon: PackageCheck,
  },
  shipped: { labelKey: "account.shipped", color: "bg-purple-100 text-purple-700", icon: Truck },
  out_for_delivery: {
    labelKey: "account.outForDelivery",
    color: "bg-amber-100 text-amber-700",
    icon: Bike,
  },
  delivered: {
    labelKey: "account.delivered",
    color: "bg-emerald-100 text-emerald-700",
    icon: CheckCircle2,
  },
  cancelled: { labelKey: "orders.cancelled", color: "bg-rose-100 text-rose-700", icon: XCircle },
  return_requested: {
    labelKey: "account.returnRequested",
    color: "bg-orange-100 text-orange-700",
    icon: RotateCcw,
  },
  returned: { labelKey: "account.returned", color: "bg-rose-100 text-rose-700", icon: RotateCcw },
};

function OrdersPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { data: orders, isLoading } = useQuery({
    queryKey: ["orders", user?.uid],
    queryFn: () => listOrders(user!.uid),
    enabled: !!user && firebaseConfigured,
  });

  return (
    <ServicePageLayout title={t("orders.title")} subtitle={t("orders.noOrdersHint")}>
      {isLoading ? (
        <div className="py-20 text-center">
          <Loader className="mx-auto w-8 h-8 animate-spin text-slate-300" />
          <p className="mt-3 text-sm text-slate-400">{t("common.loading")}</p>
        </div>
      ) : !orders || orders.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-8 flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-full bg-orange-50 border-2 border-orange-100 flex items-center justify-center mb-4 text-[#f57224]">
            <Package className="w-10 h-10 stroke-[1.5]" />
          </div>
          <h2 className="text-lg font-bold text-[#0f172a] mb-2">{t("orders.noOrders")}</h2>
          <p className="text-sm text-slate-500 mb-6 max-w-sm">{t("orders.noOrdersHint")}</p>
          <Link
            to="/shop"
            className="inline-flex items-center gap-2 bg-[#0f172a] hover:bg-slate-800 text-white font-bold py-3.5 px-8 rounded-xl transition-all shadow-md text-sm"
          >
            <ShoppingBag className="w-4 h-4" /> <span>{t("cart.startShopping")}</span>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => {
            const statusCfg = STATUS_CONFIG[o.status] ?? STATUS_CONFIG.pending;
            const StatusIcon = statusCfg.icon;
            // Extract tracking ID and expected delivery from order data
            const trackingId = (o as Order & { trackingId?: string }).trackingId;
            const deliveryInfo = (o as Order & { deliveryInfo?: { expectedDeliveryDate?: number } })
              .deliveryInfo;
            const expectedDelivery = deliveryInfo?.expectedDeliveryDate ?? 0;
            const canTrack =
              trackingId &&
              [
                "confirmed",
                "processing",
                "packed",
                "shipped",
                "out_for_delivery",
                "delivered",
              ].includes(o.status);

            return (
              <div
                key={o.id}
                className="bg-white rounded-2xl shadow-sm border border-slate-200/80 hover:shadow-md transition-all overflow-hidden"
              >
                <Link
                  to="/order/$orderId"
                  params={{ orderId: o.id }}
                  className="block p-4 hover:border-[#f57224]"
                >
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="text-xs text-slate-400">
                        Order #{o.id.slice(0, 8).toUpperCase()}
                      </div>
                      <div className="text-sm text-slate-600 mt-0.5">
                        {formatDateTime(o.createdAt)}
                      </div>
                      {trackingId && (
                        <div className="text-xs text-slate-400 mt-0.5">
                          Tracking: <span className="font-bold text-slate-600">{trackingId}</span>
                        </div>
                      )}
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${statusCfg.color}`}
                    >
                      <StatusIcon className="w-3 h-3" />
                      {t(statusCfg.labelKey as any)}
                    </span>
                  </div>

                  {/* Items preview */}
                  <div className="flex items-center gap-3">
                    <div className="flex -space-x-2">
                      {o.items.slice(0, 4).map((it) => (
                        <img
                          key={it.productId}
                          src={it.image}
                          alt=""
                          className="h-10 w-10 rounded-lg border-2 border-white object-cover shadow-sm"
                        />
                      ))}
                      {o.items.length > 4 && (
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-white bg-slate-100 text-[10px] font-bold text-slate-500 shadow-sm">
                          +{o.items.length - 4}
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      {o.items.length} {o.items.length === 1 ? t("cart.item") : t("cart.items")}
                    </div>
                    <div className="ml-auto text-right">
                      <span className="text-xs text-slate-400 block">{t("orders.total")}</span>
                      <span className="text-lg font-black text-[#f57224]">
                        {formatPrice(o.total)}
                      </span>
                    </div>
                  </div>

                  {/* Expected delivery */}
                  {expectedDelivery > 0 && o.status !== "delivered" && o.status !== "cancelled" && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                      <Clock className="w-3.5 h-3.5 text-orange-400" />
                      Expected:{" "}
                      <span className="font-semibold text-slate-600">
                        {formatDate(expectedDelivery)}
                      </span>
                    </div>
                  )}

                  {/* Bottom row */}
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">
                      {o.tracking && o.tracking.length > 0
                        ? o.tracking[o.tracking.length - 1]?.note
                        : t("orders.orderPlaced")}
                    </span>
                    <span className="text-xs font-bold text-[#f57224] flex items-center gap-1">
                      {t("orders.viewDetails")} <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </Link>

                {/* Track Order button */}
                {canTrack && trackingId && (
                  <div className="px-4 pb-3 -mt-1">
                    <a
                      href={"/track/" + trackingId}
                      className="w-full inline-flex items-center justify-center gap-2 bg-orange-50 hover:bg-orange-100 text-[#f57224] font-bold py-2.5 px-4 rounded-xl border border-orange-200 transition text-sm"
                    >
                      <Truck className="w-4 h-4" />
                      Track Order
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </ServicePageLayout>
  );
}
