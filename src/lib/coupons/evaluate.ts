/**
 * AVENTA SHOP — Coupon evaluation core (pure, unit-testable).
 *
 * The single source of truth for "does this coupon apply to this cart
 * right now, and what discount does it produce". Used by the checkout
 * server (the only redemption path) — the CLIENT NEVER AUTHORIZES a
 * discount; it only re-displays what this server-side evaluation
 * produced.
 *
 * Money convention (existing checkout): taka with 2-decimal rounding
 * (`round2`). `value` is a percent (1-100) for `percent` coupons and
 * a taka amount for `fixed` coupons — exactly the legacy Coupon shape.
 *
 * Multi-seller safety (Coupon spec §4): a scoped coupon (seller /
 * product / category) computes its discount ONLY over the eligible
 * lines — a seller coupon can never leak discount onto another
 * seller's items.
 */

export type CouponDiscountType = "percent" | "fixed";

/** Coupon fields needed for evaluation (subset of the stored doc). */
export interface CouponForEvaluation {
  code: string;
  type: CouponDiscountType;
  /** percent 1-100, or taka for fixed coupons */
  value: number;
  /** minimum order value (taka) measured against the discount base */
  minSubtotal: number | null;
  /** window start, epoch ms — null/0 = open start */
  startAt: number | null;
  /** window end (legacy `expiresAt`), epoch ms — null = no expiry */
  expiresAt: number | null;
  active: boolean;
  /** global usage limit — null = unlimited */
  usageLimit: number | null;
  /** global redemption counter (server-controlled) */
  uses: number;
  /** per-customer usage limit — null = unlimited */
  perCustomerLimit: number | null;
  /** null = platform-wide; otherwise the owning seller */
  sellerId: string | null;
  /** product scope — empty = all of the scope's products */
  productIds: string[];
  /** category scope — empty = no category restriction */
  categoryIds: string[];
  /** discount cap (taka) — null = uncapped */
  maxDiscount: number | null;
}

/** Cart line fields needed for scope matching (checkout line subset). */
export interface LineForEvaluation {
  productId: string;
  sellerId: string | null;
  categoryId: string | null;
  subcategoryId: string | null;
  /** line total in taka AFTER flash-sale pricing */
  subtotal: number;
}

export type CouponRejection =
  | "coupon/not-active"
  | "coupon/not-started"
  | "coupon/expired"
  | "coupon/no-eligible-items"
  | "coupon/min-subtotal"
  | "coupon/usage-exhausted"
  | "coupon/customer-limit"
  | "coupon/invalid-value";

export interface CouponEvaluationOk {
  ok: true;
  code: string;
  /** the discount amount (taka) */
  discount: number;
  /** the base the discount was computed over (taka) */
  base: number;
  /** number of eligible lines the discount applies to */
  eligibleLines: number;
  /** true when the coupon is scoped (seller/product/category) */
  scoped: boolean;
}

export interface CouponEvaluationErr {
  ok: false;
  code: string;
  reason: CouponRejection;
}

export type CouponEvaluation = CouponEvaluationOk | CouponEvaluationErr;

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Which lines does the coupon's scope cover?
 * A coupon is "scoped" when it restricts to a seller, specific
 * products, or specific categories — platform-wide coupons (null
 * seller, no product/category lists) cover the whole cart.
 */
export function eligibleLines(
  coupon: CouponForEvaluation,
  lines: LineForEvaluation[],
): { scoped: boolean; lines: LineForEvaluation[] } {
  const scoped =
    coupon.sellerId != null || coupon.productIds.length > 0 || coupon.categoryIds.length > 0;
  if (!scoped) return { scoped, lines };

  let out = lines;
  if (coupon.sellerId != null) {
    out = out.filter((l) => l.sellerId === coupon.sellerId);
  }
  if (coupon.productIds.length > 0) {
    const ids = new Set(coupon.productIds);
    out = out.filter((l) => ids.has(l.productId));
  }
  if (coupon.categoryIds.length > 0) {
    const cats = new Set(coupon.categoryIds);
    out = out.filter(
      (l) =>
        (l.categoryId != null && cats.has(l.categoryId)) ||
        (l.subcategoryId != null && cats.has(l.subcategoryId)),
    );
  }
  return { scoped, lines: out };
}

/**
 * Full server-side coupon validation + discount computation.
 * Pure: no I/O, deterministic given `nowMs`.
 */
export function evaluateCoupon(
  coupon: CouponForEvaluation,
  lines: LineForEvaluation[],
  userUses: number,
  nowMs: number,
): CouponEvaluation {
  const { scoped, lines: eligible } = eligibleLines(coupon, lines);
  const base = round2(eligible.reduce((s, l) => s + l.subtotal, 0));
  const subtotal = round2(lines.reduce((s, l) => s + l.subtotal, 0));
  const discountBase = scoped ? base : subtotal;

  const reject = (reason: CouponRejection): CouponEvaluationErr => ({
    ok: false,
    code: coupon.code,
    reason,
  });

  // 1. lifecycle — disabled coupons never apply
  if (coupon.active !== true) return reject("coupon/not-active");
  // 2. window — not started yet
  if (coupon.startAt != null && coupon.startAt > 0 && nowMs < coupon.startAt) {
    return reject("coupon/not-started");
  }
  // 3. window — expired
  if (coupon.expiresAt != null && nowMs >= coupon.expiresAt) {
    return reject("coupon/expired");
  }
  // 4. scope — a scoped coupon must cover at least one cart line
  if (scoped && eligible.length === 0) return reject("coupon/no-eligible-items");
  // 5. global usage limit
  if (coupon.usageLimit != null && coupon.uses >= coupon.usageLimit) {
    return reject("coupon/usage-exhausted");
  }
  // 6. per-customer usage limit
  if (coupon.perCustomerLimit != null && userUses >= coupon.perCustomerLimit) {
    return reject("coupon/customer-limit");
  }
  // 7. minimum order value — measured against the discount base
  const minSubtotal = coupon.minSubtotal ?? 0;
  if (discountBase < minSubtotal) return reject("coupon/min-subtotal");
  // 8. discount math
  const value = Number(coupon.value);
  if (!Number.isFinite(value) || value <= 0) {
    return reject("coupon/invalid-value");
  }
  let raw: number;
  if (coupon.type === "percent") {
    if (value > 100) return reject("coupon/invalid-value");
    raw = discountBase * (value / 100);
  } else {
    raw = value; // fixed taka
  }
  if (coupon.maxDiscount != null) raw = Math.min(raw, coupon.maxDiscount);
  // never exceed the discount base — a coupon can't make an order negative
  const discount = round2(Math.min(raw, discountBase));
  if (discount <= 0) return reject("coupon/invalid-value");

  return {
    ok: true,
    code: coupon.code,
    discount,
    base: discountBase,
    eligibleLines: eligible.length,
    scoped,
  };
}

/** Human-readable checkout error for a rejection code. */
export function couponRejectionMessage(reason: CouponRejection): string {
  switch (reason) {
    case "coupon/not-active":
      return "This coupon is no longer active.";
    case "coupon/not-started":
      return "This coupon is not active yet.";
    case "coupon/expired":
      return "This coupon has expired.";
    case "coupon/no-eligible-items":
      return "This coupon does not apply to any item in your cart.";
    case "coupon/min-subtotal":
      return "Your order does not meet this coupon's minimum order value.";
    case "coupon/usage-exhausted":
      return "This coupon has been fully redeemed.";
    case "coupon/customer-limit":
      return "You have already used this coupon the maximum number of times.";
    case "coupon/invalid-value":
      return "This coupon is invalid.";
  }
}
