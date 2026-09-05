import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  where,
  runTransaction,
  serverTimestamp,
  updateDoc,
  deleteDoc,
  getDocs as fbGetDocs,
} from "firebase/firestore";
import { getDb } from "./config";
import type { Review } from "@/types/commerce";

/** Map a Firestore review doc to our Review type */
function mapReviewDoc(d: { id: string; data: () => Record<string, unknown> }, productId: string): Review {
  const data = d.data();
  return {
    id: d.id,
    productId,
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
    isApproved: data.isApproved !== false, // default true for backward compat
  };
}

/** List APPROVED reviews for a product (public display on product page). */
export async function listReviews(productId: string): Promise<Review[]> {
  const snap = await getDocs(
    query(
      collection(getDb(), "products", productId, "reviews"),
      where("isApproved", "==", true),
      orderBy("createdAt", "desc"),
    ),
  );
  return snap.docs.map((d) => mapReviewDoc(d, productId));
}

/** List ALL reviews for a product (approved + pending). Admin only. */
export async function listAllReviews(productId: string): Promise<Review[]> {
  const snap = await getDocs(
    query(
      collection(getDb(), "products", productId, "reviews"),
      orderBy("createdAt", "desc"),
    ),
  );
  return snap.docs.map((d) => mapReviewDoc(d, productId));
}

/** Create or update a review. New reviews are created with isApproved = false (pending moderation). */
export async function upsertReview(input: {
  productId: string;
  userId: string;
  userName: string;
  userPhoto: string | null;
  rating: number;
  title: string;
  comment: string;
}): Promise<void> {
  const db = getDb();
  const productRef = doc(db, "products", input.productId);
  const reviewRef = doc(db, "products", input.productId, "reviews", input.userId);

  await runTransaction(db, async (tx) => {
    const productSnap = await tx.get(productRef);
    if (!productSnap.exists()) throw new Error("Product not found");
    const existingSnap = await tx.get(reviewRef);
    const existingData = existingSnap.exists() ? existingSnap.data() as Record<string, unknown> : null;

    // Preserve isApproved on update, default false on create (pending moderation)
    const isApproved = existingData?.isApproved !== undefined
      ? existingData.isApproved
      : false;

    tx.set(reviewRef, {
      userId: input.userId,
      userName: input.userName,
      userPhoto: input.userPhoto,
      rating: input.rating,
      title: input.title,
      comment: input.comment,
      isApproved,
      createdAt: existingData?.createdAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Only update product rating/reviewCount if the review is already approved
    if (isApproved === true) {
      const previous = existingData ? Number(existingData.rating ?? 0) : null;
      const productData = productSnap.data() as { rating?: number; reviewCount?: number };
      const oldAvg = Number(productData.rating ?? 0);
      const oldCount = Number(productData.reviewCount ?? 0);
      let newCount = oldCount;
      let sum = oldAvg * oldCount;
      if (previous == null) {
        newCount = oldCount + 1;
        sum += input.rating;
      } else {
        sum = sum - previous + input.rating;
      }
      const newAvg = newCount > 0 ? sum / newCount : 0;
      tx.update(productRef, {
        rating: Math.round(newAvg * 10) / 10,
        reviewCount: newCount,
        updatedAt: serverTimestamp(),
      });
    }
  });
}

/** Get the current user's review for a product (regardless of approval status). */
export async function getMyReview(productId: string, userId: string): Promise<Review | null> {
  const snap = await getDoc(doc(getDb(), "products", productId, "reviews", userId));
  if (!snap.exists()) return null;
  return mapReviewDoc(snap, productId);
}

// ─── Admin functions ───────────────────────────────────────────────

/** Approve a pending review. Updates product rating/reviewCount atomically. */
export async function approveReview(productId: string, reviewId: string): Promise<void> {
  const db = getDb();
  const productRef = doc(db, "products", productId);
  const reviewRef = doc(db, "products", productId, "reviews", reviewId);

  await runTransaction(db, async (tx) => {
    const reviewSnap = await tx.get(reviewRef);
    if (!reviewSnap.exists()) throw new Error("Review not found");
    const reviewData = reviewSnap.data() as Record<string, unknown>;
    if (reviewData.isApproved === true) return; // already approved

    const rating = Number(reviewData.rating ?? 0);
    const productSnap = await tx.get(productRef);
    if (!productSnap.exists()) throw new Error("Product not found");
    const productData = productSnap.data() as { rating?: number; reviewCount?: number };

    const oldAvg = Number(productData.rating ?? 0);
    const oldCount = Number(productData.reviewCount ?? 0);
    const newCount = oldCount + 1;
    const newAvg = (oldAvg * oldCount + rating) / newCount;

    tx.update(reviewRef, { isApproved: true, approvedAt: serverTimestamp() });
    tx.update(productRef, {
      rating: Math.round(newAvg * 10) / 10,
      reviewCount: newCount,
      updatedAt: serverTimestamp(),
    });
  });
}

/** Reject (delete) a pending review. */
export async function rejectReview(productId: string, reviewId: string): Promise<void> {
  await deleteDoc(doc(getDb(), "products", productId, "reviews", reviewId));
}

/** Unapprove a previously approved review (reverse approval). Decrements product stats. */
export async function unapproveReview(productId: string, reviewId: string): Promise<void> {
  const db = getDb();
  const productRef = doc(db, "products", productId);
  const reviewRef = doc(db, "products", productId, "reviews", reviewId);

  await runTransaction(db, async (tx) => {
    const reviewSnap = await tx.get(reviewRef);
    if (!reviewSnap.exists()) throw new Error("Review not found");
    const reviewData = reviewSnap.data() as Record<string, unknown>;
    if (reviewData.isApproved !== true) return; // not approved

    const rating = Number(reviewData.rating ?? 0);
    const productSnap = await tx.get(productRef);
    if (!productSnap.exists()) throw new Error("Product not found");
    const productData = productSnap.data() as { rating?: number; reviewCount?: number };

    const oldAvg = Number(productData.rating ?? 0);
    const oldCount = Number(productData.reviewCount ?? 0);
    const newCount = Math.max(0, oldCount - 1);
    const newAvg = newCount > 0 ? (oldAvg * oldCount - rating) / newCount : 0;

    tx.update(reviewRef, { isApproved: false, approvedAt: null });
    tx.update(productRef, {
      rating: Math.round(newAvg * 10) / 10,
      reviewCount: newCount,
      updatedAt: serverTimestamp(),
    });
  });
}
