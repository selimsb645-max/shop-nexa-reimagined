/**
 * AVENTA SHOP — Seller Wallet
 *
 * Route: /seller/wallet
 * Reuses existing infrastructure:
 * - getSellerWalletBalance, getSellerTotalEarnings, getSellerPendingBalance
 * - listSellerWalletTransactions (from sellerWallet service)
 * - requestSellerWithdrawal + triggerSettlementRelease (from sellerSettlements)
 * - SellerGate for auth + seller authorization
 *
 * Security: All balance data comes from Firestore (RLS-protected).
 * Withdrawals go through server-verified settlement functions.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { SellerGate } from "@/components/seller/SellerGate";
import {
  getSellerWalletBalance,
  getSellerTotalEarnings,
  getSellerPendingBalance,
  listSellerWalletTransactions,
} from "@/services/firebase/sellerWallet";
import {
  requestSellerWithdrawal,
  triggerSettlementRelease,
} from "@/services/firebase/sellerSettlements";
import { formatPrice, formatDateTime } from "@/utils/format";
import { toast } from "sonner";
import type { SellerWalletTx, SellerWalletTxType } from "@/types/seller";
import type { SellerProfile } from "@/types/seller";
import {
  Wallet,
  Clock,
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  Loader,
  Banknote,
  Smartphone,
  Landmark,
  CheckCircle2,
  XCircle,
  Plus,
  Minus,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/seller/wallet")({
  ssr: false,
  component: () => <SellerGate>{(profile) => <WalletPage profile={profile} />}</SellerGate>,
  head: () => ({ meta: [{ title: "Wallet — AVENTA SHOP Seller" }] }),
});

const TX_TYPE_CONFIG: Record<
  SellerWalletTxType,
  { label: string; icon: typeof Plus; color: string; bgColor: string }
> = {
  earning: { label: "Earning", icon: Plus, color: "#059669", bgColor: "#ecfdf5" },
  withdrawal: { label: "Withdrawal", icon: Minus, color: "#6366f1", bgColor: "#eef2ff" },
  adjustment: { label: "Adjustment", icon: Banknote, color: "#d97706", bgColor: "#fffbeb" },
  refund: { label: "Refund", icon: ArrowUpFromLine, color: "#dc2626", bgColor: "#fef2f2" },
  bonus: { label: "Bonus", icon: Plus, color: "#f57224", bgColor: "#fff7ed" },
};

const TX_STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  completed: { label: "Completed", color: "#059669", bgColor: "#ecfdf5" },
  pending: { label: "Pending", color: "#d97706", bgColor: "#fffbeb" },
  failed: { label: "Failed", color: "#dc2626", bgColor: "#fef2f2" },
};

function WalletPage({ profile }: { profile: SellerProfile }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [pendingBalance, setPendingBalance] = useState(0);
  const [transactions, setTransactions] = useState<SellerWalletTx[]>([]);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawMethod, setWithdrawMethod] = useState<"bank" | "bkash" | "nagad" | "rocket">(
    "bkash",
  );
  const [submitting, setSubmitting] = useState(false);

  async function loadData() {
    if (!user) return;
    setLoading(true);
    try {
      const idToken = await user.getIdToken();
      await triggerSettlementRelease(idToken);
      const [bal, earn, pend, txs] = await Promise.all([
        getSellerWalletBalance(profile.uid),
        getSellerTotalEarnings(profile.uid),
        getSellerPendingBalance(profile.uid),
        listSellerWalletTransactions(profile.uid, { max: 100 }),
      ]);
      setBalance(bal);
      setTotalEarnings(earn);
      setPendingBalance(pend);
      setTransactions(txs);
    } catch (err) {
      toast.error("Could not load wallet data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [user]);

  async function handleWithdraw() {
    if (!user) return;
    const amount = Number(withdrawAmount);
    if (!amount || amount < 10) {
      toast.error("Minimum withdrawal is 10");
      return;
    }
    if (amount > balance) {
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
      await requestSellerWithdrawal({
        idToken,
        amount,
        method: withdrawMethod,
        destination,
      });
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

  const withdrawable = Math.max(0, balance);

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0f172a] tracking-tight">Wallet</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage your balance and withdrawals</p>
        </div>
        {withdrawable >= 10 && (
          <button
            onClick={() => setShowWithdraw(!showWithdraw)}
            className="bg-[#f57224] hover:bg-orange-600 text-white font-bold py-2.5 px-4 rounded-xl text-sm transition-colors flex items-center gap-1.5"
          >
            <ArrowDownToLine className="w-4 h-4" /> Withdraw
          </button>
        )}
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Available Balance — featured */}
        <div className="bg-gradient-to-br from-[#0f172a] to-[#1e293b] rounded-xl p-5 text-white shadow-lg sm:col-span-1">
          <div className="flex items-center gap-2 mb-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/10">
              <Wallet className="w-4 h-4" />
            </span>
            <span className="text-xs font-medium text-slate-300">Available Balance</span>
          </div>
          <div className="text-2xl font-bold break-all">{formatPrice(withdrawable)}</div>
          <p className="text-xs text-slate-400 mt-1">Withdrawable to your account</p>
        </div>

        {/* Pending Balance */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-50">
              <Clock className="w-4 h-4 text-amber-600" />
            </span>
            <span className="text-xs font-medium text-slate-500">Pending Balance</span>
          </div>
          <div className="text-2xl font-bold text-[#0f172a] break-all">
            {formatPrice(pendingBalance)}
          </div>
          <p className="text-xs text-slate-400 mt-1">In hold period</p>
        </div>

        {/* Total Earnings */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-green-50">
              <Banknote className="w-4 h-4 text-green-600" />
            </span>
            <span className="text-xs font-medium text-slate-500">Total Earnings</span>
          </div>
          <div className="text-2xl font-bold text-[#0f172a] break-all">
            {formatPrice(totalEarnings)}
          </div>
          <p className="text-xs text-slate-400 mt-1">Lifetime earnings</p>
        </div>
      </div>

      {/* Withdrawal Form */}
      {showWithdraw && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <h2 className="text-sm font-bold text-[#0f172a] mb-4">Request Withdrawal</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Amount</label>
              <input
                type="number"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="Minimum 10"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#f57224]"
              />
              <p className="mt-1 text-xs text-slate-400">Available: {formatPrice(withdrawable)}</p>
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
                        ? "border-[#f57224] bg-[#fff7ed] text-[#f57224] font-semibold"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <m.icon className="w-4 h-4" />
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleWithdraw}
                disabled={submitting}
                className="rounded-lg bg-[#f57224] px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
              >
                {submitting ? "Processing..." : "Submit Request"}
              </button>
              <button
                onClick={() => setShowWithdraw(false)}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transaction History */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-[#0f172a]">
            <History className="w-4 h-4" />
            Transaction History
          </h2>
        </div>
        <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
          {transactions.length === 0 ? (
            <div className="py-12 text-center">
              <History className="w-10 h-10 text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No transactions yet</p>
              <p className="text-xs text-slate-300 mt-1">Your wallet activity will appear here</p>
            </div>
          ) : (
            transactions.map((tx) => {
              const cfg = TX_TYPE_CONFIG[tx.type] ?? TX_TYPE_CONFIG.earning;
              const statusCfg = TX_STATUS_CONFIG[tx.status] ?? TX_STATUS_CONFIG.completed;
              return (
                <div key={tx.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-full"
                    style={{ backgroundColor: cfg.bgColor, color: cfg.color }}
                  >
                    <cfg.icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#0f172a] truncate">
                      {tx.note || cfg.label}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span>{cfg.label}</span>
                      <span>·</span>
                      <span>{formatDateTime(tx.createdAt)}</span>
                      {tx.orderId && (
                        <>
                          <span>·</span>
                          <span>Order: {tx.orderId.substring(0, 8)}…</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`text-sm font-bold ${
                        tx.amount > 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {tx.amount > 0 ? "+" : "-"}
                      {formatPrice(Math.abs(tx.amount))}
                    </span>
                    <span
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: statusCfg.bgColor, color: statusCfg.color }}
                    >
                      {statusCfg.label}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
