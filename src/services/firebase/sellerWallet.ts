/**
 * AVENTA SHOP — Seller Wallet (v2 client service)
 *
 * SECURITY AUDIT: the legacy float-era reads that computed balances
 * CLIENT-SIDE (getSellerWalletBalance, getSellerTotalEarnings,
 * getSellerPendingBalance, listSellerWalletTransactions) were removed
 * — every balance/ledger/withdrawal now flows exclusively through
 * verified server functions over `sellerFinance/{uid}` +
 * `sellerLedger`. Firestore rules deny all client access to those
 * collections; the transports below are the ONLY bridge.
 */

// ════════════════════════════════════════════════════════════════════
// WALLET v2 — server-authoritative (finance engine)
//
// All wallet data comes exclusively from the server:
// `sellerFinance/{uid}` balances + the append-only `sellerLedger`
// history, reached only through verified server functions —
// a client can never compute or mutate its own balance.
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
