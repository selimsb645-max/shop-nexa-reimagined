import { collection, getDocs, limit as fbLimit, orderBy, query, where } from "firebase/firestore";
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
        : ((r.createdAt as unknown as { toMillis?: () => number })?.toMillis?.() ?? nowMs()),
  };
}

/**
 * Sum all wallet transactions to get the current balance.
 */
export async function getSellerWalletBalance(sellerId: string): Promise<number> {
  if (!firebaseConfigured) return 0;
  const snap = await getDocs(
    query(collection(getDb(), SELLERS, sellerId, WALLET_TX), fbLimit(1000)),
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
    query(collection(getDb(), SELLERS, sellerId, WALLET_TX), where("type", "==", "earning")),
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
  let q = query(collection(getDb(), SELLERS, sellerId, WALLET_TX), orderBy("createdAt", "desc"));
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

// ════════════════════════════════════════════════════════════════════
// WALLET v2 — server-authoritative (finance engine)
//
// The functions above are the LEGACY float-era reads (kept for
// backward compatibility). All NEW wallet data comes exclusively
// from the server: `sellerFinance/{uid}` balances + the append-only
// `sellerLedger` history, reached only through verified server
// functions — a client can never compute or mutate its own balance.
// ════════════════════════════════════════════════════════════════════

import {
  getSellerWalletData,
  getSellerWalletLedgerPage,
  requestWalletWithdrawal,
} from "@/lib/finance/finance.functions";

export interface WalletV2Entry {
  transactionId: string;
  seq: number;
  type: string;
  direction: "CREDIT" | "DEBIT";
  status: string;
  amountMinor: number;
  currency: string;
  orderId: string | null;
  reference: string | null;
  balanceBefore: number;
  balanceAfter: number;
  heldBefore: number;
  heldAfter: number;
  createdBy: string;
  createdAt: number;
}

export interface WalletV2Withdrawal {
  withdrawalId: string;
  sellerId: string;
  amountMinor: number;
  currency: string;
  status: "REQUESTED" | "PROCESSING" | "COMPLETED" | "REJECTED" | "FAILED";
  method: string;
  destination: string | null;
  requestedAt: number;
  processedAt: number | null;
  reviewNote: string | null;
}

export interface WalletV2Overview {
  wallet: {
    sellerId: string;
    currency: string;
    availableMinor: number;
    pendingMinor: number;
    totalEarnedMinor: number;
    totalWithdrawnMinor: number;
    status: "ACTIVE" | "SUSPENDED" | "LOCKED" | "CLOSED";
    transactionCount: number;
    lastEntryAt: number | null;
  };
  ledger: { entries: WalletV2Entry[]; nextBefore: number | null; hasMore: boolean };
  withdrawals: WalletV2Withdrawal[];
}

/** Fetch the seller's wallet overview + first ledger page (server-verified). */
export async function fetchWalletV2(idToken: string, type?: string): Promise<WalletV2Overview> {
  return getSellerWalletData({
    data: { idToken, ...(type ? { type } : {}) },
  }) as Promise<WalletV2Overview>;
}

/** Next ledger page (cursor = last seq from the previous page). */
export async function fetchWalletV2LedgerPage(
  idToken: string,
  before: number,
  type?: string,
): Promise<WalletV2Overview["ledger"]> {
  return getSellerWalletLedgerPage({
    data: { idToken, before, ...(type ? { type } : {}) },
  }) as Promise<WalletV2Overview["ledger"]>;
}

/** Request a withdrawal (atomic ledger reservation, server-side). */
export async function requestWalletWithdrawalV2(input: {
  idToken: string;
  amountTaka: number;
  method: "bank" | "bkash" | "nagad" | "rocket";
  destination: string;
}): Promise<{
  withdrawalId: string;
  amountMinor: number;
  availableAfterMinor: number;
  pendingAfterMinor: number;
}> {
  return requestWalletWithdrawal({ data: input });
}
