import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getDoc, doc } from "firebase/firestore";
import { ArrowLeft, CheckCircle2, Send, Store, ListChecks, Ban } from "lucide-react";
import { toast } from "sonner";
import { Spinner } from "@/components/common/Spinner";
import { useAuth } from "@/context/AuthContext";
import { getDb } from "@/services/firebase/config";
import { formatPrice, formatDate } from "@/utils/format";
import { mapFirebaseError } from "@/utils/errors";
import { QC_CHECKLIST_META, qcChecklistLabel } from "@/lib/products-qc/qcStateMachine";
import {
  adminStartQcReview,
  adminCompleteQcReview,
  adminListQcPassedProduct,
  adminUnlistProduct,
} from "@/lib/products-qc/qc.functions";
import type { Product } from "@/types/commerce";

export const Route = createFileRoute("/_authenticated/admin/qc/$reviewId")({
  component: AdminQcReviewPage,
  head: () => ({ meta: [{ title: "QC Review — AVENTA SHOP Admin" }] }),
});

type QcState = "DRAFT" | "PENDING_QC" | "IN_QC" | "QC_PASSED" | "QC_FAILED" | "LISTED" | "UNLISTED";

interface QcReviewDoc {
  reviewId: string;
  productId: string;
  sellerUid: string;
  status: QcState;
  reviewerUid: string | null;
  failReasons: string[];
  decision: "changes_required" | "rejected" | null;
  reviewerNote: string | null;
  submittedAt: number;
  reviewedAt: number | null;
  listedAt: number | null;
  unlistReason?: string | null;
}

type CheckState = "pass" | "fail";

function AdminQcReviewPage() {
  const { reviewId } = Route.useParams();
  const { user } = useAuth();
  const [review, setReview] = useState<QcReviewDoc | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [sellerName, setSellerName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [checks, setChecks] = useState<Record<string, CheckState>>(
    Object.fromEntries(QC_CHECKLIST_META.map((m) => [m.key, "pass" as CheckState])),
  );
  const [decision, setDecision] = useState<"changes_required" | "rejected">("changes_required");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [unlistReason, setUnlistReason] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const db = getDb();
      const snap = await getDoc(doc(db, "qcReviews", reviewId));
      if (!snap.exists()) {
        setReview(null);
        return;
      }
      const v = snap.data() as Record<string, unknown>;
      const parsed: QcReviewDoc = {
        reviewId: String(v.reviewId ?? reviewId),
        productId: String(v.productId ?? ""),
        sellerUid: String(v.sellerUid ?? ""),
        status: (v.status as QcState) ?? "DRAFT",
        reviewerUid: (v.reviewerUid as string | null) ?? null,
        failReasons: (v.failReasons as string[]) ?? [],
        decision: (v.decision as QcReviewDoc["decision"]) ?? null,
        reviewerNote: (v.reviewerNote as string | null) ?? null,
        submittedAt: Number(v.submittedAt ?? 0),
        reviewedAt: (v.reviewedAt as number | null) ?? null,
        listedAt: (v.listedAt as number | null) ?? null,
        unlistReason: (v.unlistReason as string | null) ?? null,
      };
      setReview(parsed);
      // Pre-fill checklist with previous results when re-reviewing.
      const prevChecklist = (v.checklist as { key: string; passed: boolean }[]) ?? [];
      if (prevChecklist.length > 0) {
        setChecks(
          Object.fromEntries(
            QC_CHECKLIST_META.map((m) => {
              const prev = prevChecklist.find((c) => c.key === m.key);
              return [m.key, (prev?.passed ? "pass" : "fail") as CheckState];
            }),
          ),
        );
      }
      if (parsed.decision) setDecision(parsed.decision);
      if (parsed.reviewerNote) setNote(parsed.reviewerNote);

      const prodSnap = await getDoc(doc(db, "products", parsed.productId));
      if (prodSnap.exists()) {
        const pd = prodSnap.data() as Record<string, unknown>;
        setProduct({
          ...(pd as unknown as Product),
          id: prodSnap.id,
          images: (pd.images as string[]) ?? [],
        });
      }
      const sellerSnap = await getDoc(doc(db, "sellers", parsed.sellerUid));
      if (sellerSnap.exists()) {
        const sd = sellerSnap.data() as Record<string, unknown>;
        setSellerName(String(sd.shopName ?? sd.storeName ?? sd.name ?? parsed.sellerUid));
      }
    } catch (err) {
      toast.error(mapFirebaseError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewId]);

  const idToken = async () => {
    if (!user) throw new Error("Not signed in.");
    return user.getIdToken();
  };

  const run = async (action: string, fn: (token: string) => Promise<unknown>, done: string) => {
    setBusy(action);
    try {
      await fn(await idToken());
      toast.success(done);
      await load();
    } catch (err) {
      toast.error(mapFirebaseError(err));
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
        <Spinner /> Loading review...
      </div>
    );
  }

  if (!review) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        QC review not found.{" "}
        <Link to="/admin/qc" className="text-primary hover:underline">
          Back to queue
        </Link>
      </div>
    );
  }

  const allPassed = QC_CHECKLIST_META.every((m) => checks[m.key] === "pass");
  const canComplete = review.status === "IN_QC" && (allPassed || note.trim().length >= 3);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/admin/qc"
            className="flex h-9 w-9 items-center justify-center rounded-md border hover:bg-muted"
            title="Back to QC queue"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">QC Review</h1>
            <p className="text-sm text-muted-foreground">
              {review.status.replaceAll("_", " ")} · submitted {formatDate(review.submittedAt)}
            </p>
          </div>
        </div>
      </div>

      {/* Product + seller card */}
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border bg-background p-4">
        {product?.images?.[0] ? (
          <img src={product.images[0]} alt="" className="h-16 w-16 rounded-xl object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-muted text-sm text-muted-foreground">
            ?
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{product?.title ?? review.productId}</div>
          <div className="text-sm text-muted-foreground">
            {product ? formatPrice(product.price) : "—"} · stock {product?.stock ?? "—"}
          </div>
          <div className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
            <Store className="h-3.5 w-3.5" /> {sellerName ?? review.sellerUid}
          </div>
        </div>
        {review.status === "PENDING_QC" && (
          <button
            onClick={() =>
              run(
                "start",
                (token) => adminStartQcReview({ data: { idToken: token, reviewId } }),
                "Review started",
              )
            }
            disabled={busy !== null}
            className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy === "start" ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <ListChecks className="h-4 w-4" />
            )}
            Start review
          </button>
        )}
        {review.status === "QC_PASSED" && (
          <button
            onClick={() =>
              run(
                "list",
                (token) => adminListQcPassedProduct({ data: { idToken: token, reviewId } }),
                "Product published to storefront",
              )
            }
            disabled={busy !== null}
            className="flex items-center gap-1.5 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy === "list" ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Publish to storefront
          </button>
        )}
        {review.status === "LISTED" && (
          <div className="flex flex-col gap-2">
            <input
              value={unlistReason}
              onChange={(e) => setUnlistReason(e.target.value)}
              placeholder="Reason for takedown (required)"
              className="rounded-md border px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <button
              onClick={() => {
                if (unlistReason.trim().length < 3) {
                  toast.error("A reason is required to unlist a product.");
                  return;
                }
                void run(
                  "unlist",
                  (token) =>
                    adminUnlistProduct({
                      data: { idToken: token, reviewId, reason: unlistReason.trim() },
                    }),
                  "Product unlisted",
                );
              }}
              disabled={busy !== null}
              className="flex items-center justify-center gap-1.5 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy === "unlist" ? <Spinner className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
              Unlist product
            </button>
          </div>
        )}
      </div>

      {/* Previous decision */}
      {(review.status === "QC_FAILED" ||
        review.status === "LISTED" ||
        review.status === "UNLISTED") &&
        review.reviewerNote && (
          <div className="rounded-2xl border bg-muted/30 p-4 text-sm">
            <span className="font-medium">Previous reviewer note:</span> {review.reviewerNote}
            {review.unlistReason && (
              <div className="mt-1 text-muted-foreground">Unlist reason: {review.unlistReason}</div>
            )}
          </div>
        )}

      {/* Checklist form */}
      {(review.status === "IN_QC" || review.status === "PENDING_QC") && (
        <div className="space-y-4 rounded-2xl border bg-background p-4">
          <h2 className="font-semibold">QC Checklist</h2>
          <div className="space-y-2">
            {QC_CHECKLIST_META.map((m) => (
              <div
                key={m.key}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm ${
                  checks[m.key] === "fail" ? "border-destructive/40 bg-destructive/5" : ""
                }`}
              >
                <div>
                  <div className="font-medium">{m.label}</div>
                  <div className="text-xs text-muted-foreground">{m.sellerHint}</div>
                </div>
                <div className="flex gap-1">
                  {(["pass", "fail"] as CheckState[]).map((val) => (
                    <button
                      key={val}
                      onClick={() => setChecks((prev) => ({ ...prev, [m.key]: val }))}
                      className={`rounded-md px-3 py-1 text-xs font-medium ${
                        checks[m.key] === val
                          ? val === "pass"
                            ? "bg-green-600 text-white"
                            : "bg-destructive text-white"
                          : "border hover:bg-muted"
                      }`}
                    >
                      {val === "pass" ? "Pass" : "Fail"}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Structured reasons — required when any item fails */}
          {!allPassed && (
            <div className="space-y-3 rounded-lg border border-orange-500/40 bg-orange-500/5 p-3">
              <div className="text-sm font-medium text-orange-700">
                Failed items (structured reasons sent to the seller):{" "}
                {QC_CHECKLIST_META.filter((m) => checks[m.key] === "fail")
                  .map((m) => qcChecklistLabel(m.key))
                  .join("; ") || "—"}
              </div>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="decision"
                    checked={decision === "changes_required"}
                    onChange={() => setDecision("changes_required")}
                  />
                  Request changes (seller may resubmit)
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="decision"
                    checked={decision === "rejected"}
                    onChange={() => setDecision("rejected")}
                  />
                  Reject (note required)
                </label>
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Reviewer note — required for rejection, recommended for changes"
                rows={3}
                className="w-full rounded-md border p-2 text-sm outline-none focus:border-primary"
              />
            </div>
          )}

          <button
            onClick={() => {
              if (!allPassed && decision === "rejected" && note.trim().length < 3) {
                toast.error("Rejection requires an explanatory note.");
                return;
              }
              void run(
                "complete",
                (token) =>
                  adminCompleteQcReview({
                    data: {
                      idToken: token,
                      reviewId,
                      checklist: QC_CHECKLIST_META.map((m) => ({
                        key: m.key,
                        passed: checks[m.key] === "pass",
                        note: null,
                      })),
                      decision,
                      reviewerNote: note.trim() || null,
                    },
                  }),
                allPassed
                  ? "Review passed — product ready to publish"
                  : "Review completed with required changes",
              );
            }}
            disabled={busy !== null || !canComplete}
            className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 ${
              allPassed ? "bg-green-600" : "bg-primary"
            }`}
            title={
              review.status === "PENDING_QC"
                ? "Start the review first"
                : allPassed
                  ? "Approve"
                  : "Complete with failed items"
            }
          >
            {busy === "complete" ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            {allPassed ? "Approve (QC passed)" : "Send to seller with reasons"}
          </button>
          {review.status === "PENDING_QC" && (
            <p className="text-xs text-muted-foreground">
              Click "Start review" to unlock the checklist actions.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
