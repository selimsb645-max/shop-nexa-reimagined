/**
 * AVENTA SHOP — Category-Based Commission Resolver (Server-Side)
 *
 * Commission resolution order:
 * 1. Subcategory commissionRate override (if product has subcategoryId AND override exists)
 * 2. Category base commissionRate (if product has categoryId AND rate exists)
 * 3. Seller flat commissionRate (fallback to legacy behavior)
 * 4. Global default from settings/site.commission.defaultRate (final fallback, default 8%)
 *
 * SECURITY:
 * - All reads happen server-side via Firebase Admin SDK
 * - Commission rate is NEVER trusted from the client
 * - Used by checkout.server.ts during placeOrderServer()
 *
 * BACKWARD COMPATIBILITY:
 * - Products without categoryId → falls back to seller rate (legacy behavior)
 * - Categories without commissionRate → falls back to seller rate
 * - Historical orders are NOT affected (commission is frozen at order creation)
 */

import { getAccessToken, getProjectId, fromFsFields } from "./firebase-admin.server";

function fsBaseUrl(projectId: string): string {
  const emulatorHost = Deno.env.get("FIRESTORE_EMULATOR_HOST");
  if (emulatorHost) {
    return `http://${emulatorHost}/v1/projects/${projectId}/databases/(default)/documents`;
  }
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

interface CategoryCommissionCache {
  categoryId: string;
  commissionRate: number | null;
  subcategoryOverrides: Map<string, number>;
}

/**
 * Reads commission configuration for a set of categories and their subcategories.
 * Returns a map: categoryId → { commissionRate, subcategoryOverrides: Map<subcategoryId, rate> }
 *
 * Uses batch reads to minimize Firestore API calls.
 */
export async function resolveCategoryCommissions(
  categoryIds: string[],
  subcategoryIds: Array<{ categoryId: string; subcategoryId: string }>,
): Promise<Map<string, CategoryCommissionCache>> {
  const result = new Map<string, CategoryCommissionCache>();
  if (categoryIds.length === 0) return result;

  const projectId = getProjectId();
  const token = await getAccessToken();
  const base = fsBaseUrl(projectId);

  // Batch read category documents
  const uniqueCatIds = Array.from(new Set(categoryIds.filter(Boolean)));
  for (const catId of uniqueCatIds) {
    try {
      const res = await fetch(`${base}/categories/${encodeURIComponent(catId)}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const doc = await res.json();
        const data = fromFsFields(doc.fields ?? {});
        const rate = data.commissionRate != null ? Number(data.commissionRate) : null;
        result.set(catId, {
          categoryId: catId,
          commissionRate: rate != null && Number.isFinite(rate) ? rate : null,
          subcategoryOverrides: new Map(),
        });
      } else {
        result.set(catId, {
          categoryId: catId,
          commissionRate: null,
          subcategoryOverrides: new Map(),
        });
      }
    } catch {
      result.set(catId, {
        categoryId: catId,
        commissionRate: null,
        subcategoryOverrides: new Map(),
      });
    }
  }

  // Read subcategory overrides
  const uniqueSubs = new Map<string, Set<string>>();
  for (const { categoryId, subcategoryId } of subcategoryIds) {
    if (!categoryId || !subcategoryId) continue;
    if (!uniqueSubs.has(categoryId)) uniqueSubs.set(categoryId, new Set());
    uniqueSubs.get(categoryId)!.add(subcategoryId);
  }

  for (const [catId, subIds] of uniqueSubs) {
    if (!result.has(catId)) {
      result.set(catId, {
        categoryId: catId,
        commissionRate: null,
        subcategoryOverrides: new Map(),
      });
    }
    const catCache = result.get(catId)!;

    for (const subId of subIds) {
      try {
        const res = await fetch(
          `${base}/categories/${encodeURIComponent(catId)}/subcategories/${encodeURIComponent(subId)}`,
          { headers: { authorization: `Bearer ${token}` } },
        );
        if (res.ok) {
          const doc = await res.json();
          const data = fromFsFields(doc.fields ?? {});
          const rate = data.commissionRate != null ? Number(data.commissionRate) : null;
          if (rate != null && Number.isFinite(rate)) {
            catCache.subcategoryOverrides.set(subId, rate);
          }
        }
      } catch {
        // Subcategory override not found — fall back to category rate
      }
    }
  }

  return result;
}

/**
 * Resolves the commission rate for a single product.
 *
 * @param categoryId - Product's category ID
 * @param subcategoryId - Product's subcategory ID (nullable)
 * @param commissionCache - Cache from resolveCategoryCommissions()
 * @param sellerRate - Seller's flat commission rate (fallback)
 * @param globalDefault - Global default rate (final fallback, e.g. 0.08)
 * @returns Resolved commission rate (0-1)
 */
export function resolveProductCommissionRate(
  categoryId: string | null | undefined,
  subcategoryId: string | null | undefined,
  commissionCache: Map<string, CategoryCommissionCache>,
  sellerRate: number,
  globalDefault: number,
): number {
  // Try subcategory override first
  if (categoryId && subcategoryId) {
    const catCache = commissionCache.get(categoryId);
    if (catCache) {
      const subOverride = catCache.subcategoryOverrides.get(subcategoryId);
      if (subOverride != null && Number.isFinite(subOverride)) {
        return Math.min(Math.max(subOverride, 0), 1);
      }
    }
  }

  // Try category base rate
  if (categoryId) {
    const catCache = commissionCache.get(categoryId);
    if (catCache?.commissionRate != null && Number.isFinite(catCache.commissionRate)) {
      return Math.min(Math.max(catCache.commissionRate, 0), 1);
    }
  }

  // Fall back to seller rate
  if (Number.isFinite(sellerRate)) {
    return Math.min(Math.max(sellerRate, 0), 1);
  }

  // Final fallback: global default
  return Math.min(Math.max(globalDefault, 0), 1);
}
