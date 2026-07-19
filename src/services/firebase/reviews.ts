import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { getDb } from "./config";
import type { Review } from "@/types/commerce";

export async function listReviews(productId: string): Promise<Review[]> {
  const snap = await getDocs(
    query(
      collection(getDb(), "products", productId, "reviews"),
      orderBy("createdAt", "desc"),
    ),
  );
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
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
    };
  });
}

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
    const previous = existingSnap.exists()
      ? Number((existingSnap.data() as { rating?: number }).rating ?? 0)
      : null;

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

    tx.set(reviewRef, {
      userId: input.userId,
      userName: input.userName,
      userPhoto: input.userPhoto,
      rating: input.rating,
      title: input.title,
      comment: input.comment,
      createdAt: serverTimestamp(),
    });
    tx.update(productRef, {
      rating: Math.round(newAvg * 10) / 10,
      reviewCount: newCount,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function getMyReview(productId: string, userId: string): Promise<Review | null> {
  const snap = await getDoc(doc(getDb(), "products", productId, "reviews", userId));
  if (!snap.exists()) return null;
  const data = snap.data() as Record<string, unknown>;
  return {
    id: snap.id,
    productId,
    userId,
    userName: String(data.userName ?? ""),
    userPhoto: (data.userPhoto as string | null) ?? null,
    rating: Number(data.rating ?? 0),
    title: String(data.title ?? ""),
    comment: String(data.comment ?? ""),
    createdAt:
      typeof data.createdAt === "number"
        ? data.createdAt
        : (data.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? Date.now(),
  };
}
