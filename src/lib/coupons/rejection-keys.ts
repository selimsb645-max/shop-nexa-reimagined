/**
 * AVENTA SHOP — coupon rejection → i18n key mapping (pure).
 *
 * The canonical engine (evaluate.ts) speaks machine codes
 * ("coupon/*"); this module maps them to the storefront's i18n keys
 * so the UI can localize the reason. No new error taxonomy — these
 * are exactly the engine's existing codes.
 */

export type CouponRejectionI18nKey =
  | "coupon.invalid"
  | "coupon.notStarted"
  | "coupon.expired"
  | "coupon.customerLimit"
  | "coupon.usageLimit"
  | "coupon.minOrder"
  | "coupon.notApplicable";

export function couponRejectionKey(reason: string): CouponRejectionI18nKey {
  switch (reason) {
    case "coupon/not-started":
      return "coupon.notStarted";
    case "coupon/expired":
      return "coupon.expired";
    case "coupon/customer-limit":
      return "coupon.customerLimit";
    case "coupon/usage-exhausted":
      return "coupon.usageLimit";
    case "coupon/min-subtotal":
      return "coupon.minOrder";
    case "coupon/no-eligible-items":
      return "coupon.notApplicable";
    // coupon/not-active, coupon/not-found, coupon/invalid-value and
    // anything unexpected degrade to the generic "invalid" message.
    default:
      return "coupon.invalid";
  }
}
