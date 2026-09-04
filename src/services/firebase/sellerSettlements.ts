/**
 * Aventa Shop — Client-side Seller Settlement Service
 *
 * Read-only access to seller settlement data via server functions.
 * Sellers can READ their settlement data but CANNOT mutate it.
 * All mutations go through verified server functions.
 */

import {
  requestSettlementWithdrawal,
  getSellerFinancials,
  releaseSettlements,
} from "@/lib/settlement.functions";

export interface SellerSettlementData {
  totalSales: number;
  totalCommission: number;
  pendingEarnings: number;
  availableBalance: number;
  totalWithdrawn: number;
  recentTransactions: Array<{
    id: string;
    type: string;
    orderId: string | null;
    amount: number;
    note: string;
    createdAt: number;
  }>;
}

/**
 * Get the seller's complete financial dashboard data.
 * This also triggers lazy release of eligible settlements.
 */
export async function fetchSellerFinancials(idToken: string): Promise<SellerSettlementData> {
  return getSellerFinancials({ data: { idToken } });
}

/**
 * Request a withdrawal from available balance.
 * Server verifies the balance and creates a pending walletTx + settlementTx.
 */
export async function requestSellerWithdrawal(input: {
  idToken: string;
  amount: number;
  method: "bank" | "bkash" | "nagad" | "rocket";
  destination: string;
}): Promise<{ withdrawalId: string; remainingBalance: number }> {
  return requestSettlementWithdrawal({
    data: {
      idToken: input.idToken,
      amount: input.amount,
      method: input.method,
      destination: input.destination,
    },
  });
}

/**
 * Trigger lazy release of settlements whose hold period has passed.
 * Called when seller visits their wallet/dashboard.
 */
export async function triggerSettlementRelease(idToken: string): Promise<{
  releasedCount: number;
  totalReleased: number;
}> {
  return releaseSettlements({ data: { idToken } });
}
