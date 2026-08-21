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
} from "lucide-react";
import { ServicePageLayout } from "@/components/common/ServicePageLayout";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/i18n/I18nContext";
import { listOrders } from "@/services/firebase/orders";
import { formatDateTime, formatPrice } from "@/utils/format";
import { firebaseConfigured } from "@/services/firebase/config";

export const Route = createFileRoute("/_authenticated/orders")({
  ssr: false,
  component: OrdersPage,
  head: () => ({ meta: [{ title: "My Orders — Shop Nexa" }] }),
});

const STATUS_CONFIG: Record<
  string,
  { labelKey: string; color: string; icon: typeof Package }
> = {
  pending: { labelKey: "orders.pending", color: "bg-amber-100 text-amber-700", icon: Clock },
  confirmed: { labelKey: "account.confirmed", color: "bg-blue-100 text-blue-700", icon: CheckCircle2 },
  processing: { labelKey: "account.processing", color: "bg-indigo-100 text-indigo-700", icon: Package },
  shipped: { labelKey: "account.shipped", color: "bg-purple-100 text-purple-700", icon: Truck },
  delivered: { labelKey: "account.delivered", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  cancelled: { labelKey: "orders.cancelled", color: "bg-rose-100 text-rose-700", icon: Package },
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
      {/* Loading */}
      {isLoading ? (
        <div className="py-20 text-center">
          <Loader className="mx-auto w-8 h-8 animate-spin text-slate-300" />
          <p className="mt-3 text-sm text-slate-400">{t("common.loading")}</p>
        </div>
      ) : !orders || orders.length === 0 ? (
        /* Empty State */
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-8 flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-full bg-orange-50 border-2 border-orange-100 flex items-center justify-center mb-4 text-[#f57224]">
            <Package className="w-10 h-10 stroke-[1.5]" />
          </div>
          <h2 className="text-lg font-bold text-[#0f172a] mb-2">
            {t("orders.noOrders")}
          </h2>
          <p className="text-sm text-slate-500 mb-6 max-w-sm">
            {t("orders.noOrdersHint")}
          </p>
          <Link
            to="/shop"
            className="inline-flex items-center gap-2 bg-[#0f172a] hover:bg-slate-800 text-white font-bold py-3.5 px-8 rounded-xl transition-all shadow-md text-sm"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>{t("cart.startShopping")}</span>
          </Link>
        </div>
      ) : (
        /* Orders List */
        <div className="space-y-3">
          {orders.map((o) => {
            const statusCfg =
              STATUS_CONFIG[o.status] ?? STATUS_CONFIG.pending;
            const StatusIcon = statusCfg.icon;

            return (
              <Link
                key={o.id}
                to="/order/$orderId"
                params={{ orderId: o.id }}
                className="block bg-white rounded-2xl shadow-sm border border-slate-200/80 p-4 hover:border-[#f57224] hover:shadow-md transition-all"
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

                {/* Bottom row */}
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">
                    {o.tracking && o.tracking.length > 0
                      ? o.tracking[o.tracking.length - 1]?.note
                      : t("orders.orderPlaced")}
                  </span>
                  <span className="text-xs font-bold text-[#f57224] flex items-center gap-1">
                    {t("orders.viewDetails")}
                    <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </ServicePageLayout>
  );
}
