import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { listAllSellers, setSellerStatus } from "@/services/firebase/adminSellers";
import { auditShopSlugCollisions } from "@/lib/store.functions";
import { logActivity } from "@/services/firebase/adminLogs";
import { useAuth } from "@/context/AuthContext";
import { Spinner } from "@/components/common/Spinner";
import { formatDate } from "@/utils/format";
import { mapFirebaseError } from "@/utils/errors";
import type { SellerProfile, SellerStatus } from "@/types/seller";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/_authenticated/admin/sellers")({
  component: SellersAdmin,
});

function SellersAdmin() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [sellers, setSellers] = useState<SellerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"" | SellerStatus>("");
  const [auditing, setAuditing] = useState(false);
  const [auditReport, setAuditReport] = useState<{
    totalSellers: number;
    collisionCount: number;
    collisions: Array<{
      slug: string;
      sellers: Array<{ uid: string; shopName: string; status: string; keepsSlug: boolean }>;
    }>;
    repaired: Array<{ uid: string; shopName: string; from: string; to: string }>;
  } | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      setSellers(await listAllSellers());
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return sellers.filter((s) => {
      if (filter && s.status !== filter) return false;
      if (term && !`${s.shopName} ${s.email} ${s.phone}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [sellers, q, filter]);

  const act = async (s: SellerProfile, status: SellerStatus, reason?: string) => {
    if (!user) return;
    try {
      await setSellerStatus(s.uid, status, reason ?? null);
      const action =
        status === "approved"
          ? "seller.approve"
          : status === "rejected"
            ? "seller.reject"
            : status === "suspended"
              ? "seller.suspend"
              : "seller.reinstate";
      await logActivity({ uid: user.uid, email: user.email }, action, s.uid, s.shopName);
      toast.success(`Seller ${status}`);
      await refresh();
    } catch (err) {
      toast.error(mapFirebaseError(err));
    }
  };

  const runSlugAudit = async (repair: boolean) => {
    if (!user) return;
    setAuditing(true);
    try {
      const idToken = await user.getIdToken();
      const report = await auditShopSlugCollisions({ data: { idToken, repair } });
      setAuditReport(report);
      if (repair) {
        toast.success(
          report.repaired.length
            ? `Fixed ${report.repaired.length} duplicate store URL${report.repaired.length > 1 ? "s" : ""}`
            : "No changes needed",
        );
        await logActivity(
          { uid: user.uid, email: user.email },
          "store.slugAuditRepair",
          "sellers",
          `${report.repaired.length} slugs renamed`,
        );
        await refresh();
      } else if (report.collisionCount === 0) {
        toast.success("No store URL conflicts found");
      } else {
        toast.warning(`Found ${report.collisionCount} conflicting store URL${report.collisionCount > 1 ? "s" : ""}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : mapFirebaseError(err));
    } finally {
      setAuditing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("admin.sellers")}</h1>
        <p className="text-sm text-muted-foreground">{t("admin.sellersDesc")}</p>
      </div>
      <div className="rounded-lg border bg-background p-4">
        <div className="flex flex-wrap gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search shop, email, phone…"
            className="flex-1 min-w-[220px] rounded-md border bg-background px-3 py-2 text-sm"
          />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as "" | SellerStatus)}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="">{t("admin.allStatuses")}</option>
            <option value="pending">{t("admin.pending")}</option>
            <option value="approved">{t("admin.approved")}</option>
            <option value="rejected">{t("admin.rejected")}</option>
            <option value="suspended">{t("admin.suspended")}</option>
          </select>
          <button
            onClick={() => runSlugAudit(false)}
            disabled={auditing}
            className="rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50 transition-colors"
          >
            {auditing ? "Checking…" : "Check store URLs"}
          </button>
        </div>

        {auditReport && auditReport.collisionCount > 0 && (
          <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm">
            <div className="font-semibold text-amber-900">
              {auditReport.collisionCount} store URL conflict{auditReport.collisionCount > 1 ? "s" : ""} found
              {" "}(same /store/ address used by multiple sellers)
            </div>
            <ul className="mt-2 space-y-1">
              {auditReport.collisions.map((c) => (
                <li key={c.slug} className="text-amber-900">
                  <span className="font-mono">/store/{c.slug}</span> —{" "}
                  {c.sellers.map((s) => `${s.shopName}${s.keepsSlug ? " (keeps URL)" : ""}`).join(", ")}
                </li>
              ))}
            </ul>
            <button
              onClick={() => runSlugAudit(true)}
              disabled={auditing || auditReport.repaired.length > 0}
              className="mt-3 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              {auditReport.repaired.length > 0 ? "Fixed" : "Fix conflicts"}
            </button>
            {auditReport.repaired.length > 0 && (
              <ul className="mt-2 space-y-1 text-green-700">
                {auditReport.repaired.map((r) => (
                  <li key={r.uid}>
                    {r.shopName}: <span className="font-mono">/store/{r.from}</span> → <span className="font-mono">/store/{r.to}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border bg-background">
        {loading ? (
          <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
            <Spinner /> Loading sellers…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-sm text-muted-foreground">No sellers found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2">{t("admin.shop")}</th>
                <th className="px-3 py-2">{t("admin.contact")}</th>
                <th className="px-3 py-2">{t("admin.location")}</th>
                <th className="px-3 py-2">{t("admin.status")}</th>
                <th className="px-3 py-2">{t("admin.applied")}</th>
                <th className="px-3 py-2 text-right">{t("admin.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((s) => (
                <tr key={s.uid}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-3">
                      {s.logoUrl ? (
                        <img src={s.logoUrl} alt="" className="h-10 w-10 rounded-md object-cover" />
                      ) : (
                        <div className="h-10 w-10 rounded-md bg-muted" />
                      )}
                      <div>
                        <div className="font-medium">{s.shopName}</div>
                        <div className="text-xs text-muted-foreground">/{s.shopSlug}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div>{s.email}</div>
                    <div className="text-muted-foreground">{s.phone}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {s.city}, {s.country}
                  </td>
                  <td className="px-3 py-2 capitalize">
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-xs " +
                        (s.status === "approved"
                          ? "bg-emerald-500/10 text-emerald-600"
                          : s.status === "pending_review"
                            ? "bg-amber-500/10 text-amber-600"
                            : s.status === "suspended"
                              ? "bg-orange-500/10 text-orange-600"
                              : "bg-destructive/10 text-destructive")
                      }
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {formatDate(s.createdAt)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap justify-end gap-1">
                      {s.status !== "approved" && (
                        <button
                          onClick={() => act(s, "approved")}
                          className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                        >
                          Approve
                        </button>
                      )}
                      {s.status !== "rejected" && (
                        <button
                          onClick={() => {
                            const reason = prompt("Rejection reason (optional):") ?? "";
                            act(s, "rejected", reason);
                          }}
                          className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                        >
                          Reject
                        </button>
                      )}
                      {s.status !== "suspended" && (
                        <button
                          onClick={() => act(s, "suspended")}
                          className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                        >
                          Suspend
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
