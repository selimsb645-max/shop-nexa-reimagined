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

  const discount =
    c.type === "percent"
      ? Math.min(subtotal, subtotal * (c.value / 100))
      : Math.min(subtotal, c.value);
  return { coupon: c, discount: Math.round(discount * 100) / 100 };
}

// Coupon `uses` is incremented only by the trusted server-side checkout, so
// there is intentionally no client-side increment helper here. `validateCoupon`
// above is a read-only preview; the server revalidates the coupon at checkout.
