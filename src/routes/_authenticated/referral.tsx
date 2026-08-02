import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Share2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Spinner } from "@/components/common/Spinner";
import { useAuth } from "@/context/AuthContext";
import {
  REFERRAL_BONUS_POINTS,
  REFERRAL_WELCOME_POINTS,
  applyReferralCode,
  ensureReferralCode,
  getMyReferredBy,
  listReferrals,
  referralLink,
} from "@/services/firebase/referrals";
import { formatDate } from "@/utils/format";

export const Route = createFileRoute("/_authenticated/referral")({
  component: ReferralPage,
});

function ReferralPage() {
  const { user, profile } = useAuth();
  const [code, setCode] = useState("");
  const [friendCode, setFriendCode] = useState("");
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!user) return;
    void ensureReferralCode(user.uid)
      .then(setCode)
      .catch(() => undefined);
  }, [user]);

  const referrals = useQuery({
    queryKey: ["referrals", user?.uid],
    queryFn: () => listReferrals(user!.uid),
    enabled: !!user,
  });

  const referredBy = useQuery({
    queryKey: ["referredBy", user?.uid],
    queryFn: () => getMyReferredBy(user!.uid),
    enabled: !!user,
  });

  const link = user ? referralLink(user.uid) : "";

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy");
    }
  };

  const share = async () => {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share({
          title: "Shop Nexa",
          text: `Shop with my Shop Nexa code ${code} and get ${REFERRAL_WELCOME_POINTS} bonus points.`,
          url: link,
        });
        return;
      } catch {
        /* user cancelled */
      }
    }
    await copy(link);
  };

  const apply = async () => {
    if (!user) return;
    setApplying(true);
    try {
      await applyReferralCode({
        uid: user.uid,
        displayName: profile?.displayName ?? user.displayName ?? null,
        code: friendCode,
      });
      toast.success(`${REFERRAL_WELCOME_POINTS} welcome points added`);
      setFriendCode("");
      await referredBy.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not apply this code");
    } finally {
      setApplying(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Refer &amp; Earn</h1>
          <p className="text-sm text-muted-foreground">
            Invite friends and earn {REFERRAL_BONUS_POINTS} points for every signup
          </p>
        </div>

        <div className="rounded-lg border bg-background p-6">
          <div className="text-sm text-muted-foreground">Your referral code</div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="rounded-md border border-dashed px-4 py-2.5 text-xl font-bold tracking-wider text-primary">
              {code || "…"}
            </span>
            <button
              onClick={() => void copy(code)}
              disabled={!code}
              className="flex items-center gap-2 rounded-md border px-4 py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-60"
            >
              <Copy className="h-4 w-4" /> Copy code
            </button>
            <button
              onClick={() => void share()}
              disabled={!code}
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              <Share2 className="h-4 w-4" /> Share link
            </button>
          </div>
          <p className="mt-3 break-all text-xs text-muted-foreground">{link}</p>
        </div>

        <div className="rounded-lg border bg-background p-6">
          <div className="flex items-center gap-2 font-semibold">
            <UserPlus className="h-4 w-4" /> Have a friend&apos;s code?
          </div>
          {referredBy.data ? (
            <p className="mt-2 text-sm text-muted-foreground">
              You joined with code <span className="font-semibold">{referredBy.data}</span>.
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-3">
              <input
                value={friendCode}
                onChange={(e) => setFriendCode(e.target.value.toUpperCase())}
                placeholder="NEXA123ABC"
                maxLength={20}
                className="w-56 rounded-md border px-3 py-2.5 text-sm uppercase outline-none focus:border-primary"
              />
              <button
                onClick={() => void apply()}
                disabled={applying || friendCode.trim().length < 4}
                className="flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {applying && <Spinner />} Apply code
              </button>
            </div>
          )}
        </div>

        <section className="rounded-lg border bg-background">
          <div className="flex items-center gap-2 border-b px-5 py-3 font-semibold">
            <Users className="h-4 w-4" /> Friends you invited ({referrals.data?.length ?? 0})
          </div>
          {referrals.isLoading ? (
            <div className="py-16 text-center">
              <Spinner />
            </div>
          ) : !referrals.data || referrals.data.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              No referrals yet. Share your code to start earning.
            </div>
          ) : (
            <ul className="divide-y">
              {referrals.data.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <div className="text-sm font-medium">{r.referredName}</div>
                    <div className="text-xs text-muted-foreground">Joined {formatDate(r.createdAt)}</div>
                  </div>
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold capitalize text-primary">
                    {r.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
