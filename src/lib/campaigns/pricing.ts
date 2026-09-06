/**
 * AVENTA SHOP — Campaign Pricing Engine (Prompt 05 §6)
 *
 * ALL amounts are integer minor units (paisa, BDT) — same rule as the
 * finance engine. No floats ever touch campaign pricing.
 *
 * Validation happens SERVER-SIDE (engine + Firestore rules) — the
 * client-sent price/discount is never trusted.
 *
 * Safety invariants enforced by validateDiscountRules/computeCampaignPrice:
 *   1. finalPrice is always > 0 (negative price impossible)
 *   2. discount > 0 and < originalPrice (free products are a data error,
 *      not a discount; use PRICE_OVERRIDE with review instead)
 *   3. finalPrice <= originalPrice (discount only goes down)
 *   4. finalPrice >= minimumPrice guard when provided
 *   5. PERCENT discounts are stored as basis points (1 bp = 0.01%)
 *   6. seller-approved price: the campaign price can never undercut the
 *      seller's explicitly approved floor for the product (§6)
 */
import { mulBps } from "../finance/money";

export type DiscountType = "PERCENT" | "FLAT" | "PRICE_OVERRIDE";

export interface DiscountRules {
  type: DiscountType;
  /** PERCENT: basis points (500 = 5%, max 9900). FLAT/PRICE_OVERRIDE: paisa. */
  valueMinor: number;
  /** Optional cap on the absolute discount (paisa) — PERCENT only. */
  maxDiscountMinor?: number | null;
  /** Optional floor: finalPrice may not go below this (paisa). */
  minimumPriceMinor?: number | null;
}

export interface PriceValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateDiscountRules(rules: DiscountRules): PriceValidationResult {
  const errors: string[] = [];
  if (rules.type === "PERCENT") {
    if (!Number.isSafeInteger(rules.valueMinor) || rules.valueMinor < 1 || rules.valueMinor > 9900) {
      errors.push("PERCENT discount must be 1..9900 basis points (0.01%–99%)");
    }
  } else {
    if (!Number.isSafeInteger(rules.valueMinor) || rules.valueMinor <= 0) {
      errors.push(`${rules.type} discount must be a positive integer paisa amount`);
    }
  }
  if (rules.maxDiscountMinor != null && rules.maxDiscountMinor < 0) {
    errors.push("maxDiscountMinor must be >= 0");
  }
  if (rules.minimumPriceMinor != null && rules.minimumPriceMinor <= 0) {
    errors.push("minimumPriceMinor must be > 0");
  }
  return { ok: errors.length === 0, errors };
}

export interface ComputedPrice {
  originalPriceMinor: number;
  discountMinor: number;
  finalPriceMinor: number;
}

/**
 * Compute the campaign price for one product.
 * ALL inputs are integer minor units (paisa) — the same convention as
 * the rest of the campaign + finance engine. Major-unit (taka) values
 * must be converted with toMinor() at the API boundary, never here.
 * Throws on structurally invalid input (caller surfaces the error);
 * returns a clamped, always-positive final price otherwise.
 */
export function computeCampaignPrice(
  originalPriceInput: number,
  rules: DiscountRules,
  sellerApprovedPriceInput?: number | null,
): ComputedPrice {
  const originalPriceMinor = originalPriceInput;
  if (!Number.isSafeInteger(originalPriceMinor) || originalPriceMinor <= 0) {
    throw new Error(`campaigns/price: invalid originalPrice ${originalPriceInput}`);
  }
  const sellerFloorMinor =
    sellerApprovedPriceInput == null ? null : sellerApprovedPriceInput;

  let discountMinor: number;
  switch (rules.type) {
    case "PERCENT": {
      if (rules.valueMinor < 1 || rules.valueMinor > 9900) {
        throw new Error("campaigns/price: PERCENT out of range");
      }
      discountMinor = mulBps(originalPriceMinor, rules.valueMinor);
      if (rules.maxDiscountMinor != null && discountMinor > rules.maxDiscountMinor) {
        discountMinor = rules.maxDiscountMinor;
      }
      break;
    }
    case "FLAT": {
      if (rules.valueMinor <= 0) throw new Error("campaigns/price: FLAT must be > 0");
      discountMinor = rules.valueMinor;
      break;
    }
    case "PRICE_OVERRIDE": {
      if (rules.valueMinor <= 0) throw new Error("campaigns/price: PRICE_OVERRIDE must be > 0");
      if (rules.valueMinor >= originalPriceMinor) {
        throw new Error(
          "campaigns/price: override price must be lower than the original price",
        );
      }
      discountMinor = originalPriceMinor - rules.valueMinor;
      break;
    }
    default:
      throw new Error(`campaigns/price: unknown discount type ${rules["type"] satisfies never}`);
  }

  if (discountMinor >= originalPriceMinor) discountMinor = originalPriceMinor - 1;
  let finalPriceMinor = originalPriceMinor - discountMinor;

  // minimumPrice guard (campaign-level)
  const minGuard = rules.minimumPriceMinor ?? 0;
  if (finalPriceMinor < minGuard) finalPriceMinor = minGuard;
  if (finalPriceMinor <= 0) finalPriceMinor = 1; // negative/zero price impossible

  // seller-approved floor (§6): never undercut the seller's approved price
  if (sellerFloorMinor != null && sellerFloorMinor > 0) {
    if (finalPriceMinor < sellerFloorMinor) finalPriceMinor = sellerFloorMinor;
    if (finalPriceMinor > originalPriceMinor) finalPriceMinor = originalPriceMinor;
  }

  return { originalPriceMinor, discountMinor, finalPriceMinor };
}

/**
 * Full validation used on campaign create/update and seller submission —
 * mirrors the Firestore rules constraints (rules enforce the same list
 * for any client write; this is the server-side belt to those braces).
 */
export function validateCampaignPricing(
  originalPriceInput: number,
  rules: DiscountRules,
  sellerApprovedPriceInput?: number | null,
): { result: PriceValidationResult; price?: ComputedPrice } {
  const structure = validateDiscountRules(rules);
  if (!structure.ok) return { result: structure };
  if (rules.type === "FLAT" && rules.valueMinor >= originalPriceInput) {
    return {
      result: {
        ok: false,
        errors: ["FLAT discount must be lower than the original price"],
      },
    };
  }
  try {
    const price = computeCampaignPrice(originalPriceInput, rules, sellerApprovedPriceInput);
    // semantic checks beyond structure:
    const errors: string[] = [];
    if (price.finalPriceMinor >= price.originalPriceMinor) {
      errors.push("finalPrice must be lower than originalPrice");
    }
    if (price.finalPriceMinor <= 0) errors.push("finalPrice must be positive");
    return { result: { ok: errors.length === 0, errors }, price };
  } catch (err) {
    return {
      result: { ok: false, errors: [err instanceof Error ? err.message : String(err)] },
    };
  }
}
