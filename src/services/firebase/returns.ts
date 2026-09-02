// ═══════════════════════════════════════════════════════════════
// AVENTA SHOP — Return & Refund Client Service
// ═══════════════════════════════════════════════════════════════
// Client-side service that calls server functions for ALL mutations.
// No direct Firestore writes — all financial data is server-controlled.
//
// Read operations use client SDK (Firestore rules enforce ownership).
// Mutation operations call TanStack Start server functions.
// ═══════════════════════════════════════════════════════════════

import { collection, doc, getDoc, getDocs, query, where, orderBy } from "firebase/firestore";
import { getDb } from "./config";
import type { ReturnRequest, ReturnStatus, ReturnReason } from "@/types/returns";
import {
  createReturnFn,
  reviewReturnFn,
  approveReturnFn,
  rejectReturnFn,
  markItemReceivedFn,
  approveRefundFn,
  processRefundFn,
  cancelReturnFn,
  listReturnsFn,
} from "@/lib/returns.functions";

// ─── Re-export types for backward compatibility ──────────────────
export type { ReturnStatus, ReturnReason } from "@/types/returns";
export type { ReturnRequest } from "@/types/returns";

function mapReturn(id: string, d: Record<string, unknown>): ReturnRequest {
  const nowMs = Date.now();
  const created = d.createdAt as { toMillis?: () => number } | number | undefined;
  return {
    id,
    orderId: String(d.orderId ?? ""),
    sellerId: String(d.sellerId ?? ""),
    customerId: String(d.customerId ?? ""),
    productId: String(d.productId ?? ""),
    productTitle: String(d.productTitle ?? ""),
    productImage: String(d.productImage ?? ""),
    quantity: Number(d.quantity ?? 1),
    reason: (d.reason as ReturnReason) ?? "other",
    customerNote: String(d.customerNote ?? ""),
    images: Array.isArray(d.images) ? (d.images as string[]) : [],
    itemPrice: Number(d.itemPrice ?? 0),
    itemSubtotal: Number(d.itemSubtotal ?? 0),
    discountAllocation: Number(d.discountAllocation ?? 0),
    refundableAmount: Number(d.refundableAmount ?? 0),
    approvedRefundAmount: Number(d.approvedRefundAmount ?? 0),
    refundedAmount: Number(d.refundedAmount ?? 0),
    status: (d.status as ReturnStatus) ?? "pending",
    reviewNote: (d.reviewNote as string | null) ?? null,
    rejectionReason: (d.rejectionReason as string | null) ?? null,
    processedBy: (d.processedBy as string | null) ?? null,
    sellerId_reviewed: (d.sellerId_reviewed as string | null) ?? null,
    financeProcessedBy: (d.financeProcessedBy as string | null) ?? null,
    requestedAt: Number(d.requestedAt ?? nowMs),
    reviewedAt: (d.reviewedAt as number | null) ?? null,
    approvedAt: (d.approvedAt as number | null) ?? null,
    rejectedAt: (d.rejectedAt as number | null) ?? null,
    pickedUpAt: (d.pickedUpAt as number | null) ?? null,
    refundApprovedAt: (d.refundApprovedAt as number | null) ?? null,
    refundedAt: (d.refundedAt as number | null) ?? null,
    cancelledAt: (d.cancelledAt as number | null) ?? null,
    settlementReversed: Boolean(d.settlementReversed ?? false),
    settlementReversalId: (d.settlementReversalId as string | null) ?? null,
    createdAt: typeof created === "number" ? created : (created?.toMillis?.() ?? nowMs),
    updatedAt: typeof d.updatedAt === "number" ? d.updatedAt : nowMs,
  };
}

// ─── READ: List customer's own returns (client SDK) ──────────────
export async function listUserReturns(uid: string): Promise<ReturnRequest[]> {
  const db = getDb();
  const snap = await getDocs(
    query(collection(db, "returns"), where("userId", "==", uid), orderBy("createdAt", "desc")),
  );
  return snap.docs.map((d) => mapReturn(d.id, d.data() as Record<string, unknown>));
}

// ─── READ: Get single return (client SDK) ─────────────────────────
export async function getReturnRequest(id: string): Promise<ReturnRequest | null> {
  const db = getDb();
  const snap = await getDoc(doc(db, "returns", id));
  if (!snap.exists()) return null;
  return mapReturn(snap.id, snap.data() as Record<string, unknown>);
}

// ─── MUTATION: Create return (server function) ───────────────────
// Refund amount is SERVER-CALCULATED — customer does not provide it.
export async function createReturnRequest(
  uid: string,
  data: {
    orderId: string;
    productId: string;
    productTitle: string;
    productImage: string;
    reason: ReturnReason;
    description: string;
    refundAmount: number; // Ignored by server — kept for backward compat
    images?: string[];
    quantity?: number;
  },
  idToken?: string,
): Promise<string> {
  if (!idToken) throw new Error("Authentication required to create return request.");

  const result = await createReturnFn({
    data: {
      idToken,
      customerId: uid,
      orderId: data.orderId,
      productId: data.productId,
      quantity: data.quantity ?? 1,
      reason: data.reason,
      customerNote: data.description,
      images: data.images,
    },
  });

  return result.returnId;
}

// ─── MUTATION: Cancel return (server function) ───────────────────
export async function cancelReturnRequest(id: string, idToken?: string): Promise<void> {
  if (!idToken) throw new Error("Authentication required.");
  await cancelReturnFn({ data: { idToken, returnId: id } });
}

// ─── MUTATION: Review return (server function) ───────────────────
export async function reviewReturnRequest(returnId: string, idToken: string): Promise<void> {
  await reviewReturnFn({ data: { idToken, returnId } });
}

// ─── MUTATION: Approve return (server function) ──────────────────
export async function approveReturnRequest(
  returnId: string,
  idToken: string,
  note?: string,
): Promise<void> {
  await approveReturnFn({ data: { idToken, returnId, note } });
}

// ─── MUTATION: Reject return (server function) ───────────────────
export async function rejectReturnRequest(
  returnId: string,
  idToken: string,
  reason: string,
): Promise<void> {
  await rejectReturnFn({ data: { idToken, returnId, reason } });
}

// ─── MUTATION: Mark item received (server function) ──────────────
export async function markItemReceived(returnId: string, idToken: string): Promise<void> {
  await markItemReceivedFn({ data: { idToken, returnId } });
}

// ─── MUTATION: Approve refund (server function) ──────────────────
export async function approveRefundRequest(returnId: string, idToken: string): Promise<void> {
  await approveRefundFn({ data: { idToken, returnId } });
}

// ─── MUTATION: Process refund (server function) ──────────────────
export async function processRefundRequest(
  returnId: string,
  idToken: string,
  payoutRef?: string,
): Promise<void> {
  await processRefundFn({ data: { idToken, returnId, payoutRef } });
}

// ─── READ: List returns for admin/seller (server function) ───────
export async function listReturnsForAdmin(
  idToken: string,
  filter?: "all" | "seller" | "pending" | "active",
  sellerId?: string,
): Promise<ReturnRequest[]> {
  return listReturnsFn({ data: { idToken, filter, sellerId } });
}
