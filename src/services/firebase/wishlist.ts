import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { getDb } from "./config";
import type { Product, WishlistItem } from "@/types/commerce";

export async function listWishlist(uid: string): Promise<WishlistItem[]> {
  const snap = await getDocs(
    query(collection(getDb(), "users", uid, "wishlist"), orderBy("addedAt", "desc")),
  );
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      productId: d.id,
      addedAt:
        typeof data.addedAt === "number"
          ? data.addedAt
          : ((data.addedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? Date.now()),
      title: String(data.title ?? ""),
      image: String(data.image ?? ""),
      price: Number(data.price ?? 0),
      slug: String(data.slug ?? ""),
    };
  });
}

export async function addToWishlist(uid: string, p: Product): Promise<void> {
  await setDoc(doc(getDb(), "users", uid, "wishlist", p.id), {
    title: p.title,
    image: p.images[0] ?? "",
    price: p.price,
    slug: p.slug,
    addedAt: serverTimestamp(),
  });
}

export async function removeFromWishlist(uid: string, productId: string): Promise<void> {
  await deleteDoc(doc(getDb(), "users", uid, "wishlist", productId));
}
