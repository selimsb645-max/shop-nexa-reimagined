import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDb, firebaseConfigured } from "./config";
import type { Coupon, CouponType } from "@/types/commerce";

const COUPONS = "coupons";

export interface SellerCouponInput {
  code: string;
  type: CouponType;
  value: number;
  minSubtotal: number;
  expiresAt: number | null;
  usageLimit: number | null;
  productIds: string[]; // empty = all seller's products
  maxDiscount: number | null;
  active: boolean;
}

function mapCoupon(id: string, d: Record<string, unknown>): Coupon {
  const r = d as Record<string, unknown>;
  return {
    code: String(r.code ?? id),
    type: (r.type as CouponType) ?? "fixed",
    value: Number(r.value ?? 0),
    minSubtotal: Number(r.minSubtotal ?? 0),
    expiresAt: r.expiresAt != null ? Number(r.expiresAt) : null,
    active: Boolean(r.active ?? true),
    usageLimit: r.usageLimit != null ? Number(r.usageLimit) : null,
    uses: Number(r.uses ?? 0),
    sellerId: (r.sellerId as string | null) ?? null,
    productIds: Array.isArray(r.productIds) ? (r.productIds as string[]) : [],
    maxDiscount: r.maxDiscount != null ? Number(r.maxDiscount) : null,
  };
}

/**
 * List all coupons for a specific seller.
 */
export async function listSellerCoupons(
  sellerId: string,
): Promise<Coupon[]> {
  if (!firebaseConfigured) return [];
  const snap = await getDocs(
    query(
      collection(getDb(), COUPONS),
      where("sellerId", "==", sellerId),
      orderBy("code", "asc"),
    ),
  );
  return snap.docs.map((d) => mapCoupon(d.id, d.data()));
}

/**
 * Get a single seller coupon.
 */
export async function getSellerCoupon(
  sellerId: string,
  code: string,
): Promise<Coupon | null> {
  if (!firebaseConfigured) return null;
  const snap = await getDoc(doc(getDb(), COUPONS, code.toUpperCase()));
  if (!snap.exists()) return null;
  const coupon = mapCoupon(snap.id, snap.data());
  if (coupon.sellerId !== sellerId) return null;
  return coupon;
}

/**
 * Create a seller-specific coupon.
 */
export async function createSellerCoupon(
  sellerId: string,
  input: SellerCouponInput,
): Promise<string> {
  if (!firebaseConfigured) throw new Error("Firebase is not configured.");
  const code = input.code.trim().toUpperCase();
  if (!code) throw new Error("Coupon code is required.");

  // Check if coupon code already exists
  const existing = await getDoc(doc(getDb(), COUPONS, code));
  if (existing.exists()) {
    throw new Error("A coupon with this code already exists.");
  }

  const ref = await addDoc(collection(getDb(), COUPONS), {
    code,
    type: input.type,
    value: input.value,
    minSubtotal: input.minSubtotal,
    expiresAt: input.expiresAt,
    usageLimit: input.usageLimit,
    uses: 0,
    active: input.active,
    sellerId,
    productIds: input.productIds,
    maxDiscount: input.maxDiscount,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return ref.id;
}

/**
 * Update a seller coupon.
 */
export async function updateSellerCoupon(
  sellerId: string,
  code: string,
  patch: Partial<SellerCouponInput>,
): Promise<void> {
  if (!firebaseConfigured) throw new Error("Firebase is not configured.");
  const coupon = await getSellerCoupon(sellerId, code);
  if (!coupon) throw new Error("Coupon not found or not owned by you.");

  await updateDoc(doc(getDb(), COUPONS, code.toUpperCase()), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Delete a seller coupon.
 */
export async function deleteSellerCoupon(
  sellerId: string,
  code: string,
): Promise<void> {
  if (!firebaseConfigured) throw new Error("Firebase is not configured.");
  const coupon = await getSellerCoupon(sellerId, code);
  if (!coupon) throw new Error("Coupon not found or not owned by you.");

  await deleteDoc(doc(getDb(), COUPONS, code.toUpperCase()));
}

/**
 * Toggle coupon active status.
 */
export async function toggleSellerCoupon(
  sellerId: string,
  code: string,
  active: boolean,
): Promise<void> {
  await updateSellerCoupon(sellerId, code, { active });
}
