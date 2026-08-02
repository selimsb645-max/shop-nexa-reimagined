import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Spinner } from "@/components/common/Spinner";
import { useAuth } from "@/context/AuthContext";
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

  const balance =
    Math.round((tx.data ?? []).reduce((s, t) => s + t.amount, 0) * 100) / 100;
  const credited = (tx.data ?? []).filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const spent = (tx.data ?? []).filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0);
  const redeemable =
    Math.floor((points.data ?? 0) / POINTS_PER_CURRENCY_REDEEM) * POINTS_PER_CURRENCY_REDEEM;

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
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">My Wallet</h1>
          <p className="text-sm text-muted-foreground">Cashback, refunds and store credit</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border bg-background p-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Wallet className="h-4 w-4" /> Available balance
            </div>
            <div className="mt-2 text-3xl font-bold text-primary">{formatPrice(balance)}</div>
          </div>
          <div className="rounded-lg border bg-background p-5">
            <div className="text-sm text-muted-foreground">Total credited</div>
            <div className="mt-2 text-2xl font-bold">{formatPrice(credited)}</div>
          </div>
          <div className="rounded-lg border bg-background p-5">
            <div className="text-sm text-muted-foreground">Total used</div>
            <div className="mt-2 text-2xl font-bold">{formatPrice(spent)}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-5">
          <div>
            <div className="font-semibold">Convert reward points</div>
            <p className="text-sm text-muted-foreground">
              You have {points.data ?? 0} points. {POINTS_PER_CURRENCY_REDEEM} points ={" "}
              {formatPrice(1)} wallet credit.
            </p>
          </div>
          <button
            onClick={() => void doRedeem()}
            disabled={redeeming || redeemable <= 0}
            className="flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {redeeming && <Spinner />} Redeem {redeemable} points
          </button>
        </div>

        <section className="rounded-lg border bg-background">
          <div className="border-b px-5 py-3 font-semibold">Transaction history</div>
          {tx.isLoading ? (
            <div className="py-16 text-center">
              <Spinner />
            </div>
          ) : !tx.data || tx.data.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              No wallet activity yet. Earn cashback on every order you place.
            </div>
          ) : (
            <ul className="divide-y">
              {tx.data.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-full ${t.amount >= 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                  >
                    {t.amount >= 0 ? (
                      <ArrowDownLeft className="h-4 w-4" />
                    ) : (
                      <ArrowUpRight className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{TYPE_LABEL[t.type] ?? t.type}</div>
                    <div className="truncate text-xs text-muted-foreground">{t.note}</div>
                    <div className="text-xs text-muted-foreground">{formatDateTime(t.createdAt)}</div>
                  </div>
                  <div
                    className={`text-sm font-semibold ${t.amount >= 0 ? "text-green-700" : "text-destructive"}`}
                  >
                    {t.amount >= 0 ? "+" : "-"}
                    {formatPrice(Math.abs(t.amount))}
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
