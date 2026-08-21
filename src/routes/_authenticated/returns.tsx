import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Package,
  Undo2,
  Clock,
  CheckCircle2,
  XCircle,
  Truck,
  DollarSign,
  Loader,
  ChevronRight,
} from "lucide-react";
import { ServicePageLayout } from "@/components/common/ServicePageLayout";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/i18n/I18nContext";
import { listUserReturns, createReturnRequest, type ReturnReason } from "@/services/firebase/returns";
import { listOrders } from "@/services/firebase/orders";
import { firebaseConfigured } from "@/services/firebase/config";
import { formatPrice } from "@/utils/format";
import type { ReturnStatus } from "@/services/firebase/returns";

export const Route = createFileRoute("/_authenticated/returns")({
  ssr: false,
  component: ReturnsPage,
  head: () => ({
    meta: [{ title: "Returns & Refunds — ShopNexa" }],
  }),
});

const REASONS: { value: ReturnReason; label: string }[] = [
  { value: "damaged", label: "Product damaged" },
  { value: "wrong_item", label: "Wrong item received" },
  { value: "not_as_described", label: "Not as described" },
  { value: "changed_mind", label: "Changed my mind" },
  { value: "quality_issue", label: "Quality issue" },
  { value: "other", label: "Other" },
];

const STATUS_CONFIG: Record<ReturnStatus, { icon: React.ReactNode; color: string; label: string }> = {
  pending: { icon: <Clock className="h-4 w-4" />, color: "text-orange-500", label: "Pending" },
  approved: { icon: <CheckCircle2 className="h-4 w-4" />, color: "text-green-500", label: "Approved" },
  rejected: { icon: <XCircle className="h-4 w-4" />, color: "text-red-500", label: "Rejected" },
  picked_up: { icon: <Truck className="h-4 w-4" />, color: "text-blue-500", label: "Picked Up" },
  refunded: { icon: <DollarSign className="h-4 w-4" />, color: "text-green-500", label: "Refunded" },
  cancelled: { icon: <XCircle className="h-4 w-4" />, color: "text-gray-400", label: "Cancelled" },
};

function ReturnsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [reason, setReason] = useState<ReturnReason>("other");
  const [description, setDescription] = useState("");

  const { data: returns, isLoading } = useQuery({
    queryKey: ["returns", user?.uid],
    queryFn: () => listUserReturns(user!.uid),
    enabled: !!user && firebaseConfigured,
  });

  const { data: orders } = useQuery({
    queryKey: ["orders", user?.uid],
    queryFn: () => listOrders(user!.uid),
    enabled: !!user && firebaseConfigured,
  });

  const deliveredOrders = (orders ?? []).filter(
    (o) => o.status === "delivered" || o.status === "shipped",
  );

  const createMutation = useMutation({
    mutationFn: async () => {
      const order = orders?.find((o) => o.id === selectedOrderId);
      const item = order?.items.find((i) => i.productId === selectedItemId);
      if (!order || !item) throw new Error("Select an order and product");
      return await createReturnRequest(user!.uid, {
        orderId: order.id,
        productId: item.productId,
        productTitle: item.title,
        productImage: item.image,
        reason,
        description,
        refundAmount: item.subtotal,
      });
    },
    onSuccess: () => {
      toast.success("Return request submitted");
      queryClient.invalidateQueries({ queryKey: ["returns"] });
      setShowForm(false);
      setSelectedOrderId("");
      setSelectedItemId("");
      setReason("other");
      setDescription("");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to submit"),
  });

  return (
    <ServicePageLayout title={t("returns.title")} subtitle={t("returns.subtitle")}>

        {/* {t("returns.newReturn")} Button */}
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            <Package className="h-5 w-5" /> New Return Request
          </button>
        )}

        {/* Return Form */}
        {showForm && (
          <div className="mb-6 rounded-2xl border bg-background p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">{t("returns.createReturn")}</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">{t("returns.selectOrder")}</label>
                <select
                  value={selectedOrderId}
                  onChange={(e) => setSelectedOrderId(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-primary"
                >
                  <option value="">{t("returns.chooseOrder")}</option>
                  {deliveredOrders.map((order) => (
                    <option key={order.id} value={order.id}>
                      Order #{order.id.slice(0, 8)} — {formatPrice(order.total)}
                    </option>
                  ))}
                </select>
              </div>

              {selectedOrderId && (
                <div>
                  <label className="mb-1 block text-sm font-medium">{t("returns.selectProduct")}</label>
                  <select
                    value={selectedItemId}
                    onChange={(e) => setSelectedItemId(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-primary"
                  >
                    <option value="">{t("returns.chooseProduct")}</option>
                    {orders
                      ?.find((o) => o.id === selectedOrderId)
                      ?.items.map((item) => (
                        <option key={item.productId} value={item.productId}>
                          {item.title} — {formatPrice(item.subtotal)}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium">Reason</label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value as ReturnReason)}
                  className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-primary"
                >
                  {REASONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Describe the issue..."
                  className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-primary"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => createMutation.mutate()}
                  disabled={createMutation.isPending || !selectedOrderId || !selectedItemId}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {createMutation.isPending && <Loader className="h-4 w-4" />} Submit Request
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Returns List */}
        {isLoading ? (
          <div className="py-20 text-center">
            <Loader className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !returns || returns.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border bg-muted/30 py-20 text-center">
            <Undo2 className="mb-4 h-12 w-12 text-muted-foreground/40" />
            <h2 className="text-lg font-semibold">{t("returns.empty")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Your return and refund history will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {returns.map((ret) => {
              const config = STATUS_CONFIG[ret.status];
              return (
                <div key={ret.id} className="rounded-2xl border bg-background p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <img
                      src={ret.productImage}
                      alt={ret.productTitle}
                      className="h-16 w-16 shrink-0 rounded-xl object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-semibold">{ret.productTitle}</h3>
                      <p className="text-xs text-muted-foreground">
                        Order #{ret.orderId.slice(0, 8)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Reason: {REASONS.find((r) => r.value === ret.reason)?.label ?? ret.reason}
                      </p>
                      {ret.description && (
                        <p className="mt-1 text-xs text-muted-foreground">{ret.description}</p>
                      )}
                      <div className="mt-2 flex items-center gap-3">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${config.color}`}>
                          {config.icon} {config.label}
                        </span>
                        <span className="text-xs font-medium text-muted-foreground">
                          Refund: {formatPrice(ret.refundAmount)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </ServicePageLayout>
  );
}
