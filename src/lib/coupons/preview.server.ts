/**
 * AVENTA SHOP — Coupon preview (read-only, customer-facing).
 *
 * A pre-checkout validation endpoint that REUSES the canonical
 * evaluation core (evaluate.ts) — the exact same rules the atomic
 * checkout redemption runs. It performs NO writes: no `uses`
 * increments, no counters, no redemption records. It exists purely
 * so the storefront can SHOW the customer why a coupon does or does
 * not apply — the final authority remains the checkout commit.
 *
 * Discount base mirrors checkout exactly: flash-sale-adjusted line
 * prices (an active, in-window, strictly-lower flash sale reprices
 * the line BEFORE the coupon is evaluated).
 *
 * Machine codes only (no human text): the storefront localizes.
 *  • ok:        code, discount (taka), base, eligibleLines, scoped
 *  • rejected:  "coupon/not-found" | CouponRejection ("coupon/…")
 */

import { batchGetDocs, docPath, getProjectId } from "../firebase-admin.server";
import { getActiveFlashSaleForProduct } from "../campaigns/flashSale.server";
import {
  COUPONS_COLLECTION,
  COUPON_CUSTOMER_COUNTERS_COLLECTION,
  couponForEvaluation,
} from "./coupon.server";
import { evaluateCoupon, round2, type CouponRejection } from "./evaluate";

export const MAX_PREVIEW_LINES = 100;
export const MAX_PREVIEW_QTY = 100;

export type CouponPreviewReason = "coupon/not-found" | CouponRejection;

export interface CouponPreviewRequest {
  /** null = anonymous preview (per-customer limit not checkable) */
  uid: string | null;
  items: Array<{ productId: string; quantity: number }>;
  couponCode: string;
}

export interface CouponPreviewOk {
  ok: true;
  code: string;
  /** discount amount (taka) — server-computed */
  discount: number;
  /** the base the discount was computed over (taka) */
  base: number;
  /** how many cart lines are eligible (multi-seller display) */
  eligibleLines: number;
  /** true when the coupon is scoped (seller/product/category) */
  scoped: boolean;
}

export interface CouponPreviewErr {
  ok: false;
  code: string;
  /** machine-readable rejection code — the storefront localizes it */
  reason: CouponPreviewReason;
}

export type CouponPreviewResult = CouponPreviewOk | CouponPreviewErr;

export async function previewCouponServer(req: CouponPreviewRequest): Promise<CouponPreviewResult> {
  const projectId = getProjectId();

  // Sanitize exactly like checkout: trim ids, whole quantities,
  // collapse duplicates.
  const wanted = new Map<string, number>();
  for (const item of req.items.slice(0, MAX_PREVIEW_LINES)) {
    const id = String(item.productId ?? "").trim();
    const qty = Math.floor(Number(item.quantity));
    if (!id || !Number.isFinite(qty) || qty < 1 || qty > MAX_PREVIEW_QTY) {
      continue; // preview never throws on cart shape — it rejects the coupon only
    }
    wanted.set(id, (wanted.get(id) ?? 0) + qty);
  }
  const productIds = Array.from(wanted.keys());
  const couponCode = req.couponCode.trim().toUpperCase();
  if (!couponCode) {
    return { ok: false, code: "", reason: "coupon/not-found" };
  }

  const nowMs = Date.now();
  const couponName = docPath(projectId, [COUPONS_COLLECTION, couponCode]);
  const counterName = req.uid
    ? docPath(projectId, [COUPON_CUSTOMER_COUNTERS_COLLECTION, `${couponCode}__${req.uid}`])
    : null;
  const productNames = productIds.map((id) => docPath(projectId, ["products", id]));

  const docs = await batchGetDocs(projectId, [
    ...productNames,
    couponName,
    ...(counterName ? [counterName] : []),
  ]);

  // Build evaluation lines (read-only — no stock checks, no status
  // gates; those stay checkout-time concerns).
  interface PreviewLine {
    productId: string;
    sellerId: string | null;
    categoryId: string | null;
    subcategoryId: string | null;
    price: number;
    quantity: number;
    subtotal: number;
  }
  const lines: PreviewLine[] = [];
  for (const id of productIds) {
    const doc = docs.get(docPath(projectId, ["products", id]));
    if (!doc?.exists) continue;
    const d = doc.data;
    const price = Number(d["price"] ?? NaN);
    if (!Number.isFinite(price) || price < 0) continue;
    lines.push({
      productId: id,
      sellerId: (d["sellerId"] as string | null) ?? null,
      categoryId: (d["categoryId"] as string | null) ?? null,
      subcategoryId: (d["subcategoryId"] as string | null) ?? null,
      price,
      quantity: wanted.get(id)!,
      subtotal: round2(price * wanted.get(id)!),
    });
  }

  // Flash-sale reprice — same rule as checkout: an active in-window
  // sale with a strictly-lower price adjusts the line BEFORE the
  // coupon is evaluated (the discount base can only shrink).
  for (const l of lines) {
    const sale = await getActiveFlashSaleForProduct(projectId, l.productId, nowMs);
    if (!sale) continue;
    const salePriceTaka = sale.salePriceMinor / 100;
    if (!(salePriceTaka > 0) || !(salePriceTaka < l.price)) continue;
    l.price = round2(salePriceTaka);
    l.subtotal = round2(l.price * l.quantity);
  }

  const couponDoc = docs.get(couponName);
  if (!couponDoc?.exists) {
    return { ok: false, code: couponCode, reason: "coupon/not-found" };
  }

  const counterDoc = counterName ? docs.get(counterName) : undefined;
  const userUses = counterDoc?.exists ? Number(counterDoc.data["count"] ?? 0) : 0;

  const evaluation = evaluateCoupon(
    couponForEvaluation(couponCode, couponDoc.data),
    lines.map((l) => ({
      productId: l.productId,
      sellerId: l.sellerId,
      categoryId: l.categoryId,
      subcategoryId: l.subcategoryId,
      subtotal: l.subtotal,
    })),
    userUses,
    nowMs,
  );

  if (evaluation.ok) {
    return {
      ok: true,
      code: couponCode,
      discount: evaluation.discount,
      base: evaluation.base,
      eligibleLines: evaluation.eligibleLines,
      scoped: evaluation.scoped,
    };
  }
  return { ok: false, code: couponCode, reason: evaluation.reason };
}
