/**
 * Authoritative order placement.
 *
 * Every money-affecting value (item price, subtotal, discount, shipping,
 * total), the stock decrement and the coupon usage increment are computed here
 * from Firestore data. The browser only says *what* it wants to buy.
 *
 * SETTLEMENT INTEGRATION: Every order now creates a seller-wise settlement
 * breakdown with full financial fields, plus an immutable settlementTx
 * ledger entry marking earnings as "pending".
 */
import {
  batchGetDocs,
  commitWrites,
  docPath,
  getAccessToken,
  getProjectId,
  newDocId,
  toFsFields,
  toFsValue,
  beginTransaction,
  batchGetDocsWithTx,
  commitWithTx,
  rollbackTransaction,
  fromFsFields,
  type FsWrite,
  type FetchedDoc,
} from "./firebase-admin.server";
import {
  computeSellerSettlement,
  buildSellerOrderWrite,
  buildSettlementPendingTxWrite,
} from "./settlement.server";
import {
  resolveCategoryCommissions,
  resolveProductCommissionRate,
} from "./category-commission.server";

import {
  detectDeliveryZoneId,
  resolveZoneWithSettings,
  DELIVERY_ZONES,
  type DeliveryZoneId,
} from "@/data/bd-locations/deliveryZones";
import { deactivateExpiredCoupons } from "./coupon-expiry.functions";
import {
  COUPON_CUSTOMER_COUNTERS_COLLECTION,
  buildCouponRedemptionWrites,
  couponForEvaluation,
} from "./coupons/coupon.server";
import {
  couponRejectionMessage,
  eligibleLines,
  evaluateCoupon,
  type CouponForEvaluation,
} from "./coupons/evaluate";
import { checkLowStockAndNotify } from "./stock-alert.server";
import { reserveInventoryForOrder } from "./inventory.server";
import {
  getActiveFlashSaleForProduct,
  releaseFlashSaleStock,
  reserveFlashSaleStock,
  type FlashSaleDoc,
} from "./campaigns/flashSale.server";
import { advanceOrderStatus, dispatchOrderEvent } from "./orderWorkflow.server";

const POINTS_PER_CURRENCY_REDEEM = 100;
const MAX_LINE_ITEMS = 100;
const MAX_QTY_PER_ITEM = 100;

/**
 * Server-side delivery charge calculation based on the customer's address zone.
 * This is the AUTHORITATIVE calculation — the frontend value is just a preview.
 *
 * Uses the deliveryAddressSnapshot (which is already server-validated) to
 * determine the zone and return the correct charge.
 */
/**
 * Resolve delivery zone using admin-configured Firestore settings.
 * This is the AUTHORITATIVE charge — the frontend value is just a preview.
 *
 * Reads the deliveryZones config from site settings to get the actual charge
 * for the customer's zone. Falls back to DELIVERY_ZONES defaults if settings
 * are not available.
 */
export async function computeDeliveryChargeServer(
  deliveryAddressSnapshot: Record<string, unknown> | null | undefined,
): Promise<{
  zone: DeliveryZoneId;
  zoneId: string;
  zoneName: string;
  charge: number;
  label: string;
  labelBn: string;
  etaDays: [number, number];
  resolved: boolean;
}> {
  if (!deliveryAddressSnapshot) {
    // Fallback: no address → Outside Dhaka charge (safest default)
    return {
      zone: "OUTSIDE_DHAKA",
      zoneId: "OUTSIDE_DHAKA",
      zoneName: DELIVERY_ZONES.OUTSIDE_DHAKA.labelEn,
      charge: DELIVERY_ZONES.OUTSIDE_DHAKA.charge,
      label: DELIVERY_ZONES.OUTSIDE_DHAKA.labelEn,
      labelBn: DELIVERY_ZONES.OUTSIDE_DHAKA.labelBn,
      etaDays: DELIVERY_ZONES.OUTSIDE_DHAKA.etaDays,
      resolved: true,
    };
  }

  const districtEn = String(deliveryAddressSnapshot["districtEn"] ?? "");
  const upazilaEn = String(deliveryAddressSnapshot["upazilaEn"] ?? "");
  const thanaEn = String(deliveryAddressSnapshot["thanaEn"] ?? "");

  // Read admin-configured delivery zones from Firestore settings
  let settingsZones: Array<{
    id: string;
    labelEn: string;
    labelBn: string;
    charge: number;
    etaDays: [number, number];
    description: string;
    active: boolean;
    priority: number;
  }> = [];
  const fallbackConfig: { fallbackZoneId: string; noZoneBehavior: "block" | "fallback" } = {
    fallbackZoneId: "OUTSIDE_DHAKA",
    noZoneBehavior: "fallback",
  };

  try {
    const projectId = getProjectId();
    const settingsDocPath = docPath(projectId, ["settings", "site"]);
    const settingsDocs = await batchGetDocs(projectId, [settingsDocPath]);
    const sDoc = settingsDocs.get(settingsDocPath);
    if (sDoc?.exists) {
      const sd = sDoc.data as Record<string, unknown>;
      const dz = sd["deliveryZones"] as
        | {
            zones?: typeof settingsZones;
            fallbackZoneId?: string;
            noZoneBehavior?: "block" | "fallback";
          }
        | undefined;
      if (dz?.zones && Array.isArray(dz.zones)) {
        settingsZones = dz.zones;
      }
      if (dz?.fallbackZoneId) fallbackConfig.fallbackZoneId = dz.fallbackZoneId;
      if (dz?.noZoneBehavior) fallbackConfig.noZoneBehavior = dz.noZoneBehavior;
    }
  } catch {
    // Settings not available — use defaults
  }

  if (settingsZones.length > 0) {
    const result = resolveZoneWithSettings(
      { districtEn, upazilaEn, thanaEn },
      settingsZones,
      fallbackConfig,
    );

    if (!result.resolved && fallbackConfig.noZoneBehavior === "block") {
      throw new Error(
        "Delivery is not available for your area. Please select a different delivery address.",
      );
    }

    return {
      zone: result.zone,
      zoneId: result.zoneId,
      zoneName: result.zoneName,
      charge: result.charge,
      label: result.label,
      labelBn: result.labelBn,
      etaDays: result.etaDays,
      resolved: result.resolved,
    };
  }

  // Fallback to defaults
  const zone = detectDeliveryZoneId({ districtEn, upazilaEn, thanaEn });
  const config = DELIVERY_ZONES[zone];
  return {
    zone,
    zoneId: config.id,
    zoneName: config.labelEn,
    charge: config.charge,
    label: config.labelEn,
    labelBn: config.labelBn,
    etaDays: config.etaDays,
    resolved: true,
  };
}

export interface PlaceOrderRequest {
  uid: string;
  buyerEmail: string | null;
  items: Array<{ productId: string; quantity: number }>;
  deliveryAddressSnapshot?: Record<string, unknown> | null;
  shippingAddress: {
    fullName: string;
    phone: string;
    addressLine: string;
    city: string;
    postalCode: string;
    country: string;
    notes?: string;
  };
  paymentMethod: "cash_on_delivery" | "card" | "mobile_banking";
  couponCode: string | null;
  promoCode: string | null;
  rewardPoints: number;
  walletUsed: number;
  cartHash?: string | null;
}

export interface SellerEarningsBreakdown {
  sellerId: string;
  sellerSubtotal: number;
  commissionRate: number;
  commissionAmount: number;
  sellerNetEarnings: number;
}

export interface DeliverySnapshot {
  zoneId: string;
  zoneName: string;
  zoneCharge: number;
  customerDeliveryCharge: number;
  sellerDeliveryCharge: number;
  labelBn: string;
  etaDays: [number, number];
  deliveryLines: Array<{
    productId: string;
    sellerId: string;
    freeDelivery: boolean;
    zoneCharge: number;
    customerDeliveryCharge: number;
    sellerAbsorbedCharge: number;
  }>;
}

export interface PlaceOrderResult {
  orderId: string;
  items: Array<{
    productId: string;
    slug: string;
    title: string;
    image: string;
    price: number;
    quantity: number;
    subtotal: number;
    freeDelivery: boolean;
  }>;
  subtotal: number;
  discount: number;
  /** Human-readable reason a submitted coupon was NOT applied (null if no coupon or it applied). */
  couponRejection: string | null;
  /** Machine-readable rejection code for the same case ("coupon/…") — the storefront localizes it. */
  couponRejectionReason: string | null;
  promoDiscount: number;
  tax: number;
  taxRate: number;
  taxLabel: string;
  shipping: number;
  deliveryZone: string;
  deliveryZoneId: string;
  deliveryZoneName: string;
  deliveryZoneLabel: string;
  deliveryCharge: number;
  zoneCharge: number;
  customerDeliveryCharge: number;
  sellerDeliveryCharge: number;
  deliverySnapshot: DeliverySnapshot;
  rewardDiscount: number;
  walletUsed: number;
  total: number;
  platformFee: number;
  sellerEarnings: SellerEarningsBreakdown[];
  couponCode: string | null;
  promoCode: string | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════
// TRANSACTION-SAFE WALLET DEDUCTION
// ═══════════════════════════════════════════════════════════════
// Mirrors the gift card purchase transaction pattern from
// giftcards.server.ts — uses a Firestore transaction with the user
// document as a concurrency lock to prevent double-spending.

const MAX_WALLET_TX_RETRIES = 5;

/**
 * List walletTx document IDs for a user (outside transaction — names only).
 * Same pattern as listWalletTxDocIds in giftcards.server.ts.
 */
async function listWalletTxDocIds(projectId: string, uid: string): Promise<string[]> {
  const token = await getAccessToken();
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(uid)}:runQuery`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "walletTx" }],
          select: { fields: [{ fieldPath: "__name__" }] },
          limit: 1000,
        },
      }),
    },
  );
  if (!res.ok) throw new Error("Could not read wallet data. Please try again.");
  const json = (await res.json()) as Array<{ document?: { name?: string } }>;
  return json.filter((r) => r.document?.name).map((r) => r.document!.name!);
}

/**
 * Calculate wallet balance from fetched walletTx documents.
 * Same logic as calculateBalanceFromDocs in giftcards.server.ts.
 */
function calculateWalletBalanceFromDocs(docs: Map<string, FetchedDoc>): number {
  let balance = 0;
  for (const doc of docs.values()) {
    if (!doc.exists) continue;
    balance += Number(doc.data.amount ?? 0);
  }
  return Math.round(balance * 100) / 100;
}

/**
 * Deduct wallet balance for checkout using a Firestore transaction.
 *
 * This is the CRITICAL concurrency-safe function that prevents
 * double-spending. It mirrors the transaction pattern from
 * giftcards.server.ts:purchaseGiftCardServer.
 *
 * The user document (users/{uid}) is read within the transaction as a
 * "lock". Any concurrent wallet-affecting write (gift card purchase,
 * another checkout, withdrawal) also writes to the user document,
 * causing conflicting transactions to abort and retry.
 *
 * @returns The new walletTxVersion (for the user document).
 * @throws Error if balance is insufficient after retries.
 */
async function deductWalletInTransaction(input: {
  projectId: string;
  uid: string;
  amount: number;
  orderId: string;
  nowMs: number;
}): Promise<number> {
  const { projectId, uid, amount, orderId, nowMs } = input;
  const userDocName = docPath(projectId, ["users", uid]);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_WALLET_TX_RETRIES; attempt++) {
    let tx: string | null = null;
    try {
      // 1. Begin transaction
      tx = await beginTransaction(projectId);

      // 2. List walletTx document IDs (outside tx — just for names)
      const walletTxNames = await listWalletTxDocIds(projectId, uid);

      // 3. Read user doc + all walletTx docs WITHIN the transaction
      const allNames = [userDocName, ...walletTxNames];
      const docs = await batchGetDocsWithTx(projectId, allNames, tx);

      // 4. Calculate balance from transaction-locked reads
      const walletBalance = calculateWalletBalanceFromDocs(
        new Map(Array.from(docs.entries()).filter(([name]) => name !== userDocName)),
      );

      // 5. Check balance — this is the CRITICAL concurrency-safe check
      if (walletBalance < amount) {
        await rollbackTransaction(projectId, tx);
        throw new Error(
          `Insufficient wallet balance. You have \u{09F3}${walletBalance.toFixed(0)} but need \u{09F3}${amount.toFixed(0)}.`,
        );
      }

      // 6. Prepare atomic writes within the transaction
      const now = new Date().toISOString();
      const writes = [
        // Wallet debit (negative entry in the user's wallet ledger)
        {
          update: {
            name: docPath(projectId, ["users", uid, "walletTx", newDocId()]),
            fields: toFsFields({
              type: "spend",
              amount: -amount,
              note: `Used at checkout for order #${orderId.slice(0, 8)}`,
              orderId,
              createdAt: nowMs,
            }),
          },
          currentDocument: { exists: false },
        },
        // User document update (the "lock release" — bumps walletTxVersion
        // so any concurrent transaction reading the same user doc will abort)
        {
          update: {
            name: userDocName,
            fields: toFsFields({
              walletTxVersion: attempt + 1,
              updatedAt: now,
            }),
          },
          updateMask: { fieldPaths: ["walletTxVersion", "updatedAt"] },
        },
      ];

      // 7. Commit within the transaction
      const committed = await commitWithTx(projectId, writes, tx);
      if (committed) {
        return attempt + 1; // success — return the new walletTxVersion
      }

      // 8. ABORTED — concurrent transaction modified our reads. Retry.
      lastError = new Error("Another transaction modified your wallet. Retrying...");
    } catch (err) {
      if (tx) await rollbackTransaction(projectId, tx);
      throw err; // Non-retryable error (e.g., insufficient balance)
    }
  }

  throw lastError ?? new Error("Wallet deduction failed after multiple retries. Please try again.");
}

export async function placeOrderServer(req: PlaceOrderRequest): Promise<PlaceOrderResult> {
  const projectId = getProjectId();

  if (!req.items.length) throw new Error("Your cart is empty.");

  // ── COUPON AUTO-EXPIRY SWEEP ──
  // Deactivate any expired coupons before validating, so expired coupons
  // are guaranteed to be rejected (defense-in-depth with the expiresAt check below).
  try {
    await deactivateExpiredCoupons();
  } catch {
    // Non-blocking — the expiresAt timestamp check below is the primary guard
  }
  if (req.items.length > MAX_LINE_ITEMS) {
    throw new Error(`An order can contain at most ${MAX_LINE_ITEMS} different products.`);
  }

  // Collapse duplicates and sanitise quantities.
  const wanted = new Map<string, number>();
  for (const item of req.items) {
    const id = String(item.productId ?? "").trim();
    const qty = Math.floor(Number(item.quantity));
    if (!id) throw new Error("Your cart contains an invalid item.");
    if (!Number.isFinite(qty) || qty < 1 || qty > MAX_QTY_PER_ITEM) {
      throw new Error("Please choose a valid quantity for every item.");
    }
    wanted.set(id, (wanted.get(id) ?? 0) + qty);
  }

  const productIds = Array.from(wanted.keys());
  const productNames = productIds.map((id) => docPath(projectId, ["products", id]));
  const couponCode = req.couponCode ? req.couponCode.trim().toUpperCase() : null;
  const couponName = couponCode ? docPath(projectId, ["coupons", couponCode]) : null;
  const promoCode = req.promoCode ? req.promoCode.trim().toUpperCase() : null;
  const promoName = promoCode ? docPath(projectId, ["promoCodes", promoCode]) : null;

  // Per-customer coupon counter (Coupon spec §5) — read in the SAME
  // batch as the coupon itself so validation sees a consistent snapshot.
  const couponCounterName = couponCode
    ? docPath(projectId, [COUPON_CUSTOMER_COUNTERS_COLLECTION, `${couponCode}__${req.uid}`])
    : null;

  const extraDocs: string[] = [];
  if (couponName) extraDocs.push(couponName);
  if (couponCounterName) extraDocs.push(couponCounterName);
  if (promoName) extraDocs.push(promoName);

  const docs = await batchGetDocs(
    projectId,
    extraDocs.length > 0 ? [...productNames, ...extraDocs] : productNames,
  );

  const orderId = newDocId();
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  interface Line {
    productId: string;
    slug: string;
    title: string;
    image: string;
    price: number;
    quantity: number;
    subtotal: number;
    sellerId: string | null;
    freeDelivery: boolean;
    updateTime: string | null;
    categoryId: string | null;
    subcategoryId: string | null;
    /** Set when an active flash sale repriced this line (reserve→order). */
    flashSale: { campaignId: string; salePriceMinor: number; originalPriceMinor: number } | null;
  }

  const lines: Line[] = [];
  for (const id of productIds) {
    const doc = docs.get(docPath(projectId, ["products", id]));
    if (!doc?.exists) throw new Error("One of the products is no longer available.");
    const d = doc.data;
    const title = String(d["title"] ?? "Product");
    const status = d["status"] as string | undefined;
    if (status && status !== "published") {
      throw new Error(`${title} is not available for purchase.`);
    }
    const price = Number(d["price"] ?? NaN);
    if (!Number.isFinite(price) || price < 0) {
      throw new Error(`${title} has an invalid price and cannot be ordered.`);
    }
    // Three-field inventory model (Prompt 03 §2): availability is
    // stock − reserved − sold. Older product docs without the new
    // fields behave exactly as before (missing → 0).
    const stock = Number(d["stock"] ?? 0);
    const reserved = Number(d["reservedStock"] ?? 0);
    const sold = Number(d["soldStock"] ?? 0);
    const available = stock - reserved - sold;
    const qty = wanted.get(id)!;
    if (available < qty) throw new Error(`Not enough stock for ${title}.`);
    const images = Array.isArray(d["images"]) ? (d["images"] as unknown[]) : [];
    lines.push({
      productId: id,
      slug: String(d["slug"] ?? ""),
      title,
      image: typeof images[0] === "string" ? (images[0] as string) : "",
      price,
      quantity: qty,
      subtotal: round2(price * qty),
      sellerId: (d["sellerId"] as string | null) ?? null,
      freeDelivery: Boolean(d["freeDelivery"] ?? false),
      updateTime: doc.updateTime,
      categoryId: (d["categoryId"] as string | null) ?? null,
      subcategoryId: (d["subcategoryId"] as string | null) ?? null,
      flashSale: null,
    });
  }

  // ── FLASH SALE PRICING (reserve→order integration) ─────────────
  // An active, in-window flash sale bound to a cart product applies
  // its price to that line automatically — the server decides, the
  // client never sends flash-sale state. Only a strictly-lower sale
  // price is applied (guards against stale/invalid sale docs), and
  // only sales with remaining stock. Claims are reserved atomically
  // right before the order write (see below) and released by the
  // order workflow on CANCELLED / DELIVERY_FAILED.
  const flashByProduct = new Map<string, FlashSaleDoc>();
  await Promise.all(
    productIds.map(async (id) => {
      const sale = await getActiveFlashSaleForProduct(projectId, id, nowMs);
      if (sale) flashByProduct.set(id, sale);
    }),
  );
  const flashSaleClaims: Array<{ campaignId: string; productId: string; quantity: number }> = [];
  for (const l of lines) {
    const sale = flashByProduct.get(l.productId);
    if (!sale) continue;
    const salePriceTaka = sale.salePriceMinor / 100; // paisa → taka (exact 2dp)
    if (!(salePriceTaka > 0) || !(salePriceTaka < l.price)) continue; // must be a real discount
    l.price = round2(salePriceTaka);
    l.subtotal = round2(l.price * l.quantity);
    l.flashSale = {
      campaignId: sale.campaignId,
      salePriceMinor: sale.salePriceMinor,
      originalPriceMinor: sale.originalPriceMinor,
    };
  }
  for (const l of lines) {
    if (!l.flashSale) continue;
    const existing = flashSaleClaims.find((c) => c.campaignId === l.flashSale!.campaignId);
    if (existing) existing.quantity += l.quantity;
    else
      flashSaleClaims.push({
        campaignId: l.flashSale.campaignId,
        productId: l.productId,
        quantity: l.quantity,
      });
  }

  const subtotal = round2(lines.reduce((s, l) => s + l.subtotal, 0));

  // Coupon: re-validated server side via the canonical evaluation core,
  // never trusted from the client. Multi-seller safety: a scoped coupon
  // (seller/product/category) computes its discount ONLY over the
  // eligible lines — no cross-seller discount leakage.
  let discount = 0;
  let appliedCoupon: string | null = null;
  let couponUpdateTime: string | null = null;
  let couponBase = 0;
  let couponSellerId: string | null = null;
  let couponCounterExists = false;
  let couponCounterUpdateTime: string | null = null;
  let couponUses = 0;
  let couponUserUses = 0;
  let couponRejection: string | null = null;
  let couponRejectionReason: string | null = null;
  let appliedCouponScope: CouponForEvaluation | null = null;
  if (couponCode && couponName) {
    const cDoc = docs.get(couponName);
    if (cDoc?.exists) {
      const couponEval = couponForEvaluation(couponCode, cDoc.data);
      couponUses = couponEval.uses;
      const counterDoc = couponCounterName ? docs.get(couponCounterName) : undefined;
      couponCounterExists = counterDoc?.exists === true;
      couponCounterUpdateTime = counterDoc?.updateTime ?? null;
      const userUses = couponCounterExists ? Number(counterDoc?.data["count"] ?? 0) : 0;
      couponUserUses = userUses;
      const evaluation = evaluateCoupon(
        couponEval,
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
        discount = evaluation.discount;
        appliedCoupon = couponCode;
        appliedCouponScope = couponEval;
        couponUpdateTime = cDoc.updateTime;
        couponBase = evaluation.base;
        couponSellerId = couponEval.sellerId;
      } else {
        // Legacy behavior: an unusable coupon silently does not apply
        // (the order proceeds). The reason is surfaced in the response
        // so the storefront can explain WHY it was skipped.
        couponRejection = couponRejectionMessage(evaluation.reason);
        couponRejectionReason = evaluation.reason;
      }
    } else if (couponCode) {
      // Additive: a submitted code with no matching coupon doc (legacy
      // behavior keeps the order flowing) — surface the machine code so
      // the storefront can explain WHY nothing was discounted.
      couponRejectionReason = "coupon/not-found";
    }
  }

  // Promo Code: re-validated server side, same security model as coupons.
  let promoDiscount = 0;
  let appliedPromo: string | null = null;
  let promoUpdateTime: string | null = null;
  if (promoCode && promoName) {
    const pDoc = docs.get(promoName);
    if (pDoc?.exists) {
      const p = pDoc.data;
      const status = String(p["status"] ?? "");
      const pUserId = String(p["userId"] ?? "");
      const expiresAt = Number(p["expiresAt"] ?? 0);
      const minOrder = Number(p["minimumOrderAmount"] ?? 0);
      const usageLimit = Number(p["usageLimit"] ?? 1);
      const usedCount = Number(p["usedCount"] ?? 0);
      const pType = String(p["discountType"] ?? "percent");
      const pValue = Number(p["discountValue"] ?? 0);

      const usable =
        status === "active" &&
        pUserId === req.uid && // promo must belong to this user
        (expiresAt <= 0 || expiresAt > nowMs) &&
        subtotal >= minOrder &&
        usedCount < usageLimit &&
        Number.isFinite(pValue) &&
        pValue > 0;

      if (usable) {
        promoDiscount = round2(
          pType === "percent"
            ? Math.min(subtotal - discount, (subtotal - discount) * (pValue / 100))
            : Math.min(subtotal - discount, pValue),
        );
        appliedPromo = promoCode;
        promoUpdateTime = pDoc.updateTime;
      }
    }
  }

  const subAfterDiscount = round2(subtotal - discount - promoDiscount);
  // Delivery charge is computed server-side from the address zone.
  // Customer cannot manipulate this — it's based on their delivery address.
  // Reads admin-configured zone charges from Firestore settings.
  const {
    zone: deliveryZone,
    zoneId: deliveryZoneId,
    zoneName: deliveryZoneName,
    charge: zoneCharge,
    label: deliveryZoneLabel,
    labelBn: deliveryZoneLabelBn,
    etaDays: deliveryEtaDays,
    resolved: deliveryZoneResolved,
  } = await computeDeliveryChargeServer(req.deliveryAddressSnapshot);

  if (!deliveryZoneResolved) {
    throw new Error(
      "Delivery is not available for your area. Please select a different delivery address.",
    );
  }

  // ── BUILD ORDER ITEMS & SELLER GROUPS (needed for per-seller delivery) ──
  const orderItems = lines.map((l, idx) => ({
    productId: l.productId,
    slug: l.slug,
    title: l.title,
    image: l.image,
    price: l.price,
    quantity: l.quantity,
    subtotal: l.subtotal,
    freeDelivery: l.freeDelivery,
  }));

  const itemsBySeller = new Map<string, typeof orderItems>();
  lines.forEach((l, idx) => {
    if (!l.sellerId) return;
    const list = itemsBySeller.get(l.sellerId) ?? [];
    list.push(orderItems[idx]);
    itemsBySeller.set(l.sellerId, list);
  });

  // ── PER-PRODUCT FREE DELIVERY CALCULATION ──
  // Each product's freeDelivery flag is evaluated INDEPENDENTLY.
  // If freeDelivery=true → customer pays 0, seller absorbs zoneCharge for that product.
  // If freeDelivery=false → customer pays zoneCharge for that product.
  //
  // In a multi-seller cart, each product is evaluated independently.
  // Customer's total delivery = SUM of per-product customer delivery charges.
  // Seller-specific delivery liability is aggregated per seller for settlement.
  const deliveryLines = lines.map((l) => {
    const free = l.freeDelivery;
    return {
      productId: l.productId,
      sellerId: l.sellerId!,
      freeDelivery: free,
      zoneCharge,
      customerDeliveryCharge: free ? 0 : round2(zoneCharge),
      sellerAbsorbedCharge: free ? round2(zoneCharge) : 0,
    };
  });

  // Aggregate per-seller delivery totals for settlement
  const sellerDeliveryMap = new Map<
    string,
    {
      sellerDeliveryCharge: number; // Total absorbed by this seller
      customerDeliveryCharge: number; // Total customer-paid for this seller's products
      deliveryLines: typeof deliveryLines;
    }
  >();
  let totalCustomerDelivery = 0;
  let totalSellerAbsorbed = 0;

  for (const dl of deliveryLines) {
    const existing = sellerDeliveryMap.get(dl.sellerId) ?? {
      sellerDeliveryCharge: 0,
      customerDeliveryCharge: 0,
      deliveryLines: [] as typeof deliveryLines,
    };
    existing.sellerDeliveryCharge = round2(existing.sellerDeliveryCharge + dl.sellerAbsorbedCharge);
    existing.customerDeliveryCharge = round2(
      existing.customerDeliveryCharge + dl.customerDeliveryCharge,
    );
    existing.deliveryLines.push(dl);
    sellerDeliveryMap.set(dl.sellerId, existing);
    totalCustomerDelivery = round2(totalCustomerDelivery + dl.customerDeliveryCharge);
    totalSellerAbsorbed = round2(totalSellerAbsorbed + dl.sellerAbsorbedCharge);
  }

  const shipping = totalCustomerDelivery; // Customer-facing total delivery charge

  // ── TAX / VAT COMPUTATION (server-side, authoritative) ──
  // Reads the global tax config from site settings. If perProductOverride
  // is enabled AND a product has its own tax rate, that rate is used for
  // that product's portion of the subtotal. Otherwise the global rate applies.
  let tax = 0;
  let taxRate = 0;
  let taxLabel = "VAT";
  let siteSettingsData: Record<string, unknown> = {};
  try {
    const settingsDocPath = docPath(projectId, ["settings", "site"]);
    const settingsDocs = await batchGetDocs(projectId, [settingsDocPath]);
    const sDoc = settingsDocs.get(settingsDocPath);
    if (sDoc?.exists) {
      const sd = sDoc.data;
      siteSettingsData = sd as Record<string, unknown>;
      const taxConfig = sd["tax"] as
        | { enabled?: boolean; rate?: number; label?: string; perProductOverride?: boolean }
        | undefined;
      if (taxConfig?.enabled) {
        taxLabel = String(taxConfig.label ?? "VAT");
        const globalRate = Number(taxConfig.rate ?? 0);
        if (taxConfig.perProductOverride) {
          // Per-product tax: compute tax per line item based on its tax rate
          // (falls back to global rate if product tax is 0 or not set)
          let taxSum = 0;
          for (const l of lines) {
            const productTaxRate = Number(
              (docs.get(docPath(projectId, ["products", l.productId]))?.data ?? {})["tax"] ?? 0,
            );
            const effectiveRate =
              Number.isFinite(productTaxRate) && productTaxRate > 0
                ? Math.min(Math.max(productTaxRate, 0), 100)
                : Math.min(Math.max(globalRate, 0), 100);
            // Tax applies to this line's post-discount share
            const lineAfterDiscount = round2(l.subtotal * (subAfterDiscount / subtotal));
            taxSum += round2((lineAfterDiscount * effectiveRate) / 100);
          }
          tax = round2(taxSum);
          taxRate = globalRate; // Store global rate as reference
        } else {
          // Flat global tax on post-discount subtotal
          taxRate = Math.min(Math.max(globalRate, 0), 100);
          tax = round2((subAfterDiscount * taxRate) / 100);
        }
      }
    }
  } catch {
    // Tax settings not available — tax remains 0 (safe default)
  }
  // Reward points deduction (server-side verified)
  let rewardDiscount = 0;
  if (req.rewardPoints > 0) {
    const token = await getAccessToken();
    // Read reward balance from Firestore
    const rewardRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(req.uid)}:runQuery`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          structuredQuery: { from: [{ collectionId: "rewardTx" }], limit: 1000 },
        }),
      },
    );
    if (rewardRes.ok) {
      const rewardJson = (await rewardRes.json()) as Array<{
        document?: { fields?: Record<string, unknown> };
      }>;
      let availablePoints = 0;
      for (const row of rewardJson) {
        if (!row.document) continue;
        const fields = row.document.fields ?? {};
        const pointsVal = fields.points as
          { integerValue?: string | number; doubleValue?: number } | undefined;
        const points = Number(pointsVal?.integerValue ?? pointsVal?.doubleValue ?? 0);
        availablePoints += points;
      }
      if (req.rewardPoints > availablePoints) {
        throw new Error("You do not have enough reward points.");
      }
      rewardDiscount = round2(req.rewardPoints / POINTS_PER_CURRENCY_REDEEM);
    }
  }

  // Wallet deduction (transaction-safe, prevents concurrent double-spend).
  //
  // CONCURRENCY GUARANTEE:
  // The user document (users/{uid}) is read within a Firestore transaction as
  // a "lock". Any concurrent wallet-affecting write (another checkout, gift
  // card purchase, etc.) also writes to the user document. This causes
  // conflicting transactions to abort and retry with fresh data, preventing
  // double-spending.
  //
  // FLOW (per transaction attempt):
  // 1. Begin transaction
  // 2. List walletTx document IDs (outside tx — just for names)
  // 3. Read user doc + all walletTx docs WITHIN the transaction
  // 4. Calculate balance from transaction-locked reads
  // 5. If balance < requested → rollback, throw "Insufficient balance"
  // 6. Write wallet debit + user doc update (lock release) WITHIN the transaction
  // 7. Commit (fails with ABORTED if user doc was modified by another tx)
  // 8. If ABORTED, retry from step 1
  let walletUsed = 0;
  if (req.walletUsed > 0) {
    const walletTxVersion = await deductWalletInTransaction({
      projectId,
      uid: req.uid,
      amount: req.walletUsed,
      orderId,
      nowMs,
    });
    // The transaction succeeded — walletUsed is the actual deducted amount.
    walletUsed = req.walletUsed;
    void walletTxVersion;
  }

  const totalBeforeRewardWallet = round2(subAfterDiscount + shipping + tax);
  const rewardWalletDeduction = round2(
    Math.min(rewardDiscount + walletUsed, totalBeforeRewardWallet),
  );
  const total = round2(totalBeforeRewardWallet - rewardWalletDeduction);

  const sellerIds = Array.from(itemsBySeller.keys());

  const paymentStatus = req.paymentMethod === "cash_on_delivery" ? "pending" : "unpaid";

  // ── READ SELLER COMMISSION RATES (before writes, so platform fee is known) ──
  const sellerDocPaths = sellerIds.map((sid) => docPath(projectId, ["sellers", sid]));
  const sellerDocs =
    sellerDocPaths.length > 0 ? await batchGetDocs(projectId, sellerDocPaths) : new Map();
  const sellerCommissionRates = new Map<string, number>();
  const commissionConfig = siteSettingsData["commission"] as
    { defaultRate?: number; categoryBased?: boolean } | undefined;
  const globalDefault = (commissionConfig?.defaultRate ?? 8) / 100;
  for (const sid of sellerIds) {
    const sDoc = sellerDocs.get(docPath(projectId, ["sellers", sid]));
    const sData = sDoc?.exists ? sDoc.data : {};
    const rawRate = Number(sData["commissionRate"] ?? globalDefault);
    const rate = Number.isFinite(rawRate)
      ? Math.min(Math.max(rawRate, 0), 1)
      : Math.min(Math.max(globalDefault, 0), 1);
    sellerCommissionRates.set(sid, rate);
  }

  // ── RESOLVE CATEGORY-BASED COMMISSIONS ──
  // Read category and subcategory commission rates from Firestore.
  // If categoryBased is enabled, commission is resolved per product:
  //   subcategory override > category base rate > seller rate > global default
  // If categoryBased is disabled, falls back to seller flat rate (legacy).
  const categoryBasedEnabled = Boolean(commissionConfig?.categoryBased);
  const allCategoryIds = lines.map((l) => l.categoryId).filter(Boolean) as string[];
  const allSubcategoryIds = lines
    .filter((l) => l.categoryId && l.subcategoryId)
    .map((l) => ({ categoryId: l.categoryId!, subcategoryId: l.subcategoryId! }));
  const categoryCommissionCache =
    categoryBasedEnabled && allCategoryIds.length > 0
      ? await resolveCategoryCommissions(allCategoryIds, allSubcategoryIds)
      : new Map();

  // Build per-product commission rate map
  const productCommissionRates = new Map<string, number>();
  for (const l of lines) {
    if (categoryBasedEnabled && l.categoryId) {
      const sellerRate = sellerCommissionRates.get(l.sellerId ?? "") ?? globalDefault;
      const rate = resolveProductCommissionRate(
        l.categoryId,
        l.subcategoryId,
        categoryCommissionCache,
        sellerRate,
        globalDefault,
      );
      productCommissionRates.set(l.productId, rate);
    }
  }

  // ── COMPUTE PLATFORM FEE (preliminary, refined later in settlement loop) ──
  let platformFeeTotal = 0;
  for (const [sid, sItems] of itemsBySeller.entries()) {
    const sellerRate = sellerCommissionRates.get(sid) ?? 0.08;
    for (const it of sItems) {
      const pRate = productCommissionRates.get(it.productId) ?? sellerRate;
      platformFeeTotal = round2(platformFeeTotal + it.subtotal * pRate);
    }
  }

  const writes: FsWrite[] = [];

  // Buyer order document.
  writes.push({
    update: {
      name: docPath(projectId, ["users", req.uid, "orders", orderId]),
      fields: toFsFields({
        userId: req.uid,
        items: orderItems,
        sellerIds,
        itemCount: orderItems.reduce((s, i) => s + i.quantity, 0),
        cartHash: req.cartHash ?? null,
        subtotal,
        discount,
        shipping,
        tax,
        taxRate,
        taxLabel,
        deliveryZone,
        deliveryZoneId,
        deliveryZoneName,
        deliveryZoneLabel,
        deliveryCharge: shipping,
        zoneCharge,
        customerDeliveryCharge: shipping,
        sellerDeliveryCharge: totalSellerAbsorbed,
        deliverySnapshot: {
          zoneId: deliveryZoneId,
          zoneName: deliveryZoneName,
          zoneCharge,
          customerDeliveryCharge: shipping,
          sellerDeliveryCharge: totalSellerAbsorbed,
          labelBn: deliveryZoneLabelBn,
          etaDays: deliveryEtaDays,
        },
        rewardDiscount,
        walletUsed,
        total,
        platformFee: platformFeeTotal,
        couponCode: appliedCoupon,
        promoCode: appliedPromo,
        promoDiscount: promoDiscount,
        status: "ORDER_CREATED",
        payment: {
          method: req.paymentMethod,
          status: paymentStatus,
          provider: null,
          transactionId: null,
          paidAt: null,
        },
        shippingAddress: req.shippingAddress,
        deliveryAddressSnapshot: req.deliveryAddressSnapshot ?? null,
        tracking: [{ status: "pending", note: "Order placed", at: nowMs }],
        createdAt: nowMs,
        updatedAt: nowMs,
      }),
    },
    currentDocument: { exists: false },
  });

  // ── INVENTORY (Prompt 03 §2) ──
  // Legacy immediate stock decrement REMOVED. Stock is now RESERVED
  // race-condition-safely by the workflow processor after the order
  // commits (inventory.server.ts — true Firestore transaction), so
  // two simultaneous orders can never both take the last unit.

  // Coupon redemption — ATOMIC with the order commit (single Firestore
  // batch): global uses increment (guarded by the validated coupon
  // version), per-customer counter, and the immutable redemption
  // record (create-only — replays can never double-write). A
  // concurrent last-usage collision aborts the WHOLE checkout: no
  // partial state, no double redemption.
  if (appliedCoupon) {
    writes.push(
      ...buildCouponRedemptionWrites(projectId, {
        code: appliedCoupon,
        userId: req.uid,
        orderId,
        discount,
        base: couponBase,
        couponUpdateTime,
        couponUses,
        counterExists: couponCounterExists,
        counterUpdateTime: couponCounterUpdateTime,
        counterUserUses: couponUserUses,
        sellerId: couponSellerId,
        nowMs,
      }),
    );
  }

  // Reward points deduction ledger entry.
  if (rewardDiscount > 0) {
    writes.push({
      update: {
        name: docPath(projectId, ["users", req.uid, "rewardTx", newDocId()]),
        fields: toFsFields({
          type: "redeem",
          points: -req.rewardPoints,
          note: `Redeemed at checkout for order #${orderId.slice(0, 8)}`,
          orderId,
          createdAt: nowMs,
        }),
      },
      currentDocument: { exists: false },
    });
  }

  // Wallet deduction ledger entry is written inside the Firestore transaction
  // (see deductWalletInTransaction above) to ensure atomic balance check + debit.
  // It is NOT part of the batch writes below.

  // Clear the purchased cart items.
  for (const l of lines) {
    writes.push({ delete: docPath(projectId, ["users", req.uid, "cart", l.productId]) });
  }

  // ====================================================================
  // SETTLEMENT-ENABLED SELLER MIRRORS + NOTIFICATIONS
  // Each seller gets:
  // 1. Order mirror with full settlement breakdown
  // 2. Immutable settlementTx ledger entry (pending)
  // 3. Notification
  // ====================================================================
  // Reset platformFeeTotal — recompute with precise pro-rata settlement values
  platformFeeTotal = 0;
  const sellerEarningsBreakdown: SellerEarningsBreakdown[] = [];

  // ── AUDIT FIX (money-flow audit, Sep 7 2026): per-seller COUPON shares ──
  // A scoped coupon's discount belongs ONLY to the sellers whose lines
  // were eligible. Previously the full order discount was split pro-rata
  // across ALL sellers — Seller B was charged for Seller A's coupon.
  // The eligible base is recomputed with the SAME pure core the
  // evaluation used; shares are rounded per seller and the residual is
  // assigned to the largest eligible seller so they sum EXACTLY to the
  // discount. Sellers with no eligible lines get 0.
  const sellerDiscountShares = new Map<string, number>();
  if (appliedCoupon && appliedCouponScope) {
    const evalLines = lines.map((l) => ({
      productId: l.productId,
      sellerId: l.sellerId,
      categoryId: l.categoryId,
      subcategoryId: l.subcategoryId,
      subtotal: l.subtotal,
    }));
    const { lines: eligible } = eligibleLines(appliedCouponScope, evalLines);
    const baseBySeller = new Map<string, number>();
    for (const el of eligible) {
      if (el.sellerId == null) continue;
      baseBySeller.set(el.sellerId, round2((baseBySeller.get(el.sellerId) ?? 0) + el.subtotal));
    }
    if (couponBase > 0) {
      for (const sid of itemsBySeller.keys()) {
        const base = baseBySeller.get(sid) ?? 0;
        sellerDiscountShares.set(sid, round2(discount * (base / couponBase)));
      }
      // Residual from per-seller rounding goes to the largest eligible
      // seller so the sum reconciles exactly with the order discount.
      const allocated = round2(
        Array.from(sellerDiscountShares.values()).reduce((acc, v) => acc + v, 0),
      );
      const residual = round2(discount - allocated);
      if (residual !== 0) {
        let top: string | null = null;
        let topBase = -1;
        for (const [sid, base] of baseBySeller) {
          if (base > topBase) {
            top = sid;
            topBase = base;
          }
        }
        if (top != null) {
          sellerDiscountShares.set(top, round2((sellerDiscountShares.get(top) ?? 0) + residual));
        }
      }
    }
  }

  for (const [sid, sItems] of itemsBySeller.entries()) {
    const sellerSubtotal = round2(sItems.reduce((s, it) => s + it.subtotal, 0));
    // Compute effective commission rate for this seller's items
    // If category-based commission is active, each product may have a different rate.
    // We compute a weighted average rate for the seller-level settlement record,
    // while storing per-product rates in the order items for audit trail.
    const sellerRate = sellerCommissionRates.get(sid) ?? 0.08;
    let totalCommissionForSeller = 0;
    for (const it of sItems) {
      const pRate = productCommissionRates.get(it.productId) ?? sellerRate;
      totalCommissionForSeller = round2(totalCommissionForSeller + it.subtotal * pRate);
    }
    const commissionRate =
      sellerSubtotal > 0 ? totalCommissionForSeller / sellerSubtotal : sellerRate;

    // Use pre-computed per-product delivery liability from the delivery map
    const deliveryInfo = sellerDeliveryMap.get(sid)!;
    const {
      sellerDeliveryCharge,
      customerDeliveryCharge: sellerCustomerDeliveryCharge,
      deliveryLines: sellerDeliveryLines,
    } = deliveryInfo;
    // Per-seller freeDelivery: true only if ALL this seller's products have freeDelivery
    const sellerAllFreeDelivery =
      sellerDeliveryLines.length > 0 && sellerDeliveryLines.every((dl) => dl.freeDelivery);

    // Compute full settlement breakdown with delivery snapshot
    const settlement = computeSellerSettlement({
      sellerId: sid,
      orderId,
      sellerSubtotal,
      orderSubtotal: subtotal,
      orderDiscount: discount,
      orderShipping: sellerCustomerDeliveryCharge, // Only customer-paid portion
      // AUDIT FIX: exact per-seller shares (see map construction above) —
      // a scoped coupon no longer charges ineligible sellers, and the
      // seller's own customers' delivery is credited without the double
      // pro-rata scaling the legacy path applied in multi-seller carts.
      sellerDiscountShare: sellerDiscountShares.get(sid) ?? 0,
      sellerShippingShare: sellerCustomerDeliveryCharge,
      orderTax: tax,
      commissionRate,
      nowMs,
      // Delivery zone snapshot (immutable per order)
      zoneId: deliveryZoneId,
      zoneName: deliveryZoneName,
      zoneCharge,
      customerDeliveryCharge: sellerCustomerDeliveryCharge,
      sellerDeliveryCharge,
      freeDelivery: sellerAllFreeDelivery,
      deliveryLines: sellerDeliveryLines,
    });

    // Refine platform fee total with precise pro-rata settlement
    platformFeeTotal = round2(platformFeeTotal + settlement.commissionAmount);
    sellerEarningsBreakdown.push({
      sellerId: sid,
      sellerSubtotal: settlement.sellerSubtotal,
      commissionRate: settlement.commissionRate,
      commissionAmount: settlement.commissionAmount,
      sellerNetEarnings: settlement.sellerNetEarnings,
    });

    // Seller order mirror WITH settlement data + delivery snapshot
    writes.push(
      buildSellerOrderWrite({
        projectId,
        sellerId: sid,
        orderId,
        buyerId: req.uid,
        buyerName: req.shippingAddress.fullName,
        buyerEmail: req.buyerEmail,
        items: sItems,
        settlement,
        paymentMethod: req.paymentMethod,
        paymentStatus,
        shippingAddress: req.shippingAddress,
        deliverySnapshot: {
          zoneId: deliveryZoneId,
          zoneName: deliveryZoneName,
          zoneCharge,
          customerDeliveryCharge: sellerCustomerDeliveryCharge,
          sellerDeliveryCharge,
          freeDelivery: sellerAllFreeDelivery,
          labelBn: deliveryZoneLabelBn,
          etaDays: deliveryEtaDays,
          deliveryLines: sellerDeliveryLines,
        },
        nowMs,
      }),
    );

    // Immutable settlement ledger: pending entry
    writes.push(
      buildSettlementPendingTxWrite({
        projectId,
        sellerId: sid,
        orderId,
        sellerEarnings: settlement.sellerNetEarnings,
        nowMs,
      }),
    );

    // ── SELLER NOTIFICATION (Prompt 03 §3) ──
    // Moved from an inline random-id write to the event-driven
    // workflow processor (deterministic id → duplicate events can
    // never double-notify a seller).
  }

  // ── FLASH SALE RESERVATION (reserve→order) ─────────────────────
  // Atomic per-customer-limit + stock reservation BEFORE the order
  // write: a SOLD_OUT / CUSTOMER_LIMIT rejection fails the checkout
  // cleanly with nothing written. Sibling claims already reserved in
  // this request are compensated. After the order exists, releases
  // run through the order workflow (CANCELLED / DELIVERY_FAILED).
  if (flashSaleClaims.length > 0) {
    const reserved: typeof flashSaleClaims = [];
    try {
      for (const claim of flashSaleClaims) {
        const r = await reserveFlashSaleStock(projectId, {
          campaignId: claim.campaignId,
          customerId: req.uid,
          quantity: claim.quantity,
          now: nowMs,
        });
        if (!r.ok) {
          throw new Error(
            r.code === "SOLD_OUT"
              ? "This flash sale just sold out — the offer is no longer available."
              : r.code === "CUSTOMER_LIMIT"
                ? "You have reached the purchase limit for this flash sale."
                : "This flash sale offer is no longer active.",
          );
        }
        reserved.push(claim);
      }
    } catch (err) {
      // Compensate sibling claims reserved earlier in this request.
      await Promise.all(
        reserved.map((c) =>
          releaseFlashSaleStock(projectId, c.campaignId, req.uid, c.quantity).catch(() => {}),
        ),
      );
      throw err;
    }
  }

  void nowIso;
  await commitWrites(projectId, writes);

  // Mark promo code as used if it was applied.
  // AUDIT FIX (money-flow audit, Sep 7 2026): these writes go into a
  // FRESH batch. They were previously pushed into `writes` — the array
  // that was ALREADY committed above — so the second commit re-sent the
  // whole order batch, hit the buyer-order `exists: false` precondition
  // and threw AFTER the order had committed (order created, client
  // shown an error, workflow events never dispatched, promo never
  // marked used).
  if (appliedPromo) {
    const promoWrites: FsWrite[] = [
      {
        transform: {
          document: docPath(projectId, ["promoCodes", appliedPromo]),
          fieldTransforms: [{ fieldPath: "usedCount", increment: { integerValue: "1" } }],
        },
        ...(promoUpdateTime ? { currentDocument: { updateTime: promoUpdateTime } } : {}),
      },
      {
        update: {
          name: docPath(projectId, ["promoCodes", appliedPromo]),
          fields: toFsFields({
            status: "used",
            usedAt: nowMs,
            usedOrderId: orderId,
            updatedAt: nowMs,
          }),
        },
        updateMask: { fieldPaths: ["status", "usedAt", "usedOrderId", "updatedAt"] },
      },
    ];
    try {
      await commitWrites(projectId, promoWrites);
    } catch {
      // Non-fatal by the same non-blocking discipline used elsewhere:
      // the ORDER is already committed and is the financial authority;
      // the promo counter/increment carries its own updateTime guard,
      // so a retry or admin reconciliation cannot double-apply it.
    }
  }

  // ─────────────────────────────────────────────────────────────
  // ORDER WORKFLOW (Prompt 03 §3 + §7 — event-driven)
  // ORDER_CREATED → PAYMENT_CONFIRMED → INVENTORY_RESERVED →
  // SELLER_NOTIFIED, each emitting an immutable event and fanning
  // out through the workflow processor. One branch failing never
  // corrupts the order state; a failed reservation cancels the
  // order CLEANLY (§7).
  // ─────────────────────────────────────────────────────────────
  const workflowCtx = {
    customerId: req.uid,
    sellerIds,
    // Prompt 04: per-line finance context (seller, category, line total,
    // seller-absorbed shipping) — consumed by the finance handler to post
    // ledger-first settlements. deliveryLines is index-parallel to lines.
    items: lines.map((l, i) => ({
      productId: l.productId,
      quantity: l.quantity,
      sellerId: l.sellerId ?? undefined,
      categoryId: l.categoryId ?? null,
      subcategoryId: l.subcategoryId ?? null,
      lineTotalTaka: l.subtotal,
      shippingTaka: deliveryLines[i]?.sellerAbsorbedCharge ?? 0,
    })),
    // Reserve→order: released by the flash-sale workflow handler on
    // CANCELLED / DELIVERY_FAILED (per-customer counter included).
    flashSaleClaims: flashSaleClaims.length > 0 ? flashSaleClaims : undefined,
    total,
  };

  await dispatchOrderEvent(projectId, orderId, "ORDER_CREATED", workflowCtx);

  await advanceOrderStatus(projectId, req.uid, orderId, "PAYMENT_CONFIRMED", "Payment confirmed");
  await dispatchOrderEvent(projectId, orderId, "PAYMENT_CONFIRMED", workflowCtx);

  // Concurrency-safe stock reservation (§2). Rare race loss → clean cancel.
  const reservation = await reserveInventoryForOrder(projectId, orderId, workflowCtx.items);
  if (!reservation.ok && reservation.state !== "reserved") {
    await advanceOrderStatus(
      projectId,
      req.uid,
      orderId,
      "CANCELLED",
      `Cancelled: ${reservation.reason ?? "stock unavailable"}`,
    );
    await dispatchOrderEvent(projectId, orderId, "CANCELLED", workflowCtx);
    throw new Error(
      reservation.reason ?? "Order could not be fulfilled — stock changed during checkout.",
    );
  }

  await advanceOrderStatus(projectId, req.uid, orderId, "INVENTORY_RESERVED", "Stock reserved");
  await dispatchOrderEvent(projectId, orderId, "INVENTORY_RESERVED", workflowCtx);

  await advanceOrderStatus(projectId, req.uid, orderId, "SELLER_NOTIFIED", "Seller notified");
  await dispatchOrderEvent(projectId, orderId, "SELLER_NOTIFIED", workflowCtx);

  // ── LOW STOCK ALERTS ──
  // After stock decrement, check if any product dropped to/below threshold.
  // We compute the projected stock (original - ordered qty) and fire alerts.
  try {
    await checkLowStockAndNotify(
      lines.map((l) => {
        // Read original stock from the product doc we fetched earlier
        const prodDoc = docs.get(docPath(projectId, ["products", l.productId]));
        const originalStock = Number(prodDoc?.data?.["stock"] ?? 0);
        return {
          productId: l.productId,
          sellerId: l.sellerId,
          title: l.title,
          currentStock: Math.max(0, originalStock - l.quantity),
        };
      }),
    );
  } catch {
    // Low stock alert failure should never block order placement
  }

  return {
    orderId,
    items: orderItems,
    subtotal,
    discount,
    promoDiscount,
    tax,
    taxRate,
    taxLabel,
    shipping,
    deliveryZone,
    deliveryZoneId,
    deliveryZoneName,
    deliveryZoneLabel,
    deliveryCharge: shipping,
    zoneCharge,
    customerDeliveryCharge: shipping,
    sellerDeliveryCharge: totalSellerAbsorbed,
    deliverySnapshot: {
      zoneId: deliveryZoneId,
      zoneName: deliveryZoneName,
      zoneCharge,
      customerDeliveryCharge: shipping,
      sellerDeliveryCharge: totalSellerAbsorbed,
      labelBn: deliveryZoneLabelBn,
      etaDays: deliveryEtaDays,
      deliveryLines,
    },
    rewardDiscount,
    walletUsed,
    total,
    platformFee: platformFeeTotal,
    sellerEarnings: sellerEarningsBreakdown,
    couponCode: appliedCoupon,
    promoCode: appliedPromo,
    couponRejection,
    couponRejectionReason,
  };
}
