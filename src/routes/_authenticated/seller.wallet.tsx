/**
 * AVENTA SHOP — Seller Wallet (v2, server-authoritative)
 *
 * Route: /seller/wallet
 *
 * Every number on this page comes from the finance engine through
 * verified server functions:
 *  - balances from `sellerFinance/{uid}` (maintained ONLY inside
 *    atomic ledger transactions — never client-computed)
 *  - history from the append-only `sellerLedger` collection
 *  - withdrawal requests reserve funds via SETTLEMENT_HOLD entries
 *
 * Legacy float-era walletTx reads are no longer used here.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { SellerGate } from "@/components/seller/SellerGate";
import {
  fetchWalletV2,
  fetchWalletV2LedgerPage,
  requestWalletWithdrawalV2,
  type WalletV2Entry,
  type WalletV2Overview,
} from "@/services/firebase/sellerWallet";
import { formatPrice, formatDateTime } from "@/utils/format";
import { toast } from "sonner";
import type { SellerProfile } from "@/types/seller";
import {
  Wallet,
  Clock,
  ArrowDownToLine,
  Loader,
  Banknote,
  Smartphone,
  Landmark,
  Plus,
  Minus,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  History,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/seller/wallet")({
  ssr: false,
  component: () => <SellerGate>{(profile) => <WalletPage profile={profile} />}</SellerGate>,
  head: () => ({ meta: [{ title: "Wallet — AVENTA SHOP Seller" }] }),
});

/** Ledger entry presentation — CREDIT/DEBIT never inferred from labels. */
const LEDGER_TYPE_CONFIG: Record<string, { label: string }> = {
  ORDER_CREDIT: { label: "Sale Earning" },
  COMMISSION_DEBIT: { label: "Marketplace Fee" },
  SHIPPING_DEBIT: { label: "Shipping Fee" },
  REFUND_DEBIT: { label: "Refund" },
  ADJUSTMENT: { label: "Adjustment" },
  SETTLEMENT_HOLD: { label: "Funds on Hold" },
  SETTLEMENT_RELEASE: { label: "Funds Released" },
  PAYOUT: { label: "Withdrawal Paid" },
  PAYOUT_REVERSAL: { label: "Payout Reversal" },
};

function entryLabel(e: WalletV2Entry): string {
  if (e.type === "ADJUSTMENT") {
    return e.direction === "CREDIT" ? "Bonus / Compensation" : "Adjustment";
  }
  return LEDGER_TYPE_CONFIG[e.type]?.label ?? e.type;
}

function WalletPage({ profile }: { profile: SellerProfile }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<WalletV2Overview | null>(null);
  const [entries, setEntries] = useState<WalletV2Entry[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawMethod, setWithdrawMethod] = useState<"bank" | "bkash" | "nagad" | "rocket">(
    "bkash",
  );
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const idToken = await user.getIdToken();
      const overview = await fetchWalletV2(idToken);
      setData(overview);
      setEntries(overview.ledger.entries);
      setCursor(overview.ledger.nextBefore);
      setHasMore(overview.ledger.hasMore);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load wallet data");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function loadMore() {
    if (!user || cursor == null) return;
    setLoadingMore(true);
    try {
      const idToken = await user.getIdToken();
      const page = await fetchWalletV2LedgerPage(idToken, cursor);
      setEntries((prev) => [...prev, ...page.entries]);
      setCursor(page.nextBefore);
      setHasMore(page.hasMore);
    } catch {
      toast.error("Could not load more transactions");
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleWithdraw() {
    if (!user) return;
    const amount = Number(withdrawAmount);
    if (!amount || amount < 10) {
      toast.error("Minimum withdrawal is ৳10");
      return;
    }
    if (data && amount > data.wallet.availableMinor / 100) {
      toast.error("Insufficient balance");
      return;
    }

    let destination = "";
    if (withdrawMethod === "bank") {
      destination = profile.bankInfo?.accountNumber ?? "";
      if (!destination) {
        toast.error("Please add your bank account in settings first");
        return;
      }
    } else {
      destination = profile.bankInfo?.mobileBankingNumber ?? "";
      if (!destination) {
        toast.error("Please add your mobile banking number in settings first");
        return;
      }
    }

    setSubmitting(true);
    try {
      const idToken = await user.getIdToken();
      await requestWalletWithdrawalV2({ idToken, amountTaka: amount, method: withdrawMethod, destination });
      toast.success(`Withdrawal requested: ${formatPrice(amount)}`);
      setShowWithdraw(false);
      setWithdrawAmount("");
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not request withdrawal");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader className="w-8 h-8 animate-spin text-slate-300" />
      </div>
    );
  }

  const wallet = data?.wallet;
  const available = (wallet?.availableMinor ?? 0) / 100;
  const pending = (wallet?.pendingMinor ?? 0) / 100;
  const totalEarned = (wallet?.totalEarnedMinor ?? 0) / 100;
  const totalWithdrawn = (wallet?.totalWithdrawnMinor ?? 0) / 100;
  const walletStatus = wallet?.status ?? "ACTIVE";

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0f172a] tracking-tight">Wallet</h1>
          <p className="text-sm text-slate-500 mt-0.5">Your balance, earnings and withdrawals</p>
        </div>
        {walletStatus === "ACTIVE" && available >= 10 && (
          <button
            onClick={() => setShowWithdraw(!showWithdraw)}
            className="bg-[#f57224] hover:bg-orange-600 text-white font-bold py-2.5 px-4 rounded-xl text-sm transition-colors flex items-center gap-1.5"
          >
            <ArrowDownToLine className="w-4 h-4" /> Withdraw
          </button>
        )}
      </div>

      {/* Wallet status banner */}
      {walletStatus !== "ACTIVE" && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-amber-900">
              Wallet {walletStatus === "SUSPENDED" ? "temporarily suspended" : walletStatus === "LOCKED" ? "locked" : "closed"}
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Withdrawals are blocked while your wallet is {walletStatus.toLowerCase()}. Your balance and history remain intact — contact support for details.
            </p>
          </div>
        </div>
      )}

      {/* Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-[#0f172a] to-[#1e293b] rounded-xl p-5 text-white shadow-lg">
          <div className="flex items-center gap-2 mb-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/10">
              <Wallet className="w-4 h-4" />
            </span>
            <span className="text-xs font-medium text-slate-300">Available Balance</span>
          </div>
          <div className="text-2xl font-bold break-all">{formatPrice(available)}</div>
          <p className="text-xs text-slate-400 mt-1">Ready to withdraw</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-50">
              <Clock className="w-4 h-4 text-amber-600" />
            </span>
            <span className="text-xs font-medium text-slate-500">Pending Balance</span>
          </div>
          <div className="text-2xl font-bold text-[#0f172a] break-all">{formatPrice(pending)}</div>
          <p className="text-xs text-slate-400 mt-1">On hold — release cycle or withdrawal in review</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-green-50">
              <Banknote className="w-4 h-4 text-green-600" />
            </span>
            <span className="text-xs font-medium text-slate-500">Total Earned</span>
          </div>
          <div className="text-2xl font-bold text-[#0f172a] break-all">{formatPrice(totalEarned)}</div>
          <p className="text-xs text-slate-400 mt-1">Lifetime credits</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-50">
              <ArrowDownToLine className="w-4 h-4 text-indigo-600" />
            </span>
            <span className="text-xs font-medium text-slate-500">Total Withdrawn</span>
          </div>
          <div className="text-2xl font-bold text-[#0f172a] break-all">{formatPrice(totalWithdrawn)}</div>
          <p className="text-xs text-slate-400 mt-1">Paid out to date</p>
        </div>
      </div>

      {/* Withdrawal Form */}
      {showWithdraw && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <h2 className="text-sm font-bold text-[#0f172a] mb-4">Request Withdrawal</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Amount (৳)</label>
              <input
                type="number"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="Minimum 10"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#f57224]"
              />
              <p className="mt-1 text-xs text-slate-400">Available: {formatPrice(available)}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Payout Method</label>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { id: "bkash", label: "bKash", icon: Smartphone },
                  { id: "nagad", label: "Nagad", icon: Smartphone },
                  { id: "rocket", label: "Rocket", icon: Smartphone },
                  { id: "bank", label: "Bank", icon: Landmark },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setWithdrawMethod(m.id as "bank" | "bkash" | "nagad" | "rocket")}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                      withdrawMethod === m.id
                        ? "border-[#f57224] bg-orange-50 text-[#f57224] font-semibold"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    <m.icon className="w-4 h-4" /> {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
              Funds are reserved from your available balance immediately and released once an admin
              processes the request. Rejected requests return to your available balance.
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleWithdraw}
                disabled={submitting}
                className="bg-[#f57224] hover:bg-orange-600 disabled:opacity-60 text-white font-bold py-2.5 px-4 rounded-xl text-sm transition-colors"
              >
                {submitting ? "Requesting..." : "Request Withdrawal"}
              </button>
              <button
                onClick={() => setShowWithdraw(false)}
                className="border border-slate-200 hover:border-slate-300 text-slate-600 font-semibold py-2.5 px-4 rounded-xl text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pending withdrawal requests */}
      {data && data.withdrawals.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <h2 className="text-sm font-bold text-[#0f172a] mb-3">Withdrawal Requests</h2>
          <div className="divide-y divide-slate-100">
            {data.withdrawals.map((w) => (
              <div key={w.withdrawalId} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#0f172a] truncate">
                    {formatPrice(w.amountMinor / 100)} · {w.method}
                  </p>
                  <p className="text-xs text-slate-400">{formatDateTime(w.requestedAt)}</p>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    w.status === "COMPLETED"
                      ? "bg-green-50 text-green-700"
                      : w.status === "REJECTED" || w.status === "FAILED"
                        ? "bg-red-50 text-red-600"
                        : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {w.status === "COMPLETED" ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : w.status === "REJECTED" || w.status === "FAILED" ? (
                    <XCircle className="h-3.5 w-3.5" />
                  ) : null}
                  {w.status === "REQUESTED" ? "Pending review" : w.status.toLowerCase()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transaction History */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <History className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-bold text-[#0f172a]">Transaction History</h2>
          {wallet && (
            <span className="ml-auto text-xs text-slate-400">
              {wallet.transactionCount} total
            </span>
          )}
        </div>

        {entries.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-slate-400">
              No transactions yet. Your sales, fees and payouts will appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {entries.map((e) => {
              const isCredit = e.direction === "CREDIT";
              return (
                <div key={e.transactionId} className="flex items-center gap-3 px-4 py-3">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                      isCredit ? "bg-green-50" : "bg-slate-100"
                    }`}
                  >
                    {isCredit ? (
                      <Plus className="h-4 w-4 text-green-600" />
                    ) : (
                      <Minus className="h-4 w-4 text-slate-500" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#0f172a]">{entryLabel(e)}</p>
                    <p className="truncate text-xs text-slate-400">
                      {formatDateTime(e.createdAt)}
                      {e.orderId ? ` · Order ${e.orderId.slice(0, 8)}` : ""}
                      {e.reference && !e.orderId ? ` · ${String(e.reference).slice(0, 16)}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`text-sm font-bold ${
                        isCredit ? "text-green-600" : "text-slate-700"
                      }`}
                    >
                      {isCredit ? "+" : "−"}
                      {formatPrice(Math.abs(e.amountMinor) / 100)}
                    </p>
                    <p className="text-xs text-slate-400">
                      Balance {formatPrice(e.balanceAfter / 100)}
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
