import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Edit2, Plus, Search, Trash2, Package, ClipboardCheck, Send, Archive } from "lucide-react";
import { toast } from "sonner";
import { SellerGate } from "@/components/seller/SellerGate";
import { Spinner } from "@/components/common/Spinner";
import { useAuth } from "@/context/AuthContext";
import {
  deleteSellerProduct,
  listSellerProducts,
  listMyQcReviews,
  setProductStatus,
  type SellerQcReview,
} from "@/services/firebase/sellerProducts";
import { sellerSubmitProductForQc } from "@/lib/products-qc/qc.functions";
import { mapFirebaseError } from "@/utils/errors";
import { formatPrice } from "@/utils/format";
import type { Product } from "@/types/commerce";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/_authenticated/seller/products/")({
  component: () => <SellerGate>{(profile) => <ProductsPage sellerId={profile.uid} />}</SellerGate>,
});

/** Derive the QC pipeline status shown for a product row. */
function qcStatusFor(p: Product, review: SellerQcReview | undefined) {
  if (p.status === "archived") return "ARCHIVED" as const;
  if (review && review.status !== "DRAFT") return review.status;
  return "DRAFT" as const;
}

const QC_BADGES: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "Draft", cls: "bg-muted text-muted-foreground" },
  PENDING_QC: { label: "Pending QC", cls: "bg-amber-500/10 text-amber-600" },
  IN_QC: { label: "Under Review", cls: "bg-blue-500/10 text-blue-600" },
  QC_PASSED: { label: "Approved — awaiting publish", cls: "bg-emerald-500/10 text-emerald-600" },
  QC_FAILED: { label: "Changes Required", cls: "bg-orange-500/10 text-orange-600" },
  REJECTED: { label: "Rejected", cls: "bg-destructive/10 text-destructive" },
  LISTED: { label: "Published", cls: "bg-green-500/10 text-green-600" },
  UNLISTED: { label: "Unlisted", cls: "bg-destructive/10 text-destructive" },
  ARCHIVED: { label: "Archived", cls: "bg-muted text-muted-foreground" },
};

function ProductsPage({ sellerId }: { sellerId: string }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [qcReviews, setQcReviews] = useState<Map<string, SellerQcReview>>(new Map());
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "published" | "archived">(
    "all",
  );

  const refresh = async () => {
    setLoading(true);
    try {
      const [prods, reviews] = await Promise.all([
        listSellerProducts(sellerId),
        listMyQcReviews(sellerId),
      ]);
      setProducts(prods);
      setQcReviews(new Map(reviews.map((r) => [r.productId, r])));
    } catch (err) {
      toast.error(mapFirebaseError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerId]);

  const qcCounts = useMemo(() => {
    const counts = { PENDING_QC: 0, IN_QC: 0, QC_FAILED: 0, QC_PASSED: 0, LISTED: 0 };
    if (!qcReviews) return counts;
    for (const r of qcReviews.values()) {
      if (r.status in counts) counts[r.status as keyof typeof counts] += 1;
    }
    return counts;
  }, [qcReviews]);

  const filtered = useMemo(() => {
    if (!products) return [];
    const query = q.trim().toLowerCase();
    return products.filter((p) => {
      if (statusFilter !== "all" && (p.status ?? "published") !== statusFilter) return false;
      if (query) {
        const hay = `${p.title} ${p.sku ?? ""} ${p.tags.join(" ")}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [products, q, statusFilter]);

  const onDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      await deleteSellerProduct(sellerId, id);
      toast.success(t("seller.productDeleted"));
      void refresh();
    } catch (err) {
      toast.error(mapFirebaseError(err));
    }
  };

  const onArchive = async (p: Product) => {
    try {
      await setProductStatus(sellerId, p.id, "archived");
      toast.success("Product archived");
      void refresh();
    } catch (err) {
      toast.error(mapFirebaseError(err));
    }
  };

  /** Submit (or resubmit) a product into the QC queue — the only path to publication. */
  const onSubmitForQc = async (p: Product) => {
    if (!user) return;
    setSubmittingId(p.id);
    try {
      const idToken = await user.getIdToken();
      await sellerSubmitProductForQc({ data: { idToken, productId: p.id } });
      toast.success(`"${p.title}" submitted for QC. We'll notify you once it's reviewed.`);
      void refresh();
    } catch (err) {
      toast.error(mapFirebaseError(err));
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("seller.products")}</h1>
          <p className="text-sm text-muted-foreground">{t("seller.manageListings")}</p>
        </div>
        <Link
          to="/seller/products/new"
          className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Add product
        </Link>
      </div>

      {/* QC pipeline summary */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-background p-3 text-sm">
        <span className="mr-1 flex items-center gap-1.5 font-medium">
          <ClipboardCheck className="h-4 w-4 text-primary" /> QC Pipeline:
        </span>
        {[
          ["Pending QC", qcCounts.PENDING_QC, "text-amber-600"],
          ["Under Review", qcCounts.IN_QC, "text-blue-600"],
          ["Changes Required", qcCounts.QC_FAILED, "text-orange-600"],
          ["Approved", qcCounts.QC_PASSED, "text-emerald-600"],
          ["Published", qcCounts.LISTED, "text-green-600"],
        ].map(([label, count, cls]) => (
          <span
            key={String(label)}
            className={`rounded-full bg-muted px-3 py-1 text-xs font-medium ${cls}`}
          >
            {label}: {String(count)}
          </span>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          Products are published only after passing QC review.
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-background p-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title, SKU, tags"
            className="w-full rounded-md border px-9 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="all">{t("seller.allStatuses")}</option>
          <option value="published">{t("seller.published")}</option>
          <option value="draft">{t("seller.draft")}</option>
          <option value="archived">{t("seller.archived")}</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-lg border bg-background p-8 text-sm text-muted-foreground">
          <Spinner /> Loading products...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border bg-background py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Package className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">
            {products?.length === 0 ? "No products yet" : "No products match your filters"}
          </h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {products?.length === 0
              ? "Add your first product to start selling on AVENTA SHOP."
              : "Try clearing your search or status filter."}
          </p>
          {products?.length === 0 && (
            <Link
              to="/seller/products/new"
              className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Add product
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* Mobile product cards */}
          <div className="space-y-3 md:hidden">
            {filtered.map((p) => {
              const review = qcReviews.get(p.id);
              const qcStatus = qcStatusFor(p, review);
              const badge =
                QC_BADGES[
                  qcStatus === "QC_FAILED" && review?.decision === "rejected"
                    ? "REJECTED"
                    : qcStatus
                ] ?? QC_BADGES.DRAFT;
              const canSubmit = qcStatus === "DRAFT" || qcStatus === "QC_FAILED";
              return (
                <div key={p.id} className="rounded-lg border bg-background p-4">
                  <div className="flex items-start gap-3">
                    <img
                      src={p.images[0]}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-md object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{p.title}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {p.sku || `/${p.slug}`}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-sm font-bold">{formatPrice(p.price)}</span>
                        <span
                          className={
                            p.stock === 0
                              ? "text-xs text-destructive"
                              : p.stock <= 5
                                ? "text-xs text-orange-600"
                                : "text-xs text-muted-foreground"
                          }
                        >
                          Stock: {p.stock}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.cls}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {qcStatus === "DRAFT" || qcStatus === "QC_FAILED" ? (
                      <button
                        onClick={() => onSubmitForQc(p)}
                        disabled={submittingId === p.id}
                        className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                      >
                        {submittingId === p.id ? (
                          <Spinner className="h-3 w-3" />
                        ) : (
                          <Send className="h-3 w-3" />
                        )}
                        {qcStatus === "QC_FAILED" ? "Resubmit for QC" : "Submit for QC"}
                      </button>
                    ) : null}
                    {qcStatus !== "DRAFT" && qcStatus !== "ARCHIVED" && (
                      <Link
                        to="/seller/products/$id/qc"
                        params={{ id: p.id }}
                        className="rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                      >
                        View QC
                      </Link>
                    )}
                    <Link
                      to="/seller/products/$id/edit"
                      params={{ id: p.id }}
                      className="flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                    >
                      <Edit2 className="h-3 w-3" /> Edit
                    </Link>
                    {qcStatus === "DRAFT" && (
                      <button
                        onClick={() => onArchive(p)}
                        className="rounded-md border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                      >
                        Archive
                      </button>
                    )}
                    <button
                      onClick={() => onDelete(p.id, p.title)}
                      className="rounded-md border px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-lg border bg-background md:block">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">{t("seller.product")}</th>
                <th className="px-4 py-3 text-left">SKU</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3 text-left">QC Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((p) => {
                const review = qcReviews.get(p.id);
                const qcStatus = qcStatusFor(p, review);
                const badge =
                  QC_BADGES[
                    qcStatus === "QC_FAILED" && review?.decision === "rejected"
                      ? "REJECTED"
                      : qcStatus
                  ] ?? QC_BADGES.DRAFT;
                const canSubmit = qcStatus === "DRAFT" || qcStatus === "QC_FAILED";
                return (
                  <tr key={p.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={
                            p.images[0] ||
                            "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5jcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMDAgMzAwIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI2YzZjRmNiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzljYTNhZiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg=="
                          }
                          alt=""
                          className="h-10 w-10 rounded-md object-cover"
                        />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{p.title}</div>
                          <div className="text-xs text-muted-foreground">/{p.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.sku || "—"}</td>
                    <td className="px-4 py-3 text-right">{formatPrice(p.price)}</td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={
                          p.stock === 0 ? "text-destructive" : p.stock <= 5 ? "text-orange-600" : ""
                        }
                      >
                        {p.stock}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {qcStatus === "DRAFT" || qcStatus === "ARCHIVED" ? (
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.cls}`}
                          >
                            {badge.label}
                          </span>
                        ) : (
                          <Link
                            to="/seller/products/$id/qc"
                            params={{ id: p.id }}
                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium underline-offset-2 hover:underline ${badge.cls}`}
                            title="View QC details"
                          >
                            {badge.label}
                          </Link>
                        )}
                        {canSubmit && (
                          <button
                            onClick={() => onSubmitForQc(p)}
                            disabled={submittingId === p.id}
                            className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                          >
                            {submittingId === p.id ? (
                              <Spinner className="h-3 w-3" />
                            ) : (
                              <Send className="h-3 w-3" />
                            )}
                            {qcStatus === "QC_FAILED" ? "Resubmit for QC" : "Submit for QC"}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Link
                          to="/seller/products/$id/edit"
                          params={{ id: p.id }}
                          className="flex h-8 w-8 items-center justify-center rounded-md border hover:bg-muted"
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Link>
                        {qcStatus === "DRAFT" && (
                          <button
                            onClick={() => onArchive(p)}
                            className="flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted"
                            title="Archive"
                          >
                            <Archive className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => onDelete(p.id, p.title)}
                          className="flex h-8 w-8 items-center justify-center rounded-md border text-destructive hover:bg-destructive/10"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </>
      )}
    </div>
  );
}
