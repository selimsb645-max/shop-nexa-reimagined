/**
 * AVENTA SHOP — Admin: List All Withdrawal Requests
 * 
 * Reads ALL withdrawal requests across ALL sellers using the Firebase client SDK.
 * This is used by the admin finance panel to show pending withdrawals.
 */

import { collectionGroup, getDocs, query, orderBy } from "firebase/firestore";
import { getDb, firebaseConfigured } from "./config";

export interface AdminWithdrawalRow {
  id: string;
  sellerId: string;
  amount: number;
  method: string;
  destination: string;
  status: string;
  requestedAt: number;
  processedAt: number | null;
  note: string | null;
  txId: string | null;
}

function nowMs() {
  return Date.now();
}

function mapWithdrawal(id: string, sellerId: string, data: Record<string, unknown>): AdminWithdrawalRow {
  return {
    id,
    sellerId,
    amount: Number(data.amount ?? 0),
    method: String(data.method ?? "bank"),
    destination: String(data.destination ?? ""),
    status: String(data.status ?? "pending"),
    requestedAt:
      typeof data.requestedAt === "number"
        ? data.requestedAt
        : (data.requestedAt as { toMillis?: () => number })?.toMillis?.() ?? nowMs(),
    processedAt:
      data.processedAt != null
        ? typeof data.processedAt === "number"
          ? data.processedAt
          : (data.processedAt as { toMillis?: () => number })?.toMillis?.() ?? null
        : null,
    note: (data.note as string | null) ?? null,
    txId: (data.txId as string | null) ?? null,
  };
}

/**
 * Lists ALL withdrawal requests across all sellers.
 * Uses collectionGroup query — requires admin SDK or appropriate rules.
 */
export async function listAllWithdrawalRequests(_idToken: string): Promise<AdminWithdrawalRow[]> {
  if (!firebaseConfigured) return [];

  const snap = await getDocs(
    query(
      collectionGroup(getDb(), "withdrawals"),
      orderBy("requestedAt", "desc"),
    ),
  );

  const results: AdminWithdrawalRow[] = [];
  snap.docs.forEach((doc) => {
    // Extract sellerId from path: sellers/{sellerId}/withdrawals/{id}
    const path = doc.ref.path.split("/");
    if (path.length >= 4 && path[0] === "sellers") {
      const sellerId = path[1];
      results.push(mapWithdrawal(doc.id, sellerId, doc.data()));
    }
  });

  return results;
}
