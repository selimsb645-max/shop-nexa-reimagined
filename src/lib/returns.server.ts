// ═══════════════════════════════════════════════════════════════
// AVENTA SHOP — Return & Refund Server-Side Processing
// ═══════════════════════════════════════════════════════════════
// All return mutations go through these server functions.
// Uses Firebase Admin SDK (bypasses Firestore rules).
//
// SECURITY:
// - Every function verifies caller identity and role
// - Refund amount is ALWAYS server-calculated
// - Settlement adjustment uses existing reverseSellerSettlement
// - Immutable ledger entries prevent duplicate financial effects
// - Idempotent operations (safe to retry)
//
// REQUIRES: FIREBASE_SERVICE_ACCOUNT env var
// ═══════════════════════════════════════════════════════════════

import {
  type ReturnRequest,
  type ReturnStatus,
  type ReturnReason,
  type RefundLedgerEntry,
  RETURN_CONFIG,
} from "@/types/returns";
import {
  isValidReturnStatusTransition,
  returnTransitionErrorMessage,
} from "@/lib/return-transitions";

// Re-use the existing Firebase Admin bridge
import { verifyIdToken, getAccessToken, getProjectId } from "./firebase-admin.server";

// Re-use existing settlement reversal
import { reverseSellerSettlement } from "./settlement.server";

// Firestore REST helpers
function fsBase(projectId: string): string {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

function toFsValue(val: unknown): Record<string, unknown> {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === "string") return { stringValue: val };
  if (typeof val === "number") {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (typeof val === "boolean") return { booleanValue: val };
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map((v) => toFsValue(v)),
      },
    };
  }
  if (typeof val === "object") {
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      fields[k] = toFsValue(v);
    }
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}

function toFsFields(obj: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    fields[k] = toFsValue(v);
  }
  return fields;
}

function fromFsValue(v: Record<string, unknown>): unknown {
  if ("nullValue" in v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("arrayValue" in v) {
    const arr = (v.arrayValue as { values?: unknown[] }).values ?? [];
    return arr.map((item) => fromFsValue(item as Record<string, unknown>));
  }
  if ("mapValue" in v) {
    const fields = (v.mapValue as { fields?: Record<string, unknown> }).fields ?? {};
    const obj: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(fields)) {
      obj[k] = fromFsValue(val as Record<string, unknown>);
    }
    return obj;
  }
  return null;
}

function fromFsFields(fields: Record<string, unknown>): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    obj[k] = fromFsValue(v as Record<string, unknown>);
  }
  return obj;
}

function mapReturnRequest(id: string, data: Record<string, unknown>): ReturnRequest {
  return {
    id,
    orderId: String(data.orderId ?? ""),
    sellerId: String(data.sellerId ?? ""),
    customerId: String(data.customerId ?? ""),
    productId: String(data.productId ?? ""),
    productTitle: String(data.productTitle ?? ""),
    productImage: String(data.productImage ?? ""),
    quantity: Number(data.quantity ?? 1),
    reason: (data.reason as ReturnReason) ?? "other",
    customerNote: String(data.customerNote ?? ""),
    images: Array.isArray(data.images) ? (data.images as string[]) : [],
    itemPrice: Number(data.itemPrice ?? 0),
    itemSubtotal: Number(data.itemSubtotal ?? 0),
    discountAllocation: Number(data.discountAllocation ?? 0),
    refundableAmount: Number(data.refundableAmount ?? 0),
    approvedRefundAmount: Number(data.approvedRefundAmount ?? 0),
    refundedAmount: Number(data.refundedAmount ?? 0),
    status: (data.status as ReturnStatus) ?? "pending",
    reviewNote: (data.reviewNote as string | null) ?? null,
    rejectionReason: (data.rejectionReason as string | null) ?? null,
    processedBy: (data.processedBy as string | null) ?? null,
    sellerId_reviewed: (data.sellerId_reviewed as string | null) ?? null,
    financeProcessedBy: (data.financeProcessedBy as string | null) ?? null,
    requestedAt: Number(data.requestedAt ?? Date.now()),
    reviewedAt: (data.reviewedAt as number | null) ?? null,
    approvedAt: (data.approvedAt as number | null) ?? null,
    rejectedAt: (data.rejectedAt as number | null) ?? null,
    pickedUpAt: (data.pickedUpAt as number | null) ?? null,
    refundApprovedAt: (data.refundApprovedAt as number | null) ?? null,
    refundedAt: (data.refundedAt as number | null) ?? null,
    cancelledAt: (data.cancelledAt as number | null) ?? null,
    settlementReversed: Boolean(data.settlementReversed ?? false),
    settlementReversalId: (data.settlementReversalId as string | null) ?? null,
    createdAt: Number(data.createdAt ?? Date.now()),
    updatedAt: Number(data.updatedAt ?? Date.now()),
  };
}

// ═══════════════════════════════════════════════════════════════
// 1. CREATE RETURN REQUEST
// ═══════════════════════════════════════════════════════════════

export async function createReturnRequestServer(input: {
  idToken: string;
  customerId: string;
  orderId: string;
  productId: string;
  quantity: number;
  reason: ReturnReason;
  customerNote: string;
  images?: string[];
}): Promise<{ returnId: string; refundableAmount: number }> {
  const { uid } = await verifyIdToken(input.idToken);

  // Security: Customer can only create returns for their own orders
  if (uid !== input.customerId) {
    throw new Error("You can only request returns for your own orders.");
  }

  const token = await getAccessToken();
  const projectId = getProjectId();
  const base = fsBase(projectId);
  const nowMs = Date.now();

  // 1. Read the customer order
  const orderRes = await fetch(
    `${base}/users/${encodeURIComponent(input.customerId)}/orders/${encodeURIComponent(input.orderId)}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!orderRes.ok) throw new Error("Order not found.");
  const orderDoc = await orderRes.json();
  const orderData = fromFsFields(orderDoc.fields ?? {});

  // 2. Verify order belongs to customer
  if (String(orderData.userId ?? "") !== input.customerId) {
    throw new Error("Order does not belong to you.");
  }

  // 3. Check order status — only delivered orders can be returned
  const orderStatus = String(orderData.status ?? "pending");
  if (orderStatus !== "delivered") {
    throw new Error(
      `Returns are only available for delivered orders. Current status: ${orderStatus}.`,
    );
  }

  // 4. Check return window
  const tracking = (orderData.tracking as Array<{ status: string; at: number }>) ?? [];
  const deliveredEvent = tracking.find((t) => t.status === "delivered");
  if (deliveredEvent) {
    const daysSinceDelivery = (nowMs - deliveredEvent.at) / (1000 * 60 * 60 * 24);
    if (daysSinceDelivery > RETURN_CONFIG.returnWindowDays) {
      throw new Error(
        `Return window has expired. Returns must be requested within ${RETURN_CONFIG.returnWindowDays} days of delivery.`,
      );
    }
  }

  // 5. Find the item in the order
  const items =
    (orderData.items as Array<{
      productId: string;
      title: string;
      image: string;
      price: number;
      quantity: number;
      subtotal: number;
    }>) ?? [];
  const item = items.find((i) => i.productId === input.productId);
  if (!item) throw new Error("Product not found in this order.");

  // 6. Validate quantity
  if (input.quantity < 1 || input.quantity > item.quantity) {
    throw new Error(`Invalid quantity. You can return 1 to ${item.quantity} items.`);
  }

  // 7. Find the sellerId for this product
  const sellerIds = (orderData.sellerIds as string[]) ?? [];
  // Read seller orders to find which seller has this product
  let sellerId = "";
  for (const sid of sellerIds) {
    const sellerOrderRes = await fetch(
      `${base}/sellers/${encodeURIComponent(sid)}/orders/${encodeURIComponent(input.orderId)}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (sellerOrderRes.ok) {
      const sellerOrder = await sellerOrderRes.json();
      const sellerItems =
        (fromFsFields(sellerOrder.fields ?? {}).items as Array<{ productId: string }>) ?? [];
      if (sellerItems.some((si) => si.productId === input.productId)) {
        sellerId = sid;
        break;
      }
    }
  }
  if (!sellerId) throw new Error("Could not determine seller for this product.");

  // 8. Check for duplicate return request (same order + product + non-terminal status)
  const existingReturnsRes = await fetch(`${base}:runQuery`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "returns" }],
        where: {
          compositeFilter: {
            op: "AND",
            filters: [
              {
                fieldFilter: {
                  field: { fieldPath: "orderId" },
                  op: "==",
                  value: { stringValue: input.orderId },
                },
              },
              {
                fieldFilter: {
                  field: { fieldPath: "productId" },
                  op: "==",
                  value: { stringValue: input.productId },
                },
              },
              {
                fieldFilter: {
                  field: { fieldPath: "customerId" },
                  op: "==",
                  value: { stringValue: input.customerId },
                },
              },
            ],
          },
        },
      },
    }),
  });
  if (existingReturnsRes.ok) {
    const existingDocs = await existingReturnsRes.json();
    for (const doc of existingDocs) {
      if (doc.document) {
        const existingData = fromFsFields(doc.document.fields ?? {});
        const existingStatus = String(existingData.status ?? "pending");
        if (!["rejected", "refunded", "cancelled"].includes(existingStatus)) {
          throw new Error("An active return request already exists for this product.");
        }
      }
    }
  }

  // 9. SERVER-SIDE REFUND CALCULATION
  // Calculate refundable amount from order data (never trust client)
  const itemSubtotal = item.price * input.quantity;
  const orderSubtotal = Number(orderData.subtotal ?? 0);
  const orderDiscount = Number(orderData.discount ?? 0);
  // Pro-rata discount allocation for this item
  const discountAllocation = orderSubtotal > 0 ? (itemSubtotal / orderSubtotal) * orderDiscount : 0;
  // Refundable = item subtotal - discount allocation
  const refundableAmount = Math.max(0, itemSubtotal - discountAllocation);

  // 10. Create return document
  const returnData: Record<string, unknown> = {
    orderId: input.orderId,
    sellerId,
    customerId: input.customerId,
    productId: input.productId,
    productTitle: item.title,
    productImage: item.image,
    quantity: input.quantity,
    reason: input.reason,
    customerNote: input.customerNote,
    images: input.images ?? [],
    // Financial (server-calculated)
    itemPrice: item.price,
    itemSubtotal,
    discountAllocation,
    refundableAmount,
    approvedRefundAmount: 0,
    refundedAmount: 0,
    // Status
    status: "pending",
    reviewNote: null,
    rejectionReason: null,
    processedBy: null,
    sellerId_reviewed: null,
    financeProcessedBy: null,
    // Timestamps
    requestedAt: nowMs,
    reviewedAt: null,
    approvedAt: null,
    rejectedAt: null,
    pickedUpAt: null,
    refundApprovedAt: null,
    refundedAt: null,
    cancelledAt: null,
    // Settlement
    settlementReversed: false,
    settlementReversalId: null,
    createdAt: nowMs,
    updatedAt: nowMs,
  };

  const createRes = await fetch(`${base}/returns`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: toFsFields(returnData) }),
  });

  if (!createRes.ok) {
    throw new Error("Failed to create return request.");
  }

  const createdDoc = await createRes.json();
  const returnId = createdDoc.name.split("/").pop();

  // 11. Send notification to seller
  try {
    const notifData = {
      type: "order_returned",
      title: "New Return Request",
      message: `Return requested for ${item.title} (Order #${input.orderId.slice(0, 8)})`,
      link: `/seller/returns`,
      read: false,
      createdAt: nowMs,
    };
    await fetch(`${base}/sellers/${encodeURIComponent(sellerId)}/notifications`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields: toFsFields(notifData) }),
    });
  } catch {
    // Non-fatal: notification failure shouldn't block return creation
  }

  return { returnId, refundableAmount };
}

// ═══════════════════════════════════════════════════════════════
// 2. REVIEW RETURN (seller or admin)
// Moves: pending → under_review
// ═══════════════════════════════════════════════════════════════

export async function reviewReturnServer(input: {
  idToken: string;
  returnId: string;
}): Promise<void> {
  const { uid } = await verifyIdToken(input.idToken);
  const token = await getAccessToken();
  const projectId = getProjectId();
  const base = fsBase(projectId);

  // Read return
  const retRes = await fetch(`${base}/returns/${encodeURIComponent(input.returnId)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!retRes.ok) throw new Error("Return request not found.");
  const retData = fromFsFields((await retRes.json()).fields ?? {});
  const currentStatus = String(retData.status ?? "pending");

  // Validate transition
  if (!isValidReturnStatusTransition(currentStatus, "under_review")) {
    throw new Error(returnTransitionErrorMessage(currentStatus, "under_review"));
  }

  // Authorization: seller (own products) or admin
  await authorizeReturnActor(uid, retData, token, projectId, ["admin", "super_admin"], true);

  const nowMs = Date.now();
  await fetch(
    `${base}/returns/${encodeURIComponent(input.returnId)}?updateMask.fieldPaths=status&updateMask.fieldPaths=reviewedAt&updateMask.fieldPaths=sellerId_reviewed&updateMask.fieldPaths=updatedAt`,
    {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: toFsFields({
          status: "under_review",
          reviewedAt: nowMs,
          sellerId_reviewed: uid,
          updatedAt: nowMs,
        }),
      }),
    },
  );
}

// ═══════════════════════════════════════════════════════════════
// 3. APPROVE RETURN (seller or admin)
// Moves: under_review → approved
// ═══════════════════════════════════════════════════════════════

export async function approveReturnServer(input: {
  idToken: string;
  returnId: string;
  note?: string;
}): Promise<void> {
  const { uid } = await verifyIdToken(input.idToken);
  const token = await getAccessToken();
  const projectId = getProjectId();
  const base = fsBase(projectId);

  const retRes = await fetch(`${base}/returns/${encodeURIComponent(input.returnId)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!retRes.ok) throw new Error("Return request not found.");
  const retData = fromFsFields((await retRes.json()).fields ?? {});
  const currentStatus = String(retData.status ?? "pending");

  if (!isValidReturnStatusTransition(currentStatus, "approved")) {
    throw new Error(returnTransitionErrorMessage(currentStatus, "approved"));
  }

  await authorizeReturnActor(uid, retData, token, projectId, ["admin", "super_admin"], true);

  const nowMs = Date.now();
  await fetch(
    `${base}/returns/${encodeURIComponent(input.returnId)}?updateMask.fieldPaths=status&updateMask.fieldPaths=approvedAt&updateMask.fieldPaths=reviewNote&updateMask.fieldPaths=processedBy&updateMask.fieldPaths=updatedAt`,
    {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: toFsFields({
          status: "approved",
          approvedAt: nowMs,
          reviewNote: input.note ?? "Approved",
          processedBy: uid,
          updatedAt: nowMs,
        }),
      }),
    },
  );

  // Notify customer
  await notifyCustomer(
    token,
    base,
    String(retData.customerId ?? ""),
    "Return Approved",
    `Your return request for ${String(retData.productTitle ?? "")} has been approved. Please arrange pickup.`,
  );
}

// ═══════════════════════════════════════════════════════════════
// 4. REJECT RETURN (seller or admin)
// Moves: under_review/approved → rejected (terminal)
// ═══════════════════════════════════════════════════════════════

export async function rejectReturnServer(input: {
  idToken: string;
  returnId: string;
  reason: string;
}): Promise<void> {
  const { uid } = await verifyIdToken(input.idToken);
  const token = await getAccessToken();
  const projectId = getProjectId();
  const base = fsBase(projectId);

  const retRes = await fetch(`${base}/returns/${encodeURIComponent(input.returnId)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!retRes.ok) throw new Error("Return request not found.");
  const retData = fromFsFields((await retRes.json()).fields ?? {});
  const currentStatus = String(retData.status ?? "pending");

  if (!isValidReturnStatusTransition(currentStatus, "rejected")) {
    throw new Error(returnTransitionErrorMessage(currentStatus, "rejected"));
  }

  await authorizeReturnActor(uid, retData, token, projectId, ["admin", "super_admin"], true);

  const nowMs = Date.now();
  await fetch(
    `${base}/returns/${encodeURIComponent(input.returnId)}?updateMask.fieldPaths=status&updateMask.fieldPaths=rejectedAt&updateMask.fieldPaths=rejectionReason&updateMask.fieldPaths=processedBy&updateMask.fieldPaths=updatedAt`,
    {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: toFsFields({
          status: "rejected",
          rejectedAt: nowMs,
          rejectionReason: input.reason,
          processedBy: uid,
          updatedAt: nowMs,
        }),
      }),
    },
  );

  await notifyCustomer(
    token,
    base,
    String(retData.customerId ?? ""),
    "Return Rejected",
    `Your return request for ${String(retData.productTitle ?? "")} has been rejected. Reason: ${input.reason}`,
  );
}

// ═══════════════════════════════════════════════════════════════
// 5. MARK ITEM RECEIVED (seller or admin)
// Moves: approved → picked_up
// ═══════════════════════════════════════════════════════════════

export async function markItemReceivedServer(input: {
  idToken: string;
  returnId: string;
}): Promise<void> {
  const { uid } = await verifyIdToken(input.idToken);
  const token = await getAccessToken();
  const projectId = getProjectId();
  const base = fsBase(projectId);

  const retRes = await fetch(`${base}/returns/${encodeURIComponent(input.returnId)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!retRes.ok) throw new Error("Return request not found.");
  const retData = fromFsFields((await retRes.json()).fields ?? {});
  const currentStatus = String(retData.status ?? "pending");

  if (!isValidReturnStatusTransition(currentStatus, "picked_up")) {
    throw new Error(returnTransitionErrorMessage(currentStatus, "picked_up"));
  }

  await authorizeReturnActor(uid, retData, token, projectId, ["admin", "super_admin"], true);

  const nowMs = Date.now();
  await fetch(
    `${base}/returns/${encodeURIComponent(input.returnId)}?updateMask.fieldPaths=status&updateMask.fieldPaths=pickedUpAt&updateMask.fieldPaths=processedBy&updateMask.fieldPaths=updatedAt`,
    {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: toFsFields({
          status: "picked_up",
          pickedUpAt: nowMs,
          processedBy: uid,
          updatedAt: nowMs,
        }),
      }),
    },
  );
}

// ═══════════════════════════════════════════════════════════════
// 6. APPROVE REFUND (finance_admin, admin, or super_admin)
// Moves: picked_up → refund_approved
// Sets approvedRefundAmount = refundableAmount (server-calculated)
// ═══════════════════════════════════════════════════════════════

export async function approveRefundServer(input: {
  idToken: string;
  returnId: string;
}): Promise<{ approvedAmount: number }> {
  const { uid } = await verifyIdToken(input.idToken);
  const token = await getAccessToken();
  const projectId = getProjectId();
  const base = fsBase(projectId);

  const retRes = await fetch(`${base}/returns/${encodeURIComponent(input.returnId)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!retRes.ok) throw new Error("Return request not found.");
  const retData = fromFsFields((await retRes.json()).fields ?? {});
  const currentStatus = String(retData.status ?? "pending");

  if (!isValidReturnStatusTransition(currentStatus, "refund_approved")) {
    throw new Error(returnTransitionErrorMessage(currentStatus, "refund_approved"));
  }

  // Authorization: only finance_admin, admin, super_admin
  const userRole = await getUserAdminRole(token, base, uid);
  if (!userRole || !["finance_admin", "admin", "super_admin"].includes(userRole)) {
    throw new Error("Only finance administrators can approve refunds.");
  }

  // Use server-calculated refundableAmount (never client-provided)
  const refundableAmount = Number(retData.refundableAmount ?? 0);
  if (refundableAmount <= 0) {
    throw new Error("Refundable amount is zero. Cannot approve refund.");
  }

  const nowMs = Date.now();

  // Update return status
  await fetch(
    `${base}/returns/${encodeURIComponent(input.returnId)}?updateMask.fieldPaths=status&updateMask.fieldPaths=refundApprovedAt&updateMask.fieldPaths=approvedRefundAmount&updateMask.fieldPaths=financeProcessedBy&updateMask.fieldPaths=updatedAt`,
    {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: toFsFields({
          status: "refund_approved",
          refundApprovedAt: nowMs,
          approvedRefundAmount: refundableAmount,
          financeProcessedBy: uid,
          updatedAt: nowMs,
        }),
      }),
    },
  );

  // Create immutable refund ledger entry
  const ledgerId = `refund_approved_${input.returnId}_${nowMs}`;
  await fetch(`${base}/returns/${encodeURIComponent(input.returnId)}/refundLedger/${ledgerId}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: toFsFields({
        type: "refund_approved",
        returnId: input.returnId,
        orderId: String(retData.orderId ?? ""),
        sellerId: String(retData.sellerId ?? ""),
        customerId: String(retData.customerId ?? ""),
        amount: refundableAmount,
        reason: "Refund approved by finance",
        processedBy: uid,
        createdAt: nowMs,
      }),
    }),
  });

  await notifyCustomer(
    token,
    base,
    String(retData.customerId ?? ""),
    "Refund Approved",
    `Your refund of ৳${refundableAmount.toFixed(2)} has been approved and will be processed shortly.`,
  );

  return { approvedAmount: refundableAmount };
}

// ═══════════════════════════════════════════════════════════════
// 7. PROCESS REFUND (finance_admin, admin, super_admin)
// Moves: refund_approved → refunded (terminal)
// For COD: marks refund as payable, creates settlement adjustment
// For online: would trigger gateway refund (future)
//
// IDEMPOTENT: If already refunded, returns without duplicate effect.
// ═══════════════════════════════════════════════════════════════

export async function processRefundServer(input: {
  idToken: string;
  returnId: string;
  payoutRef?: string; // Manual payout reference (bank/bkash/nagad)
}): Promise<{ refunded: boolean; amount: number; settlementAdjusted: boolean }> {
  const { uid } = await verifyIdToken(input.idToken);
  const token = await getAccessToken();
  const projectId = getProjectId();
  const base = fsBase(projectId);

  const retRes = await fetch(`${base}/returns/${encodeURIComponent(input.returnId)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!retRes.ok) throw new Error("Return request not found.");
  const retData = fromFsFields((await retRes.json()).fields ?? {});
  const currentStatus = String(retData.status ?? "pending");

  // Idempotent: already refunded
  if (currentStatus === "refunded") {
    return { refunded: false, amount: 0, settlementAdjusted: false };
  }

  if (!isValidReturnStatusTransition(currentStatus, "refunded")) {
    throw new Error(returnTransitionErrorMessage(currentStatus, "refunded"));
  }

  // Authorization: only finance_admin, admin, super_admin
  const userRole = await getUserAdminRole(token, base, uid);
  if (!userRole || !["finance_admin", "admin", "super_admin"].includes(userRole)) {
    throw new Error("Only finance administrators can process refunds.");
  }

  const refundableAmount = Number(retData.refundableAmount ?? 0);
  const sellerId = String(retData.sellerId ?? "");
  const orderId = String(retData.orderId ?? "");
  const nowMs = Date.now();

  // 1. Update return status to refunded
  await fetch(
    `${base}/returns/${encodeURIComponent(input.returnId)}?updateMask.fieldPaths=status&updateMask.fieldPaths=refundedAt&updateMask.fieldPaths=refundedAmount&updateMask.fieldPaths=updatedAt`,
    {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: toFsFields({
          status: "refunded",
          refundedAt: nowMs,
          refundedAmount: refundableAmount,
          updatedAt: nowMs,
        }),
      }),
    },
  );

  // 2. Create immutable refund ledger entry (refund_processed)
  const ledgerId = `refund_processed_${input.returnId}`;
  await fetch(`${base}/returns/${encodeURIComponent(input.returnId)}/refundLedger/${ledgerId}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: toFsFields({
        type: "refund_processed",
        returnId: input.returnId,
        orderId,
        sellerId,
        customerId: String(retData.customerId ?? ""),
        amount: refundableAmount,
        reason: `Refund processed (COD manual payout${input.payoutRef ? `: ${input.payoutRef}` : ""})`,
        processedBy: uid,
        createdAt: nowMs,
      }),
    }),
  });

  // 3. Adjust seller settlement — reverse earnings for this order
  let settlementAdjusted = false;
  try {
    const result = await reverseSellerSettlement({
      sellerId,
      orderId,
      reason: `Return refund: ${String(retData.productTitle ?? "")} (Return #${input.returnId.slice(0, 8)})`,
      adminUid: uid,
    });

    if (result.reversed) {
      settlementAdjusted = true;
      // Update return with settlement reversal reference
      await fetch(
        `${base}/returns/${encodeURIComponent(input.returnId)}?updateMask.fieldPaths=settlementReversed&updateMask.fieldPaths=settlementReversalId&updateMask.fieldPaths=updatedAt`,
        {
          method: "PATCH",
          headers: { authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            fields: toFsFields({
              settlementReversed: true,
              settlementReversalId: `reversal_${orderId}_${nowMs}`,
              updatedAt: nowMs,
            }),
          }),
        },
      );
    }
  } catch (err) {
    // Settlement may be in "paid" status requiring manual reconciliation
    // The refund is still marked as completed, but settlement needs manual handling
    console.error(
      "Settlement adjustment failed:",
      err instanceof Error ? err.message : String(err),
    );
  }

  // 4. Notify customer
  await notifyCustomer(
    token,
    base,
    String(retData.customerId ?? ""),
    "Refund Completed",
    `Your refund of ৳${refundableAmount.toFixed(2)} has been processed. You will receive it via your selected refund method.`,
  );

  return { refunded: true, amount: refundableAmount, settlementAdjusted };
}

// ═══════════════════════════════════════════════════════════════
// 8. CANCEL RETURN (customer only)
// Moves: pending → cancelled (terminal)
// ═══════════════════════════════════════════════════════════════

export async function cancelReturnServer(input: {
  idToken: string;
  returnId: string;
}): Promise<void> {
  const { uid } = await verifyIdToken(input.idToken);
  const token = await getAccessToken();
  const projectId = getProjectId();
  const base = fsBase(projectId);

  const retRes = await fetch(`${base}/returns/${encodeURIComponent(input.returnId)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!retRes.ok) throw new Error("Return request not found.");
  const retData = fromFsFields((await retRes.json()).fields ?? {});
  const currentStatus = String(retData.status ?? "pending");

  if (!isValidReturnStatusTransition(currentStatus, "cancelled")) {
    throw new Error(returnTransitionErrorMessage(currentStatus, "cancelled"));
  }

  // Only the customer who created the return can cancel it
  if (uid !== String(retData.customerId ?? "")) {
    throw new Error("Only the customer can cancel their return request.");
  }

  const nowMs = Date.now();
  await fetch(
    `${base}/returns/${encodeURIComponent(input.returnId)}?updateMask.fieldPaths=status&updateMask.fieldPaths=cancelledAt&updateMask.fieldPaths=updatedAt`,
    {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: toFsFields({
          status: "cancelled",
          cancelledAt: nowMs,
          updatedAt: nowMs,
        }),
      }),
    },
  );
}

// ═══════════════════════════════════════════════════════════════
// 9. LIST RETURNS (admin/seller)
// ═══════════════════════════════════════════════════════════════

export async function listReturnsServer(input: {
  idToken: string;
  filter?: "all" | "seller" | "pending" | "active";
  sellerId?: string;
}): Promise<ReturnRequest[]> {
  const { uid } = await verifyIdToken(input.idToken);
  const token = await getAccessToken();
  const projectId = getProjectId();
  const base = fsBase(projectId);

  // Read all returns (admin) or seller-specific returns
  let queryBody: Record<string, unknown> = {
    structuredQuery: {
      from: [{ collectionId: "returns" }],
      orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
    },
  };

  if (input.filter === "seller" && input.sellerId) {
    // Verify caller is this seller or admin
    if (uid !== input.sellerId) {
      const role = await getUserAdminRole(token, base, uid);
      if (!role) throw new Error("Unauthorized.");
    }
    queryBody = {
      structuredQuery: {
        from: [{ collectionId: "returns" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "sellerId" },
            op: "==",
            value: { stringValue: input.sellerId },
          },
        },
        orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
      },
    };
  } else {
    // Admin access — verify role
    const role = await getUserAdminRole(token, base, uid);
    if (!role) throw new Error("Unauthorized to list all returns.");
  }

  const res = await fetch(`${base}:runQuery`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(queryBody),
  });

  if (!res.ok) throw new Error("Failed to list returns.");
  const docs = await res.json();
  const returns: ReturnRequest[] = [];
  for (const doc of docs) {
    if (doc.document) {
      const id = String(doc.document.name).split("/").pop() ?? "";
      returns.push(mapReturnRequest(id, fromFsFields(doc.document.fields ?? {})));
    }
  }
  return returns;
}

// ═══════════════════════════════════════════════════════════════
// Helper: Authorize return actor
// ═══════════════════════════════════════════════════════════════

async function authorizeReturnActor(
  uid: string,
  retData: Record<string, unknown>,
  token: string,
  projectId: string,
  allowedAdminRoles: string[],
  allowSellerSelf: boolean,
): Promise<void> {
  const sellerId = String(retData.sellerId ?? "");
  const base = fsBase(projectId);

  // If caller is the seller for this return
  if (allowSellerSelf && uid === sellerId) {
    // Verify they're actually an approved seller
    const sellerRes = await fetch(`${base}/sellers/${encodeURIComponent(uid)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (sellerRes.ok) {
      const sellerData = fromFsFields((await sellerRes.json()).fields ?? {});
      const status = String(sellerData.status ?? "");
      if (status === "approved") return; // Authorized as seller
    }
  }

  // Check if caller is admin with allowed role
  const adminRole = await getUserAdminRole(token, base, uid);
  if (adminRole && allowedAdminRoles.includes(adminRole)) {
    return; // Authorized as admin
  }

  throw new Error("You do not have permission to perform this action.");
}

// ═══════════════════════════════════════════════════════════════
// Helper: Get user's adminRole
// ═══════════════════════════════════════════════════════════════

async function getUserAdminRole(token: string, base: string, uid: string): Promise<string | null> {
  const userRes = await fetch(`${base}/users/${encodeURIComponent(uid)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) return null;
  const userDoc = await userRes.json();
  const role = userDoc.fields?.role?.stringValue ?? "customer";
  if (role !== "admin") return null;
  return userDoc.fields?.adminRole?.stringValue ?? null;
}

// ═══════════════════════════════════════════════════════════════
// Helper: Send customer notification
// ═══════════════════════════════════════════════════════════════

async function notifyCustomer(
  token: string,
  base: string,
  customerId: string,
  title: string,
  message: string,
): Promise<void> {
  try {
    const notifData = {
      type: "order",
      title,
      message,
      link: "/returns",
      read: false,
      createdAt: Date.now(),
    };
    await fetch(`${base}/users/${encodeURIComponent(customerId)}/notifications`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields: toFsFields(notifData) }),
    });
  } catch {
    // Non-fatal: notification failure shouldn't block return processing
  }
}
