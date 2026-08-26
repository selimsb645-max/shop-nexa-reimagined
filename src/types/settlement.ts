/**
 * AVENTA SHOP — Settlement Architecture Types
 * 
 * Defines the seller-wise settlement breakdown for every order.
 * These types power the Payment → Seller Settlement → Withdrawal flow.
 * 
 * Design principles:
 * - Customer payment and seller payout are SEPARATE financial flows.
 * - All financial data is computed/stored server-side.
 * - Ledger entries are immutable (append-only).
 * - COD and online payments use the SAME settlement architecture.
 */

// ----------------------------------------------------------------------
// Settlement Status (per seller per order)
// ----------------------------------------------------------------------
export type SettlementStatus =
  | "pending"     // Order placed, not yet delivered
  | "hold"        // Delivered, within settlement hold period
  | "available"   // Hold period passed, earnings available for withdrawal
  | "requested"   // Seller requested withdrawal (part of a withdrawal batch)
  | "paid"        // Payout completed to seller's registered account
  | "reversed";   // Order cancelled/refunded, earnings reversed

// ----------------------------------------------------------------------
// Payout Status
// ----------------------------------------------------------------------
export type PayoutStatus =
  | "none"        // No payout initiated
  | "pending"     // Withdrawal requested, awaiting admin approval
  | "approved"    // Admin approved, manual payout in progress
  | "paid"        // Manual payout completed
  | "rejected";   // Withdrawal rejected, funds returned to available

// ----------------------------------------------------------------------
// Per-Product Delivery Line (immutable snapshot at order time)
// ----------------------------------------------------------------------
export interface DeliveryLineItem {
  productId: string;
  sellerId: string;
  freeDelivery: boolean;
  zoneCharge: number;
  customerDeliveryCharge: number;  // 0 if freeDelivery, zoneCharge if not
  sellerAbsorbedCharge: number;    // zoneCharge if freeDelivery, 0 if not
}

// ----------------------------------------------------------------------
// Seller-wise Order Settlement Breakdown
// Stored in: sellers/{sellerId}/orders/{orderId}
// ----------------------------------------------------------------------
export interface SellerSettlementBreakdown {
  sellerId: string;
  orderId: string;

  // Financial breakdown
  sellerSubtotal: number;        // Sum of this seller's item subtotals
  sellerDiscountShare: number;    // Pro-rata share of order-level discount
  sellerShippingShare: number;    // Pro-rata share of shipping
  // Delivery zone snapshot (immutable per order)
  zoneId: string | null;          // Delivery zone ID at order time
  zoneName: string | null;        // Zone label at order time
  zoneCharge: number;             // Admin-configured charge at order time
  customerDeliveryCharge: number; // What customer pays for delivery
  sellerDeliveryCharge: number;   // What seller absorbs for delivery
  freeDelivery: boolean;          // Whether ALL this seller's products had freeDelivery
  deliveryLines: DeliveryLineItem[]; // Per-product delivery breakdown (immutable)
  sellerTaxShare: number;          // Pro-rata share of order tax
  sellerNetSubtotal: number;      // subtotal - discountShare + shippingShare + taxShare
  commissionRate: number;         // From seller profile (e.g. 0.08 = 8%)
  commissionAmount: number;      // commissionRate * sellerSubtotal
  sellerNetEarnings: number;      // sellerNetSubtotal - commissionAmount

  // Settlement lifecycle
  settlementStatus: SettlementStatus;
  payoutStatus: PayoutStatus;

  // Key dates (epoch ms)
  orderCreatedAt: number;
  deliveredAt: number | null;
  eligibleSettlementDate: number | null;  // deliveredAt + hold period
  settledAt: number | null;                // When earnings became available
  payoutAt: number | null;                 // When manual payout completed

  // Links
  payoutId: string | null;       // Reference to withdrawal request if requested/paid
  reversalReason: string | null;

  createdAt: number;
  updatedAt: number;
}

// ----------------------------------------------------------------------
// Immutable Settlement Ledger Entry
// Stored in: sellers/{sellerId}/settlementTx/{txId}
// This is an append-only ledger — entries are NEVER edited or deleted.
// ----------------------------------------------------------------------
export type SettlementTxType =
  | "earning"        // Earnings credited (order delivered + hold passed)
  | "hold"           // Earnings in hold period
  | "reversal"       // Earnings reversed (order cancelled/refunded)
  | "payout"         // Payout to seller (negative)
  | "payout_reversal"; // Payout rejected, funds returned (positive)

export interface SettlementTxEntry {
  id: string;
  type: SettlementTxType;
  orderId: string | null;
  amount: number;                // Positive = credit, Negative = debit
  sellerEarnings: number;        // Snapshot of seller net earnings for the order
  settlementStatus: SettlementStatus;
  note: string;
  createdBy: string;            // uid of the system or admin who triggered this
  createdAt: number;
}

// ----------------------------------------------------------------------
// Withdrawal Request (extended from existing)
// ----------------------------------------------------------------------
export interface SettlementWithdrawalRequest {
  id: string;
  sellerId: string;
  amount: number;
  method: "bank" | "bkash" | "nagad" | "rocket";
  destination: string;          // Masked for security (e.g. "bkash: 01**7234")
  status: "pending" | "processing" | "completed" | "rejected";
  settlementTxIds: string[];   // Linked settlement ledger entries
  
  // Admin/Finance
  reviewedBy: string | null;
  reviewNote: string | null;
  
  requestedAt: number;
  processedAt: number | null;
  paidAt: number | null;
  txId: string | null;          // Manual payout transaction reference
}

// ----------------------------------------------------------------------
// Admin Finance Overview
// ----------------------------------------------------------------------
export interface AdminFinanceOverview {
  totalCustomerPayments: number;    // All paid orders (online + COD collected)
  totalPlatformRevenue: number;     // Total commission earned
  totalSellerSales: number;          // Total seller subtotals
  totalCommission: number;           // Same as platform revenue (alias)
  pendingSellerSettlement: number;   // Earnings in pending/hold status
  availableSellerBalance: number;   // Earnings available for withdrawal
  pendingWithdrawals: number;        // Withdrawal requests awaiting action
  approvedWithdrawals: number;       // Approved, payout in progress
  paidWithdrawals: number;           // Completed payouts
  refundedAmount: number;            // Total reversed/refunded
  totalWithdrawnAmount: number;      // Total paid out to sellers
}

// ----------------------------------------------------------------------
// Seller Dashboard Financials
// ----------------------------------------------------------------------
export interface SellerFinancials {
  totalSales: number;             // Lifetime seller subtotals
  totalCommission: number;        // Lifetime commission paid to platform
  pendingEarnings: number;        // Earnings in pending/hold
  availableBalance: number;       // Available for withdrawal
  totalWithdrawn: number;          // Total successfully withdrawn
  pendingWithdrawal: number;       // Current pending withdrawal request amount
  withdrawalHistory: SettlementWithdrawalRequest[];
}

// ----------------------------------------------------------------------
// Settlement Configuration
// ----------------------------------------------------------------------
export const SETTLEMENT_HOLD_DAYS = 7; // Configurable: 7 days after delivery

export interface SettlementConfig {
  holdPeriodDays: number;
  minWithdrawalAmount: number;
  defaultCommissionRate: number;  // Default 8%
}
