import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Send,
  UserCheck,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { SellerGate } from "@/components/seller/SellerGate";
import { Spinner } from "@/components/common/Spinner";
import { useAuth } from "@/context/AuthContext";
import { getSellerProduct, type SellerQcReview } from "@/services/firebase/sellerProducts";
import { sellerSubmitProductForQc } from "@/lib/products-qc/qc.functions";
import {
  QC_STATE_LABELS,
  QC_CHECKLIST_META,
  qcChecklistHint,
  qcChecklistLabel,
} from "@/lib/products-qc/qcStateMachine";
import { mapFirebaseError } from "@/utils/errors";
import { formatPrice } from "@/utils/format";
import { formatDate } from "@/utils/format";
import type { Product } from "@/types/commerce";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/_authenticated/seller/products/$id/qc")({
  component: () => <SellerGate>{(profile) => <QcStatusPage sellerId={profile.uid} />}</SellerGate>,
});

const STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  PENDING_QC: "bg-amber-500/10 text-amber-600",
  IN_QC: "bg-blue-500/10 text-blue-600",
  QC_PASSED: "bg-emerald-500/10 text-emerald-600",
  QC_FAILED: "bg-orange-500/10 text-orange-600",
  LISTED: "bg-green-500/10 text-green-600",
  UNLISTED: "bg-destructive/10 text-destructive",
};

function QcStatusPage({ sellerId }: { sellerId: string }) {
  const { t } = useI18n();
  const { id } = Route.useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const [review, setReview] = useState<SellerQcReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // The product doc carries a denormalized qcReviewId? No — one read
        // of the deterministic review id (qc_{productId}) is enough.
        const prod = await getSellerProduct(sellerId, id);
        if (cancelled) return;
        setProduct(prod);
        const { getDoc, doc } = await import("firebase/firestore");
        const { getDb } = await import("@/services/firebase/config");
        const snap = await getDoc(doc(getDb(), "qcReviews", `qc_${id}`));
        if (!cancelled) {
          setReview(
            snap.exists()
              ? ({
                  reviewId: String(snap.data().reviewId ?? snap.id),
                  productId: String(snap.data().productId ?? id),
                  sellerUid: String(snap.data().sellerUid ?? ""),
                  status: (snap.data().status as SellerQcReview["status"]) ?? "DRAFT",
                  checklist: (snap.data().checklist as SellerQcReview["checklist"]) ?? [],
                  reviewerUid: (snap.data().reviewerUid as string | null) ?? null,
                  failReasons: (snap.data().failReasons as string[]) ?? [],
                  decision: (snap.data().decision as SellerQcReview["decision"]) ?? null,
                  reviewerNote: (snap.data().reviewerNote as string | null) ?? null,
                  submittedAt: Number(snap.data().submittedAt ?? 0),
                  reviewedAt: (snap.data().reviewedAt as number | null) ?? null,
                  listedAt: (snap.data().listedAt as number | null) ?? null,
                } satisfies SellerQcReview)
              : null,
          );
        }
      } catch (err) {
        if (!cancelled) toast.error(mapFirebaseError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sellerId, id]);

  const status = review?.status ?? "DRAFT";
  const tone = STATUS_TONE[status] ?? STATUS_TONE.DRAFT;
  const canResubmit = status === "QC_FAILED" || status === "DRAFT" || status === "UNLISTED";

  const onResubmit = async () => {
    if (!user || !product) return;
    setSubmitting(true);
    try {
      const idToken = await user.getIdToken();
      await sellerSubmitProductForQc({ data: { idToken, productId: id } });
      toast.success("Product resubmitted for QC.");
      router.invalidate();
    } catch (err) {
      toast.error(mapFirebaseError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
        <Spinner /> Loading QC status...
      </div>
    );
  }

  if (!product) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Product not found.{" "}
        <Link to="/seller/products" className="text-primary hover:underline">
          Back to products
        </Link>
      </div>
    );
  }

  const failedKeys = new Set(review?.failReasons ?? []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/seller/products"
            className="flex h-9 w-9 items-center justify-center rounded-md border hover:bg-muted"
            title="Back to products"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">QC Review Status</h1>
            <p className="text-sm text-muted-foreground">{product.title}</p>
          </div>
        </div>
        <Link
          to="/seller/products/$id/edit"
          params={{ id }}
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Edit product
        </Link>
      </div>

      {/* Product snapshot */}
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border bg-background p-4">
        <img
          src={
            product.images[0] ||
            "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5jcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMDAgMzAwIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI2YzZjRmNiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzljYTNhZiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg=="
          }
          alt=""
          className="h-16 w-16 rounded-xl object-cover"
        />
        <div className="grid flex-1 gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div className="text-muted-foreground">
            Price: <span className="font-medium text-foreground">{formatPrice(product.price)}</span>
          </div>
          <div className="text-muted-foreground">
            Stock: <span className="font-medium text-foreground">{product.stock}</span>
          </div>
          <div className="text-muted-foreground">
            Category:{" "}
            <span className="font-medium text-foreground">{product.categorySlug || "—"}</span>
          </div>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${tone}`}>
          {status === "QC_FAILED" && review?.decision === "rejected"
            ? "Rejected"
            : QC_STATE_LABELS[status]}
        </span>
      </div>

      {/* Timeline */}
      <div className="rounded-2xl border bg-background p-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <CalendarClock className="h-4 w-4 text-primary" /> QC Timeline
        </h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
            <dt className="text-muted-foreground">Submitted</dt>
            <dd className="font-medium">{review ? formatDate(review.submittedAt) : "—"}</dd>
          </div>
          <div className="flex justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
            <dt className="text-muted-foreground">Last review</dt>
            <dd className="font-medium">
              {review?.reviewedAt ? formatDate(review.reviewedAt) : "—"}
            </dd>
          </div>
          <div className="flex justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
            <dt className="text-muted-foreground">Published</dt>
            <dd className="font-medium">{review?.listedAt ? formatDate(review.listedAt) : "—"}</dd>
          </div>
          <div className="flex justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
            <dt className="text-muted-foreground">Reviewed by</dt>
            <dd className="font-medium">
              {review?.reviewerUid ? (
                <span className="flex items-center gap-1">
                  <UserCheck className="h-4 w-4 text-emerald-600" /> AVENTA QC team
                </span>
              ) : (
                "—"
              )}
            </dd>
          </div>
        </dl>
      </div>

      {/* Correction checklist (shown after a failed review) */}
      {status === "QC_FAILED" && (
        <div className="rounded-2xl border border-orange-500/30 bg-orange-500/5 p-4">
          <h2 className="flex items-center gap-2 font-semibold text-orange-700">
            <AlertTriangle className="h-4 w-4" />
            {review?.decision === "rejected"
              ? "Product rejected"
              : "Corrections required before approval"}
          </h2>
          {review?.reviewerNote && (
            <p className="mt-2 rounded-lg bg-background p-3 text-sm">
              <span className="font-medium">Reviewer note:</span> {review.reviewerNote}
            </p>
          )}
          <ul className="mt-3 space-y-2">
            {QC_CHECKLIST_META.filter((m) => failedKeys.has(m.key)).map((m) => (
              <li
                key={m.key}
                className="flex items-start gap-2 rounded-lg bg-background p-3 text-sm"
              >
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div>
                  <div className="font-medium">{qcChecklistLabel(m.key)} — needs fixing</div>
                  <div className="text-muted-foreground">{m.sellerHint}</div>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              to="/seller/products/$id/edit"
              params={{ id }}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Fix and edit product
            </Link>
            <button
              onClick={onResubmit}
              disabled={submitting}
              className="flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              {submitting ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              Resubmit for QC
            </button>
          </div>
        </div>
      )}

      {/* Passed checklist summary (approved products) */}
      {(status === "QC_PASSED" || status === "LISTED") && review && review.checklist.length > 0 && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <h2 className="flex items-center gap-2 font-semibold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> QC checklist — all items passed
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {review.checklist.map((c) => (
              <li
                key={c.key}
                className="flex items-center gap-2 rounded-lg bg-background p-2 text-sm"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                {qcChecklistLabel(c.key)}
              </li>
            ))}
          </ul>
          {review.reviewerNote && (
            <p className="mt-3 rounded-lg bg-background p-3 text-sm">
              <span className="font-medium">Reviewer note:</span> {review.reviewerNote}
            </p>
          )}
        </div>
      )}

      {/* Still a draft — explain the pipeline */}
      {status === "DRAFT" && (
        <div className="rounded-2xl border bg-background p-4 text-sm text-muted-foreground">
          <h2 className="flex items-center gap-2 font-medium text-foreground">
            <ClipboardCheck className="h-4 w-4 text-primary" /> This product hasn't been submitted
            for QC yet
          </h2>
          <p className="mt-2">
            Every product on AVENTA SHOP goes through a quality review before it becomes publicly
            visible: submit it for QC, our team checks the listing against a standard checklist, and
            once it passes it gets published to the storefront.
          </p>
          <button
            onClick={onResubmit}
            disabled={submitting || !user}
            className="mt-4 flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            Submit for QC
          </button>
        </div>
      )}

      {/* Taken down */}
      {status === "UNLISTED" && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <h2 className="flex items-center gap-2 font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4" /> Product unlisted by the QC team
          </h2>
          <p className="mt-2 text-muted-foreground">
            Fix the issues and resubmit for a new QC review to make it live again.
          </p>
          <button
            onClick={onResubmit}
            disabled={submitting || !user}
            className="mt-4 flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            Resubmit for QC
          </button>
        </div>
      )}
    </div>
  );
}
