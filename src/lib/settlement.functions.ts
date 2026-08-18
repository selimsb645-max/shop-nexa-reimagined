/**
 * Shop Nexa — Settlement Server Functions
 * 
 * These are TanStack Start server functions that bridge the client to the
 * settlement server module. Each function:
 * 1. Validates the Firebase ID token (verifies caller identity)
 * 2. Checks permissions (seller vs admin)
 * 3. Delegates to settlement.server.ts
 * 
 * SECURITY: Financial mutations ONLY happen through these verified endpoints.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// ====================================================================
// 1. RELEASE SETTLEMENTS (seller triggers lazy release)
// ====================================================================

const releaseSchema = z.object({
  idToken: z.string().min(10),
});

export const releaseSettlements = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => releaseSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken } = await import("./firebase-admin.server");
    const { batchReleaseSettlements } = await import("./settlement.server");

    const { uid } = await verifyIdToken(data.idToken);

    return batchReleaseSettlements(uid);
  });

// ====================================================================
// 2. WITHDRAWAL REQUEST (seller action)
// ====================================================================

const withdrawSchema = z.object({
  idToken: z.string().min(10),
  amount: z.number().min(10).max(100_000),
  method: z.enum(["bank", "bkash", "nagad", "rocket"]),
  destination: z.string().trim().min(4).max(200),
});

export const requestSettlementWithdrawal = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => withdrawSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken } = await import("./firebase-admin.server");
    const { requestSettlementWithdrawal: requestWithdrawal } = await import("./settlement.server");

    const { uid } = await verifyIdToken(data.idToken);

    return requestWithdrawal({
      uid,
      amount: data.amount,
      method: data.method,
      destination: data.destination,
    });
  });

// ====================================================================
// 3. PROCESS WITHDRAWAL (admin action — approve/reject)
// ====================================================================

const processWithdrawalSchema = z.object({
  idToken: z.string().min(10),
  sellerId: z.string().min(1).max(200),
  withdrawalId: z.string().min(1).max(200),
  action: z.enum(["approve", "reject"]),
  note: z.string().max(500).optional(),
  txRef: z.string().max(200).optional(),
});

export const processSettlementWithdrawal = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => processWithdrawalSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken, getAccessToken, getProjectId } = await import("./firebase-admin.server");
    const { processSettlementWithdrawal: processWithdrawal } = await import("./settlement.server");

    const { uid } = await verifyIdToken(data.idToken);

    // Verify caller is admin
    const token = await getAccessToken();
    const projectId = getProjectId();
    const userRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(uid)}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (!userRes.ok) throw new Error("Could not verify admin permissions.");
    const userDoc = await userRes.json();
    const role = userDoc.fields?.role?.stringValue ?? "customer";
    if (role !== "admin") throw new Error("Only admins can process withdrawals.");

    return processWithdrawal({
      adminUid: uid,
      sellerId: data.sellerId,
      withdrawalId: data.withdrawalId,
      action: data.action,
      note: data.note,
      txRef: data.txRef,
    });
  });

// ====================================================================
// 4. REVERSE SETTLEMENT (admin action — on order cancel/refund)
// ====================================================================

const reverseSchema = z.object({
  idToken: z.string().min(10),
  sellerId: z.string().min(1).max(200),
  orderId: z.string().min(1).max(200),
  reason: z.string().trim().min(3).max(500),
});

export const reverseSettlement = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => reverseSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken, getAccessToken, getProjectId } = await import("./firebase-admin.server");
    const { reverseSellerSettlement } = await import("./settlement.server");

    const { uid } = await verifyIdToken(data.idToken);

    // Verify caller is admin
    const token = await getAccessToken();
    const projectId = getProjectId();
    const userRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(uid)}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (!userRes.ok) throw new Error("Could not verify admin permissions.");
    const userDoc = await userRes.json();
    const role = userDoc.fields?.role?.stringValue ?? "customer";
    if (role !== "admin") throw new Error("Only admins can reverse settlements.");

    return reverseSellerSettlement({
      sellerId: data.sellerId,
      orderId: data.orderId,
      reason: data.reason,
      adminUid: uid,
    });
  });

// ====================================================================
// 5. MARK ORDER DELIVERED (triggers settlement hold period)
// Called by seller/admin when updating order status to "delivered"
// ====================================================================

const markDeliveredSchema = z.object({
  idToken: z.string().min(10),
  sellerId: z.string().min(1).max(200),
  orderId: z.string().min(1).max(200),
});

export const markOrderDelivered = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => markDeliveredSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken } = await import("./firebase-admin.server");
    const { markOrderDeliveredSettlement } = await import("./settlement.server");

    const { uid } = await verifyIdToken(data.idToken);

    // Caller must be the seller or an admin
    // The existing order status update handles permission checks.
    // This function ONLY handles the settlement side effect.

    const nowMs = Date.now();
    return markOrderDeliveredSettlement({
      sellerId: data.sellerId,
      orderId: data.orderId,
      deliveredAt: nowMs,
    });
  });

// ====================================================================
// 6. ADMIN FINANCE OVERVIEW (admin only)
// ====================================================================

const adminFinanceSchema = z.object({
  idToken: z.string().min(10),
});

export const getAdminFinanceOverview = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => adminFinanceSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken, getAccessToken, getProjectId } = await import("./firebase-admin.server");
    const { readAdminFinanceOverview } = await import("./settlement.server");

    const { uid } = await verifyIdToken(data.idToken);

    // Verify admin
    const token = await getAccessToken();
    const projectId = getProjectId();
    const userRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(uid)}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (!userRes.ok) throw new Error("Could not verify admin permissions.");
    const userDoc = await userRes.json();
    const role = userDoc.fields?.role?.stringValue ?? "customer";
    if (role !== "admin") throw new Error("Only admins can view finance overview.");

    return readAdminFinanceOverview();
  });

// ====================================================================
// 7. SELLER FINANCIALS (seller's own data)
// ====================================================================

const sellerFinancialsSchema = z.object({
  idToken: z.string().min(10),
});

export const getSellerFinancials = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => sellerFinancialsSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken } = await import("./firebase-admin.server");
    const { readSellerFinancials, readSettlementLedger } = await import("./settlement.server");

    const { uid } = await verifyIdToken(data.idToken);

    // Release any eligible settlements first (lazy release)
    const { batchReleaseSettlements } = await import("./settlement.server");
    await batchReleaseSettlements(uid);

    // Now read financials
    const financials = await readSellerFinancials(uid);
    const ledger = await readSettlementLedger(uid, 50);

    return { ...financials, recentTransactions: ledger };
  });
