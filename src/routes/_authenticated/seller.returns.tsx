/**
 * AVENTA SHOP — Seller Returns Management
 *
 * Route: /seller/returns
 * Shows return requests for the seller's own products.
 * Seller can: review, approve, reject, mark item received.
 * Seller CANNOT: approve refund, process refund (finance-only).
 * All mutations go through server functions with authorization.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Undo2,
  Clock,
  CheckCircle2,
  XCircle,
  Truck,
  Loader,
  Package,
  FileText,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { getFirebaseAuth } from "@/services/firebase/config";
import {
  listReturnsForAdmin,
  reviewReturnRequest,
  approveReturnRequest,
  rejectReturnRequest,
  markItemReceived,
  type ReturnRequest,
} from "@/services/firebase/returns";
import { formatPrice } from "@/utils/format";

export const Route = createFileRoute("/_authenticated/seller/returns")({
  ssr: false,
  component: SellerReturnsPage,
  head: () => ({
    meta: [{ title: "Returns — Seller — AVENTA SHOP" }],
  }),
});

const STATUS_LABELS: Record<string, { color: string; label: string }> = {
  pending: { color: "text-orange-500", label: "Pending" },
  under_review: { color: "text-blue-500", label: "Under Review" },
  approved: { color: "text-green-500", label: "Approved" },
  rejected: { color: "text-red-500", label: "Rejected" },
  picked_up: { color: "text-blue-500", label: "Item Received" },
  refund_approved: { color: "text-purple-500", label: "Refund Approved" },
  refunded: { color: "text-green-500", label: "Refunded" },
  cancelled: { color: "text-gray-400", label: "Cancelled" },
};

function formatDate(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SellerReturnsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: returns, isLoading } = useQuery({
    queryKey: ["seller-returns", user?.uid],
    queryFn: async () => {
      const auth = getFirebaseAuth();
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("Authentication required");
      return listReturnsForAdmin(idToken, "seller", user!.uid);
    },
    enabled: !!user,
  });

  const reviewMutation = useMutation({
    mutationFn: async (returnId: string) => {
      const auth = getFirebaseAuth();
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("Authentication required");
      return reviewReturnRequest(returnId, idToken);
    },
    onSuccess: () => {
      toast.success("Return marked for review");
      queryClient.invalidateQueries({ queryKey: ["seller-returns"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  const approveMutation = useMutation({
    mutationFn: async (returnId: string) => {
      const auth = getFirebaseAuth();
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("Authentication required");
      return approveReturnRequest(returnId, idToken);
    },
    onSuccess: () => {
      toast.success("Return approved");
      queryClient.invalidateQueries({ queryKey: ["seller-returns"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ returnId, reason }: { returnId: string; reason: string }) => {
      const auth = getFirebaseAuth();
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("Authentication required");
      return rejectReturnRequest(returnId, idToken, reason);
    },
    onSuccess: () => {
      toast.success("Return rejected");
      queryClient.invalidateQueries({ queryKey: ["seller-returns"] });
      setRejectingId(null);
      setRejectReason("");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  const receivedMutation = useMutation({
    mutationFn: async (returnId: string) => {
      const auth = getFirebaseAuth();
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("Authentication required");
      return markItemReceived(returnId, idToken);
    },
    onSuccess: () => {
      toast.success("Item marked as received");
      queryClient.invalidateQueries({ queryKey: ["seller-returns"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  const filteredReturns = useMemo(() => {
    if (!returns) return [];
    if (filter === "all") return returns;
    return returns.filter((r) => r.status === filter);
  }, [returns, filter]);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div className="flex items-center gap-3">
        <Undo2 className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold">Return Requests</h1>
          <p className="text-sm text-muted-foreground">Manage returns for your products</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto">
        {[
          { value: "all", label: "All" },
          { value: "pending", label: "Pending" },
          { value: "under_review", label: "Under Review" },
          { value: "approved", label: "Approved" },
          { value: "picked_up", label: "Received" },
          { value: "refunded", label: "Refunded" },
          { value: "rejected", label: "Rejected" },
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium ${
              filter === f.value ? "bg-primary text-primary-foreground" : "border hover:bg-muted"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="py-20 text-center">
          <Loader className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !filteredReturns || filteredReturns.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border bg-muted/30 py-20 text-center">
          <Package className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="text-lg font-semibold">No return requests</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Return requests for your products will appear here
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredReturns.map((ret) => {
            const cfg = STATUS_LABELS[ret.status] ?? { color: "text-gray-500", label: ret.status };
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
                      Order #{ret.orderId.slice(0, 8)} · Qty: {ret.quantity}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Reason: {ret.reason.replace(/_/g, " ")}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Refundable: {formatPrice(ret.refundableAmount)}
                    </p>
                    <span
                      className={`mt-2 inline-flex items-center gap-1 text-xs font-medium ${cfg.color}`}
                    >
                      {cfg.label} · {formatDate(ret.requestedAt)}
                    </span>
                  </div>
                </div>

                {ret.customerNote && (
                  <div className="mt-3 rounded-lg bg-muted/50 p-3">
                    <p className="text-xs font-medium text-muted-foreground">Customer Note:</p>
                    <p className="mt-1 text-xs">{ret.customerNote}</p>
                  </div>
                )}

                {/* Seller actions — permission gated by server */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {ret.status === "pending" && (
                    <button
                      onClick={() => reviewMutation.mutate(ret.id)}
                      disabled={reviewMutation.isPending}
                      className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-2 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50"
                    >
                      {reviewMutation.isPending ? (
                        <Loader className="h-3 w-3 animate-spin" />
                      ) : (
                        <FileText className="h-3 w-3" />
                      )}
                      Mark Under Review
                    </button>
                  )}

                  {ret.status === "under_review" && (
                    <>
                      <button
                        onClick={() => approveMutation.mutate(ret.id)}
                        disabled={approveMutation.isPending}
                        className="flex items-center gap-1.5 rounded-lg bg-green-500 px-3 py-2 text-xs font-medium text-white hover:bg-green-600 disabled:opacity-50"
                      >
                        {approveMutation.isPending ? (
                          <Loader className="h-3 w-3 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3 w-3" />
                        )}
                        Approve Return
                      </button>
                      <button
                        onClick={() => setRejectingId(ret.id)}
                        className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-2 text-xs font-medium text-white hover:bg-red-600"
                      >
                        <XCircle className="h-3 w-3" /> Reject
                      </button>
                    </>
                  )}

                  {ret.status === "approved" && (
                    <button
                      onClick={() => receivedMutation.mutate(ret.id)}
                      disabled={receivedMutation.isPending}
                      className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-2 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50"
                    >
                      {receivedMutation.isPending ? (
                        <Loader className="h-3 w-3 animate-spin" />
                      ) : (
                        <Truck className="h-3 w-3" />
                      )}
                      Mark Item Received
                    </button>
                  )}
                </div>

                {/* Reject reason input */}
                {rejectingId === ret.id && (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={2}
                      placeholder="Why is this return being rejected?"
                      className="w-full rounded-lg border border-red-300 px-3 py-2 text-xs outline-none focus:border-red-500"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => {
                          if (rejectReason.length < 3) {
                            toast.error("Reason must be at least 3 characters");
                            return;
                          }
                          rejectMutation.mutate({ returnId: ret.id, reason: rejectReason });
                        }}
                        disabled={rejectMutation.isPending || rejectReason.length < 3}
                        className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50"
                      >
                        {rejectMutation.isPending ? (
                          <Loader className="h-3 w-3 animate-spin" />
                        ) : (
                          "Confirm Reject"
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setRejectingId(null);
                          setRejectReason("");
                        }}
                        className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {ret.status === "refund_approved" && (
                  <p className="mt-2 text-xs text-purple-600">
                    Refund approved by finance — awaiting processing
                  </p>
                )}
                {ret.status === "refunded" && (
                  <p className="mt-2 text-xs text-green-600">
                    Refund completed: {formatPrice(ret.refundedAmount)}
                  </p>
                )}
                {ret.status === "rejected" && ret.rejectionReason && (
                  <p className="mt-2 text-xs text-red-600">Rejected: {ret.rejectionReason}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
