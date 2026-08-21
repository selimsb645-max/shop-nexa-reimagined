import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Share2, UserPlus, Users, Loader, Gift } from "lucide-react";
import { toast } from "sonner";
import { ServicePageLayout } from "@/components/common/ServicePageLayout";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/i18n/I18nContext";
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
  const { t } = useI18n();
  const { user, profile } = useAuth();
  const [code, setCode] = useState("");
  const [friendCode, setFriendCode] = useState("");
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!user) return;
    void ensureReferralCode(user.uid).then(setCode).catch(() => undefined);
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
    <ServicePageLayout title={t("referral.title")} subtitle={t("referral.subtitle")}>
      {/* Referral code hero card */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="bg-gradient-to-br from-orange-50 to-white px-5 py-6">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Gift className="h-4 w-4 text-[#f57224]" /> Your referral code
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="rounded-xl border-2 border-dashed border-orange-200 bg-white px-5 py-3 text-2xl font-black tracking-wider text-[#f57224]">
              {code || "…"}
            </span>
            <button
              onClick={() => void copy(code)}
              disabled={!code}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-95 disabled:opacity-50"
            >
              <Copy className="h-4 w-4" /> Copy code
            </button>
            <button
              onClick={() => void share()}
              disabled={!code}
              className="inline-flex items-center gap-2 rounded-xl bg-[#f57224] px-4 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-orange-600 active:scale-95 disabled:opacity-50"
            >
              <Share2 className="h-4 w-4" /> Share link
            </button>
          </div>
          <p className="mt-3 break-all text-xs text-slate-400">{link}</p>
        </div>
      </div>

      {/* Apply friend's code */}
      <div className="mt-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 font-bold text-slate-800">
          <UserPlus className="h-4 w-4 text-[#f57224]" /> Have a friend's code?
        </div>
        {referredBy.data ? (
          <p className="mt-2 text-sm text-slate-500">
            You joined with code <span className="font-bold text-slate-700">{referredBy.data}</span>.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-3">
            <input
              value={friendCode}
              onChange={(e) => setFriendCode(e.target.value.toUpperCase())}
              placeholder="NEXA123ABC"
              maxLength={20}
              className="w-56 rounded-xl border border-slate-200 px-3 py-2.5 text-sm uppercase outline-none focus:border-[#f57224]"
            />
            <button
              onClick={() => void apply()}
              disabled={applying || friendCode.trim().length < 4}
              className="inline-flex items-center gap-2 rounded-xl bg-[#f57224] px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-orange-600 active:scale-95 disabled:opacity-50"
            >
              {applying && <Loader className="h-4 w-4 animate-spin" />} Apply code
            </button>
          </div>
        )}
      </div>

      {/* Friends invited */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3.5 font-bold text-slate-800">
          <Users className="h-4 w-4 text-[#f57224]" /> Friends you invited ({referrals.data?.length ?? 0})
        </div>
        {referrals.isLoading ? (
          <div className="py-16 text-center">
            <Loader className="mx-auto h-8 w-8 animate-spin text-slate-300" />
          </div>
        ) : !referrals.data || referrals.data.length === 0 ? (
          <div className="flex flex-col items-center py-14 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-orange-50 text-[#f57224]">
              <Users className="h-7 w-7" />
            </span>
            <h3 className="mt-4 text-sm font-bold text-slate-700">No referrals yet</h3>
            <p className="mt-1 max-w-xs text-xs text-slate-400">
              Share your code to start earning.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {referrals.data.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div>
                  <div className="text-sm font-semibold text-slate-700">{r.referredName}</div>
                  <div className="text-xs text-slate-400">Joined {formatDate(r.createdAt)}</div>
                </div>
                <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold capitalize text-[#f57224]">
                  {r.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ServicePageLayout>
  );
}
