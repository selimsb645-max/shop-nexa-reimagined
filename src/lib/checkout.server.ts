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
  type FsWrite,
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
import { checkLowStockAndNotify } from "./stock-alert.server";

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
    id: string; labelEn: string; labelBn: string; charge: number;
    etaDays: [number, number]; description: string; active: boolean; priority: number;
  }> = [];
  let fallbackConfig: { fallbackZoneId: string; noZoneBehavior: "block" | "fallback" } = {
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
      const dz = sd["deliveryZones"] as {
        zones?: typeof settingsZones;
        fallbackZoneId?: string;
        noZoneBehavior?: "block" | "fallback";
      } | undefined;
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
  items: Array<{ productId: string; slug: string; title: string; image: string; price: number; quantity: number; subtotal: number; freeDelivery: boolean }>;
  subtotal: number;
  discount: number;
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

  const extraDocs: string[] = [];
  if (couponName) extraDocs.push(couponName);
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
    const stock = Number(d["stock"] ?? 0);
    const qty = wanted.get(id)!;
    if (stock < qty) throw new Error(`Not enough stock for ${title}.`);
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
    });
  }

  const subtotal = round2(lines.reduce((s, l) => s + l.subtotal, 0));

  // Coupon: re-validated server side, never trusted from the client.
  let discount = 0;
  let appliedCoupon: string | null = null;
  let couponUpdateTime: string | null = null;
  if (couponCode && couponName) {
    const cDoc = docs.get(couponName);
    if (cDoc?.exists) {
      const c = cDoc.data;
      const active = c["active"] === true;
      const expiresAt = c["expiresAt"] == null ? null : Number(c["expiresAt"]);
      const minSubtotal = c["minSubtotal"] == null ? 0 : Number(c["minSubtotal"]);
      const usageLimit = c["usageLimit"] == null ? null : Number(c["usageLimit"]);
      const uses = Number(c["uses"] ?? 0);
      const type = String(c["type"] ?? "fixed");
      const value = Number(c["value"] ?? 0);
      const maxDiscount = c["maxDiscount"] == null ? null : Number(c["maxDiscount"]);
      const couponSellerId = (c["sellerId"] as string | null) ?? null;
      const couponProductIds = Array.isArray(c["productIds"]) ? (c["productIds"] as string[]) : [];

      // For seller-specific coupons, validate that at least one product
      // in the cart belongs to that seller. If productIds is specified,
      // validate that at least one of those products is in the cart.
      let sellerCouponValid = true;
      if (couponSellerId) {
        const sellerHasProductInCart = lines.some((l) => l.sellerId === couponSellerId);
        if (!sellerHasProductInCart) sellerCouponValid = false;

        // If productIds specified, at least one must be in the cart
        if (couponProductIds.length > 0) {
          const hasMatchingProduct = lines.some((l) => couponProductIds.includes(l.productId));
          if (!hasMatchingProduct) sellerCouponValid = false;
        }
      }

      const usable =
        active &&
        sellerCouponValid &&
        (expiresAt == null || expiresAt > nowMs) &&
        subtotal >= minSubtotal &&
        (usageLimit == null || uses < usageLimit) &&
        Number.isFinite(value) &&
        value > 0;
      if (usable) {
        const rawDiscount = type === "percent" ? subtotal * (value / 100) : value;
        // Cap discount at subtotal and at maxDiscount if specified
        const cappedDiscount =
          maxDiscount != null ? Math.min(rawDiscount, maxDiscount) : rawDiscount;
        discount = round2(Math.min(subtotal, cappedDiscount));
        appliedCoupon = couponCode;
        couponUpdateTime = cDoc.updateTime;
      }
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
  const sellerDeliveryMap = new Map<string, {
    sellerDeliveryCharge: number;   // Total absorbed by this seller
    customerDeliveryCharge: number;  // Total customer-paid for this seller's products
    deliveryLines: typeof deliveryLines;
  }>();
  let totalCustomerDelivery = 0;
  let totalSellerAbsorbed = 0;

  for (const dl of deliveryLines) {
    const existing = sellerDeliveryMap.get(dl.sellerId) ?? {
      sellerDeliveryCharge: 0,
      customerDeliveryCharge: 0,
      deliveryLines: [] as typeof deliveryLines,
    };
    existing.sellerDeliveryCharge = round2(existing.sellerDeliveryCharge + dl.sellerAbsorbedCharge);
    existing.customerDeliveryCharge = round2(existing.customerDeliveryCharge + dl.customerDeliveryCharge);
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
            const lineAfterDiscount =
              round2(l.subtotal * (subAfterDiscount / subtotal));
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

  // Wallet deduction (server-side verified)
  let walletUsed = 0;
  if (req.walletUsed > 0) {
    const token = await getAccessToken();
    const walletRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(req.uid)}:runQuery`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          structuredQuery: { from: [{ collectionId: "walletTx" }], limit: 1000 },
        }),
      },
    );
    if (walletRes.ok) {
      const walletJson = (await walletRes.json()) as Array<{
        document?: { fields?: Record<string, unknown> };
      }>;
      let walletBalance = 0;
      for (const row of walletJson) {
        if (!row.document) continue;
        const fields = row.document.fields ?? {};
        const amountVal = fields.amount as
          { integerValue?: string | number; doubleValue?: number } | undefined;
        const amount = Number(amountVal?.integerValue ?? amountVal?.doubleValue ?? 0);
        walletBalance += amount;
      }
      walletUsed = Math.min(req.walletUsed, walletBalance);
      if (walletUsed <= 0) {
        throw new Error("You do not have enough wallet balance.");
      }
    }
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
    | { defaultRate?: number; categoryBased?: boolean }
    | undefined;
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
  const categoryCommissionCache = categoryBasedEnabled && allCategoryIds.length > 0
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
        status: "confirmed",
        payment: {
          method: req.paymentMethod,
          status: paymentStatus,
          provider: null,
          transactionId: null,
          paidAt: null,
        },
        shippingAddress: req.shippingAddress,
        deliveryAddressSnapshot: req.deliveryAddressSnapshot ?? null,
        tracking: [{ status: "confirmed", note: "Order placed and auto-confirmed", at: nowMs }],
        createdAt: nowMs,
        updatedAt: nowMs,
      }),
    },
    currentDocument: { exists: false },
  });

  // Stock decrement, guarded by the version we read.
  for (const l of lines) {
    const name = docPath(projectId, ["products", l.productId]);
    writes.push({
      transform: {
        document: name,
        fieldTransforms: [{ fieldPath: "stock", increment: { integerValue: String(-l.quantity) } }],
      },
      ...(l.updateTime ? { currentDocument: { updateTime: l.updateTime } } : {}),
    });
    writes.push({
      update: { name, fields: { updatedAt: toFsValue(nowMs) } },
      updateMask: { fieldPaths: ["updatedAt"] },
    });
  }

  // Coupon usage increment, guarded by the version we validated.
  if (appliedCoupon) {
    writes.push({
      transform: {
        document: docPath(projectId, ["coupons", appliedCoupon]),
        fieldTransforms: [{ fieldPath: "uses", increment: { integerValue: "1" } }],
      },
      ...(couponUpdateTime ? { currentDocument: { updateTime: couponUpdateTime } } : {}),
    });
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

  // Wallet deduction ledger entry.
  if (walletUsed > 0) {
    writes.push({
      update: {
        name: docPath(projectId, ["users", req.uid, "walletTx", newDocId()]),
        fields: toFsFields({
          type: "spend",
          amount: -walletUsed,
          note: `Used at checkout for order #${orderId.slice(0, 8)}`,
          orderId,
          createdAt: nowMs,
        }),
      },
      currentDocument: { exists: false },
    });
  }

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
    const commissionRate = sellerSubtotal > 0
      ? totalCommissionForSeller / sellerSubtotal
      : sellerRate;

    // Use pre-computed per-product delivery liability from the delivery map
    const deliveryInfo = sellerDeliveryMap.get(sid)!;
    const { sellerDeliveryCharge, customerDeliveryCharge: sellerCustomerDeliveryCharge, deliveryLines: sellerDeliveryLines } = deliveryInfo;
    // Per-seller freeDelivery: true only if ALL this seller's products have freeDelivery
    const sellerAllFreeDelivery = sellerDeliveryLines.length > 0 && sellerDeliveryLines.every((dl) => dl.freeDelivery);

    // Compute full settlement breakdown with delivery snapshot
    const settlement = computeSellerSettlement({
      sellerId: sid,
      orderId,
      sellerSubtotal,
      orderSubtotal: subtotal,
      orderDiscount: discount,
      orderShipping: sellerCustomerDeliveryCharge, // Only customer-paid portion
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

    // Seller notification
    writes.push({
      update: {
        name: docPath(projectId, ["sellers", sid, "notifications", newDocId()]),
        fields: toFsFields({
          type: "order",
          title: "New order received",
          message: `Order #${orderId.slice(0, 8)} · ${sItems.length} item${
            sItems.length > 1 ? "s" : ""
          }`,
          link: `/seller/orders/${orderId}`,
          read: false,
          createdAt: nowMs,
        }),
      },
    });
  }

  void nowIso;
  await commitWrites(projectId, writes);

  // Mark promo code as used if it was applied
  if (appliedPromo) {
    writes.push({
      transform: {
        document: docPath(projectId, ["promoCodes", appliedPromo]),
        fieldTransforms: [{ fieldPath: "usedCount", increment: { integerValue: "1" } }],
      },
      ...(promoUpdateTime ? { currentDocument: { updateTime: promoUpdateTime } } : {}),
    });
    // Set status to "used" and record order info
    writes.push({
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
    });
  }

  await commitWrites(projectId, writes);

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
  };
}
