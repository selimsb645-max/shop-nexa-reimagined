/**
 * Coupon evaluation core — pure unit tests.
 * Covers every validation rule + the multi-seller eligible-base math.
 */
import { describe, it, expect } from "vitest";
import {
  evaluateCoupon,
  eligibleLines,
  type CouponForEvaluation,
  type LineForEvaluation,
} from "../evaluate";

const NOW = 1_750_000_000_000;

function coupon(overrides: Partial<CouponForEvaluation> = {}): CouponForEvaluation {
  return {
    code: "SAVE10",
    type: "percent",
    value: 10,
    minSubtotal: 0,
    startAt: null,
    expiresAt: null,
    active: true,
    usageLimit: null,
    uses: 0,
    perCustomerLimit: null,
    sellerId: null,
    productIds: [],
    categoryIds: [],
    maxDiscount: null,
    ...overrides,
  };
}

function line(overrides: Partial<LineForEvaluation> = {}): LineForEvaluation {
  return {
    productId: "p1",
    sellerId: "sellerA",
    categoryId: "cat1",
    subcategoryId: "sub1",
    subtotal: 1000,
    ...overrides,
  };
}

describe("discount math", () => {
  it("percent discount on a platform-wide coupon covers the full cart", () => {
    const lines = [
      line({ productId: "p1", sellerId: "A", subtotal: 600 }),
      line({ productId: "p2", sellerId: "B", subtotal: 400 }),
    ];
    const r = evaluateCoupon(coupon({ type: "percent", value: 10 }), lines, 0, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.discount).toBe(100);
      expect(r.base).toBe(1000);
      expect(r.scoped).toBe(false);
    }
  });

  it("fixed discount", () => {
    const r = evaluateCoupon(
      coupon({ type: "fixed", value: 150 }),
      [line({ subtotal: 1000 })],
      0,
      NOW,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.discount).toBe(150);
  });

  it("maxDiscount caps a percent discount", () => {
    const r = evaluateCoupon(
      coupon({ type: "percent", value: 50, maxDiscount: 200 }),
      [line({ subtotal: 1000 })],
      0,
      NOW,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.discount).toBe(200);
  });

  it("discount can never exceed the discount base (no negative orders)", () => {
    const r = evaluateCoupon(
      coupon({ type: "fixed", value: 9999 }),
      [line({ subtotal: 500 })],
      0,
      NOW,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.discount).toBe(500);
  });

  it("percent > 100 is rejected as invalid", () => {
    const r = evaluateCoupon(coupon({ type: "percent", value: 150 }), [line()], 0, NOW);
    expect(r).toEqual({ ok: false, code: "SAVE10", reason: "coupon/invalid-value" });
  });

  it("rounds to 2dp", () => {
    const r = evaluateCoupon(
      coupon({ type: "percent", value: 15 }),
      [line({ subtotal: 333 })],
      0,
      NOW,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.discount).toBe(49.95);
  });
});

describe("lifecycle", () => {
  it("disabled coupons never apply", () => {
    const r = evaluateCoupon(coupon({ active: false }), [line()], 0, NOW);
    expect(r).toEqual({ ok: false, code: "SAVE10", reason: "coupon/not-active" });
  });

  it("not-started coupons are rejected", () => {
    const r = evaluateCoupon(coupon({ startAt: NOW + 60_000 }), [line()], 0, NOW);
    expect(r).toEqual({ ok: false, code: "SAVE10", reason: "coupon/not-started" });
  });

  it("a startAt in the past is accepted", () => {
    const r = evaluateCoupon(coupon({ startAt: NOW - 60_000 }), [line()], 0, NOW);
    expect(r.ok).toBe(true);
  });

  it("expired coupons are rejected (inclusive boundary)", () => {
    const r = evaluateCoupon(coupon({ expiresAt: NOW }), [line()], 0, NOW);
    expect(r).toEqual({ ok: false, code: "SAVE10", reason: "coupon/expired" });
  });

  it("a null startAt/expiry is an open window (legacy docs)", () => {
    const r = evaluateCoupon(coupon(), [line()], 0, NOW);
    expect(r.ok).toBe(true);
  });
});

describe("limits", () => {
  it("global usage exhausted", () => {
    const r = evaluateCoupon(coupon({ usageLimit: 100, uses: 100 }), [line()], 0, NOW);
    expect(r).toEqual({ ok: false, code: "SAVE10", reason: "coupon/usage-exhausted" });
  });

  it("last available usage still applies", () => {
    const r = evaluateCoupon(coupon({ usageLimit: 100, uses: 99 }), [line()], 0, NOW);
    expect(r.ok).toBe(true);
  });

  it("per-customer limit reached", () => {
    const r = evaluateCoupon(coupon({ perCustomerLimit: 2 }), [line()], 2, NOW);
    expect(r).toEqual({ ok: false, code: "SAVE10", reason: "coupon/customer-limit" });
  });

  it("minimum order value against the discount base", () => {
    const r = evaluateCoupon(
      coupon({ minSubtotal: 500, sellerId: "A" }),
      [
        line({ productId: "pA", sellerId: "A", subtotal: 300 }),
        line({ productId: "pB", sellerId: "B", subtotal: 5000 }),
      ],
      0,
      NOW,
    );
    // the OTHER seller's 5000 taka must NOT satisfy this seller coupon's minimum
    expect(r).toEqual({ ok: false, code: "SAVE10", reason: "coupon/min-subtotal" });
  });
});

describe("multi-seller safety (spec §4)", () => {
  const multiSellerCart = () => [
    line({ productId: "pA1", sellerId: "A", subtotal: 600 }),
    line({ productId: "pA2", sellerId: "A", subtotal: 400 }),
    line({ productId: "pB1", sellerId: "B", subtotal: 10_000 }),
  ];

  it("a seller coupon discounts ONLY the seller's items (no leakage)", () => {
    const r = evaluateCoupon(
      coupon({ sellerId: "A", type: "percent", value: 10 }),
      multiSellerCart(),
      0,
      NOW,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.base).toBe(1000); // A's 600+400, NOT the 10_000 of seller B
      expect(r.discount).toBe(100);
      expect(r.eligibleLines).toBe(2);
      expect(r.scoped).toBe(true);
    }
  });

  it("a seller coupon with no eligible items is rejected", () => {
    const r = evaluateCoupon(coupon({ sellerId: "C" }), multiSellerCart(), 0, NOW);
    expect(r).toEqual({ ok: false, code: "SAVE10", reason: "coupon/no-eligible-items" });
  });

  it("product scope discounts only those products", () => {
    const r = evaluateCoupon(
      coupon({ productIds: ["pA2"], type: "percent", value: 50 }),
      multiSellerCart(),
      0,
      NOW,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.base).toBe(400);
      expect(r.discount).toBe(200);
    }
  });

  it("category scope matches categoryId", () => {
    const r = evaluateCoupon(
      coupon({ categoryIds: ["cat2"], type: "fixed", value: 100 }),
      [
        line({ productId: "pX", categoryId: "cat2", subtotal: 900 }),
        line({ productId: "pY", categoryId: "cat1", subtotal: 5000 }),
      ],
      0,
      NOW,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.discount).toBe(100); // capped at its 900 base
  });

  it("category scope also matches subcategoryId", () => {
    const r = evaluateCoupon(
      coupon({ categoryIds: ["sub2"] }),
      [line({ subcategoryId: "sub2", subtotal: 800 })],
      0,
      NOW,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.discount).toBe(80);
  });

  it("seller + product + category scopes intersect (all must match)", () => {
    const r = evaluateCoupon(
      coupon({ sellerId: "A", productIds: ["pA1"], categoryIds: ["cat1"] }),
      multiSellerCart(),
      0,
      NOW,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.base).toBe(600);
      expect(r.eligibleLines).toBe(1);
    }
  });

  it("eligibleLines keeps the original line objects", () => {
    const lines = multiSellerCart();
    const { lines: out } = eligibleLines(coupon({ sellerId: "A" }), lines);
    expect(out).toHaveLength(2);
    expect(out[0].productId).toBe("pA1");
  });
});

describe("flash-sale compatibility (spec §11)", () => {
  it("discount base uses the FLASH-SALE price, not the original price", () => {
    // flash sale rewrote the line to the sale price before coupon evaluation
    const flashLine = line({ productId: "pFlash", subtotal: 350 }); // was 500
    const r = evaluateCoupon(coupon({ type: "percent", value: 10 }), [flashLine], 0, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.discount).toBe(35); // 10% of 350 — coupon can never "restore" the original price
  });
});
