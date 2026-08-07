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
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { WhatsAppFab } from "@/components/layout/SiteChrome";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { useAuth } from "@/context/AuthContext";
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
  { label: string; color: string; icon: typeof Package }
> = {
  pending: { label: "Pending", color: "bg-amber-100 text-amber-700", icon: Clock },
  confirmed: { label: "Confirmed", color: "bg-blue-100 text-blue-700", icon: CheckCircle2 },
  processing: { label: "Processing", color: "bg-indigo-100 text-indigo-700", icon: Package },
  shipped: { label: "Shipped", color: "bg-purple-100 text-purple-700", icon: Truck },
  delivered: { label: "Delivered", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", color: "bg-rose-100 text-rose-700", icon: Package },
};

function OrdersPage() {
  const { user } = useAuth();
  const { data: orders, isLoading } = useQuery({
    queryKey: ["orders", user?.uid],
    queryFn: () => listOrders(user!.uid),
    enabled: !!user && firebaseConfigured,
  });

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 font-sans antialiased">
      <SiteHeader />

      <main className="flex-1 max-w-5xl w-full mx-auto px-3 sm:px-4 md:px-6 py-4 md:py-6 pb-24 lg:pb-8">
        {/* Breadcrumb */}
        <nav className="mb-4 text-xs sm:text-sm text-slate-500 flex items-center gap-1.5">
          <Link to="/" className="hover:text-[#f57224] transition-colors">
            Home
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <Link to="/account" className="hover:text-[#f57224] transition-colors">
            Account
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-semibold text-[#0f172a]">My Orders</span>
        </nav>

        {/* Page Header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-orange-50 text-[#f57224] flex items-center justify-center border border-orange-100 shadow-inner">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#0f172a] tracking-tight">
              My Orders
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Track and manage your purchases
            </p>
          </div>
        </div>

        {/* Loading */}
        {isLoading ? (
          <div className="py-20 text-center">
            <Loader className="mx-auto w-8 h-8 animate-spin text-slate-300" />
            <p className="mt-3 text-sm text-slate-400">Loading your orders...</p>
          </div>
        ) : !orders || orders.length === 0 ? (
          /* Empty State */
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-8 flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-full bg-orange-50 border-2 border-orange-100 flex items-center justify-center mb-4 text-[#f57224]">
              <Package className="w-10 h-10 stroke-[1.5]" />
            </div>
            <h2 className="text-lg font-bold text-[#0f172a] mb-2">
              No orders yet
            </h2>
            <p className="text-sm text-slate-500 mb-6 max-w-sm">
              When you place an order, it will appear here so you can track
              shipping and order history.
            </p>
            <Link
              to="/shop"
              className="inline-flex items-center gap-2 bg-[#0f172a] hover:bg-slate-800 text-white font-bold py-3.5 px-8 rounded-xl transition-all shadow-md text-sm"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Start Shopping</span>
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
                  className="block bg-white rounded-xl shadow-sm border border-slate-200/80 p-4 hover:border-[#f57224] hover:shadow-md transition-all"
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
                      {statusCfg.label}
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
                      {o.items.length} {o.items.length === 1 ? "item" : "items"}
                    </div>
                    <div className="ml-auto text-right">
                      <span className="text-xs text-slate-400 block">Total</span>
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
                        : "Order placed"}
                    </span>
                    <span className="text-xs font-bold text-[#f57224] flex items-center gap-1">
                      View Details
                      <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>

      <SiteFooter />
      <WhatsAppFab />
      <MobileBottomNav />
    </div>
  );
}
