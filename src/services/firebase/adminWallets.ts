/**
 * AVENTA SHOP — Admin Wallets Service (client)
 *
 * Thin wrappers over verified server functions. All permission checks
 * happen SERVER-SIDE (finance.read / finance.adjust / finance.payout /
 * finance.reconcile) — the UI only uses them to hide controls.
 */

import {
  getAdminWallets,
  getAdminWalletDetail,
  postWalletAdjustment,
  setWalletStatus,
  processWalletWithdrawal,
  runFinanceReconciliation,
  migrateLegacyWallet,
} from "@/lib/finance/finance.functions";

export interface AdminWalletRow {
  sellerId: string;
  shopName: string | null;
  sellerStatus: string | null;
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
    lastEntryType: string | null;
  };
}

export interface AdminWalletDetailData {
  wallet: AdminWalletRow["wallet"];
  shopName: string | null;
  sellerStatus: string | null;
  ledger: {
    entries: Array<{
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
    }>;
    nextBefore: number | null;
    hasMore: boolean;
  };
  withdrawals: Array<{
    withdrawalId: string;
    amountMinor: number;
    currency: string;
    status: "REQUESTED" | "PROCESSING" | "COMPLETED" | "REJECTED" | "FAILED";
    method: string;
    destination: string | null;
    requestedAt: number;
    processedAt: number | null;
    reviewNote: string | null;
  }>;
}

export async function fetchAdminWallets(
  idToken: string,
  opts: { search?: string; status?: "ACTIVE" | "SUSPENDED" | "LOCKED" | "CLOSED" } = {},
): Promise<AdminWalletRow[]> {
  return getAdminWallets({
    data: {
      idToken,
      ...(opts.search ? { search: opts.search } : {}),
      ...(opts.status ? { status: opts.status } : {}),
    },
  }) as Promise<AdminWalletRow[]>;
}

export async function fetchAdminWalletDetail(
  idToken: string,
  sellerId: string,
  opts: { type?: string; before?: number | null } = {},
): Promise<AdminWalletDetailData> {
  return getAdminWalletDetail({
    data: {
      idToken,
      sellerId,
      ...(opts.type ? { type: opts.type } : {}),
      ...(opts.before ? { before: opts.before } : {}),
    },
  }) as Promise<AdminWalletDetailData>;
}

export async function submitWalletAdjustment(input: {
  idToken: string;
  sellerId: string;
  amountTaka: number;
  direction: "CREDIT" | "DEBIT";
  reason: string;
  reference?: string;
}): Promise<{ transactionId: string; availableAfterMinor: number }> {
  return postWalletAdjustment({ data: input });
}

export async function submitWalletStatusChange(input: {
  idToken: string;
  sellerId: string;
  status: "ACTIVE" | "SUSPENDED" | "LOCKED" | "CLOSED";
  reason: string;
}): Promise<{ status: string }> {
  return setWalletStatus({ data: input });
}

export async function submitWithdrawalDecision(input: {
  idToken: string;
  sellerId: string;
  withdrawalId: string;
  action: "approve" | "reject";
  note?: string;
}): Promise<{ status: string }> {
  return processWalletWithdrawal({ data: input });
}

export async function runWalletReconciliation(idToken: string): Promise<{
  sellersChecked: number;
  mismatches: string[];
  dashboard: unknown | null;
}> {
  return runFinanceReconciliation({ data: { idToken } }) as Promise<{
    sellersChecked: number;
    mismatches: string[];
    dashboard: unknown | null;
  }>;
}

export async function migrateSellerLegacyWallet(
  idToken: string,
  sellerId: string,
): Promise<{ migrated: number; skippedPending: number }> {
  return migrateLegacyWallet({ data: { idToken, sellerId } });
}
