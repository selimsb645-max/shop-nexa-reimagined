/**
 * Rejection-code → i18n-key mapping (pure). The mapping must cover
 * every machine code the canonical engine can emit, degrade
 * gracefully on unknown codes, and never invent new codes.
 */
import { describe, it, expect } from "vitest";
import { couponRejectionKey } from "../rejection-keys";

describe("couponRejectionKey", () => {
  it("maps every engine rejection to a distinct i18n key", () => {
    expect(couponRejectionKey("coupon/not-started")).toBe("coupon.notStarted");
    expect(couponRejectionKey("coupon/expired")).toBe("coupon.expired");
    expect(couponRejectionKey("coupon/customer-limit")).toBe("coupon.customerLimit");
    expect(couponRejectionKey("coupon/usage-exhausted")).toBe("coupon.usageLimit");
    expect(couponRejectionKey("coupon/min-subtotal")).toBe("coupon.minOrder");
    expect(couponRejectionKey("coupon/no-eligible-items")).toBe("coupon.notApplicable");
  });

  it("degrades disabled / not-found / invalid-value to the generic invalid key", () => {
    expect(couponRejectionKey("coupon/not-active")).toBe("coupon.invalid");
    expect(couponRejectionKey("coupon/not-found")).toBe("coupon.invalid");
    expect(couponRejectionKey("coupon/invalid-value")).toBe("coupon.invalid");
  });

  it("degrades unknown/legacy codes to the generic invalid key", () => {
    expect(couponRejectionKey("")).toBe("coupon.invalid");
    expect(couponRejectionKey("something/else")).toBe("coupon.invalid");
  });

  it("only ever returns keys the storefront i18n dictionary defines", () => {
    const allowed = new Set([
      "coupon.invalid",
      "coupon.notStarted",
      "coupon.expired",
      "coupon.customerLimit",
      "coupon.usageLimit",
      "coupon.minOrder",
      "coupon.notApplicable",
    ]);
    for (const code of [
      "coupon/not-active",
      "coupon/not-started",
      "coupon/expired",
      "coupon/no-eligible-items",
      "coupon/min-subtotal",
      "coupon/usage-exhausted",
      "coupon/customer-limit",
      "coupon/invalid-value",
      "coupon/not-found",
      "bogus",
    ]) {
      expect(allowed.has(couponRejectionKey(code))).toBe(true);
    }
  });
});
