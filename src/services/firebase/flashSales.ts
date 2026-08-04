import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  addDoc,
  serverTimestamp,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { getDb } from "./config";
import type { Product } from "@/types/commerce";

export interface FlashSale {
  id: string;
  title: string;
  slug: string;
  description: string;
  bannerImage: string | null;
  discountPercent: number;
  productIds: string[];
  startsAt: number;
  endsAt: number;
  active: boolean;
  createdAt: number;
}

export async function listActiveFlashSales(): Promise<FlashSale[]> {
  const db = getDb();
  const now = Date.now();
  const snap = await getDocs(
    query(
      collection(db, "flashSales"),
      where("active", "==", true),
      where("startsAt", "<=", now),
    ),
  );
  return snap.docs
    .map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        title: String(data.title ?? ""),
        slug: String(data.slug ?? d.id),
        description: String(data.description ?? ""),
        bannerImage: (data.bannerImage as string | null) ?? null,
        discountPercent: Number(data.discountPercent ?? 0),
        productIds: Array.isArray(data.productIds) ? (data.productIds as string[]) : [],
        startsAt: typeof data.startsAt === "number" ? data.startsAt : 0,
        endsAt: typeof data.endsAt === "number" ? data.endsAt : 0,
        active: Boolean(data.active),
        createdAt:
          typeof data.createdAt === "number"
            ? data.createdAt
            : (data.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? Date.now(),
      };
    })
    .filter((s) => s.endsAt > now)
    .sort((a, b) => a.endsAt - b.endsAt);
}

export async function getFlashSale(id: string): Promise<FlashSale | null> {
  const db = getDb();
  const snap = await getDoc(doc(db, "flashSales", id));
  if (!snap.exists()) return null;
  const data = snap.data() as Record<string, unknown>;
  return {
    id: snap.id,
    title: String(data.title ?? ""),
    slug: String(data.slug ?? snap.id),
    description: String(data.description ?? ""),
    bannerImage: (data.bannerImage as string | null) ?? null,
    discountPercent: Number(data.discountPercent ?? 0),
    productIds: Array.isArray(data.productIds) ? (data.productIds as string[]) : [],
    startsAt: typeof data.startsAt === "number" ? data.startsAt : 0,
    endsAt: typeof data.endsAt === "number" ? data.endsAt : 0,
    active: Boolean(data.active),
    createdAt:
      typeof data.createdAt === "number"
        ? data.createdAt
        : (data.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? Date.now(),
  };
}

export interface FlashSaleProduct extends Product {
  flashSalePrice: number;
  discountPercent: number;
}

export function computeFlashSalePrice(price: number, discountPercent: number): number {
  return Math.round(price * (1 - discountPercent / 100) * 100) / 100;
}
