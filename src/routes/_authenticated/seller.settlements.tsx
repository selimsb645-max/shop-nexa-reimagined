/**
 * AVENTA SHOP — Seller Settlement Dashboard Route
 *
 * Route: /seller/settlements
 * Shows the seller's complete financial picture:
 * - Total Sales, Total Commission
 * - Pending Earnings (in hold period)
 * - Available Balance
 * - Total Withdrawn
 * - Pending Withdrawal
 * - Withdrawal History
 * - Settlement Ledger (immutable transaction history)
 * - Withdrawal Request form
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useSellerProfile } from "@/hooks/useSellerProfile";
import {
  fetchSellerFinancials,
  requestSellerWithdrawal,
  triggerSettlementRelease,
  type SellerSettlementData,
} from "@/services/firebase/sellerSettlements";
import { SellerShell } from "@/components/seller/SellerShell";
import { SellerGate } from "@/components/seller/SellerGate";
import { formatPrice } from "@/utils/format";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import {
  DollarSign,
  TrendingUp,
  Wallet,
  Clock,
  ArrowDownToLine,
  History,
  CheckCircle2,
  XCircle,
  Banknote,
  Smartphone,
  Landmark,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/seller/settlements")({
  ssr: false,
  component: () => (
    <SellerGate>{(profile) => <SellerSettlementsPage profile={profile} />}</SellerGate>
  ),
  head: () => ({ meta: [{ title: "Settlements — AVENTA SHOP Seller" }] }),
});

function SellerSettlementsPage({
  profile: seller,
}: {
  profile: NonNullable<ReturnType<typeof useSellerProfile>["profile"]>;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SellerSettlementData | null>(null);
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
      // Lazy release eligible settlements first
      await triggerSettlementRelease(idToken);
      const financials = await fetchSellerFinancials(idToken);
      setData(financials);
    } catch (err) {
      toast.error(t("seller.couldNotLoadFinance"));
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
      toast.error("Minimum withdrawal is $10");
      return;
    }
    if (data && amount > data.availableBalance) {
      toast.error(t("seller.insufficientBalance"));
      return;
    }

    // Get destination from seller profile
    let destination = "";
    if (withdrawMethod === "bank") {
      destination = seller?.bankInfo?.accountNumber ?? "";
      if (!destination) {
        toast.error(t("seller.addBankFirst"));
        return;
      }
    } else {
      destination = seller?.bankInfo?.mobileBankingNumber ?? "";
      if (!destination) {
        toast.error(t("seller.addMobileBankingFirst"));
        return;
      }
    }

    setSubmitting(true);
    try {
      const idToken = await user.getIdToken();
      const result = await requestSellerWithdrawal({
        idToken,
        amount,
        method: withdrawMethod,
        destination,
      });
      toast.success(`Withdrawal requested: ${formatPrice(amount)}`);
      setShowWithdraw(false);
      setWithdrawAmount("");
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not request withdrawal");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <SellerShell>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </SellerShell>
    );
  }

  return (
    <SellerShell>
      <div className="space-y-6 p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Settlements & Earnings</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Your sales, earnings, and withdrawal management
            </p>
          </div>
          {data && data.availableBalance >= 10 && (
            <button
              onClick={() => setShowWithdraw(!showWithdraw)}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Request Withdrawal
            </button>
          )}
        </div>

        {/* Overview Cards */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
          <StatCard
            icon={<DollarSign className="h-5 w-5" />}
            label="Total Sales"
            value={data ? formatPrice(data.totalSales) : "$0"}
            color="text-blue-600"
          />
          <StatCard
            icon={<TrendingUp className="h-5 w-5" />}
            label="Total Commission"
            value={data ? formatPrice(data.totalCommission) : "$0"}
            color="text-red-600"
          />
          <StatCard
            icon={<Clock className="h-5 w-5" />}
            label="Pending Earnings"
            value={data ? formatPrice(data.pendingEarnings) : "$0"}
            color="text-orange-600"
          />
          <StatCard
            icon={<Wallet className="h-5 w-5" />}
            label="Available Balance"
            value={data ? formatPrice(data.availableBalance) : "$0"}
            color="text-green-600"
          />
          <StatCard
            icon={<ArrowDownToLine className="h-5 w-5" />}
            label="Total Withdrawn"
            value={data ? formatPrice(data.totalWithdrawn) : "$0"}
            color="text-indigo-600"
          />
        </div>

        {/* Withdrawal Form */}
        {showWithdraw && (
          <div className="rounded-xl border bg-card p-4">
            <h2 className="text-lg font-semibold mb-4">{t("seller.requestWithdrawal")}</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Amount ($)</label>
                <input
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="Minimum $10"
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Available: {data ? formatPrice(data.availableBalance) : "$0"}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium">{t("seller.payoutMethod")}</label>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {([
                    { id: "bkash" as const, label: "bKash", icon: Smartphone },
                    { id: "nagad" as const, label: "Nagad", icon: Smartphone },
                    { id: "rocket" as const, label: "Rocket", icon: Smartphone },
                    { id: "bank" as const, label: "Bank", icon: Landmark },
                  ] as const).map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setWithdrawMethod(m.id)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                        withdrawMethod === m.id
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      <m.icon className="h-4 w-4" />
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleWithdraw}
                  disabled={submitting}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {submitting ? "Processing..." : "Submit Request"}
                </button>
                <button
                  onClick={() => setShowWithdraw(false)}
                  className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Settlement Ledger */}
        <div className="rounded-xl border bg-card">
          <div className="border-b px-4 py-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <History className="h-5 w-5" />
              Settlement History
            </h2>
          </div>
          <div className="divide-y max-h-96 overflow-y-auto">
            {data?.recentTransactions.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No transactions yet
              </div>
            ) : (
              data?.recentTransactions.map(
                (tx: NonNullable<SellerSettlementData["recentTransactions"]>[number]) => (
                  <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full ${
                        tx.amount > 0 ? "bg-green-100" : "bg-red-100"
                      }`}
                    >
                      {tx.amount > 0 ? (
                        <ArrowDownToLine className="h-4 w-4 text-green-600" />
                      ) : (
                        <ArrowDownToLine className="h-4 w-4 text-red-600 rotate-180" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{tx.note}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(tx.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div
                      className={`text-sm font-semibold ${
                        tx.amount > 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {tx.amount > 0 ? "+" : ""}
                      {formatPrice(Math.abs(tx.amount))}
                    </div>
                  </div>
                ),
              )
            )}
          </div>
        </div>

        {/* Settlement Lifecycle Info */}
        <div className="rounded-xl border bg-muted/30 p-4">
          <h3 className="text-sm font-semibold mb-2">{t("seller.howSettlementsWork")}</h3>
          <div className="space-y-1 text-xs text-muted-foreground">
            <div>1. Customer places order → Your earnings are "Pending"</div>
            <div>2. Order is delivered → Earnings enter 7-day hold period</div>
            <div>3. Hold period ends → Earnings become "Available"</div>
            <div>4. You request withdrawal → Admin reviews and processes</div>
            <div>5. Manual payout to your registered account → Marked as "Paid"</div>
          </div>
        </div>
      </div>
    </SellerShell>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={color}>{icon}</span>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="text-xl font-bold break-all">{value}</div>
    </div>
  );
}
