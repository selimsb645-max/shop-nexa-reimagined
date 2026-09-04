/**
 * Aventa Shop — Admin Finance & Settlement Service
 *
 * Client-side read access for the admin/finance panel.
 * Admin can view overview, process withdrawals, and reverse settlements.
 * All mutations go through verified server functions.
 */

import {
  getAdminFinanceOverview,
  processSettlementWithdrawal,
  reverseSettlement,
} from "@/lib/settlement.functions";

export interface AdminFinanceData {
  totalCustomerPayments: number;
  totalPlatformRevenue: number;
  totalSellerSales: number;
  pendingSellerSettlement: number;
  availableSellerBalance: number;
  refundedAmount: number;
  totalWithdrawnAmount: number;
  pendingWithdrawalsCount: number;
}

/**
 * Fetch the admin finance overview (total customer payments, platform revenue,
 * seller settlements, withdrawals, refunds, etc.)
 */
export async function fetchAdminFinanceOverview(idToken: string): Promise<AdminFinanceData> {
  return getAdminFinanceOverview({ data: { idToken } });
}

/**
 * Admin approves a seller's withdrawal request.
 * Server marks it as completed, creates walletTx + settlementTx entries.
 */
export async function approveWithdrawal(input: {
  idToken: string;
  sellerId: string;
  withdrawalId: string;
  note?: string;
  txRef?: string; // Manual payout transaction reference
}): Promise<{ status: string }> {
  return processSettlementWithdrawal({
    data: {
      idToken: input.idToken,
      sellerId: input.sellerId,
      withdrawalId: input.withdrawalId,
      action: "approve",
      note: input.note,
      txRef: input.txRef,
    },
  });
}

/**
 * Admin rejects a seller's withdrawal request.
 * Server reverses the pending debit, funds return to available balance.
 */
export async function rejectWithdrawal(input: {
  idToken: string;
  sellerId: string;
  withdrawalId: string;
  note?: string;
}): Promise<{ status: string }> {
  return processSettlementWithdrawal({
    data: {
      idToken: input.idToken,
      sellerId: input.sellerId,
      withdrawalId: input.withdrawalId,
      action: "reject",
      note: input.note,
    },
  });
}

/**
 * Admin reverses a seller's settlement (on order cancellation/refund).
 * Depending on settlement status, this either just marks as reversed
 * or also debits the wallet if earnings were already released.
 */
export async function reverseSellerEarnings(input: {
  idToken: string;
  sellerId: string;
  orderId: string;
  reason: string;
}): Promise<{ reversed: boolean; walletImpact: number }> {
  return reverseSettlement({
    data: {
      idToken: input.idToken,
      sellerId: input.sellerId,
      orderId: input.orderId,
      reason: input.reason,
    },
  });
}
