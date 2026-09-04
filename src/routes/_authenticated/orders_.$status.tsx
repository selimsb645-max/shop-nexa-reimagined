import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Package,
  ChevronRight,
  Check,
  Clock3,
  Loader,
  Box,
  Truck,
  Bike,
  PackageCheck,
  Undo2,
  BadgeDollarSign,
  XCircle,
} from "lucide-react";
import { ServicePageLayout } from "@/components/common/ServicePageLayout";
import { Spinner } from "@/components/common/Spinner";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/i18n/I18nContext";
import { firebaseConfigured } from "@/services/firebase/config";
import { listOrders } from "@/services/firebase/orders";
import { formatDateTime, formatPrice } from "@/utils/format";
import {
  ORDER_VIEWS,
  PROGRESS_STEPS,
  VIEW_META,
  filterOrders,
  isOrderView,
  progressIndex,
  type OrderView,
} from "@/utils/orderStatus";
import type { Order } from "@/types/commerce";

export const Route = createFileRoute("/_authenticated/orders_/$status")({
  ssr: false,
  component: OrderStatusPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="p-10 text-center text-sm text-gray-600">
      {error.message}
    </div>
  ),
  notFoundComponent: () => {
    const { t } = useI18n();
    return (
      <div className="p-10 text-center">
        <h1 className="text-lg font-bold text-gray-800">{t("orders.unknownStatus")}</h1>
        <Link
          to="/account"
          className="mt-3 inline-block text-sm font-semibold text-orange-500 hover:underline"
        >
          {t("orders.backToAccount")}
        </Link>
      </div>
    );
  },
});

const TAB_ICON: Record<OrderView, React.ReactNode> = {
  pending: <Clock3 className="h-4 w-4" />,
  processing: <Loader className="h-4 w-4" />,
  packed: <Box className="h-4 w-4" />,
  shipped: <Truck className="h-4 w-4" />,
  delivery: <Bike className="h-4 w-4" />,
  delivered: <PackageCheck className="h-4 w-4" />,
  returns: <Undo2 className="h-4 w-4" />,
  refunds: <BadgeDollarSign className="h-4 w-4" />,
};

const TAB_LABEL: Record<OrderView, string> = {
  pending: "Pending",
  processing: "Processing",
  packed: "Packed",
  shipped: "Shipped",
  delivery: "Delivery",
  delivered: "Delivered",
  returns: "Returns",
  refunds: "Refunds",
};

function OrderStatusPage() {
  const { t } = useI18n();
  const raw = Route.useParams().status as string;
  const status: OrderView = isOrderView(raw) ? raw : "pending";
  const { user } = useAuth();
  const uid = user?.uid;

  const { data: orders, isLoading } = useQuery({
    queryKey: ["orders", uid],
    queryFn: () => listOrders(uid!),
    enabled: Boolean(uid && firebaseConfigured),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  const meta = VIEW_META[status];
  const list = filterOrders(orders ?? [], status);

  return (
    <ServicePageLayout title={meta.title} subtitle={meta.subtitle} backTo="/account">
      {/* Status tabs */}
      <div className="border-b border-gray-100 bg-white">
        <div className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-3 py-2 sm:px-6">
          {ORDER_VIEWS.map((v) => {
            const active = v === status;
            const count = filterOrders(orders ?? [], v).length;
            return (
              <Link
                key={v}
                to="/orders/$status"
                params={{ status: v }}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition active:scale-95 ${
                  active
                    ? "bg-orange-500 text-white shadow-sm"
                    : "bg-orange-50 text-orange-600 hover:bg-orange-100"
                }`}
              >
                {TAB_ICON[v]} {TAB_LABEL[v]}
                {count > 0 && (
                  <span
                    className={`grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold ${active ? "bg-white/25 text-white" : "bg-orange-500 text-white"}`}
                  >
                    {count > 99 ? "99+" : count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="space-y-3 py-2">
        {isLoading ? (
          <div className="py-20 text-center">
            <Spinner />
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-100 bg-white py-16 text-center shadow-sm">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-orange-50 text-orange-500">
              <Package className="h-7 w-7" />
            </span>
            <h2 className="mt-4 text-base font-bold text-gray-800">
              No {TAB_LABEL[status].toLowerCase()} orders
            </h2>
            <p className="mt-1 max-w-xs text-xs text-gray-500">
              Orders with this status will appear here automatically.
            </p>
            <Link
              to="/shop"
              className="mt-4 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-orange-600 active:scale-95"
            >
              Continue Shopping
            </Link>
          </div>
        ) : (
          list.map((o) => <OrderStatusCard key={o.id} order={o} view={status} />)
        )}
      </div>
    </ServicePageLayout>
  );
}

function OrderStatusCard({ order, view }: { order: Order; view: OrderView }) {
  const current = progressIndex(order);
  const cancelled = order.status === "cancelled";
  const latest = order.tracking?.length ? order.tracking[order.tracking.length - 1] : null;

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/50 px-4 py-2.5">
        <div className="min-w-0">
          <div className="truncate text-xs font-bold text-gray-800">
            Order #{order.id.slice(0, 8).toUpperCase()}
          </div>
          <div className="truncate text-[11px] text-gray-500">
            {formatDateTime(order.createdAt)}
          </div>
        </div>
        <Link
          to="/order/$orderId"
          params={{ orderId: order.id }}
          className="inline-flex items-center gap-1 text-xs font-semibold text-orange-500 hover:underline"
        >
          Details <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
        </Link>
      </div>

      {/* Live progress tracker */}
      <div className="px-4 pt-4">
        {cancelled || view === "refunds" ? (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-red-600">
            {view === "refunds" ? (
              <BadgeDollarSign className="h-5 w-5" />
            ) : (
              <XCircle className="h-5 w-5" />
            )}
            <span className="text-xs font-semibold">
              {view === "refunds" ? "Payment refunded" : "Order cancelled / returned"}
            </span>
          </div>
        ) : (
          <div className="flex items-start">
            {PROGRESS_STEPS.map((label, i) => {
              const done = i < current;
              const active = i === current;
              return (
                <div key={label} className="flex min-w-0 flex-1 flex-col items-center">
                  <div className="flex w-full items-center">
                    <span
                      className={`h-0.5 flex-1 ${i === 0 ? "bg-transparent" : done || active ? "bg-green-500" : "bg-gray-200"}`}
                    />
                    <span
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold transition ${
                        active
                          ? "animate-pulse bg-orange-500 text-white shadow-[0_0_0_4px_rgba(249,115,22,0.25)]"
                          : done
                            ? "bg-green-500 text-white"
                            : "bg-gray-100 text-gray-400"
                      }`}
                    >
                      {done ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
                    </span>
                    <span
                      className={`h-0.5 flex-1 ${i === PROGRESS_STEPS.length - 1 ? "bg-transparent" : done ? "bg-green-500" : "bg-gray-200"}`}
                    />
                  </div>
                  <span
                    className={`mt-1.5 text-center text-[10px] font-semibold leading-tight ${
                      active ? "text-orange-500" : done ? "text-green-600" : "text-gray-400"
                    }`}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {latest && (
        <div className="mx-4 mt-3 rounded-xl bg-orange-50/60 px-3 py-2">
          <p className="text-[11px] font-medium text-gray-700">{latest.note}</p>
          <p className="text-[10px] text-gray-500">{formatDateTime(latest.at)}</p>
        </div>
      )}

      {/* Items */}
      <div className="space-y-3 p-4">
        {order.items.map((it) => (
          <div key={it.productId} className="flex items-center gap-3">
            <Link to="/product/$slug" params={{ slug: it.slug }} className="shrink-0">
              <img
                src={it.image}
                alt={it.title}
                className="h-14 w-14 rounded-xl border border-gray-100 object-cover"
              />
            </Link>
            <div className="min-w-0 flex-1">
              <Link
                to="/product/$slug"
                params={{ slug: it.slug }}
                className="line-clamp-2 text-xs font-semibold text-gray-800 hover:text-orange-500"
              >
                {it.title}
              </Link>
              <div className="text-[11px] text-gray-500">
                {formatPrice(it.price)} × {it.quantity}
              </div>
            </div>
            <div className="text-xs font-bold text-gray-800">{formatPrice(it.subtotal)}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
        <span className="text-[11px] text-gray-500">
          {order.items.length} item{order.items.length === 1 ? "" : "s"} •{" "}
          {order.payment.method.replace(/_/g, " ")}
        </span>
        <span className="text-sm font-bold text-orange-500">{formatPrice(order.total)}</span>
      </div>
    </section>
  );
}
