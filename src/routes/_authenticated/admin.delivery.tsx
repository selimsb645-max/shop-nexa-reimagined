import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Truck,
  Package,
  Clock,
  CheckCircle2,
  Loader,
  MapPin,
  Phone,
} from "lucide-react";
import { firebaseConfigured } from "@/services/firebase/config";
import { formatPrice } from "@/utils/format";
import type { Order } from "@/types/commerce";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/_authenticated/admin/delivery")({
  ssr: false,
  component: AdminDeliveryDashboardPage,
  head: () => ({ meta: [{ title: "Delivery Dashboard — ShopNexa Admin" }] }),
});

function AdminDeliveryDashboardPage() {

  const { t } = useI18n();  const { data: orders } = useQuery({
    queryKey: ["adminOrders", "all"],
    queryFn: async () => {
      const db = (await import("@/services/firebase/config")).getDb();
      const { collection, getDocs } = await import("firebase/firestore");
      const snap = await getDocs(collection(db, "orders"));

      return snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          userId: String(data.userId ?? ""),
          items: Array.isArray(data.items) ? data.items : [],
          subtotal: Number(data.subtotal ?? 0),
          discount: Number(data.discount ?? 0),
          shipping: Number(data.shipping ?? 0),
          total: Number(data.total ?? 0),
          couponCode: (data.couponCode as string | null) ?? null,
          status: (data.status as Order["status"]) ?? "pending",
          payment: (data.payment as Order["payment"]) ?? { method: "cash_on_delivery", status: "unpaid", provider: null, transactionId: null, paidAt: null },
          shippingAddress: (data.shippingAddress as Order["shippingAddress"]) ?? { fullName: "", phone: "", addressLine: "", city: "", postalCode: "", country: "" },
          tracking: Array.isArray(data.tracking) ? data.tracking : [],
          createdAt: typeof data.createdAt === "number" ? data.createdAt : (data.createdAt as { toMillis?: () => number })?.toMillis?.() ?? Date.now(),
          updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : Date.now(),
        } as Order;
      });
    },
    enabled: firebaseConfigured,
  });

  const allOrders = orders ?? [];
  const pending = allOrders.filter((o) => o.status === "pending");
  const processing = allOrders.filter((o) => o.status === "processing" || o.status === "confirmed");
  const shipped = allOrders.filter((o) => o.status === "shipped");
  const delivered = allOrders.filter((o) => o.status === "delivered");
  const codOrders = allOrders.filter((o) => o.payment?.method === "cash_on_delivery");
  const codEarnings = codOrders.reduce((sum, o) => sum + o.total, 0);

  return (
    <div className="min-h-screen bg-muted/30">
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-6 flex items-center gap-3">
          <Link to="/admin" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Truck className="h-6 w-6 text-primary" />
            Delivery Dashboard
          </h1>
        </div>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard icon={<Clock className="h-5 w-5" />} label="Pending" value={String(pending.length)} color="text-orange-500" />
          <StatCard icon={<Package className="h-5 w-5" />} label="Processing" value={String(processing.length)} color="text-blue-500" />
          <StatCard icon={<Truck className="h-5 w-5" />} label="Shipped" value={String(shipped.length)} color="text-purple-500" />
          <StatCard icon={<CheckCircle2 className="h-5 w-5" />} label="Delivered" value={String(delivered.length)} color="text-green-500" />
          <StatCard icon={<Truck className="h-5 w-5" />} label="COD Earnings" value={formatPrice(codEarnings)} />
        </div>

        {/* Active deliveries */}
        <div className="rounded-2xl border bg-background shadow-sm">
          <div className="border-b bg-muted/50 px-4 py-3">
            <h2 className="text-sm font-semibold">{t("admin.activeDeliveries")}</h2>
          </div>
          {!orders ? (
            <div className="py-20 text-center">
              <Loader className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : shipped.length === 0 && processing.length === 0 && pending.length === 0 ? (
            <div className="py-16 text-center">
              <Truck className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No active deliveries</p>
            </div>
          ) : (
            <div className="divide-y">
              {[...pending, ...processing, ...shipped].map((order) => (
                <div key={order.id} className="flex items-center gap-3 p-4">
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                    order.status === "pending" ? "bg-orange-100 text-orange-600"
                      : order.status === "shipped" ? "bg-purple-100 text-purple-600"
                      : "bg-blue-100 text-blue-600"
                  }`}>
                    {order.status === "pending" ? <Clock className="h-5 w-5" /> : order.status === "shipped" ? <Truck className="h-5 w-5" /> : <Package className="h-5 w-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">Order #{order.id.slice(0, 8)}</p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      <span className="truncate">{order.shippingAddress.city || "N/A"}</span>
                      {order.shippingAddress.phone && (
                        <>
                          <span className="mx-1">•</span>
                          <Phone className="h-3 w-3" />
                          <span>{order.shippingAddress.phone}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{formatPrice(order.total)}</p>
                    <p className="text-xs text-muted-foreground">{order.payment?.method === "cash_on_delivery" ? "COD" : "Paid"}</p>
                  </div>
                  <Link
                    to="/admin/orders"
                    className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                  >
                    View
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function StatCard({ icon, label, value, color = "text-primary" }: { icon: React.ReactNode; label: string; value: string; color?: string }) {
  return (
    <div className="rounded-2xl border bg-background p-4 shadow-sm">
      <div className={`mb-1 ${color}`}>{icon}</div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}
