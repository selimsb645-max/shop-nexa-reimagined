import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Gift, Sparkles, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Spinner } from "@/components/common/Spinner";
import { useAuth } from "@/context/AuthContext";
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
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Rewards</h1>
          <p className="text-sm text-muted-foreground">
            Earn points on every order and convert them into wallet credit
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border bg-background p-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4" /> Points balance
            </div>
            <div className="mt-2 text-3xl font-bold text-primary">{balance}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Worth {formatPrice(balance / POINTS_PER_CURRENCY_REDEEM)}
            </p>
          </div>
          <div className="rounded-lg border bg-background p-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingUp className="h-4 w-4" /> Lifetime earned
            </div>
            <div className="mt-2 text-2xl font-bold">{earned}</div>
          </div>
          <div className="rounded-lg border bg-background p-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Gift className="h-4 w-4" /> Membership tier
            </div>
            <div className="mt-2 text-2xl font-bold">{tier.name}</div>
            <div className="mt-3 h-2 rounded-full bg-muted">
              <div className="h-2 rounded-full bg-primary" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {next ? `${next.min - earned} points to ${next.name}` : "Top tier reached"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-5">
          <p className="text-sm text-muted-foreground">
            Convert your points into store credit any time from your wallet.
          </p>
          <Link
            to="/wallet"
            className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Go to wallet
          </Link>
        </div>

        <section className="rounded-lg border bg-background">
          <div className="border-b px-5 py-3 font-semibold">Points activity</div>
          {isLoading ? (
            <div className="py-16 text-center">
              <Spinner />
            </div>
          ) : !data || data.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              No points yet. Place your first order to start earning.
            </div>
          ) : (
            <ul className="divide-y">
              {data.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium capitalize">{t.type}</div>
                    <div className="truncate text-xs text-muted-foreground">{t.note}</div>
                    <div className="text-xs text-muted-foreground">{formatDateTime(t.createdAt)}</div>
                  </div>
                  <div
                    className={`text-sm font-semibold ${t.points >= 0 ? "text-green-700" : "text-destructive"}`}
                  >
                    {t.points >= 0 ? "+" : ""}
                    {t.points} pts
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
