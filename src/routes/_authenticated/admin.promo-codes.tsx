import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Spinner } from "@/components/common/Spinner";
import { adminListPromoCodes, adminCreatePromoCode, adminDisablePromoCode } from "@/lib/promo.functions";
import type { PromoCode } from "@/types/promo";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/_authenticated/admin/promo-codes")({
  component: AdminPromoCodesPage,
});

function AdminPromoCodesPage() {

  const { t } = useI18n();  const { user } = useAuth();
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  // Create form state
  const [targetUid, setTargetUid] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");
  const [discountValue, setDiscountValue] = useState(10);
  const [usageLimit, setUsageLimit] = useState(1);
  const [expiryDays, setExpiryDays] = useState(30);
  const [minOrder, setMinOrder] = useState(0);

  const loadPromos = async () => {
    if (!user) return;
    try {
      const idToken = await user.getIdToken();
      const result = await adminListPromoCodes({ data: { idToken, limit: 100 } });
      setPromos(result as PromoCode[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load promo codes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPromos();
  }, [user]);

  const handleCreate = async () => {
    if (!user || !targetUid.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      await adminCreatePromoCode({
        data: {
          idToken,
          targetUid: targetUid.trim(),
          campaignType: "admin_issued",
          discountType,
          discountValue,
          usageLimit,
          expiryDays,
          minimumOrderAmount: minOrder,
        },
      });
      setTargetUid("");
      setShowCreate(false);
      await loadPromos();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create promo code.");
    } finally {
      setCreating(false);
    }
  };

  const handleDisable = async (code: string) => {
    if (!user) return;
    try {
      const idToken = await user.getIdToken();
      await adminDisablePromoCode({ data: { idToken, code } });
      await loadPromos();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not disable promo code.");
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-[#1a1f3a]">{t("admin.promoCodes")}</h1>
            <p className="text-sm text-slate-500 mt-1">{t("admin.managePromoCodes")}</p>
          </div>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="bg-[#f57224] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#e0621a] transition-colors"
          >
            {showCreate ? "Cancel" : "Issue Promo Code"}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {showCreate && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">{t("admin.issueNewPromoCode")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">{t("admin.targetUserId")}</label>
                <input
                  type="text"
                  value={targetUid}
                  onChange={(e) => setTargetUid(e.target.value)}
                  placeholder={t("admin.firebaseUid")}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#f57224]"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">{t("admin.discountType")}</label>
                <select
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value as "percent" | "fixed")}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#f57224]"
                >
                  <option value="percent">Percent (%)</option>
                  <option value="fixed">{t("admin.fixedAmount")}</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">{t("admin.discountValue")}</label>
                <input
                  type="number"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#f57224]"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">{t("admin.usageLimit")}</label>
                <input
                  type="number"
                  value={usageLimit}
                  onChange={(e) => setUsageLimit(Number(e.target.value))}
                  min={1}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#f57224]"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Expiry (days)</label>
                <input
                  type="number"
                  value={expiryDays}
                  onChange={(e) => setExpiryDays(Number(e.target.value))}
                  min={1}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#f57224]"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">{t("admin.minOrderAmount")}</label>
                <input
                  type="number"
                  value={minOrder}
                  onChange={(e) => setMinOrder(Number(e.target.value))}
                  min={0}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#f57224]"
                />
              </div>
            </div>
            <button
              onClick={handleCreate}
              disabled={creating || !targetUid.trim()}
              className="mt-4 bg-[#0f172a] text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              {creating ? "Generating..." : "Generate Promo Code"}
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 py-8">
            <Spinner /> Loading promo codes...
          </div>
        ) : promos.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <p className="text-sm text-slate-500">No promo codes issued yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">{t("admin.code")}</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">{t("admin.user")}</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">{t("admin.discount")}</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">{t("admin.status")}</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">{t("admin.uses")}</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">{t("admin.expiry")}</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">{t("admin.action")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {promos.map((promo) => (
                  <tr key={promo.code} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-bold">{promo.code}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{promo.userId.slice(0, 12)}...</td>
                    <td className="px-4 py-3">
                      {promo.discountType === "percent"
                        ? `${promo.discountValue}%`
                        : promo.discountValue.toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        promo.status === "active" ? "bg-green-100 text-green-700" :
                        promo.status === "used" ? "bg-slate-100 text-slate-500" :
                        promo.status === "expired" ? "bg-red-100 text-red-600" :
                        "bg-slate-100 text-slate-400"
                      }`}>
                        {promo.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">{promo.usedCount}/{promo.usageLimit}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {promo.expiresAt > 0
                        ? new Date(promo.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                        : "No expiry"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {promo.status === "active" && (
                        <button
                          onClick={() => handleDisable(promo.code)}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Disable
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
