import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getDocs,
  collection,
  query as fsQuery,
  where,
  orderBy,
  limit as fbLimit,
  startAfter,
  getCountFromServer,
  getDocs as getDocsFn,
  documentId,
} from "firebase/firestore";
import { ClipboardCheck, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Spinner } from "@/components/common/Spinner";
import { getDb } from "@/services/firebase/config";
import { formatDate } from "@/utils/format";
import type { Product } from "@/types/commerce";

export const Route = createFileRoute("/_authenticated/admin/qc")({
  component: AdminQcQueuePage,
  head: () => ({ meta: [{ title: "Product QC — AVENTA SHOP Admin" }] }),
});

type QcState = "DRAFT" | "PENDING_QC" | "IN_QC" | "QC_PASSED" | "QC_FAILED" | "LISTED" | "UNLISTED";

interface QcReviewRow {
  reviewId: string;
  productId: string;
  sellerUid: string;
  status: QcState;
  decision: "changes_required" | "rejected" | null;
  failReasons: string[];
  submittedAt: number;
  reviewedAt: number | null;
  listedAt: number | null;
  // Enriched client-side:
  productTitle?: string;
  productImage?: string;
  sellerName?: string;
}

const PAGE_SIZE = 20;

const STATUS_TABS: { key: "" | QcState; label: string }[] = [
  { key: "", label: "All" },
  { key: "PENDING_QC", label: "Pending Review" },
  { key: "IN_QC", label: "Under Review" },
  { key: "QC_FAILED", label: "Changes Required" },
  { key: "QC_PASSED", label: "Passed" },
  { key: "LISTED", label: "Published" },
  { key: "UNLISTED", label: "Unlisted" },
];

const STATUS_TONE: Record<string, string> = {
  PENDING_QC: "bg-amber-500/10 text-amber-600",
  IN_QC: "bg-blue-500/10 text-blue-600",
  QC_PASSED: "bg-emerald-500/10 text-emerald-600",
  QC_FAILED: "bg-orange-500/10 text-orange-600",
  LISTED: "bg-green-500/10 text-green-600",
  UNLISTED: "bg-destructive/10 text-destructive",
  DRAFT: "bg-muted text-muted-foreground",
};

/** Batch-fetch docs by id (chunks of 30 — Firestore `in` limit). */
async function fetchByIds<T>(
  coll: string,
  ids: string[],
  map: (id: string, data: Record<string, unknown>) => T,
): Promise<Map<string, T>> {
  const out = new Map<string, T>();
  const db = getDb();
  for (let i = 0; i < ids.length; i += 30) {
    const chunk = ids.slice(i, i + 30);
    const snap = await getDocsFn(fsQuery(collection(db, coll), where(documentId(), "in", chunk)));
    snap.docs.forEach((d) => out.set(d.id, map(d.id, d.data() as Record<string, unknown>)));
  }
  return out;
}

function AdminQcQueuePage() {
  const [rows, setRows] = useState<QcReviewRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"" | QcState>("PENDING_QC");
  const [sellerFilter, setSellerFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const loadPage = useCallback(async (tabKey: "" | QcState, seller: string, pageIdx: number) => {
    setLoading(true);
    setError(null);
    try {
      const db = getDb();
      const clauses = [
        ...(tabKey ? [where("status", "==", tabKey)] : []),
        ...(seller.trim() ? [where("sellerUid", "==", seller.trim())] : []),
        orderBy("submittedAt", "desc"),
        fbLimit(PAGE_SIZE + 1),
        ...(pageIdx > 0 ? [startAfter(pageIdx * PAGE_SIZE)] : []),
      ];
      const snap = await getDocs(fsQuery(collection(db, "qcReviews"), ...clauses));
      const docs = snap.docs.slice(0, PAGE_SIZE);
      setHasMore(snap.docs.length > PAGE_SIZE);
      const parsed: QcReviewRow[] = docs.map((d) => {
        const v = d.data() as Record<string, unknown>;
        return {
          reviewId: String(v.reviewId ?? d.id),
          productId: String(v.productId ?? ""),
          sellerUid: String(v.sellerUid ?? ""),
          status: (v.status as QcState) ?? "DRAFT",
          decision: (v.decision as QcReviewRow["decision"]) ?? null,
          failReasons: (v.failReasons as string[]) ?? [],
          submittedAt: Number(v.submittedAt ?? 0),
          reviewedAt: (v.reviewedAt as number | null) ?? null,
          listedAt: (v.listedAt as number | null) ?? null,
        };
      });

      // Enrich with product + seller info (batched, bounded).
      const products = await fetchByIds<Product>(
        "products",
        [...new Set(parsed.map((r) => r.productId))],
        (id, d) =>
          ({
            id,
            title: String(d.title ?? ""),
            images: (d.images as string[]) ?? [],
          }) as Product,
      );
      const sellers = await fetchByIds<{ name: string }>(
        "sellers",
        [...new Set(parsed.map((r) => r.sellerUid))],
        (_id, d) => ({ name: String(d.shopName ?? d.storeName ?? d.name ?? "—") }),
      );
      setRows(
        parsed.map((r) => ({
          ...r,
          productTitle: products.get(r.productId)?.title,
          productImage: products.get(r.productId)?.images?.[0],
          sellerName: sellers.get(r.sellerUid)?.name,
        })),
      );
    } catch (err) {
      setError((err as Error).message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load queue whenever filters change (page reset).
  useEffect(() => {
    setPage(0);
    void loadPage(tab, sellerFilter, 0);
  }, [tab, sellerFilter, loadPage]);

  // Status counts for the tabs (admin-gated reads).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = getDb();
        const statuses = ["PENDING_QC", "IN_QC", "QC_FAILED", "QC_PASSED", "LISTED", "UNLISTED"];
        const entries = await Promise.all(
          statuses.map(async (s) => {
            const snap = await getCountFromServer(
              fsQuery(collection(db, "qcReviews"), where("status", "==", s)),
            );
            return [s, snap.data().count] as const;
          }),
        );
        if (!cancelled) setCounts(Object.fromEntries(entries));
      } catch {
        /* counts are best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.productTitle?.toLowerCase().includes(q) ||
        r.productId.toLowerCase().includes(q) ||
        r.sellerUid.toLowerCase().includes(q) ||
        r.reviewId.toLowerCase().includes(q),
    );
  }, [rows, search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ClipboardCheck className="h-6 w-6 text-primary" /> Product QC
        </h1>
        <p className="text-sm text-muted-foreground">
          Review marketplace listings before they go live. Publication happens only through this
          pipeline.
        </p>
      </div>

      {/* Status tabs with counts */}
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map(({ key, label }) => (
          <button
            key={key || "all"}
            onClick={() => setTab(key)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${
              tab === key ? "bg-primary text-primary-foreground" : "border hover:bg-muted"
            }`}
          >
            {label}
            {key && counts[key] !== undefined ? ` (${counts[key]})` : ""}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-background p-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product, product ID, seller UID (current page)"
            className="w-full rounded-md border px-9 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
        <input
          value={sellerFilter}
          onChange={(e) => setSellerFilter(e.target.value)}
          placeholder="Filter by seller UID"
          className="min-w-[200px] flex-1 rounded-md border px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 rounded-lg border bg-background p-8 text-sm text-muted-foreground">
          <Spinner /> Loading QC queue...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border bg-background p-10 text-center text-sm text-muted-foreground">
          No QC reviews match this view.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-background">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Product</th>
                <th className="px-4 py-3 text-left">Seller</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Submitted</th>
                <th className="px-4 py-3 text-left">Issues</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((r) => (
                <tr key={r.reviewId} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {r.productImage ? (
                        <img
                          src={r.productImage}
                          alt=""
                          className="h-10 w-10 rounded-md object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
                          ?
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="truncate font-medium">{r.productTitle ?? r.productId}</div>
                        <div className="truncate text-xs text-muted-foreground">{r.productId}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.sellerName ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.sellerUid}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        STATUS_TONE[r.status] ?? STATUS_TONE.DRAFT
                      }`}
                    >
                      {r.status === "QC_FAILED" && r.decision === "rejected"
                        ? "REJECTED"
                        : r.status.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {r.submittedAt ? formatDate(r.submittedAt) : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {r.failReasons.length > 0 ? r.failReasons.join(", ") : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to="/admin/qc/$reviewId"
                      params={{ reviewId: r.reviewId }}
                      className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                    >
                      {r.status === "PENDING_QC"
                        ? "Start review"
                        : r.status === "IN_QC"
                          ? "Continue review"
                          : "View"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Page {page + 1}</span>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const next = page - 1;
              setPage(next);
              void loadPage(tab, sellerFilter, next);
            }}
            disabled={page === 0 || loading}
            className="flex items-center gap-1 rounded-md border px-3 py-1.5 hover:bg-muted disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" /> Prev
          </button>
          <button
            onClick={() => {
              const next = page + 1;
              setPage(next);
              void loadPage(tab, sellerFilter, next);
            }}
            disabled={!hasMore || loading}
            className="flex items-center gap-1 rounded-md border px-3 py-1.5 hover:bg-muted disabled:opacity-40"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
