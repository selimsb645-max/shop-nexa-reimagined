import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listMyPromoCodes, type PromoCode, formatPromoDiscount, isPromoUsable, formatPromoExpiry } from "@/services/firebase/promoCodes";
import { generatePromoCode } from "@/lib/promo.functions";
import { useAuth } from "@/context/AuthContext";
import { Spinner } from "@/components/common/Spinner";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/_authenticated/promo-codes")({
  component: PromoCodesPage,
});

function PromoCodesPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const loadPromos = async () => {
    if (!user) return;
    try {
      setPromos(await listMyPromoCodes(user.uid));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load promo codes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPromos();
  }, [user]);

  const handleGenerate = async () => {
    if (!user) return;
    setGenerating(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      await generatePromoCode({ data: { idToken, campaignType: "welcome" } });
      await loadPromos();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate promo code.");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = code;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    }
  };

  if (!user) return null;

  const hasActivePromo = promos.some(isPromoUsable);
  const hasWelcomePromo = promos.some((p) => p.campaignType === "welcome");

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#1a1f3a]">My Promo Codes</h1>
          <p className="text-sm text-slate-500 mt-1">
            Your exclusive Shop Nexa promo codes and discounts.
          </p>
        </div>

        {/* Generate button - only show if no welcome promo yet */}
        {!hasWelcomePromo && !generating && (
          <div className="bg-gradient-to-r from-[#f57224] to-[#ff8a4c] rounded-xl p-6 mb-6 text-white">
            <h2 className="text-lg font-semibold mb-2">{t("promoCodes.welcome")}</h2>
            <p className="text-sm text-white/90 mb-4">
              Your welcome promo code was not generated automatically. Claim it now and get 10% off your next order.
            </p>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="bg-white text-[#f57224] font-semibold px-6 py-2.5 rounded-lg text-sm hover:bg-orange-50 transition-colors disabled:opacity-50"
            >
              {generating ? "Generating..." : "Claim My Promo Code"}
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 py-8">
            <Spinner /> Loading your promo codes...
          </div>
        ) : promos.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <p className="text-sm text-slate-500">No promo codes yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {promos.map((promo) => {
              const usable = isPromoUsable(promo);
              return (
                <div
                  key={promo.code}
                  className={`bg-white rounded-xl border p-5 ${
                    usable
                      ? "border-[#f57224]/30 shadow-sm"
                      : "border-slate-200 opacity-75"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      {/* Code */}
                      <div className="flex items-center gap-3 mb-3">
                        <div className="bg-slate-900 text-white px-4 py-2 rounded-lg font-mono text-lg font-bold tracking-wider">
                          {promo.code}
                        </div>
                        <button
                          onClick={() => handleCopy(promo.code)}
                          disabled={!usable}
                          className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                            usable
                              ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                              : "bg-slate-50 text-slate-300 cursor-not-allowed"
                          }`}
                        >
                          {copiedCode === promo.code ? "Copied!" : "Copy"}
                        </button>
                      </div>

                      {/* Discount */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg font-semibold text-[#f57224]">
                          {formatPromoDiscount(promo)}
                        </span>
                        {promo.minimumOrderAmount > 0 && (
                          <span className="text-xs text-slate-500">
                            Min order: {promo.minimumOrderAmount.toFixed(2)}
                          </span>
                        )}
                      </div>

                      {/* Status badge */}
                      <div className="flex items-center gap-3 text-xs">
                        {usable ? (
                          <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                            Active
                          </span>
                        ) : promo.status === "used" ? (
                          <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                            Used
                          </span>
                        ) : promo.status === "expired" ? (
                          <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                            Expired
                          </span>
                        ) : promo.status === "disabled" ? (
                          <span className="bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full">
                            Disabled
                          </span>
                        ) : null}

                        <span className="text-slate-400">
                          Expires: {formatPromoExpiry(promo)}
                        </span>

                        <span className="text-slate-400">
                          Uses: {promo.usedCount}/{promo.usageLimit}
                        </span>
                      </div>

                      {/* Campaign type */}
                      <p className="text-xs text-slate-400 mt-2">
                        {promo.campaignType === "welcome" && "Welcome bonus promo"}
                        {promo.campaignType === "first_order" && "First order reward"}
                        {promo.campaignType === "campaign" && "Campaign promo"}
                        {promo.campaignType === "admin_issued" && "Issued by Shop Nexa"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Info note */}
        <div className="mt-6 text-center">
          <p className="text-xs text-slate-400">
            Promo codes are generated securely and linked to your account.
            Use them at checkout to apply your discount.
          </p>
        </div>
      </div>
    </div>
  );
}
