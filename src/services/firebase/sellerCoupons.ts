/**
 * AVENTA SHOP — Seller coupon client service.
 *
 * Thin transport client: every call goes through the TanStack server
 * functions in @/lib/coupons/seller-coupons.functions, which enforce
 * seller verification, canonical field validation, ownership and the
 * audit trail server-side. This service NEVER touches Firestore
 * directly — the security rules deny client SDK writes on coupons,
 * and the legacy direct-write path also created coupons with auto
 * doc ids the checkout engine could never see (code-id convention).
 *
 * The sellerId arguments are kept for API compatibility with the
 * existing UI, but ownership is derived from the caller's ID token
 * server-side — a mismatched sellerId is ignored, never trusted.
 */
import type { Coupon, CouponType } from "@/types/commerce";
import { getFirebaseAuth, firebaseConfigured } from "./config";
import {
  listSellerCouponsFn,
  createSellerCouponFn,
  toggleSellerCouponFn,
  deleteSellerCouponFn,
} from "@/lib/coupons/seller-coupons.functions";

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

async function requireIdToken(): Promise<string> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("Please sign in again.");
  return user.getIdToken();
}

/**
 * List all coupons for the signed-in seller (ownership verified
 * server-side against the ID token — the passed sellerId is advisory
 * and ignored when it does not match the caller).
 */
export async function listSellerCoupons(sellerId: string): Promise<Coupon[]> {
  if (!firebaseConfigured) return [];
  const idToken = await requireIdToken();
  const list = await listSellerCouponsFn({ data: { idToken } });
  // Defense-in-depth: never surface a coupon the caller does not own.
  return list.filter((c) => c.sellerId === sellerId);
}

/**
 * Get a single seller coupon (from the seller's own list only).
 */
export async function getSellerCoupon(sellerId: string, code: string): Promise<Coupon | null> {
  const list = await listSellerCoupons(sellerId);
  return list.find((c) => c.code === code.trim().toUpperCase()) ?? null;
}

/**
 * Create a seller-specific coupon (server-validated, code = doc id).
 */
export async function createSellerCoupon(
  _sellerId: string,
  input: SellerCouponInput,
): Promise<string> {
  const idToken = await requireIdToken();
  const coupon = await createSellerCouponFn({ data: { idToken, input } });
  return coupon.code;
}

/**
 * Delete a seller coupon — only when it has never been redeemed
 * (enforced server-side; redeemed coupons must be disabled instead).
 */
export async function deleteSellerCoupon(_sellerId: string, code: string): Promise<void> {
  const idToken = await requireIdToken();
  await deleteSellerCouponFn({ data: { idToken, code } });
}

/**
 * Toggle coupon active status (the ONLY field a seller may change
 * after creation — enforced by the masked server-side update).
 */
export async function toggleSellerCoupon(
  _sellerId: string,
  code: string,
  active: boolean,
): Promise<void> {
  const idToken = await requireIdToken();
  await toggleSellerCouponFn({ data: { idToken, code, active } });
}
