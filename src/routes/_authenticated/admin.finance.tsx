/**
 * AVENTA SHOP — Admin Finance Panel Route
 *
 * Route: /admin/finance
 * Shows the complete financial overview for AVENTA SHOP:
 * - Total Customer Payments
 * - Total Platform Revenue (commission)
 * - Total Seller Sales
 * - Pending Seller Settlement
 * - Available Seller Balance
 * - Withdrawal Requests (pending, approved, paid)
 * - Refunded Amount
 * - Seller-wise settlement history
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  fetchAdminFinanceOverview,
  approveWithdrawal,
  rejectWithdrawal,
} from "@/services/firebase/adminSettlements";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  listAllWithdrawalRequests,
  type AdminWithdrawalRow,
} from "@/services/firebase/adminWithdrawals";
import type { AdminFinanceData } from "@/services/firebase/adminSettlements";
import { formatPrice } from "@/utils/format";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import {
  DollarSign,
  TrendingUp,
  Wallet,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowDownToLine,
  Receipt,
  RotateCcw,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/finance")({
  ssr: false,
  component: AdminFinancePage,
  head: () => ({ meta: [{ title: "Finance — AVENTA SHOP Admin" }] }),
});

function AdminFinancePage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<AdminFinanceData | null>(null);
  const [withdrawals, setWithdrawals] = useState<AdminWithdrawalRow[]>([]);
  const [processing, setProcessing] = useState<string | null>(null);

  async function loadData() {
    if (!user) return;
    setLoading(true);
    try {
      const idToken = await user.getIdToken();
      const [finance, withdrawalList] = await Promise.all([
        fetchAdminFinanceOverview(idToken),
        listAllWithdrawalRequests(idToken),
      ]);
      setOverview(finance);
      setWithdrawals(withdrawalList);
    } catch (err) {
      toast.error(t("admin.couldNotLoadFinance"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [user]);

  async function handleApprove(sellerId: string, withdrawalId: string, txRef?: string) {
    if (!user) return;
    setProcessing(withdrawalId);
    try {
      const idToken = await user.getIdToken();
      await approveWithdrawal({ idToken, sellerId, withdrawalId, txRef });
      toast.success(t("admin.withdrawalApproved"));
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not approve withdrawal");
    } finally {
      setProcessing(null);
    }
  }

  async function handleReject(sellerId: string, withdrawalId: string, note: string) {
    if (!user) return;
    setProcessing(withdrawalId);
    try {
      const idToken = await user.getIdToken();
      await rejectWithdrawal({ idToken, sellerId, withdrawalId, note });
      toast.success(t("admin.withdrawalRejected"));
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reject withdrawal");
    } finally {
      setProcessing(null);
    }
  }

  if (loading) {
    return (
      <AdminShell>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <div className="space-y-6 p-4 sm:p-6">
        <div>
          <h1 className="text-2xl font-bold">Finance & Settlements</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Customer payments, seller settlements, and withdrawal management
          </p>
        </div>

        {/* Overview Cards */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <FinanceCard
            icon={<DollarSign className="h-5 w-5" />}
            label="Customer Payments"
            value={overview ? formatPrice(overview.totalCustomerPayments) : "$0"}
            color="text-blue-600"
          />
          <FinanceCard
            icon={<TrendingUp className="h-5 w-5" />}
            label="Platform Revenue"
            value={overview ? formatPrice(overview.totalPlatformRevenue) : "$0"}
            color="text-green-600"
          />
          <FinanceCard
            icon={<Receipt className="h-5 w-5" />}
            label="Seller Sales"
            value={overview ? formatPrice(overview.totalSellerSales) : "$0"}
            color="text-purple-600"
          />
          <FinanceCard
            icon={<Clock className="h-5 w-5" />}
            label="Pending Settlement"
            value={overview ? formatPrice(overview.pendingSellerSettlement) : "$0"}
            color="text-orange-600"
          />
          <FinanceCard
            icon={<Wallet className="h-5 w-5" />}
            label="Available Balance"
            value={overview ? formatPrice(overview.availableSellerBalance) : "$0"}
            color="text-teal-600"
          />
          <FinanceCard
            icon={<ArrowDownToLine className="h-5 w-5" />}
            label="Total Withdrawn"
            value={overview ? formatPrice(overview.totalWithdrawnAmount) : "$0"}
            color="text-indigo-600"
          />
          <FinanceCard
            icon={<RotateCcw className="h-5 w-5" />}
            label="Refunded"
            value={overview ? formatPrice(overview.refundedAmount) : "$0"}
            color="text-red-600"
          />
          <FinanceCard
            icon={<Clock className="h-5 w-5" />}
            label="Pending Withdrawals"
            value={String(overview?.pendingWithdrawalsCount ?? 0)}
            color="text-amber-600"
          />
        </div>

        {/* Money Flow Diagram */}
        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-lg font-semibold mb-3">{t("admin.moneyFlow")}</h2>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <FlowBox label="Customer" color="bg-blue-100 text-blue-700" />
            <FlowArrow />
            <FlowBox label="AVENTA SHOP Gateway" color="bg-primary/10 text-primary" />
            <FlowArrow />
            <FlowBox label="Order Paid" color="bg-green-100 text-green-700" />
            <FlowArrow />
            <FlowBox label="Seller Earnings: Pending" color="bg-orange-100 text-orange-700" />
            <FlowArrow />
            <FlowBox label="Delivered → Hold (7d)" color="bg-amber-100 text-amber-700" />
            <FlowArrow />
            <FlowBox label="Available" color="bg-teal-100 text-teal-700" />
            <FlowArrow />
            <FlowBox label="Withdrawal → Admin → Paid" color="bg-indigo-100 text-indigo-700" />
          </div>
        </div>

        {/* Withdrawal Requests */}
        <div className="rounded-xl border bg-card">
          <div className="border-b px-4 py-3">
            <h2 className="text-lg font-semibold">{t("admin.withdrawalRequests")}</h2>
          </div>
          <div className="divide-y">
            {withdrawals.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No withdrawal requests
              </div>
            ) : (
              withdrawals.map((w) => (
                <div key={w.id} className="flex items-center gap-4 px-4 py-3">
                  <div className="flex-1">
                    <div className="font-medium">
                      {w.sellerId.slice(0, 8)} · {formatPrice(w.amount)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {w.method} · {w.destination} · {new Date(w.requestedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="text-right">
                    {w.status === "pending" ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            const txRef = prompt("Enter payout transaction reference:");
                            if (txRef) handleApprove(w.sellerId, w.id, txRef);
                          }}
                          disabled={processing === w.id}
                          className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => {
                            const note = prompt("Rejection reason:") ?? "";
                            handleReject(w.sellerId, w.id, note);
                          }}
                          disabled={processing === w.id}
                          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span
                        className={`text-xs font-medium ${w.status === "completed" ? "text-green-600" : "text-red-600"}`}
                      >
                        {w.status}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

function FinanceCard({
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
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}

function FlowBox({ label, color }: { label: string; color: string }) {
  return <span className={`rounded-lg px-3 py-1.5 text-xs font-medium ${color}`}>{label}</span>;
}

function FlowArrow() {
  return <span className="text-muted-foreground">→</span>;
}
