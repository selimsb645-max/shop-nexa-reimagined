import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { getDb } from "./config";
import type { CartItem, Product } from "@/types/commerce";

export async function listCart(uid: string): Promise<CartItem[]> {
  const snap = await getDocs(collection(getDb(), "users", uid, "cart"));
  return snap.docs
    .map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        productId: d.id,
        quantity: Number(data.quantity ?? 1),
        addedAt:
          typeof data.addedAt === "number"
            ? data.addedAt
            : (data.addedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ??
              Date.now(),
        title: String(data.title ?? ""),
        image: String(data.image ?? ""),
        price: Number(data.price ?? 0),
        slug: String(data.slug ?? ""),
        stock: Number(data.stock ?? 0),
      };
    })
    .sort((a, b) => b.addedAt - a.addedAt);
}

export async function setCartItem(
  uid: string,
  product: Product,
  quantity: number,
): Promise<void> {
  if (quantity <= 0) {
    await deleteDoc(doc(getDb(), "users", uid, "cart", product.id));
    return;
  }
  await setDoc(doc(getDb(), "users", uid, "cart", product.id), {
    quantity,
    title: product.title,
    image: product.images[0] ?? "",
    price: product.price,
    slug: product.slug,
    stock: product.stock,
    addedAt: serverTimestamp(),
  });
}

export async function updateCartQuantity(
  uid: string,
  productId: string,
  quantity: number,
  snapshot: Pick<CartItem, "title" | "image" | "price" | "slug" | "stock">,
): Promise<void> {
  if (quantity <= 0) {
    await deleteDoc(doc(getDb(), "users", uid, "cart", productId));
    return;
  }
  await setDoc(
    doc(getDb(), "users", uid, "cart", productId),
    { ...snapshot, quantity, addedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function removeCartItem(uid: string, productId: string): Promise<void> {
  await deleteDoc(doc(getDb(), "users", uid, "cart", productId));
}

export async function clearCart(uid: string): Promise<void> {
  const snap = await getDocs(collection(getDb(), "users", uid, "cart"));
  const batch = writeBatch(getDb());
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

export async function mergeGuestCart(uid: string, items: CartItem[]): Promise<void> {
  if (!items.length) return;
  const batch = writeBatch(getDb());
  for (const item of items) {
    batch.set(
      doc(getDb(), "users", uid, "cart", item.productId),
      {
        quantity: item.quantity,
        title: item.title,
        image: item.image,
        price: item.price,
        slug: item.slug,
        stock: item.stock,
        addedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }
  await batch.commit();
}
