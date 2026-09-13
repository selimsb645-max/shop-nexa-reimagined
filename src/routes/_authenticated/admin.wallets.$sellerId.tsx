/**
 * AVENTA SHOP — Admin Wallet Detail
 *
 * Route: /admin/wallets/$sellerId
 * Full financial view + every mutation path for one seller wallet:
 *  - immutable ledger history (type filter + cursor pagination)
 *  - withdrawal processing (approve → payout, reject → release)
 *  - manual adjustments (reason required, fresh re-auth server-side)
 *  - wallet status lifecycle (suspend / lock / reactivate / close)
 * All actions go through server functions that re-check finance
 * permissions and (for money-moving actions) FRESH re-authentication.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  fetchAdminWalletDetail,
  submitWalletAdjustment,
  submitWalletStatusChange,
  submitWithdrawalDecision,
  type AdminWalletDetailData,
} from "@/services/firebase/adminWallets";
import { formatPrice, formatDateTime } from "@/utils/format";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader,
  Plus,
  Minus,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  Lock,
  Unlock,
  PauseCircle,
  Ban,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/wallets/$sellerId")({
  ssr: false,
  component: () => (
    <AdminShell>
      <WalletDetailPage />
    </AdminShell>
  ),
  head: () => ({ meta: [{ title: "Wallet — AVENTA SHOP Admin" }] }),
});

const TYPE_FILTERS = [
  "ALL",
  "ORDER_CREDIT",
  "COMMISSION_DEBIT",
  "SHIPPING_DEBIT",
  "REFUND_DEBIT",
  "ADJUSTMENT",
  "SETTLEMENT_HOLD",
  "SETTLEMENT_RELEASE",
  "PAYOUT",
  "PAYOUT_REVERSAL",
] as const;

function WalletDetailPage() {
  const { sellerId } = Route.useParams();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AdminWalletDetailData | null>(null);
  const [entries, setEntries] = useState<AdminWalletDetailData["ledger"]["entries"]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [typeFilter, setTypeFilter] = useState<(typeof TYPE_FILTERS)[number]>("ALL");
  const [loadingMore, setLoadingMore] = useState(false);

  // adjustment form
  const [adjAmount, setAdjAmount] = useState("");
  const [adjDirection, setAdjDirection] = useState<"CREDIT" | "DEBIT">("CREDIT");
  const [adjReason, setAdjReason] = useState("");
  const [adjSubmitting, setAdjSubmitting] = useState(false);

  // status change
  const [statusReason, setStatusReason] = useState("");
  const [statusSubmitting, setStatusSubmitting] = useState<string | null>(null);

  const load = useCallback(
    async (opts: { type?: string; before?: number | null; append?: boolean } = {}) => {
      if (!user) return;
      if (!opts.append) setLoading(true);
      try {
        const idToken = await user.getIdToken();
        const detail = await fetchAdminWalletDetail(idToken, sellerId, {
          type: opts.type && opts.type !== "ALL" ? opts.type : undefined,
          before: opts.before ?? null,
        });
        setData(detail);
        setEntries((prev) =>
          opts.append ? [...prev, ...detail.ledger.entries] : detail.ledger.entries,
        );
        setCursor(detail.ledger.nextBefore);
        setHasMore(detail.ledger.hasMore);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not load wallet");
      } finally {
        setLoading(false);
      }
    },
    [user, sellerId],
  );

  useEffect(() => {
    setEntries([]);
    load({ type: typeFilter });
  }, [load, typeFilter]);

  async function loadMore() {
    if (cursor == null) return;
    setLoadingMore(true);
    try {
      await load({ type: typeFilter, before: cursor, append: true });
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleAdjustment() {
    if (!user) return;
    const amount = Number(adjAmount);
    if (!amount || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (adjReason.trim().length < 10) {
      toast.error("A reason of at least 10 characters is required for financial adjustments");
      return;
    }
    setAdjSubmitting(true);
    try {
      const idToken = await user.getIdToken();
      await submitWalletAdjustment({
        idToken,
        sellerId,
        amountTaka: amount,
        direction: adjDirection,
        reason: adjReason.trim(),
      });
      toast.success(
        `Adjustment posted — balance is now ${formatPrice((data?.wallet.availableMinor ?? 0) / 100)}`,
      );
      setAdjAmount("");
      setAdjReason("");
      await load({ type: typeFilter });
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Adjustment failed (re-authentication may be required)",
      );
    } finally {
      setAdjSubmitting(false);
    }
  }

  async function handleStatusChange(status: "ACTIVE" | "SUSPENDED" | "LOCKED" | "CLOSED") {
    if (!user) return;
    if (statusReason.trim().length < 10) {
      toast.error("A reason of at least 10 characters is required");
      return;
    }
    setStatusSubmitting(status);
    try {
      const idToken = await user.getIdToken();
      await submitWalletStatusChange({ idToken, sellerId, status, reason: statusReason.trim() });
      toast.success(`Wallet ${status === "ACTIVE" ? "reactivated" : status.toLowerCase()}`);
      setStatusReason("");
      await load({ type: typeFilter });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Status change failed");
    } finally {
      setStatusSubmitting(null);
    }
  }

  async function handleWithdrawal(withdrawalId: string, action: "approve" | "reject") {
    if (!user) return;
    try {
      const idToken = await user.getIdToken();
      await submitWithdrawalDecision({ idToken, sellerId, withdrawalId, action });
      toast.success(
        action === "approve" ? "Withdrawal completed" : "Withdrawal rejected — funds released",
      );
      await load({ type: typeFilter });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader className="h-8 w-8 animate-spin text-slate-300" />
      </div>
    );
  }

  const wallet = data?.wallet;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link
          to="/admin/wallets"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:text-[#f57224]"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-xl sm:text-2xl font-bold text-[#0f172a] tracking-tight">
            {data?.shopName ?? sellerId}
          </h1>
          <p className="truncate text-xs text-slate-400">
            Wallet {sellerId} · {wallet?.transactionCount ?? 0} transactions
            {data?.sellerStatus ? ` · seller ${data.sellerStatus}` : ""}
          </p>
        </div>
        {wallet && (
          <span
            className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
              wallet.status === "ACTIVE"
                ? "bg-green-50 text-green-700"
                : wallet.status === "CLOSED"
                  ? "bg-slate-100 text-slate-500"
                  : "bg-amber-50 text-amber-700"
            }`}
          >
            {wallet.status}
          </span>
        )}
      </div>

      {/* Balances */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Available", value: (wallet?.availableMinor ?? 0) / 100, cls: "text-[#0f172a]" },
          { label: "Pending", value: (wallet?.pendingMinor ?? 0) / 100, cls: "text-amber-600" },
          {
            label: "Total Earned",
            value: (wallet?.totalEarnedMinor ?? 0) / 100,
            cls: "text-green-600",
          },
          {
            label: "Total Withdrawn",
            value: (wallet?.totalWithdrawnMinor ?? 0) / 100,
            cls: "text-indigo-600",
          },
        ].map((b) => (
          <div key={b.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">{b.label}</p>
            <p className={`mt-1 text-lg font-bold break-all ${b.cls}`}>{formatPrice(b.value)}</p>
          </div>
        ))}
      </div>

      {/* Withdrawal requests */}
      {data && data.withdrawals.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-bold text-[#0f172a]">Withdrawal Requests</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {data.withdrawals.map((w) => (
              <div key={w.withdrawalId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#0f172a]">
                    {formatPrice(w.amountMinor / 100)} · {w.method}
                    {w.destination ? ` · ${w.destination}` : ""}
                  </p>
                  <p className="text-xs text-slate-400">
                    Requested {formatDateTime(w.requestedAt)}
                    {w.reviewNote ? ` · note: ${w.reviewNote}` : ""}
                  </p>
                </div>
                {w.status === "REQUESTED" || w.status === "PROCESSING" ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleWithdrawal(w.withdrawalId, "approve")}
                      className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-green-700"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Approve &amp; Pay
                    </button>
                    <button
                      onClick={() => handleWithdrawal(w.withdrawalId, "reject")}
                      className="flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-600 transition-colors hover:bg-red-50"
                    >
                      <XCircle className="h-3.5 w-3.5" /> Reject
                    </button>
                  </div>
                ) : (
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      w.status === "COMPLETED"
                        ? "bg-green-50 text-green-700"
                        : w.status === "REJECTED"
                          ? "bg-red-50 text-red-600"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {w.status}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual adjustment */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-[#0f172a]">Manual Adjustment</h2>
        <p className="mt-0.5 text-xs text-slate-400">
          Posts an immutable ADJUSTMENT ledger entry. A reason is mandatory and is audit-logged. You
          may be asked to re-enter your password (fresh re-auth) for money-moving actions.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-[120px_1fr]">
          <div className="flex gap-2">
            <button
              onClick={() => setAdjDirection("CREDIT")}
              className={`flex flex-1 items-center justify-center gap-1 rounded-lg border py-2 text-sm font-bold transition-colors ${
                adjDirection === "CREDIT"
                  ? "border-green-600 bg-green-50 text-green-700"
                  : "border-slate-200 text-slate-500"
              }`}
            >
              <Plus className="h-4 w-4" /> Credit
            </button>
            <button
              onClick={() => setAdjDirection("DEBIT")}
              className={`flex flex-1 items-center justify-center gap-1 rounded-lg border py-2 text-sm font-bold transition-colors ${
                adjDirection === "DEBIT"
                  ? "border-red-500 bg-red-50 text-red-600"
                  : "border-slate-200 text-slate-500"
              }`}
            >
              <Minus className="h-4 w-4" /> Debit
            </button>
          </div>
          <input
            type="number"
            value={adjAmount}
            onChange={(e) => setAdjAmount(e.target.value)}
            placeholder="Amount (৳)"
            className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#f57224]"
          />
        </div>
        <input
          value={adjReason}
          onChange={(e) => setAdjReason(e.target.value)}
          placeholder="Reason (required, min 10 characters — e.g. compensation for verified service issue)"
          className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#f57224]"
        />
        <button
          onClick={handleAdjustment}
          disabled={adjSubmitting}
          className="mt-3 rounded-xl bg-[#0f172a] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
        >
          {adjSubmitting ? "Posting..." : `Post ${adjDirection === "CREDIT" ? "Credit" : "Debit"}`}
        </button>
      </div>

      {/* Wallet status */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-[#0f172a]">Wallet Status</h2>
        <p className="mt-0.5 text-xs text-slate-400">
          SUSPENDED/LOCKED blocks new withdrawals. CLOSED is terminal — history stays auditable.
        </p>
        <input
          value={statusReason}
          onChange={(e) => setStatusReason(e.target.value)}
          placeholder="Reason (required, min 10 characters — audit-logged)"
          className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#f57224]"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {wallet?.status !== "ACTIVE" && (
            <button
              onClick={() => handleStatusChange("ACTIVE")}
              disabled={statusSubmitting != null}
              className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-green-700 disabled:opacity-60"
            >
              <Unlock className="h-3.5 w-3.5" /> Reactivate
            </button>
          )}
          {wallet?.status !== "SUSPENDED" && wallet?.status !== "CLOSED" && (
            <button
              onClick={() => handleStatusChange("SUSPENDED")}
              disabled={statusSubmitting != null}
              className="flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-60"
            >
              <PauseCircle className="h-3.5 w-3.5" /> Suspend
            </button>
          )}
          {wallet?.status !== "LOCKED" && wallet?.status !== "CLOSED" && (
            <button
              onClick={() => handleStatusChange("LOCKED")}
              disabled={statusSubmitting != null}
              className="flex items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-60"
            >
              <Lock className="h-3.5 w-3.5" /> Lock
            </button>
          )}
          {wallet?.status !== "CLOSED" && (
            <button
              onClick={() => handleStatusChange("CLOSED")}
              disabled={statusSubmitting != null}
              className="flex items-center gap-1 rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-bold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
            >
              <Ban className="h-3.5 w-3.5" /> Close (terminal)
            </button>
          )}
        </div>
      </div>

      {/* Ledger history */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          <ShieldAlert className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-bold text-[#0f172a]">Transaction Ledger</h2>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as (typeof TYPE_FILTERS)[number])}
            className="ml-auto rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 outline-none"
          >
            {TYPE_FILTERS.map((t) => (
              <option key={t} value={t}>
                {t === "ALL" ? "All types" : t}
              </option>
            ))}
          </select>
        </div>

        {entries.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-slate-400">No transactions for this filter.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {entries.map((e) => {
              const isCredit = e.direction === "CREDIT";
              return (
                <div key={e.transactionId} className="flex items-start gap-3 px-4 py-3">
                  <span
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      isCredit ? "bg-green-50 text-green-600" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {isCredit ? "+" : "−"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[#0f172a]">
                      {e.type}
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                        {e.status}
                      </span>
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {formatDateTime(e.createdAt)} · by {e.createdBy}
                      {e.orderId ? ` · order ${e.orderId.slice(0, 12)}` : ""}
                      {e.reference ? ` · ref ${String(e.reference).slice(0, 24)}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`text-sm font-bold ${isCredit ? "text-green-600" : "text-slate-700"}`}
                    >
                      {isCredit ? "+" : "−"}
                      {formatPrice(Math.abs(e.amountMinor) / 100)}
                    </p>
                    <p className="text-xs text-slate-400">
                      bal {formatPrice(e.balanceAfter / 100)} · held{" "}
                      {formatPrice(e.heldAfter / 100)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {hasMore && (
          <div className="border-t border-slate-100 p-3 text-center">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="text-sm font-semibold text-[#f57224] hover:text-orange-600 disabled:opacity-60"
            >
              {loadingMore ? "Loading..." : "Load more"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
