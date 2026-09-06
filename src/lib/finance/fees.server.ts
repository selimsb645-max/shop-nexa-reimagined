/**
 * AVENTA SHOP — Order Financial Calculation (Prompt 04 §2)
 *
 *   Order Gross
 *   − Platform Commission
 *   − Applicable Fees (shipping share, service fees)
 *   − Refund/Reserve (if any)
 *   = Seller Net
 *
 * ALL amounts are integer minor units (paisa). Legacy float values
 * (taka) are converted ONCE at the read boundary via toMinor().
 *
 * Commission resolution reuses the EXISTING production hierarchy
 * (checkout.server.ts semantics — no behavior change, no hard-coded
 * commission anywhere in this engine):
 *   subcategory override > category base rate > seller flat rate
 *   > siteSettings.commission.defaultRate (default 8%)
 *
 * Runs ONLY on the server (service account). The frontend never sees
 * commission configuration.
 */

import { docPath, batchGetDocs } from "../firebase-admin.server";
import { resolveCategoryCommissions, resolveProductCommissionRate } from "../category-commission.server";
import { toMinor, mulBps, rateToBps, type Money } from "./money";

export interface OrderLineFinancialInput {
  sellerId: string;
  productId?: string | null;
  categoryId?: string | null;
  subcategoryId?: string | null;
  /** Line gross in legacy float taka (converted once, here). */
  lineTotalTaka: number;
  /** Line shipping share in legacy float taka (0 if platform-paid). */
  shippingTaka?: number;
}

export interface OrderLineFinancial {
  sellerId: string;
  /** Category for per-category return-window policies (Prompt 04 §5). */
  categoryId?: string | null;
  gross: Money;
  commission: Money;
  shippingFee: Money;
  sellerNet: Money;
  /** Resolved integer basis points used (audit transparency). */
  commissionBps: number;
}

export interface OrderFinancialBreakdown {
  currency: "BDT";
  lines: OrderLineFinancial[];
  totals: {
    grossMinor: number;
    commissionMinor: number;
    shippingFeeMinor: number;
    sellerNetMinor: number;
  };
}

interface CommissionSiteConfig {
  defaultRate?: number;
  categoryBased?: boolean;
}

/**
 * Compute the full per-seller financial breakdown for an order in
 * integer minor units. Pure read-only function — the caller decides
 * what to do with the result (settlement creation, audit, etc.).
 */
export async function computeOrderFinancials(
  projectId: string,
  siteSettingsData: Record<string, unknown>,
  lines: OrderLineFinancialInput[],
): Promise<OrderFinancialBreakdown> {
  const commissionConfig = (siteSettingsData["commission"] ?? {}) as CommissionSiteConfig;
  // Legacy config stores a percent (e.g. 8 = 8%) — converted to fraction
  // once, then to integer bps. No floats past this point.
  const globalDefaultRate = Number(commissionConfig.defaultRate ?? 8) / 100;
  const globalDefaultBps = rateToBps(Math.min(Math.max(globalDefaultRate, 0), 1));

  const sellerIds = [...new Set(lines.map((l) => l.sellerId))];
  const sellerDocs = sellerIds.length
    ? await batchGetDocs(projectId, sellerIds.map((sid) => docPath(projectId, ["sellers", sid])))
    : new Map();

  const sellerBps = new Map<string, number>();
  for (const sid of sellerIds) {
    const sDoc = sellerDocs.get(docPath(projectId, ["sellers", sid]));
    const sData = sDoc?.exists ? sDoc.data : {};
    const rawRate = Number(sData["commissionRate"] ?? globalDefaultRate);
    const safeRate = Number.isFinite(rawRate)
      ? Math.min(Math.max(rawRate, 0), 1)
      : Math.min(Math.max(globalDefaultRate, 0), 1);
    sellerBps.set(sid, rateToBps(safeRate));
  }

  // Category-based commissions reuse the production resolver.
  const categoryBased = Boolean(commissionConfig.categoryBased);
  const categoryIds = lines.map((l) => l.categoryId).filter(Boolean) as string[];
  const subPairs = lines
    .filter((l) => l.categoryId && l.subcategoryId)
    .map((l) => ({ categoryId: l.categoryId!, subcategoryId: l.subcategoryId! }));
  const commissionCache = categoryBased && categoryIds.length
    ? await resolveCategoryCommissions(categoryIds, subPairs)
    : new Map();

  const out: OrderLineFinancial[] = [];
  let grossMinor = 0, commissionMinor = 0, shippingMinor = 0, netMinor = 0;

  // ── GROUP PER SELLER FIRST (§2): one seller → one settlement row.
  // Multiple lines of the same seller are aggregated BEFORE any money
  // math so commission applies to the seller's order subtotal exactly
  // once (same result as per-line bps since the rate is per-seller).
  const grouped = new Map<string, {
    grossTaka: number; shippingTaka: number;
    categoryId: string | null; subcategoryId: string | null;
  }>();
  for (const l of lines) {
    const g = grouped.get(l.sellerId) ?? {
      grossTaka: 0, shippingTaka: 0, categoryId: null, subcategoryId: null,
    };
    g.grossTaka += l.lineTotalTaka;
    g.shippingTaka += l.shippingTaka ?? 0;
    // Keep the first non-null category for per-category policies.
    if (g.categoryId == null) g.categoryId = l.categoryId ?? null;
    if (g.subcategoryId == null) g.subcategoryId = l.subcategoryId ?? null;
    grouped.set(l.sellerId, g);
  }
  const sellerLines = [...grouped.entries()].map(([sellerId, g]) => ({
    sellerId,
    lineTotalTaka: g.grossTaka,
    shippingTaka: g.shippingTaka,
    categoryId: g.categoryId,
    subcategoryId: g.subcategoryId,
  }));

  for (const l of sellerLines) {
    const gross = toMinor(l.lineTotalTaka); // float → paisa ONCE
    const shippingFee = toMinor(l.shippingTaka ?? 0);

    let commissionBps = sellerBps.get(l.sellerId) ?? globalDefaultBps;
    if (categoryBased && l.categoryId) {
      const rate = resolveProductCommissionRate(
        l.categoryId, l.subcategoryId, commissionCache,
        sellerBps.get(l.sellerId) ?? globalDefaultRate,
        globalDefaultRate,
      );
      commissionBps = rateToBps(Math.min(Math.max(Number.isFinite(rate) ? rate : globalDefaultRate, 0), 1));
    }

    const commissionAmt = mulBps(gross.amountMinor, commissionBps);
    const net = gross.amountMinor - commissionAmt - shippingFee.amountMinor;

    out.push({
      sellerId: l.sellerId,
      categoryId: l.categoryId ?? null,
      gross,
      commission: { currency: "BDT", amountMinor: commissionAmt },
      shippingFee,
      sellerNet: { currency: "BDT", amountMinor: net },
      commissionBps,
    });
    grossMinor += gross.amountMinor;
    commissionMinor += commissionAmt;
    shippingMinor += shippingFee.amountMinor;
    netMinor += net;
  }

  return {
    currency: "BDT",
    lines: out,
    totals: {
      grossMinor, commissionMinor,
      shippingFeeMinor: shippingMinor,
      sellerNetMinor: netMinor,
    },
  };
}
