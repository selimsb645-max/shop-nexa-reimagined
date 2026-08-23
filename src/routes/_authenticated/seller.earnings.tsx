/**
 * Shop Nexa — Seller Earnings Dashboard
 *
 * Route: /seller/earnings
 * Reuses existing Settlements infrastructure:
 * - fetchSellerFinancials (server-verified financial data)
 * - triggerSettlementRelease (lazy release of eligible settlements)
 * - SellerSettlementData type
 *
 * Shows: Earnings Summary + Settlement/Earnings History
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  fetchSellerFinancials,
  triggerSettlementRelease,
  type SellerSettlementData,
} from "@/services/firebase/sellerSettlements";
import { SellerGate } from "@/components/seller/SellerGate";
import { formatPrice, formatDateTime } from "@/utils/format";
import { toast } from "sonner";
import {
  DollarSign,
  Wallet,
  Clock,
  ArrowDownToLine,
  History,
  Loader,
  TrendingUp,
  Banknote,
  Info,
} from "lucide-react";
import type { SellerProfile } from "@/types/seller";

export const Route = createFileRoute("/_authenticated/seller/earnings")({
  ssr: false,
  component: () => <SellerGate>{(profile) => <EarningsPage profile={profile} />}</SellerGate>,
  head: () => ({ meta: [{ title: "Earnings — Shop Nexa Seller" }] }),
});

function EarningsPage({ profile }: { profile: SellerProfile }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SellerSettlementData | null>(null);

  async function loadData() {
    if (!user) return;
    setLoading(true);
    try {
      const idToken = await user.getIdToken();
      await triggerSettlementRelease(idToken);
      const financials = await fetchSellerFinancials(idToken);
      setData(financials);
    } catch (err) {
      toast.error("Could not load earnings data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader className="w-8 h-8 animate-spin text-slate-300" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-[#0f172a] tracking-tight">Earnings</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Your sales performance and settlement overview
        </p>
      </div>

      {/* Earnings Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          icon={<DollarSign className="w-4 h-4" />}
          label="Total Sales"
          value={data ? formatPrice(data.totalSales) : formatPrice(0)}
          color="#059669"
          bgColor="#ecfdf5"
        />
        <SummaryCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Total Commission"
          value={data ? formatPrice(data.totalCommission) : formatPrice(0)}
          color="#dc2626"
          bgColor="#fef2f2"
        />
        <SummaryCard
          icon={<Clock className="w-4 h-4" />}
          label="Pending Earnings"
          value={data ? formatPrice(data.pendingEarnings) : formatPrice(0)}
          color="#d97706"
          bgColor="#fffbeb"
        />
        <SummaryCard
          icon={<Wallet className="w-4 h-4" />}
          label="Available Balance"
          value={data ? formatPrice(data.availableBalance) : formatPrice(0)}
          color="#f57224"
          bgColor="#fff7ed"
        />
      </div>

      {/* Withdrawn row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <SummaryCard
          icon={<ArrowDownToLine className="w-4 h-4" />}
          label="Total Withdrawn"
          value={data ? formatPrice(data.totalWithdrawn) : formatPrice(0)}
          color="#6366f1"
          bgColor="#eef2ff"
        />
        <SummaryCard
          icon={<Banknote className="w-4 h-4" />}
          label="Commission Rate"
          value={`${((profile.commissionRate ?? 0.08) * 100).toFixed(0)}%`}
          color="#0f172a"
          bgColor="#f1f5f9"
        />
        <SummaryCard
          icon={<DollarSign className="w-4 h-4" />}
          label="Net Earnings"
          value={data ? formatPrice(data.totalSales - data.totalCommission) : formatPrice(0)}
          color="#059669"
          bgColor="#ecfdf5"
        />
      </div>

      {/* Earnings History */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-[#0f172a]">
            <History className="w-4 h-4" />
            Earnings & Settlement History
          </h2>
        </div>
        <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
          {!data || data.recentTransactions.length === 0 ? (
            <div className="py-12 text-center">
              <History className="w-10 h-10 text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No transactions yet</p>
              <p className="text-xs text-slate-300 mt-1">
                Your earnings will appear here after your first sale
              </p>
            </div>
          ) : (
            data.recentTransactions.map((tx) => (
              <div key={tx.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full ${
                    tx.amount > 0 ? "bg-green-100" : "bg-red-100"
                  }`}
                >
                  {tx.amount > 0 ? (
                    <ArrowDownToLine className="w-4 h-4 text-green-600" />
                  ) : (
                    <ArrowDownToLine className="w-4 h-4 text-red-600 rotate-180" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[#0f172a] truncate">{tx.note}</div>
                  <div className="text-xs text-slate-400">
                    {tx.orderId ? `Order: ${tx.orderId.substring(0, 8)}… · ` : ""}
                    {formatDateTime(tx.createdAt)}
                  </div>
                </div>
                <div
                  className={`text-sm font-bold ${
                    tx.amount > 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {tx.amount > 0 ? "+" : "-"}
                  {formatPrice(Math.abs(tx.amount))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Settlement Lifecycle Info */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[#0f172a] mb-3">
          <Info className="w-4 h-4 text-slate-400" />
          How Settlements Work
        </h3>
        <div className="space-y-2 text-xs text-slate-500">
          <div className="flex gap-2">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold">
              1
            </span>
            <span>Customer places order → Your earnings are "Pending"</span>
          </div>
          <div className="flex gap-2">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold">
              2
            </span>
            <span>Order is delivered → Earnings enter 7-day hold period</span>
          </div>
          <div className="flex gap-2">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold">
              3
            </span>
            <span>Hold period ends → Earnings become "Available"</span>
          </div>
          <div className="flex gap-2">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold">
              4
            </span>
            <span>Request withdrawal from Wallet → Admin reviews and processes</span>
          </div>
          <div className="flex gap-2">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold">
              5
            </span>
            <span>Manual payout to your registered account → Marked as "Paid"</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  color,
  bgColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  bgColor: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <div className="flex items-center gap-2 mb-2">
        <span
          className="flex items-center justify-center w-7 h-7 rounded-lg"
          style={{ backgroundColor: bgColor, color }}
        >
          {icon}
        </span>
        <span className="text-xs font-medium text-slate-500">{label}</span>
      </div>
      <div className="text-lg sm:text-xl font-bold text-[#0f172a] break-all">{value}</div>
    </div>
  );
}
