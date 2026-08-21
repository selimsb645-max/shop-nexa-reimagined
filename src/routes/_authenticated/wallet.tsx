import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, Wallet, Loader, Sparkles, TrendingUp } from "lucide-react";
import { ServicePageLayout } from "@/components/common/ServicePageLayout";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/i18n/I18nContext";
import {
  POINTS_PER_CURRENCY_REDEEM,
  getRewardPoints,
  listWalletTx,
  redeemPoints,
} from "@/services/firebase/wallet";
import { formatDateTime, formatPrice } from "@/utils/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/wallet")({
  component: WalletPage,
});

const TYPE_LABEL: Record<string, string> = {
  cashback: "Cashback",
  refund: "Refund",
  topup: "Top up",
  spend: "Spent",
  adjustment: "Adjustment",
};

function WalletPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [redeeming, setRedeeming] = useState(false);

  const tx = useQuery({
    queryKey: ["walletTx", user?.uid],
    queryFn: () => listWalletTx(user!.uid),
    enabled: !!user,
  });
  const points = useQuery({
    queryKey: ["rewardPoints", user?.uid],
    queryFn: () => getRewardPoints(user!.uid),
    enabled: !!user,
  });

  const balance = Math.round((tx.data ?? []).reduce((s, t) => s + t.amount, 0) * 100) / 100;
  const credited = (tx.data ?? []).filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const spent = (tx.data ?? []).filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0);
  const redeemable = Math.floor((points.data ?? 0) / POINTS_PER_CURRENCY_REDEEM) * POINTS_PER_CURRENCY_REDEEM;

  const doRedeem = async () => {
    if (!user || redeemable <= 0) return;
    setRedeeming(true);
    try {
      const credit = await redeemPoints(user.uid, redeemable);
      toast.success(`${formatPrice(credit)} added to your wallet`);
      await Promise.all([tx.refetch(), points.refetch()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not redeem points");
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <ServicePageLayout title={t("wallet.title")} subtitle={t("wallet.subtitle")}>
      {/* Balance card */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="bg-gradient-to-br from-orange-50 to-white px-5 py-6">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Wallet className="h-4 w-4 text-[#f57224]" /> Available balance
          </div>
          <div className="mt-2 text-4xl font-black text-[#f57224]">{formatPrice(balance)}</div>
        </div>
        <div className="grid grid-cols-2 divide-x divide-gray-100 border-t border-gray-100">
          <div className="px-5 py-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <TrendingUp className="h-3.5 w-3.5" /> Total credited
            </div>
            <div className="mt-1 text-lg font-bold text-slate-700">{formatPrice(credited)}</div>
          </div>
          <div className="px-5 py-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <ArrowUpRight className="h-3.5 w-3.5" /> Total spent
            </div>
            <div className="mt-1 text-lg font-bold text-slate-700">{formatPrice(spent)}</div>
          </div>
        </div>
      </div>

      {/* Redeem points */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div>
          <div className="flex items-center gap-2 font-semibold text-slate-800">
            <Sparkles className="h-4 w-4 text-[#f57224]" /> Convert reward points
          </div>
          <p className="mt-1 text-sm text-slate-500">
            You have <span className="font-bold text-slate-700">{points.data ?? 0}</span> points. {POINTS_PER_CURRENCY_REDEEM} points = {formatPrice(1)} credit.
          </p>
        </div>
        <button
          onClick={() => void doRedeem()}
          disabled={redeeming || redeemable <= 0}
          className="inline-flex items-center gap-2 rounded-xl bg-[#f57224] px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-orange-600 active:scale-95 disabled:opacity-50"
        >
          {redeeming && <Loader className="h-4 w-4 animate-spin" />}
          Redeem {redeemable} points
        </button>
      </div>

      {/* Transaction history */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-3.5 font-bold text-slate-800">
          Transaction history
        </div>
        {tx.isLoading ? (
          <div className="py-16 text-center">
            <Loader className="mx-auto h-8 w-8 animate-spin text-slate-300" />
          </div>
        ) : !tx.data || tx.data.length === 0 ? (
          <div className="flex flex-col items-center py-14 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-orange-50 text-[#f57224]">
              <Wallet className="h-7 w-7" />
            </span>
            <h3 className="mt-4 text-sm font-bold text-slate-700">No wallet activity yet</h3>
            <p className="mt-1 max-w-xs text-xs text-slate-400">
              Earn cashback on every order you place.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {tx.data.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-5 py-3.5">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    t.amount >= 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                  }`}
                >
                  {t.amount >= 0 ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-700">{TYPE_LABEL[t.type] ?? t.type}</div>
                  <div className="truncate text-xs text-slate-400">{t.note}</div>
                  <div className="text-xs text-slate-400">{formatDateTime(t.createdAt)}</div>
                </div>
                <div className={`text-sm font-bold ${t.amount >= 0 ? "text-green-700" : "text-red-600"}`}>
                  {t.amount >= 0 ? "+" : "-"}{formatPrice(Math.abs(t.amount))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ServicePageLayout>
  );
}
