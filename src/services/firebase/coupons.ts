import { doc, getDoc } from "firebase/firestore";
import { getDb } from "./config";
import type { Coupon } from "@/types/commerce";

export class CouponError extends Error {
  code: "not_found" | "inactive" | "expired" | "min_subtotal" | "usage_limit";
  constructor(code: CouponError["code"], msg: string) {
    super(msg);
    this.code = code;
  }
}

export interface CouponResult {
  coupon: Coupon;
  discount: number;
}

export async function validateCoupon(code: string, subtotal: number): Promise<CouponResult> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) throw new CouponError("not_found", "Enter a coupon code");
  const snap = await getDoc(doc(getDb(), "coupons", normalized));
  if (!snap.exists()) throw new CouponError("not_found", "Coupon not found");
  const c = { code: snap.id, ...(snap.data() as Omit<Coupon, "code">) };
  if (!c.active) throw new CouponError("inactive", "This coupon is no longer active");
  if (c.expiresAt && Date.now() > c.expiresAt)
    throw new CouponError("expired", "This coupon has expired");
  if (c.minSubtotal && subtotal < c.minSubtotal)
    throw new CouponError("min_subtotal", `Minimum order of $${c.minSubtotal.toFixed(2)} required`);
  if (c.usageLimit != null && c.uses >= c.usageLimit)
    throw new CouponError("usage_limit", "Coupon usage limit reached");

  let discount = c.type === "percent" ? subtotal * (c.value / 100) : c.value;
  // Cap at maxDiscount if specified (percent type only)
  if (c.maxDiscount != null) {
    discount = Math.min(discount, c.maxDiscount);
  }
  // Cap at subtotal
  discount = Math.min(subtotal, discount);
  return { coupon: c, discount: Math.round(discount * 100) / 100 };
}

// Coupon `uses` is incremented only by the trusted server-side checkout, so
// there is intentionally no client-side increment helper here. `validateCoupon`
// above is a read-only preview; the server revalidates the coupon at checkout.

// ═══════════════════════════════════════════════════════════════
// Coupon v2 — SERVER-AUTHORITATIVE preview (the only path the
// storefront uses to validate a coupon). The legacy client-side
// `validateCoupon` above is kept only for backward compatibility;
// it is NOT authoritative and must not gate any new flow: the
// canonical evaluation core (server) decides, the UI re-displays
// its result.
// ═══════════════════════════════════════════════════════════════

import { previewCoupon } from "@/lib/coupons/preview.functions";
import type { CouponPreviewResult, CouponPreviewReason } from "@/lib/coupons/preview.server";
import { getFirebaseAuth } from "./config";

export type { CouponPreviewResult, CouponPreviewReason };

/**
 * Server-authoritative coupon preview for the current cart.
 *
 * Sends product ids + quantities + the code; the server loads real
 * prices, applies flash-sale pricing and runs the SAME evaluation
 * core as the checkout redemption. Returns a machine-readable
 * result — the caller localizes the rejection via
 * `couponRejectionKey` below.
 *
 * Throws on network/server failure — callers MUST distinguish that
 * from a coupon rejection (show the network-error message, retry).
 */
export async function previewCouponForCart(
  code: string,
  items: Array<{ productId: string; quantity: number }>,
): Promise<CouponPreviewResult> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) {
    return { ok: false, code: "", reason: "coupon/not-found" };
  }
  // The cart is a public page — an anonymous preview is allowed; it
  // simply cannot see the per-customer usage counter (checkout, which
  // requires auth, enforces it authoritatively).
  const currentUser = getFirebaseAuth().currentUser;
  const idToken = currentUser ? await currentUser.getIdToken() : undefined;
  return previewCoupon({
    data: { idToken, items, couponCode: normalized },
  });
}

export { couponRejectionKey } from "@/lib/coupons/rejection-keys";
export type { CouponRejectionI18nKey as CouponRejectionKey } from "@/lib/coupons/rejection-keys";
