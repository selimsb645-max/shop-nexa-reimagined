/**
 * AVENTA SHOP — Admin coupon client service.
 *
 * Thin transport client for the TanStack server functions in
 * @/lib/coupons/coupon-admin.functions — every call is role-verified
 * (COUPON_MANAGER_ROLES), canonical-field-validated and audited
 * server-side. This service NEVER touches Firestore directly: the
 * security rules deny client SDK writes on coupons for every role.
 *
 * The legacy direct-write path had two real bugs this fixes:
 *   1. it wrote from the browser, bypassing server validation and
 *      the audit trail entirely;
 *   2. upsert used setDoc() on the whole doc, silently WIPING
 *      sellerId, productIds and maxDiscount whenever an admin edited
 *      a coupon (data loss on every edit of a seller coupon).
 */
import type { Coupon, CouponType } from "@/types/commerce";
import { getFirebaseAuth, firebaseConfigured } from "./config";
import {
  listCouponsFn,
  upsertCouponFn,
  updateCouponActiveFn,
  deleteCouponFn,
} from "@/lib/coupons/coupon-admin.functions";

async function requireIdToken(): Promise<string> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("Please sign in again.");
  return user.getIdToken();
}

/** List every coupon (platform + seller) with usage counts. */
export async function listCoupons(): Promise<Coupon[]> {
  if (!firebaseConfigured) return [];
  const idToken = await requireIdToken();
  return listCouponsFn({ data: { idToken } });
}

export interface CouponInput {
  code: string;
  type: CouponType;
  value: number;
  minSubtotal: number;
  expiresAt: number | null;
  active: boolean;
  usageLimit: number | null;
}

/**
 * Create or edit a coupon. Editing is a masked server-side patch —
 * redemptions (uses), ownership (sellerId) and identity (code,
 * createdAt) are immutable; only the discount fields change.
 */
export async function upsertCoupon(input: CouponInput): Promise<void> {
  const idToken = await requireIdToken();
  await upsertCouponFn({ data: { idToken, input } });
}

/**
 * Enable/disable a coupon (audited COUPON_ENABLED/COUPON_DISABLED).
 */
export async function updateCouponActive(code: string, active: boolean): Promise<void> {
  const idToken = await requireIdToken();
  await updateCouponActiveFn({ data: { idToken, code, active } });
}

/**
 * Delete a never-redeemed coupon — the server refuses coupons with
 * redemptions (history is immutable; disable instead).
 */
export async function deleteCoupon(code: string): Promise<void> {
  const idToken = await requireIdToken();
  await deleteCouponFn({ data: { idToken, code } });
}
