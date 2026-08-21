import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Gift, Sparkles, TrendingUp, Loader } from "lucide-react";
import { ServicePageLayout } from "@/components/common/ServicePageLayout";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/i18n/I18nContext";
import { POINTS_PER_CURRENCY_REDEEM, listRewardTx } from "@/services/firebase/wallet";
import { formatDateTime, formatPrice } from "@/utils/format";

export const Route = createFileRoute("/_authenticated/rewards")({
  component: RewardsPage,
});

const TIERS = [
  { name: "Bronze", min: 0 },
  { name: "Silver", min: 1000 },
  { name: "Gold", min: 5000 },
  { name: "Platinum", min: 15000 },
];

function RewardsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["rewardTx", user?.uid],
    queryFn: () => listRewardTx(user!.uid),
    enabled: !!user,
  });

  const balance = (data ?? []).reduce((s, t) => s + t.points, 0);
  const earned = (data ?? []).filter((t) => t.points > 0).reduce((s, t) => s + t.points, 0);
  const tierIndex = TIERS.reduce((idx, t, i) => (earned >= t.min ? i : idx), 0);
  const tier = TIERS[tierIndex];
  const next = TIERS[tierIndex + 1];
  const progress = next
    ? Math.min(100, Math.round(((earned - tier.min) / (next.min - tier.min)) * 100))
    : 100;

  return (
    <ServicePageLayout title={t("rewards.title")} subtitle={t("rewards.subtitle")}>
      {/* Points balance hero card */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="bg-gradient-to-br from-orange-50 to-white px-5 py-6">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Sparkles className="h-4 w-4 text-[#f57224]" /> Points balance
          </div>
          <div className="mt-2 text-4xl font-black text-[#f57224]">{balance}</div>
          <p className="mt-1 text-xs text-slate-400">
            Worth {formatPrice(balance / POINTS_PER_CURRENCY_REDEEM)} in wallet credit
          </p>
        </div>
        <div className="grid grid-cols-2 divide-x divide-gray-100 border-t border-gray-100">
          <div className="px-5 py-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <TrendingUp className="h-3.5 w-3.5" /> Lifetime earned
            </div>
            <div className="mt-1 text-lg font-bold text-slate-700">{earned}</div>
          </div>
          <div className="px-5 py-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Gift className="h-3.5 w-3.5" /> Membership tier
            </div>
            <div className="mt-1 text-lg font-bold text-slate-700">{tier.name}</div>
          </div>
        </div>
        {/* Progress bar */}
        <div className="border-t border-gray-100 px-5 py-4">
          <div className="h-2 rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-orange-400 to-orange-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            {next ? `${next.min - earned} points to ${next.name}` : "Top tier reached"}
          </p>
        </div>
      </div>

      {/* CTA */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-500">
          Convert your points into store credit any time from your wallet.
        </p>
        <Link
          to="/wallet"
          className="rounded-xl bg-[#f57224] px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-orange-600 active:scale-95"
        >
          Go to wallet
        </Link>
      </div>

      {/* Points activity */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-3.5 font-bold text-slate-800">
          Points activity
        </div>
        {isLoading ? (
          <div className="py-16 text-center">
            <Loader className="mx-auto h-8 w-8 animate-spin text-slate-300" />
          </div>
        ) : !data || data.length === 0 ? (
          <div className="flex flex-col items-center py-14 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-orange-50 text-[#f57224]">
              <Gift className="h-7 w-7" />
            </span>
            <h3 className="mt-4 text-sm font-bold text-slate-700">{t("rewards.noPoints")}</h3>
            <p className="mt-1 max-w-xs text-xs text-slate-400">
              Place your first order to start earning.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {data.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold capitalize text-slate-700">{t.type}</div>
                  <div className="truncate text-xs text-slate-400">{t.note}</div>
                  <div className="text-xs text-slate-400">{formatDateTime(t.createdAt)}</div>
                </div>
                <div className={`text-sm font-bold ${t.points >= 0 ? "text-green-700" : "text-red-600"}`}>
                  {t.points >= 0 ? "+" : ""}{t.points} pts
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ServicePageLayout>
  );
}
