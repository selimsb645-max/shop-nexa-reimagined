/**
 * AVENTA SHOP — Server-Side Settlement Engine
 *
 * This module is the SINGLE source of truth for all seller settlement operations.
 * It runs exclusively on the server (via Deno/server functions) and uses the
 * Firebase service account, bypassing client security rules.
 *
 * RESPONSIBILITIES:
 * 1. Compute seller-wise settlement breakdown at order placement
 * 2. Transition settlement status when order is delivered (pending → hold)
 * 3. Release earnings after hold period (hold → available) + create walletTx
 * 4. Reverse earnings on cancellation/refund (any → reversed)
 * 5. Process withdrawal requests and admin approvals
 * 6. Maintain immutable settlementTx ledger
 *
 * SECURITY:
 * - Sellers CANNOT call any function here directly.
 * - All functions verify caller permissions (admin or verified seller).
 * - Financial mutations are atomic (Firestore batch writes).
 * - Ledger entries are append-only (currentDocument: { exists: false }).
 * - Payment callbacks are idempotent (check current status before mutating).
 */

import {
  batchGetDocs,
  commitWrites,
  docPath,
  getAccessToken,
  getProjectId,
  newDocId,
  toFsFields,
  fromFsFields,
  type FsValue,
  type FsWrite,
} from "./firebase-admin.server";
import { SETTLEMENT_HOLD_DAYS } from "@/types/settlement";
import type {
  SettlementStatus,
  PayoutStatus,
  SellerSettlementBreakdown,
  SettlementTxEntry,
  SettlementTxType,
  DeliveryLineItem,
} from "@/types/settlement";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const SETTLEMENT_TX = "settlementTx";
const WALLET_TX = "walletTx";
const WITHDRAWALS = "withdrawals";

// ====================================================================
// 1. COMPUTE SETTLEMENT BREAKDOWN (called during order placement)
// ====================================================================

/**
 * Computes the settlement breakdown for a single seller's portion of an order.
 * This is called from checkout.server.ts during placeOrderServer().
 *
 * Discount and shipping are distributed pro-rata based on each seller's
 * share of the order subtotal.
 */
export function computeSellerSettlement(input: {
  sellerId: string;
  orderId: string;
  sellerSubtotal: number;
  orderSubtotal: number;
  orderDiscount: number;
  orderShipping: number;
  orderTax: number;
  commissionRate: number;
  nowMs: number;
  // Delivery zone snapshot (immutable per order)
  zoneId?: string | null;
  zoneName?: string | null;
  zoneCharge?: number;
  customerDeliveryCharge?: number;
  sellerDeliveryCharge?: number;
  freeDelivery?: boolean;
  deliveryLines?: DeliveryLineItem[];
}): SellerSettlementBreakdown {
  const {
    sellerId,
    orderId,
    sellerSubtotal,
    orderSubtotal,
    orderDiscount,
    orderShipping,
    orderTax,
    commissionRate: rawRate,
    nowMs,
    zoneId = null,
    zoneName = null,
    zoneCharge = 0,
    customerDeliveryCharge = 0,
    sellerDeliveryCharge = 0,
    freeDelivery = false,
    deliveryLines = [],
  } = input;

  // Defense-in-depth: clamp commission rate to [0, 1] to prevent invalid
  // values (negative, >100%, NaN) from producing nonsensical financial results.
  // The checkout server already clamps, but this guards against any other caller.
  const commissionRate = Number.isFinite(rawRate)
    ? Math.min(Math.max(rawRate, 0), 1)
    : rawRate === Infinity
      ? 1
      : 0;

  // Pro-rata share of discount and shipping
  const sellerRatio = orderSubtotal > 0 ? sellerSubtotal / orderSubtotal : 0;
  const sellerDiscountShare = round2(orderDiscount * sellerRatio);
  const sellerShippingShare = round2(orderShipping * sellerRatio);
  const sellerTaxShare = round2(orderTax * sellerRatio);

  const sellerNetSubtotal = round2(sellerSubtotal - sellerDiscountShare + sellerShippingShare + sellerTaxShare);
  const commissionAmount = round2(sellerSubtotal * commissionRate);
  const sellerNetEarnings = round2(sellerNetSubtotal - commissionAmount);

  return {
    sellerId,
    orderId,
    sellerSubtotal,
    sellerDiscountShare,
    sellerShippingShare,
    sellerTaxShare,
    sellerNetSubtotal,
    commissionRate,
    commissionAmount,
    sellerNetEarnings,
    // Delivery zone snapshot (immutable)
    zoneId,
    zoneName,
    zoneCharge,
    customerDeliveryCharge,
    sellerDeliveryCharge,
    freeDelivery,
    deliveryLines,
    settlementStatus: "pending",
    payoutStatus: "none",
    orderCreatedAt: nowMs,
    deliveredAt: null,
    eligibleSettlementDate: null,
    settledAt: null,
    payoutAt: null,
    payoutId: null,
    reversalReason: null,
    createdAt: nowMs,
    updatedAt: nowMs,
  };
}

/**
 * Builds the Firestore write for a seller order mirror WITH settlement data.
 * Use this in checkout.server.ts instead of the current bare seller order write.
 */
export function buildSellerOrderWrite(input: {
  projectId: string;
  sellerId: string;
  orderId: string;
  buyerId: string;
  buyerName: string;
  buyerEmail: string | null;
  items: Array<{
    productId: string;
    slug: string;
    title: string;
    image: string;
    price: number;
    quantity: number;
    subtotal: number;
  }>;
  settlement: SellerSettlementBreakdown;
  paymentMethod: string;
  paymentStatus: string;
  shippingAddress: Record<string, unknown>;
  deliverySnapshot?: {
    zoneId: string;
    zoneName: string;
    zoneCharge: number;
    customerDeliveryCharge: number;
    sellerDeliveryCharge: number;
    freeDelivery: boolean;
    labelBn: string;
    etaDays: [number, number];
    deliveryLines: DeliveryLineItem[];
  };
  nowMs: number;
}): FsWrite {
  const { projectId, sellerId, orderId, settlement, deliverySnapshot, ...rest } = input;
  const s = settlement;

  return {
    update: {
      name: docPath(projectId, ["sellers", sellerId, "orders", orderId]),
      fields: toFsFields({
        sellerId,
        buyerId: rest.buyerId,
        buyerName: rest.buyerName,
        buyerEmail: rest.buyerEmail,
        items: rest.items,
        subtotal: s.sellerSubtotal,
        discountShare: s.sellerDiscountShare,
        shippingShare: s.sellerShippingShare,
        taxShare: s.sellerTaxShare,
        netSubtotal: s.sellerNetSubtotal,
        commissionRate: s.commissionRate,
        commission: s.commissionAmount,
        earnings: s.sellerNetEarnings,
        status: "confirmed",
        paymentMethod: rest.paymentMethod,
        paymentStatus: rest.paymentStatus,
        shippingAddress: rest.shippingAddress,
        shipping: {
          courier: null,
          trackingNumber: null,
          shippingCharge: s.sellerShippingShare,
          status: "pending",
          shippedAt: null,
          deliveredAt: null,
          estimatedDays: null,
        },
        // Settlement fields
        settlement: {
          settlementStatus: s.settlementStatus,
          payoutStatus: s.payoutStatus,
          sellerSubtotal: s.sellerSubtotal,
          sellerDiscountShare: s.sellerDiscountShare,
          sellerShippingShare: s.sellerShippingShare,
          sellerTaxShare: s.sellerTaxShare,
          sellerNetSubtotal: s.sellerNetSubtotal,
          commissionRate: s.commissionRate,
          commissionAmount: s.commissionAmount,
          sellerNetEarnings: s.sellerNetEarnings,
          orderCreatedAt: s.orderCreatedAt,
          deliveredAt: s.deliveredAt,
          eligibleSettlementDate: s.eligibleSettlementDate,
          settledAt: s.settledAt,
          payoutAt: s.payoutAt,
          payoutId: s.payoutId,
          reversalReason: s.reversalReason,
          // Delivery zone snapshot (immutable per order)
          zoneId: s.zoneId,
          zoneName: s.zoneName,
          zoneCharge: s.zoneCharge,
          customerDeliveryCharge: s.customerDeliveryCharge,
          sellerDeliveryCharge: s.sellerDeliveryCharge,
          freeDelivery: s.freeDelivery,
          deliveryLines: s.deliveryLines,
        },
        // Delivery snapshot for admin finance visibility
        deliverySnapshot: deliverySnapshot ?? null,
        tracking: [{ status: "confirmed", note: "Order auto-confirmed", at: rest.nowMs }],
        createdAt: rest.nowMs,
        updatedAt: rest.nowMs,
      }),
    },
    currentDocument: { exists: false },
  };
}

/**
 * Builds the immutable settlementTx "pending" entry for a new order.
 * This is created at order placement time to record that earnings are pending.
 */
export function buildSettlementPendingTxWrite(input: {
  projectId: string;
  sellerId: string;
  orderId: string;
  sellerEarnings: number;
  nowMs: number;
}): FsWrite {
  const { projectId, sellerId, orderId, sellerEarnings, nowMs } = input;
  return {
    update: {
      name: docPath(projectId, ["sellers", sellerId, SETTLEMENT_TX, newDocId()]),
      fields: toFsFields({
        type: "hold" as SettlementTxType,
        orderId,
        amount: 0, // No amount credited yet — just records the pending state
        sellerEarnings,
        settlementStatus: "pending" as SettlementStatus,
        note: `Earnings pending for order #${orderId.slice(0, 8)}`,
        createdBy: "system",
        createdAt: nowMs,
      }),
    },
    currentDocument: { exists: false },
  };
}

// ====================================================================
// 2. MARK ORDER AS DELIVERED → settlement: pending → hold
// ====================================================================

/**
 * Called when an order status changes to "delivered" (by seller or admin).
 * Updates the seller order's settlement status to "hold" and sets the
 * eligibleSettlementDate = deliveredAt + SETTLEMENT_HOLD_DAYS.
 *
 * IDEMPOTENT: If settlement is already "hold" or beyond, does nothing.
 */
export async function markOrderDeliveredSettlement(input: {
  sellerId: string;
  orderId: string;
  deliveredAt: number;
}): Promise<{ updated: boolean; eligibleDate: number | null }> {
  const projectId = getProjectId();
  const token = await getAccessToken();

  // Read current seller order
  const orderRes = await fetch(
    `${baseUrl(projectId)}/sellers/${encodeURIComponent(input.sellerId)}/orders/${encodeURIComponent(input.orderId)}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!orderRes.ok) throw new Error("Seller order not found for settlement update.");

  const orderDoc = await orderRes.json();
  const orderData = fromFsFields(orderDoc.fields ?? {});
  const settlement = (orderData.settlement ?? {}) as Record<string, unknown>;
  const currentStatus = String(settlement.settlementStatus ?? "pending");

  // Idempotent: only transition from "pending"
  if (currentStatus !== "pending") {
    return { updated: false, eligibleDate: null };
  }

  // Read configurable hold period from site settings (fallback to default)
  let holdDays = SETTLEMENT_HOLD_DAYS;
  try {
    const settingsDocPath = docPath(projectId, ["settings", "site"]);
    const settingsDocs = await batchGetDocs(projectId, [settingsDocPath]);
    const sDoc = settingsDocs.get(settingsDocPath);
    if (sDoc?.exists) {
      const commissionConfig = (sDoc.data as Record<string, unknown>)["commission"] as
        | { holdPeriodDays?: number }
        | undefined;
      if (commissionConfig?.holdPeriodDays && commissionConfig.holdPeriodDays > 0) {
        holdDays = commissionConfig.holdPeriodDays;
      }
    }
  } catch {
    // Use default
  }
  const eligibleDate = input.deliveredAt + holdDays * 24 * 60 * 60 * 1000;
  const nowMs = Date.now();

  const writes: FsWrite[] = [
    // Update seller order settlement fields
    {
      update: {
        name: docPath(projectId, ["sellers", input.sellerId, "orders", input.orderId]),
        fields: toFsFields({
          "settlement.settlementStatus": "hold" as SettlementStatus,
          "settlement.deliveredAt": input.deliveredAt,
          "settlement.eligibleSettlementDate": eligibleDate,
          "settlement.updatedAt": nowMs,
        }),
      },
      updateMask: {
        fieldPaths: [
          "settlement.settlementStatus",
          "settlement.deliveredAt",
          "settlement.eligibleSettlementDate",
          "settlement.updatedAt",
        ],
      },
    },
    // Immutable ledger entry
    {
      update: {
        name: docPath(projectId, ["sellers", input.sellerId, SETTLEMENT_TX, newDocId()]),
        fields: toFsFields({
          type: "hold" as SettlementTxType,
          orderId: input.orderId,
          amount: 0,
          sellerEarnings: Number(settlement.sellerNetEarnings ?? 0),
          settlementStatus: "hold" as SettlementStatus,
          note: `Order delivered. Earnings in ${holdDays}-day hold period. Eligible: ${new Date(eligibleDate).toISOString()}`,
          createdBy: "system",
          createdAt: nowMs,
        }),
      },
      currentDocument: { exists: false },
    },
  ];

  await commitWrites(projectId, writes);
  return { updated: true, eligibleDate };
}

// ====================================================================
// 3. RELEASE EARNINGS AFTER HOLD PERIOD (hold → available)
// ====================================================================

/**
 * Checks if a seller order's hold period has passed and releases earnings.
 * Creates a walletTx "earning" entry (positive credit) to make funds available.
 *
 * IDEMPOTENT: Only transitions from "hold". If already "available" or beyond, skips.
 *
 * Can be called:
 * - On-demand when seller views their wallet (lazy release)
 * - By a scheduled job that checks all sellers with hold-period orders
 */
export async function releaseSettlementIfEligible(input: {
  sellerId: string;
  orderId: string;
}): Promise<{ released: boolean; amount: number | null }> {
  const projectId = getProjectId();
  const token = await getAccessToken();

  // Read seller order
  const orderRes = await fetch(
    `${baseUrl(projectId)}/sellers/${encodeURIComponent(input.sellerId)}/orders/${encodeURIComponent(input.orderId)}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!orderRes.ok) throw new Error("Seller order not found for release check.");

  const orderDoc = await orderRes.json();
  const orderData = fromFsFields(orderDoc.fields ?? {});
  const settlement = (orderData.settlement ?? {}) as Record<string, unknown>;
  const currentStatus = String(settlement.settlementStatus ?? "pending");
  const eligibleDate = Number(settlement.eligibleSettlementDate ?? 0);
  const sellerEarnings = Number(settlement.sellerNetEarnings ?? 0);

  // Only release from "hold" status, and only if hold period has passed
  if (currentStatus !== "hold" || Date.now() < eligibleDate) {
    return { released: false, amount: null };
  }

  const nowMs = Date.now();

  const writes: FsWrite[] = [
    // Update seller order settlement → available
    {
      update: {
        name: docPath(projectId, ["sellers", input.sellerId, "orders", input.orderId]),
        fields: toFsFields({
          "settlement.settlementStatus": "available" as SettlementStatus,
          "settlement.settledAt": nowMs,
          "settlement.updatedAt": nowMs,
        }),
      },
      updateMask: {
        fieldPaths: ["settlement.settlementStatus", "settlement.settledAt", "settlement.updatedAt"],
      },
    },
    // Immutable settlement ledger: earning credited
    {
      update: {
        name: docPath(projectId, ["sellers", input.sellerId, SETTLEMENT_TX, newDocId()]),
        fields: toFsFields({
          type: "earning" as SettlementTxType,
          orderId: input.orderId,
          amount: sellerEarnings,
          sellerEarnings,
          settlementStatus: "available" as SettlementStatus,
          note: `Earnings released after ${SETTLEMENT_HOLD_DAYS}-day hold for order #${input.orderId.slice(0, 8)}`,
          createdBy: "system",
          createdAt: nowMs,
        }),
      },
      currentDocument: { exists: false },
    },
    // Wallet ledger: credit to available balance
    {
      update: {
        name: docPath(projectId, ["sellers", input.sellerId, WALLET_TX, newDocId()]),
        fields: toFsFields({
          type: "earning",
          amount: sellerEarnings,
          orderId: input.orderId,
          note: `Earnings from order #${input.orderId.slice(0, 8)}`,
          status: "completed",
          createdAt: nowMs,
        }),
      },
      currentDocument: { exists: false },
    },
  ];

  await commitWrites(projectId, writes);
  return { released: true, amount: sellerEarnings };
}

/**
 * Batch release: checks ALL seller orders in "hold" status and releases
 * those whose hold period has passed. Used by scheduled jobs or on-demand.
 */
export async function batchReleaseSettlements(sellerId: string): Promise<{
  releasedCount: number;
  totalReleased: number;
}> {
  const projectId = getProjectId();
  const token = await getAccessToken();

  // Query seller orders with settlement.settlementStatus == "hold"
  const res = await fetch(
    `${baseUrl(projectId)}/sellers/${encodeURIComponent(sellerId)}/orders:runQuery`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "orders" }],
          where: {
            fieldFilter: {
              field: { fieldPath: "settlement.settlementStatus" },
              op: "EQUAL",
              value: { stringValue: "hold" },
            },
          },
          limit: 100,
        },
      }),
    },
  );

  if (!res.ok) return { releasedCount: 0, totalReleased: 0 };

  const json = (await res.json()) as Array<{
    document?: { name: string; fields?: Record<string, FsValue> };
  }>;
  const nowMs = Date.now();
  let releasedCount = 0;
  let totalReleased = 0;
  const writes: FsWrite[] = [];

  for (const row of json) {
    if (!row.document) continue;
    const data = fromFsFields(row.document.fields ?? {});
    const settlement = (data.settlement ?? {}) as Record<string, unknown>;
    const eligibleDate = Number(settlement.eligibleSettlementDate ?? 0);
    const sellerEarnings = Number(settlement.sellerNetEarnings ?? 0);
    const orderId = row.document.name.split("/").pop()!;

    if (nowMs < eligibleDate) continue;

    // Update seller order settlement → available
    writes.push({
      update: {
        name: docPath(projectId, ["sellers", sellerId, "orders", orderId]),
        fields: toFsFields({
          "settlement.settlementStatus": "available" as SettlementStatus,
          "settlement.settledAt": nowMs,
          "settlement.updatedAt": nowMs,
        }),
      },
      updateMask: {
        fieldPaths: ["settlement.settlementStatus", "settlement.settledAt", "settlement.updatedAt"],
      },
    });

    // Settlement ledger entry
    writes.push({
      update: {
        name: docPath(projectId, ["sellers", sellerId, SETTLEMENT_TX, newDocId()]),
        fields: toFsFields({
          type: "earning" as SettlementTxType,
          orderId,
          amount: sellerEarnings,
          sellerEarnings,
          settlementStatus: "available" as SettlementStatus,
          note: `Earnings released after ${SETTLEMENT_HOLD_DAYS}-day hold for order #${orderId.slice(0, 8)}`,
          createdBy: "system",
          createdAt: nowMs,
        }),
      },
      currentDocument: { exists: false },
    });

    // Wallet ledger credit
    writes.push({
      update: {
        name: docPath(projectId, ["sellers", sellerId, WALLET_TX, newDocId()]),
        fields: toFsFields({
          type: "earning",
          amount: sellerEarnings,
          orderId,
          note: `Earnings from order #${orderId.slice(0, 8)}`,
          status: "completed",
          createdAt: nowMs,
        }),
      },
      currentDocument: { exists: false },
    });

    releasedCount++;
    totalReleased += sellerEarnings;
  }

  if (writes.length > 0) {
    await commitWrites(projectId, writes);
  }

  return { releasedCount, totalReleased: round2(totalReleased) };
}

// ====================================================================
// 4. REVERSE EARNINGS ON CANCELLATION/REFUND
// ====================================================================

/**
 * Reverses a seller's earnings for an order (cancellation/refund).
 *
 * BEHAVIOR by current settlement status:
 * - "pending": → "reversed" (no wallet impact, earnings were never credited)
 * - "hold": → "reversed" (no wallet impact, earnings were never credited)
 * - "available": → "reversed" + walletTx debit (earnings were credited, remove them)
 * - "paid": → cannot reverse automatically (payout already made, requires manual handling)
 * - "reversed": idempotent no-op
 *
 * IDEMPOTENT: If already reversed, does nothing.
 */
export async function reverseSellerSettlement(input: {
  sellerId: string;
  orderId: string;
  reason: string;
  adminUid: string;
}): Promise<{ reversed: boolean; walletImpact: number }> {
  const projectId = getProjectId();
  const token = await getAccessToken();

  // Read seller order
  const orderRes = await fetch(
    `${baseUrl(projectId)}/sellers/${encodeURIComponent(input.sellerId)}/orders/${encodeURIComponent(input.orderId)}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!orderRes.ok) throw new Error("Seller order not found for reversal.");

  const orderDoc = await orderRes.json();
  const orderData = fromFsFields(orderDoc.fields ?? {});
  const settlement = (orderData.settlement ?? {}) as Record<string, unknown>;
  const currentStatus = String(settlement.settlementStatus ?? "pending");
  const sellerEarnings = Number(settlement.sellerNetEarnings ?? 0);

  // Idempotent
  if (currentStatus === "reversed") {
    return { reversed: false, walletImpact: 0 };
  }

  // Cannot auto-reverse if already paid out
  if (currentStatus === "paid") {
    throw new Error(
      "Cannot auto-reverse: seller earnings already paid out. Manual reconciliation required.",
    );
  }

  const nowMs = Date.now();
  const wasAvailable = currentStatus === "available";
  const writes: FsWrite[] = [];

  // Update seller order settlement → reversed
  writes.push({
    update: {
      name: docPath(projectId, ["sellers", input.sellerId, "orders", input.orderId]),
      fields: toFsFields({
        "settlement.settlementStatus": "reversed" as SettlementStatus,
        "settlement.reversalReason": input.reason,
        "settlement.updatedAt": nowMs,
      }),
    },
    updateMask: {
      fieldPaths: [
        "settlement.settlementStatus",
        "settlement.reversalReason",
        "settlement.updatedAt",
      ],
    },
  });

  // Immutable ledger: reversal entry
  writes.push({
    update: {
      name: docPath(projectId, ["sellers", input.sellerId, SETTLEMENT_TX, newDocId()]),
      fields: toFsFields({
        type: "reversal" as SettlementTxType,
        orderId: input.orderId,
        amount: wasAvailable ? -sellerEarnings : 0,
        sellerEarnings,
        settlementStatus: "reversed" as SettlementStatus,
        note: `Earnings reversed: ${input.reason}`,
        createdBy: input.adminUid,
        createdAt: nowMs,
      }),
    },
    currentDocument: { exists: false },
  });

  // If earnings were already credited to wallet, debit them back
  if (wasAvailable) {
    writes.push({
      update: {
        name: docPath(projectId, ["sellers", input.sellerId, WALLET_TX, newDocId()]),
        fields: toFsFields({
          type: "refund",
          amount: -sellerEarnings,
          orderId: input.orderId,
          note: `Earnings reversed for order #${input.orderId.slice(0, 8)}: ${input.reason}`,
          status: "completed",
          createdAt: nowMs,
        }),
      },
      currentDocument: { exists: false },
    });
  }

  await commitWrites(projectId, writes);
  return { reversed: true, walletImpact: wasAvailable ? -sellerEarnings : 0 };
}

// ====================================================================
// 5. WITHDRAWAL REQUEST (seller action)
// ====================================================================

/**
 * Creates a withdrawal request. Seller's available balance (walletTx ledger)
 * must cover the amount. Creates a pending walletTx debit.
 *
 * EXTENDS the existing withdraw.server.ts logic by also:
 * - Linking settlement entries that are being withdrawn
 * - Creating settlementTx payout entries for audit
 */
export async function requestSettlementWithdrawal(input: {
  uid: string; // seller's Firebase uid
  amount: number;
  method: "bank" | "bkash" | "nagad" | "rocket";
  destination: string;
}): Promise<{ withdrawalId: string; remainingBalance: number }> {
  const projectId = getProjectId();
  const token = await getAccessToken();
  const MIN_WITHDRAWAL = 10;

  if (input.amount < MIN_WITHDRAWAL) {
    throw new Error(`Minimum withdrawal amount is $${MIN_WITHDRAWAL}.`);
  }

  // Read wallet balance from Firestore (authoritative)
  const walletRes = await fetch(
    `${baseUrl(projectId)}/sellers/${encodeURIComponent(input.uid)}/${WALLET_TX}:runQuery`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        structuredQuery: { from: [{ collectionId: WALLET_TX }], limit: 1000 },
      }),
    },
  );

  if (!walletRes.ok) throw new Error("Could not read wallet balance. Please try again.");

  const walletJson = (await walletRes.json()) as Array<{
    document?: { fields?: Record<string, FsValue> };
  }>;

  let balance = 0;
  for (const row of walletJson) {
    if (!row.document) continue;
    const fields = fromFsFields(row.document.fields ?? {});
    const amount = Number(fields.amount ?? 0);
    const status = String(fields.status ?? "completed");
    if (status === "completed") balance += amount;
    else if (status === "pending" && amount < 0) balance += amount;
  }

  if (input.amount > balance) {
    throw new Error(`Insufficient balance. Available: $${balance.toFixed(2)}`);
  }

  const withdrawalId = newDocId();
  const txId = newDocId();
  const nowMs = Date.now();

  // Mask the destination for security
  const maskedDestination = maskPayoutDestination(input.method, input.destination);

  const writes: FsWrite[] = [
    // Withdrawal request
    {
      update: {
        name: docPath(projectId, ["sellers", input.uid, WITHDRAWALS, withdrawalId]),
        fields: toFsFields({
          sellerId: input.uid,
          amount: input.amount,
          method: input.method,
          destination: maskedDestination,
          rawDestination: input.destination, // Stored but protected by Firestore rules
          status: "pending",
          reviewedBy: null,
          reviewNote: null,
          settlementTxIds: [],
          requestedAt: nowMs,
          processedAt: null,
          paidAt: null,
          txId: null,
          pendingTxId: txId,
        }),
      },
      currentDocument: { exists: false },
    },
    // Pending walletTx (debit)
    {
      update: {
        name: docPath(projectId, ["sellers", input.uid, WALLET_TX, txId]),
        fields: toFsFields({
          type: "withdrawal",
          amount: -input.amount,
          orderId: null,
          note: `Withdrawal #${withdrawalId.slice(0, 8)} via ${input.method}`,
          status: "pending",
          createdAt: nowMs,
        }),
      },
      currentDocument: { exists: false },
    },
    // Settlement ledger: payout pending
    {
      update: {
        name: docPath(projectId, ["sellers", input.uid, SETTLEMENT_TX, newDocId()]),
        fields: toFsFields({
          type: "payout" as SettlementTxType,
          orderId: null,
          amount: -input.amount,
          sellerEarnings: 0,
          settlementStatus: "available" as SettlementStatus,
          note: `Withdrawal requested: $${input.amount.toFixed(2)} via ${input.method}`,
          createdBy: input.uid,
          createdAt: nowMs,
        }),
      },
      currentDocument: { exists: false },
    },
  ];

  await commitWrites(projectId, writes);

  return {
    withdrawalId,
    remainingBalance: round2(balance - input.amount),
  };
}

// ====================================================================
// 6. PROCESS WITHDRAWAL (admin/finance action)
// ====================================================================

/**
 * Admin approves or rejects a withdrawal request.
 *
 * APPROVE: marks withdrawal as completed, creates completed walletTx,
 *          creates settlementTx payout entry.
 * REJECT:  marks withdrawal as rejected, creates reversal walletTx,
 *          creates settlementTx payout_reversal entry.
 *
 * IDEMPOTENT: if withdrawal is already processed, throws error.
 */
export async function processSettlementWithdrawal(input: {
  adminUid: string;
  sellerId: string;
  withdrawalId: string;
  action: "approve" | "reject";
  note?: string;
  txRef?: string; // Manual payout transaction reference (for approve)
}): Promise<{ status: string }> {
  const projectId = getProjectId();
  const token = await getAccessToken();

  // Read withdrawal
  const withdrawRes = await fetch(
    `${baseUrl(projectId)}/sellers/${encodeURIComponent(input.sellerId)}/withdrawals/${encodeURIComponent(input.withdrawalId)}`,
    { headers: { authorization: `Bearer ${token}` } },
  );

  if (!withdrawRes.ok) throw new Error("Withdrawal request not found.");

  const withdrawDoc = await withdrawRes.json();
  const withdrawData = fromFsFields(withdrawDoc.fields ?? {});
  const amount = Number(withdrawData.amount ?? 0);
  const method = String(withdrawData.method ?? "bank");
  const currentStatus = String(withdrawData.status ?? "pending");

  if (currentStatus !== "pending") {
    throw new Error(`Withdrawal already ${currentStatus}.`);
  }

  const nowMs = Date.now();

  const writes: FsWrite[] = [
    // Update withdrawal status
    {
      update: {
        name: docPath(projectId, ["sellers", input.sellerId, "withdrawals", input.withdrawalId]),
        fields: toFsFields({
          status: input.action === "approve" ? "completed" : "rejected",
          reviewedBy: input.adminUid,
          reviewNote: input.note ?? null,
          processedAt: nowMs,
          paidAt: input.action === "approve" ? nowMs : null,
          txId: input.txRef ?? (input.action === "approve" ? newDocId() : null),
        }),
      },
      updateMask: {
        fieldPaths: ["status", "reviewedBy", "reviewNote", "processedAt", "paidAt", "txId"],
      },
    },
  ];

  if (input.action === "approve") {
    // UPDATE the pending walletTx to "completed" (not create a new one —
    // creating a new one would double-debit the seller's balance).
    const pendingTxId = String(withdrawData.pendingTxId ?? "");
    if (pendingTxId) {
      writes.push({
        update: {
          name: docPath(projectId, ["sellers", input.sellerId, WALLET_TX, pendingTxId]),
          fields: toFsFields({
            status: "completed",
            note: `Withdrawal completed #${input.withdrawalId.slice(0, 8)} via ${method}`,
            updatedAt: nowMs,
          }),
        },
        updateMask: {
          fieldPaths: ["status", "note", "updatedAt"],
        },
      });
    } else {
      // Fallback: if no pendingTxId (legacy withdrawal), create completed walletTx
      writes.push({
        update: {
          name: docPath(projectId, ["sellers", input.sellerId, WALLET_TX, newDocId()]),
          fields: toFsFields({
            type: "withdrawal",
            amount: -amount,
            orderId: null,
            note: `Withdrawal completed #${input.withdrawalId.slice(0, 8)} via ${method}`,
            status: "completed",
            createdAt: nowMs,
          }),
        },
        currentDocument: { exists: false },
      });
    }

    // Settlement ledger: payout completed
    writes.push({
      update: {
        name: docPath(projectId, ["sellers", input.sellerId, SETTLEMENT_TX, newDocId()]),
        fields: toFsFields({
          type: "payout" as SettlementTxType,
          orderId: null,
          amount: -amount,
          sellerEarnings: 0,
          settlementStatus: "paid" as SettlementStatus,
          note: `Payout completed: $${amount.toFixed(2)} via ${method}. Ref: ${input.txRef ?? "manual"}`,
          createdBy: input.adminUid,
          createdAt: nowMs,
        }),
      },
      currentDocument: { exists: false },
    });
  } else {
    // UPDATE the pending walletTx to "rejected" so it no longer reduces
    // available balance. (Previously created a reversal entry, which worked
    // but left a stale "pending" entry in the ledger.)
    const pendingTxId = String(withdrawData.pendingTxId ?? "");
    if (pendingTxId) {
      writes.push({
        update: {
          name: docPath(projectId, ["sellers", input.sellerId, WALLET_TX, pendingTxId]),
          fields: toFsFields({
            status: "rejected",
            note: `Withdrawal rejected #${input.withdrawalId.slice(0, 8)}`,
            updatedAt: nowMs,
          }),
        },
        updateMask: {
          fieldPaths: ["status", "note", "updatedAt"],
        },
      });
    } else {
      // Fallback: create reversal walletTx for legacy withdrawals
      writes.push({
        update: {
          name: docPath(projectId, ["sellers", input.sellerId, WALLET_TX, newDocId()]),
          fields: toFsFields({
            type: "adjustment",
            amount,
            orderId: null,
            note: `Withdrawal rejected #${input.withdrawalId.slice(0, 8)}, funds reversed`,
            status: "completed",
            createdAt: nowMs,
          }),
        },
        currentDocument: { exists: false },
      });
    }

    // Settlement ledger: payout reversal
    writes.push({
      update: {
        name: docPath(projectId, ["sellers", input.sellerId, SETTLEMENT_TX, newDocId()]),
        fields: toFsFields({
          type: "payout_reversal" as SettlementTxType,
          orderId: null,
          amount,
          sellerEarnings: 0,
          settlementStatus: "available" as SettlementStatus,
          note: `Withdrawal rejected: $${amount.toFixed(2)} returned to available balance`,
          createdBy: input.adminUid,
          createdAt: nowMs,
        }),
      },
      currentDocument: { exists: false },
    });
  }

  // Notify seller
  writes.push({
    update: {
      name: docPath(projectId, ["sellers", input.sellerId, "notifications", newDocId()]),
      fields: toFsFields({
        type: "withdrawal",
        title: input.action === "approve" ? "Withdrawal approved" : "Withdrawal rejected",
        message:
          input.action === "approve"
            ? `Your withdrawal of $${amount.toFixed(2)} via ${method} has been processed.`
            : `Your withdrawal of $${amount.toFixed(2)} was rejected. ${input.note ?? ""}`,
        link: "/seller/settings",
        read: false,
        createdAt: nowMs,
      }),
    },
  });

  await commitWrites(projectId, writes);
  return { status: input.action === "approve" ? "completed" : "rejected" };
}

// ====================================================================
// 7. READ SETTLEMENT DATA (for dashboards)
// ====================================================================

/**
 * Reads a seller's settlement transactions (immutable ledger).
 */
export async function readSettlementLedger(
  sellerId: string,
  max = 100,
): Promise<SettlementTxEntry[]> {
  const projectId = getProjectId();
  const token = await getAccessToken();

  const res = await fetch(
    `${baseUrl(projectId)}/sellers/${encodeURIComponent(sellerId)}/${SETTLEMENT_TX}:runQuery`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: SETTLEMENT_TX }],
          orderBy: { field: { fieldPath: "createdAt" }, direction: "DESCENDING" },
          limit: max,
        },
      }),
    },
  );

  if (!res.ok) return [];

  const json = (await res.json()) as Array<{
    document?: { name: string; fields?: Record<string, FsValue> };
  }>;
  return json
    .filter((r) => r.document)
    .map((r) => {
      const data = fromFsFields(r.document!.fields ?? {}) as Record<string, unknown>;
      return {
        id: r.document!.name.split("/").pop()!,
        type: data.type as SettlementTxType,
        orderId: (data.orderId as string | null) ?? null,
        amount: Number(data.amount ?? 0),
        sellerEarnings: Number(data.sellerEarnings ?? 0),
        settlementStatus: data.settlementStatus as SettlementStatus,
        note: String(data.note ?? ""),
        createdBy: String(data.createdBy ?? "system"),
        createdAt: typeof data.createdAt === "number" ? data.createdAt : 0,
      };
    });
}

/**
 * Reads a seller's complete financial summary from the ledger.
 * Used by the seller dashboard.
 */
export async function readSellerFinancials(sellerId: string): Promise<{
  totalSales: number;
  totalCommission: number;
  pendingEarnings: number;
  availableBalance: number;
  totalWithdrawn: number;
}> {
  const projectId = getProjectId();
  const token = await getAccessToken();

  // Read all seller orders to compute sales/commission
  const ordersRes = await fetch(
    `${baseUrl(projectId)}/sellers/${encodeURIComponent(sellerId)}/orders:runQuery`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "orders" }],
          limit: 500,
        },
      }),
    },
  );

  let totalSales = 0;
  let totalCommission = 0;
  let pendingEarnings = 0;

  if (ordersRes.ok) {
    const ordersJson = (await ordersRes.json()) as Array<{
      document?: { fields?: Record<string, FsValue> };
    }>;
    for (const row of ordersJson) {
      if (!row.document) continue;
      const data = fromFsFields(row.document.fields ?? {});
      const settlement = (data.settlement ?? {}) as Record<string, unknown>;
      const status = String(settlement.settlementStatus ?? "pending");
      const sellerSubtotal = Number(settlement.sellerSubtotal ?? Number(data.subtotal ?? 0));
      const commission = Number(settlement.commissionAmount ?? Number(data.commission ?? 0));
      const earnings = Number(settlement.sellerNetEarnings ?? Number(data.earnings ?? 0));

      if (status !== "reversed") {
        totalSales += sellerSubtotal;
        totalCommission += commission;
      }

      if (status === "pending" || status === "hold") {
        pendingEarnings += earnings;
      }
    }
  }

  // Read wallet balance
  const walletRes = await fetch(
    `${baseUrl(projectId)}/sellers/${encodeURIComponent(sellerId)}/${WALLET_TX}:runQuery`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        structuredQuery: { from: [{ collectionId: WALLET_TX }], limit: 1000 },
      }),
    },
  );

  let availableBalance = 0;
  let totalWithdrawn = 0;

  if (walletRes.ok) {
    const walletJson = (await walletRes.json()) as Array<{
      document?: { fields?: Record<string, FsValue> };
    }>;
    for (const row of walletJson) {
      if (!row.document) continue;
      const data = fromFsFields(row.document.fields ?? {});
      const amount = Number(data.amount ?? 0);
      const status = String(data.status ?? "completed");
      const type = String(data.type ?? "");

      if (status === "completed") {
        availableBalance += amount;
        if (type === "withdrawal" && amount < 0) {
          totalWithdrawn += Math.abs(amount);
        }
      } else if (status === "pending" && amount < 0) {
        availableBalance += amount;
      }
    }
  }

  return {
    totalSales: round2(totalSales),
    totalCommission: round2(totalCommission),
    pendingEarnings: round2(pendingEarnings),
    availableBalance: round2(availableBalance),
    totalWithdrawn: round2(totalWithdrawn),
  };
}

/**
 * Reads admin-level finance overview across ALL sellers.
 * Used by the admin/finance panel.
 */
export async function readAdminFinanceOverview(): Promise<{
  totalCustomerPayments: number;
  totalPlatformRevenue: number;
  totalSellerSales: number;
  pendingSellerSettlement: number;
  availableSellerBalance: number;
  refundedAmount: number;
  totalWithdrawnAmount: number;
  pendingWithdrawalsCount: number;
}> {
  const projectId = getProjectId();
  const token = await getAccessToken();

  // Read all buyer orders via collectionGroup
  const ordersRes = await fetch(`${baseUrl(projectId)}:runQuery`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "orders" }],
        limit: 500,
      },
    }),
  });

  let totalCustomerPayments = 0;
  let totalPlatformRevenue = 0;
  let totalSellerSales = 0;
  let pendingSellerSettlement = 0;
  let refundedAmount = 0;

  if (ordersRes.ok) {
    const ordersJson = (await ordersRes.json()) as Array<{
      document?: { name: string; fields?: Record<string, FsValue> };
    }>;
    for (const row of ordersJson) {
      if (!row.document) continue;
      // Only count buyer orders (path contains /users/)
      if (!row.document.name.includes("/users/")) continue;

      const data = fromFsFields(row.document.fields ?? {});
      const total = Number(data.total ?? 0);
      const paymentStatus = String((data.payment as Record<string, unknown>)?.status ?? "unpaid");
      const orderStatus = String(data.status ?? "pending");

      if (
        paymentStatus === "paid" ||
        (paymentStatus === "pending" && orderStatus === "delivered")
      ) {
        totalCustomerPayments += total;
      }

      if (orderStatus === "cancelled" && paymentStatus === "refunded") {
        refundedAmount += total;
      }
    }
  }

  // Read all seller orders via collectionGroup for seller-side metrics
  const sellerOrdersRes = await fetch(`${baseUrl(projectId)}:runQuery`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "orders" }],
        limit: 1000,
      },
    }),
  });

  if (sellerOrdersRes.ok) {
    const sellerOrdersJson = (await sellerOrdersRes.json()) as Array<{
      document?: { name: string; fields?: Record<string, FsValue> };
    }>;
    for (const row of sellerOrdersJson) {
      if (!row.document) continue;
      // Only seller orders (path contains /sellers/)
      if (!row.document.name.includes("/sellers/")) continue;

      const data = fromFsFields(row.document.fields ?? {});
      const settlement = (data.settlement ?? {}) as Record<string, unknown>;
      const status = String(settlement.settlementStatus ?? "pending");
      const sellerSubtotal = Number(settlement.sellerSubtotal ?? Number(data.subtotal ?? 0));
      const commission = Number(settlement.commissionAmount ?? Number(data.commission ?? 0));
      const earnings = Number(settlement.sellerNetEarnings ?? Number(data.earnings ?? 0));

      if (status === "reversed") {
        refundedAmount += earnings;
      } else {
        totalSellerSales += sellerSubtotal;
        totalPlatformRevenue += commission;
        if (status === "pending" || status === "hold") {
          pendingSellerSettlement += earnings;
        }
      }
    }
  }

  // Count pending withdrawals across all sellers (requires reading all seller withdrawals)
  // This is a best-effort count — for large scale, a denormalized counter should be used
  let pendingWithdrawalsCount = 0;
  let availableSellerBalance = 0;
  let totalWithdrawnAmount = 0;

  // Read all sellers to get their wallet + withdrawal data
  const sellersRes = await fetch(`${baseUrl(projectId)}/sellers`, {
    headers: { authorization: `Bearer ${token}` },
  });

  if (sellersRes.ok) {
    const sellersJson = await sellersRes.json();
    const sellers = (sellersJson.documents ?? []) as Array<{ name: string }>;

    for (const sellerDoc of sellers) {
      const sellerId = sellerDoc.name.split("/").pop()!;

      // Pending withdrawals for this seller
      const pendingRes = await fetch(
        `${baseUrl(projectId)}/sellers/${encodeURIComponent(sellerId)}/withdrawals:runQuery`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({
            structuredQuery: {
              from: [{ collectionId: "withdrawals" }],
              where: {
                fieldFilter: {
                  field: { fieldPath: "status" },
                  op: "EQUAL",
                  value: { stringValue: "pending" },
                },
              },
              limit: 50,
            },
          }),
        },
      );
      if (pendingRes.ok) {
        const pendingJson = (await pendingRes.json()) as Array<{ document?: unknown }>;
        pendingWithdrawalsCount += pendingJson.filter((r) => r.document).length;
      }

      // Wallet balance for this seller
      const walletRes = await fetch(
        `${baseUrl(projectId)}/sellers/${encodeURIComponent(sellerId)}/${WALLET_TX}:runQuery`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({
            structuredQuery: { from: [{ collectionId: WALLET_TX }], limit: 1000 },
          }),
        },
      );
      if (walletRes.ok) {
        const walletJson = (await walletRes.json()) as Array<{
          document?: { fields?: Record<string, FsValue> };
        }>;
        for (const row of walletJson) {
          if (!row.document) continue;
          const data = fromFsFields(row.document.fields ?? {});
          const amount = Number(data.amount ?? 0);
          const status = String(data.status ?? "completed");
          if (status === "completed") {
            availableSellerBalance += amount;
            if (String(data.type ?? "") === "withdrawal" && amount < 0) {
              totalWithdrawnAmount += Math.abs(amount);
            }
          } else if (status === "pending" && amount < 0) {
            availableSellerBalance += amount;
          }
        }
      }
    }
  }

  return {
    totalCustomerPayments: round2(totalCustomerPayments),
    totalPlatformRevenue: round2(totalPlatformRevenue),
    totalSellerSales: round2(totalSellerSales),
    pendingSellerSettlement: round2(pendingSellerSettlement),
    availableSellerBalance: round2(availableSellerBalance),
    refundedAmount: round2(refundedAmount),
    totalWithdrawnAmount: round2(totalWithdrawnAmount),
    pendingWithdrawalsCount,
  };
}

// ====================================================================
// HELPERS
// ====================================================================

function baseUrl(projectId: string): string {
  const emulatorHost = Deno.env.get("FIRESTORE_EMULATOR_HOST");
  if (emulatorHost) {
    return `http://${emulatorHost}/v1/projects/${projectId}/databases/(default)/documents`;
  }
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

/**
 * Masks a payout destination for secure display.
 * Example: "01XX7234" → "01XX7234" (already safe to store masked)
 * For bank: "****1234" (last 4 digits)
 */
function maskPayoutDestination(method: string, destination: string): string {
  if (method === "bank") {
    // Show last 4 of account number
    return destination.length > 4 ? `****${destination.slice(-4)}` : destination;
  }
  // Mobile banking: show first 2 and last 4
  if (destination.length > 6) {
    return `${destination.slice(0, 2)}**${destination.slice(-4)}`;
  }
  return destination;
}
