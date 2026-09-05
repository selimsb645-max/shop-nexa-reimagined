import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAuth } from "@/context/AuthContext";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Check, X, Clock, Star, MessageSquare, ChevronRight, Inbox, RotateCcw } from "lucide-react";
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit as fbLimit,
  startAfter,
  type QueryDocumentSnapshot,
  DocumentData,
} from "firebase/firestore";
import { getDb } from "@/services/firebase/config";
import { approveReview, rejectReview, unapproveReview } from "@/services/firebase/reviews";
import type { Review } from "@/types/commerce";

export const Route = createFileRoute("/_authenticated/admin/reviews")({
  component: AdminReviewsPage,
});

type FilterTab = "pending" | "approved" | "all";

interface AdminReview extends Review {
  productTitle: string;
  productImage: string;
}

function AdminReviewsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<FilterTab>("pending");
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const loadReviews = useCallback(async (filter: FilterTab) => {
    if (!user) return;
    setLoading(true);
    try {
      const db = getDb();
      // Get all products, then scan their reviews subcollections
      // For efficiency, use a different approach: query a small set of products
      const productsSnap = await getDocs(query(collection(db, "products"), fbLimit(200)));
      const allReviews: AdminReview[] = [];

      for (const prodDoc of productsSnap.docs) {
        const prodData = prodDoc.data() as Record<string, unknown>;
        const productTitle = String(prodData.title ?? "Untitled");
        const productImage = Array.isArray(prodData.images) && prodData.images.length > 0
          ? String(prodData.images[0])
          : (prodData.image as string) ?? "";

        let reviewsQuery;
        if (filter === "pending") {
          // For pending, we can't easily do where + orderBy on different fields without composite index
          // So we fetch all and filter client-side (products typically have few reviews each)
          reviewsQuery = query(
            collection(db, "products", prodDoc.id, "reviews"),
            orderBy("createdAt", "desc"),
            fbLimit(50),
          );
        } else if (filter === "approved") {
          reviewsQuery = query(
            collection(db, "products", prodDoc.id, "reviews"),
            orderBy("createdAt", "desc"),
            fbLimit(50),
          );
        } else {
          reviewsQuery = query(
            collection(db, "products", prodDoc.id, "reviews"),
            orderBy("createdAt", "desc"),
            fbLimit(50),
          );
        }

        const reviewsSnap = await getDocs(reviewsQuery);
        for (const revDoc of reviewsSnap.docs) {
          const data = revDoc.data() as Record<string, unknown>;
          const isApproved = data.isApproved !== false;
          if (filter === "pending" && isApproved) continue;
          if (filter === "approved" && !isApproved) continue;

          allReviews.push({
            id: revDoc.id,
            productId: prodDoc.id,
            userId: String(data.userId ?? ""),
            userName: String(data.userName ?? "Customer"),
            userPhoto: (data.userPhoto as string | null) ?? null,
            rating: Number(data.rating ?? 0),
            title: String(data.title ?? ""),
            comment: String(data.comment ?? ""),
            createdAt:
              typeof data.createdAt === "number"
                ? data.createdAt
                : (data.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? Date.now(),
            isApproved,
            productTitle,
            productImage,
          });
        }
      }

      // Sort by createdAt desc
      allReviews.sort((a, b) => b.createdAt - a.createdAt);
      setReviews(allReviews);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load reviews");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadReviews(tab);
  }, [tab, loadReviews]);

  async function handleApprove(productId: string, reviewId: string) {
    setProcessing(reviewId);
    try {
      await approveReview(productId, reviewId);
      toast.success("Review approved");
      setReviews((prev) => prev.filter((r) => r.id !== reviewId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to approve review");
    } finally {
      setProcessing(null);
    }
  }

  async function handleReject(productId: string, reviewId: string) {
    setProcessing(reviewId);
    try {
      await rejectReview(productId, reviewId);
      toast.success("Review rejected & removed");
      setReviews((prev) => prev.filter((r) => r.id !== reviewId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reject review");
    } finally {
      setProcessing(null);
    }
  }

  async function handleUnapprove(productId: string, reviewId: string) {
    setProcessing(reviewId);
    try {
      await unapproveReview(productId, reviewId);
      toast.success("Review moved back to pending");
      setReviews((prev) => prev.filter((r) => r.id !== reviewId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to unapprove review");
    } finally {
      setProcessing(null);
    }
  }

  const pendingCount = reviews.length;

  return (
    <AdminShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0f172a]">Review Moderation</h1>
            <p className="text-sm text-slate-500 mt-1">
              Approve or reject customer reviews before they appear on your store
            </p>
          </div>
        </div>

        {/* Tab filters */}
        <div className="flex gap-2 border-b border-slate-200">
          {([
            { id: "pending" as const, label: "Pending", icon: Clock },
            { id: "approved" as const, label: "Approved", icon: Check },
            { id: "all" as const, label: "All Reviews", icon: MessageSquare },
          ]).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? "border-[#f57224] text-[#f57224]"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Reviews list */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin h-8 w-8 border-3 border-[#f57224] border-t-transparent rounded-full" />
          </div>
        ) : reviews.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Inbox className="h-12 w-12 text-slate-300 mb-3" />
            <p className="text-sm font-medium text-slate-400">
              {tab === "pending" ? "No pending reviews" : "No reviews found"}
            </p>
            <p className="text-xs text-slate-300 mt-1">
              {tab === "pending" ? "All caught up! New reviews will appear here for approval." : "Reviews will appear here once customers start leaving them."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map((review) => (
              <ReviewCard
                key={review.id}
                review={review}
                tab={tab}
                processing={processing === review.id}
                onApprove={() => handleApprove(review.productId, review.id)}
                onReject={() => handleReject(review.productId, review.id)}
                onUnapprove={() => handleUnapprove(review.productId, review.id)}
              />
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  );
}

function ReviewCard({
  review,
  tab,
  processing,
  onApprove,
  onReject,
  onUnapprove,
}: {
  review: AdminReview;
  tab: FilterTab;
  processing: boolean;
  onApprove: () => void;
  onReject: () => void;
  onUnapprove: () => void;
}) {
  const dateStr = new Date(review.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
      <div className="flex gap-4">
        {/* Product image */}
        <div className="flex-shrink-0">
          {review.productImage ? (
            <img
              src={review.productImage}
              alt={review.productTitle}
              className="w-14 h-14 rounded-lg object-cover border border-slate-200"
            />
          ) : (
            <div className="w-14 h-14 rounded-lg bg-slate-100 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-slate-300" />
            </div>
          )}
        </div>

        {/* Review content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-[#0f172a] truncate">
                  {review.title || "No title"}
                </h3>
                <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                  review.isApproved
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}>
                  {review.isApproved ? "Approved" : "Pending"}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                on {review.productTitle}
              </p>
            </div>
            <div className="flex items-center gap-0.5 flex-shrink-0">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`h-3.5 w-3.5 ${
                    star <= review.rating
                      ? "fill-amber-400 text-amber-400"
                      : "text-slate-200"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* User info */}
          <div className="flex items-center gap-2 mt-2">
            {review.userPhoto ? (
              <img
                src={review.userPhoto}
                alt={review.userName}
                className="w-5 h-5 rounded-full"
              />
            ) : (
              <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-medium text-slate-500">
                {review.userName.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-xs text-slate-600">{review.userName}</span>
            <span className="text-xs text-slate-300">·</span>
            <span className="text-xs text-slate-400">{dateStr}</span>
          </div>

          {/* Comment */}
          {review.comment && (
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              {review.comment}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
            {!review.isApproved && (
              <button
                onClick={onApprove}
                disabled={processing}
                className="flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                Approve
              </button>
            )}
            {!review.isApproved && (
              <button
                onClick={onReject}
                disabled={processing}
                className="flex items-center gap-1 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
                Reject
              </button>
            )}
            {review.isApproved && (
              <button
                onClick={onUnapprove}
                disabled={processing}
                className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Unapprove
              </button>
            )}
            {review.isApproved && (
              <button
                onClick={onReject}
                disabled={processing}
                className="flex items-center gap-1 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
