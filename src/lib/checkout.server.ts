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

const SHIPPING_FLAT = 5;
const FREE_SHIPPING_THRESHOLD = 50;
const EXPRESS_SHIPPING_FLAT = 12;
const POINTS_PER_CURRENCY_REDEEM = 100;
const MAX_LINE_ITEMS = 100;
const MAX_QTY_PER_ITEM = 100;

export function computeShippingServer(subtotalAfterDiscount: number): number {
  return subtotalAfterDiscount >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FLAT;
}

export interface PlaceOrderRequest {
  uid: string;
  buyerEmail: string | null;
  items: Array<{ productId: string; quantity: number }>;
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
  deliveryMethod: "standard" | "express";
  rewardPoints: number;
  walletUsed: number;
}

export interface PlaceOrderResult {
  orderId: string;
  subtotal: number;
  discount: number;
  promoDiscount: number;
  shipping: number;
  rewardDiscount: number;
  walletUsed: number;
  total: number;
  couponCode: string | null;
  promoCode: string | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function placeOrderServer(
  req: PlaceOrderRequest,
): Promise<PlaceOrderResult> {
  const projectId = getProjectId();

  if (!req.items.length) throw new Error("Your cart is empty.");
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
  const couponName = couponCode
    ? docPath(projectId, ["coupons", couponCode])
    : null;
  const promoCode = req.promoCode ? req.promoCode.trim().toUpperCase() : null;
  const promoName = promoCode
    ? docPath(projectId, ["promoCodes", promoCode])
    : null;

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
    updateTime: string | null;
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
      updateTime: doc.updateTime,
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
      const usable =
        active &&
        (expiresAt == null || expiresAt > nowMs) &&
        subtotal >= minSubtotal &&
        (usageLimit == null || uses < usageLimit) &&
        Number.isFinite(value) &&
        value > 0;
      if (usable) {
        discount = round2(
          type === "percent"
            ? Math.min(subtotal, subtotal * (value / 100))
            : Math.min(subtotal, value),
        );
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
        pUserId === req.uid &&  // promo must belong to this user
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
  const shipping =
    req.deliveryMethod === "express"
      ? EXPRESS_SHIPPING_FLAT
      : computeShippingServer(subAfterDiscount);
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
      const rewardJson = (await rewardRes.json()) as Array<{ document?: { fields?: Record<string, unknown> } }>;
      let availablePoints = 0;
      for (const row of rewardJson) {
        if (!row.document) continue;
        const fields = row.document.fields ?? {};
        const pointsVal = fields.points as { integerValue?: string | number; doubleValue?: number } | undefined;
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
      const walletJson = (await walletRes.json()) as Array<{ document?: { fields?: Record<string, unknown> } }>;
      let walletBalance = 0;
      for (const row of walletJson) {
        if (!row.document) continue;
        const fields = row.document.fields ?? {};
        const amountVal = fields.amount as { integerValue?: string | number; doubleValue?: number } | undefined;
        const amount = Number(amountVal?.integerValue ?? amountVal?.doubleValue ?? 0);
        walletBalance += amount;
      }
      walletUsed = Math.min(req.walletUsed, walletBalance);
      if (walletUsed <= 0) {
        throw new Error("You do not have enough wallet balance.");
      }
    }
  }

  const totalBeforeRewardWallet = round2(subAfterDiscount + shipping);
  const rewardWalletDeduction = round2(Math.min(rewardDiscount + walletUsed, totalBeforeRewardWallet));
  const total = round2(totalBeforeRewardWallet - rewardWalletDeduction);

  const orderItems = lines.map((l) => ({
    productId: l.productId,
    slug: l.slug,
    title: l.title,
    image: l.image,
    price: l.price,
    quantity: l.quantity,
    subtotal: l.subtotal,
  }));

  const itemsBySeller = new Map<string, typeof orderItems>();
  lines.forEach((l, idx) => {
    if (!l.sellerId) return;
    const list = itemsBySeller.get(l.sellerId) ?? [];
    list.push(orderItems[idx]);
    itemsBySeller.set(l.sellerId, list);
  });
  const sellerIds = Array.from(itemsBySeller.keys());

  const paymentStatus =
    req.paymentMethod === "cash_on_delivery" ? "pending" : "unpaid";

  const writes: FsWrite[] = [];

  // Buyer order document.
  writes.push({
    update: {
      name: docPath(projectId, ["users", req.uid, "orders", orderId]),
      fields: toFsFields({
        userId: req.uid,
        items: orderItems,
        sellerIds,
        subtotal,
        discount,
        shipping,
        rewardDiscount,
        walletUsed,
        total,
        couponCode: appliedCoupon,
        status: "pending",
        payment: {
          method: req.paymentMethod,
          status: paymentStatus,
          provider: null,
          transactionId: null,
          paidAt: null,
        },
        shippingAddress: req.shippingAddress,
        tracking: [
          { status: "pending", note: "Order placed successfully", at: nowMs },
        ],
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
        fieldTransforms: [
          { fieldPath: "stock", increment: { integerValue: String(-l.quantity) } },
        ],
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
        fieldTransforms: [
          { fieldPath: "uses", increment: { integerValue: "1" } },
        ],
      },
      ...(couponUpdateTime
        ? { currentDocument: { updateTime: couponUpdateTime } }
        : {}),
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

  // Read seller commission rates from Firestore.
  const sellerDocPaths = sellerIds.map((sid) =>
    docPath(projectId, ["sellers", sid]),
  );
  const sellerDocs =
    sellerDocPaths.length > 0
      ? await batchGetDocs(projectId, sellerDocPaths)
      : new Map();
  const sellerCommissionRates = new Map<string, number>();
  for (const sid of sellerIds) {
    const sDoc = sellerDocs.get(docPath(projectId, ["sellers", sid]));
    const rate = sDoc?.exists
      ? Number(sDoc.data["commissionRate"] ?? 0.08)
      : 0.08;
    sellerCommissionRates.set(sid, Number.isFinite(rate) ? rate : 0.08);
  }

  // ====================================================================
  // SETTLEMENT-ENABLED SELLER MIRRORS + NOTIFICATIONS
  // Each seller gets:
  // 1. Order mirror with full settlement breakdown
  // 2. Immutable settlementTx ledger entry (pending)
  // 3. Notification
  // ====================================================================
  for (const [sid, sItems] of itemsBySeller.entries()) {
    const sellerSubtotal = round2(sItems.reduce((s, it) => s + it.subtotal, 0));
    const commissionRate = sellerCommissionRates.get(sid) ?? 0.08;

    // Compute full settlement breakdown with pro-rata discount/shipping
    const settlement = computeSellerSettlement({
      sellerId: sid,
      orderId,
      sellerSubtotal,
      orderSubtotal: subtotal,
      orderDiscount: discount,
      orderShipping: shipping,
      commissionRate,
      nowMs,
    });

    // Seller order mirror WITH settlement data
    writes.push(buildSellerOrderWrite({
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
      nowMs,
    }));

    // Immutable settlement ledger: pending entry
    writes.push(buildSettlementPendingTxWrite({
      projectId,
      sellerId: sid,
      orderId,
      sellerEarnings: settlement.sellerNetEarnings,
      nowMs,
    }));

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
        fieldTransforms: [
          { fieldPath: "usedCount", increment: { integerValue: "1" } },
        ],
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

  return { orderId, subtotal, discount, promoDiscount, shipping, rewardDiscount, walletUsed, total, couponCode: appliedCoupon, promoCode: appliedPromo };
}
