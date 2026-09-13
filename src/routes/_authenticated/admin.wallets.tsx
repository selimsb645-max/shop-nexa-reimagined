/**
 * AVENTA SHOP — Admin Wallets (Finance)
 *
 * Route: /admin/wallets
 * Lists every seller wallet with server-authoritative balances from
 * the finance engine (`sellerFinance`, `sellerLedger`). Read-only —
 * every mutation (adjustment, status change, withdrawal processing)
 * happens on the wallet detail route through verified server functions
 * with server-side finance permission checks.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  fetchAdminWallets,
  runWalletReconciliation,
  type AdminWalletRow,
} from "@/services/firebase/adminWallets";
import { formatPrice, formatDateTime } from "@/utils/format";
import { toast } from "sonner";
import {
  Wallet,
  Search,
  Loader,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/wallets")({
  ssr: false,
  component: () => (
    <AdminShell>
      <WalletsPage />
    </AdminShell>
  ),
  head: () => ({ meta: [{ title: "Seller Wallets — AVENTA SHOP Admin" }] }),
});

const STATUS_FILTERS = ["ALL", "ACTIVE", "SUSPENDED", "LOCKED", "CLOSED"] as const;

function WalletsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AdminWalletRow[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("ALL");
  const [recon, setRecon] = useState<{ sellersChecked: number; mismatches: string[] } | null>(null);
  const [reconRunning, setReconRunning] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const idToken = await user.getIdToken();
      const data = await fetchAdminWallets(idToken, {
        search: search || undefined,
        status: statusFilter === "ALL" ? undefined : statusFilter,
      });
      setRows(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load wallets");
    } finally {
      setLoading(false);
    }
  }, [user, search, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleReconcile() {
    if (!user) return;
    setReconRunning(true);
    try {
      const idToken = await user.getIdToken();
      const report = await runWalletReconciliation(idToken);
      setRecon(report);
      if (report.mismatches.length === 0) {
        toast.success(`Reconciliation clean — ${report.sellersChecked} wallet(s) verified`);
      } else {
        toast.error(`${report.mismatches.length} mismatch(es) found`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reconciliation failed");
    } finally {
      setReconRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0f172a] tracking-tight">
            Seller Wallets
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Server-authoritative balances from the immutable finance ledger
          </p>
        </div>
        <button
          onClick={handleReconcile}
          disabled={reconRunning}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${reconRunning ? "animate-spin" : ""}`} />
          {reconRunning ? "Checking..." : "Run Reconciliation"}
        </button>
      </div>

      {/* Reconciliation result */}
      {recon && (
        <div
          className={`rounded-xl border p-4 ${
            recon.mismatches.length === 0
              ? "border-green-200 bg-green-50"
              : "border-red-200 bg-red-50"
          }`}
        >
          <div className="flex items-center gap-2">
            {recon.mismatches.length === 0 ? (
              <ShieldCheck className="h-5 w-5 text-green-600" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-red-600" />
            )}
            <p className="text-sm font-semibold text-slate-800">
              Reconciliation: {recon.sellersChecked} wallet(s) checked · {recon.mismatches.length}{" "}
              mismatch(es)
            </p>
          </div>
          {recon.mismatches.length > 0 && (
            <ul className="mt-2 space-y-1">
              {recon.mismatches.map((m, i) => (
                <li key={i} className="text-xs text-red-700 break-all">
                  {m}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search seller or wallet id…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#f57224]"
          />
        </div>
        <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === s ? "bg-[#0f172a] text-white" : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Wallet list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader className="h-8 w-8 animate-spin text-slate-300" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-12 text-center">
          <Wallet className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm text-slate-400">
            No wallets found. Wallets are created when a seller's first ledger entry posts.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {/* Header row (desktop) */}
          <div className="hidden grid-cols-[1.6fr_repeat(4,1fr)_auto] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-500 lg:grid">
            <span>Seller</span>
            <span className="text-right">Available</span>
            <span className="text-right">Pending</span>
            <span className="text-right">Total Earned</span>
            <span className="text-right">Total Withdrawn</span>
            <span className="text-center">Status</span>
          </div>
          <div className="divide-y divide-slate-100">
            {rows.map((row) => (
              <Link
                key={row.sellerId}
                to="/admin/wallets/$sellerId"
                params={{ sellerId: row.sellerId }}
                className="grid grid-cols-2 gap-x-3 gap-y-2 px-4 py-3.5 transition-colors hover:bg-orange-50/40 lg:grid-cols-[1.6fr_repeat(4,1fr)_auto] lg:items-center"
              >
                <div className="col-span-2 lg:col-span-1 min-w-0">
                  <p className="truncate text-sm font-semibold text-[#0f172a]">
                    {row.shopName ?? row.sellerId}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {row.sellerId} · {row.wallet.transactionCount} tx
                    {row.wallet.lastEntryAt
                      ? ` · last ${formatDateTime(row.wallet.lastEntryAt)}`
                      : ""}
                  </p>
                </div>
                <div className="lg:text-right">
                  <p className="text-xs text-slate-400 lg:hidden">Available</p>
                  <p className="text-sm font-bold text-[#0f172a]">
                    {formatPrice(row.wallet.availableMinor / 100)}
                  </p>
                </div>
                <div className="lg:text-right">
                  <p className="text-xs text-slate-400 lg:hidden">Pending</p>
                  <p className="text-sm font-semibold text-amber-600">
                    {formatPrice(row.wallet.pendingMinor / 100)}
                  </p>
                </div>
                <div className="lg:text-right">
                  <p className="text-xs text-slate-400 lg:hidden">Earned</p>
                  <p className="text-sm text-slate-600">
                    {formatPrice(row.wallet.totalEarnedMinor / 100)}
                  </p>
                </div>
                <div className="lg:text-right">
                  <p className="text-xs text-slate-400 lg:hidden">Withdrawn</p>
                  <p className="text-sm text-slate-600">
                    {formatPrice(row.wallet.totalWithdrawnMinor / 100)}
                  </p>
                </div>
                <div className="col-span-2 flex items-center justify-between gap-2 lg:col-span-1 lg:justify-end">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      row.wallet.status === "ACTIVE"
                        ? "bg-green-50 text-green-700"
                        : row.wallet.status === "CLOSED"
                          ? "bg-slate-100 text-slate-500"
                          : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {row.wallet.status}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
