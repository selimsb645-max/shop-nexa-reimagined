import {
  collection,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { getDb } from "./config";
import { firebaseConfigured } from "./config";
import type { SellerWalletTx, SellerWalletTxType } from "@/types/seller";

const SELLERS = "sellers";
const WALLET_TX = "walletTx";

function nowMs() {
  return Date.now();
}

function mapTx(id: string, d: Record<string, unknown>): SellerWalletTx {
  const r = d as Partial<SellerWalletTx> & Record<string, unknown>;
  return {
    id,
    type: (r.type as SellerWalletTx["type"]) ?? "earning",
    amount: Number(r.amount ?? 0),
    orderId: (r.orderId as string | null) ?? null,
    note: String(r.note ?? ""),
    status: (r.status as SellerWalletTx["status"]) ?? "completed",
    createdAt:
      typeof r.createdAt === "number"
        ? r.createdAt
        : (r.createdAt as { toMillis?: () => number })?.toMillis?.() ?? nowMs(),
  };
}

/**
 * Sum all wallet transactions to get the current balance.
 */
export async function getSellerWalletBalance(sellerId: string): Promise<number> {
  if (!firebaseConfigured) return 0;
  const snap = await getDocs(
    query(
      collection(getDb(), SELLERS, sellerId, WALLET_TX),
      fbLimit(1000),
    ),
  );
  let balance = 0;
  snap.docs.forEach((d) => {
    const data = d.data();
    const amount = Number(data.amount ?? 0);
    const status = String(data.status ?? "completed");
    // Only count completed transactions; pending withdrawals reduce available
    if (status === "completed") {
      balance += amount;
    } else if (status === "pending" && amount < 0) {
      // Pending withdrawals reduce available balance
      balance += amount;
    }
  });
  return Math.round(balance * 100) / 100;
}

/**
 * Sum only earning-type transactions (lifetime earnings).
 */
export async function getSellerTotalEarnings(sellerId: string): Promise<number> {
  if (!firebaseConfigured) return 0;
  const snap = await getDocs(
    query(
      collection(getDb(), SELLERS, sellerId, WALLET_TX),
      where("type", "==", "earning"),
    ),
  );
  let total = 0;
  snap.docs.forEach((d) => {
    total += Number(d.data().amount ?? 0);
  });
  return Math.round(total * 100) / 100;
}

/**
 * Sum pending (not-yet-delivered) order earnings.
 * This queries orders that are not delivered/cancelled and sums their earnings.
 */
export async function getSellerPendingBalance(sellerId: string): Promise<number> {
  if (!firebaseConfigured) return 0;
  // Import here to avoid circular deps
  const { listSellerOrders } = await import("./sellerOrders");
  const orders = await listSellerOrders(sellerId);
  let pending = 0;
  orders.forEach((o) => {
    if (o.status !== "delivered" && o.status !== "cancelled") {
      pending += o.earnings || 0;
    }
  });
  return Math.round(pending * 100) / 100;
}

/**
 * List wallet transactions with optional type filter.
 */
export async function listSellerWalletTransactions(
  sellerId: string,
  opts?: { type?: SellerWalletTxType; max?: number },
): Promise<SellerWalletTx[]> {
  if (!firebaseConfigured) return [];
  let q = query(
    collection(getDb(), SELLERS, sellerId, WALLET_TX),
    orderBy("createdAt", "desc"),
  );
  if (opts?.type) {
    q = query(
      collection(getDb(), SELLERS, sellerId, WALLET_TX),
      where("type", "==", opts.type),
      orderBy("createdAt", "desc"),
    );
  }
  if (opts?.max) {
    q = query(q, fbLimit(opts.max));
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapTx(d.id, d.data()));
}
