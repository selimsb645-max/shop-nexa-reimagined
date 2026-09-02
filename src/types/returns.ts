// ═══════════════════════════════════════════════════════════════
// AVENTA SHOP — Return & Refund Types
// ═══════════════════════════════════════════════════════════════
// Complete return/refund data model for the marketplace.
// Compatible with existing settlement architecture.
//
// Design:
// - Return requests are per-item (one product per return)
// - Refund amount is ALWAYS server-calculated
// - Settlement adjustment uses existing reverseSellerSettlement
// - Immutable ledger entries in sellers/{sid}/settlementTx
// - COD refunds use manual finance processing (no fake gateway)
// ═══════════════════════════════════════════════════════════════

// ----------------------------------------------------------------------
// Return Status Machine
// ----------------------------------------------------------------------
// Flow:
//   pending → under_review → approved → picked_up → refund_approved → refunded
//                    ↘ rejected (terminal)
//   pending → cancelled (customer cancelled, terminal)
//
// Terminal states: rejected, refunded, cancelled

export type ReturnStatus =
  | "pending" // Customer submitted return request
  | "under_review" // Seller/admin reviewing
  | "approved" // Return approved, pickup arranged
  | "rejected" // Return rejected (terminal)
  | "picked_up" // Item received from customer
  | "refund_approved" // Finance approved refund amount
  | "refunded" // Refund completed (terminal)
  | "cancelled"; // Customer cancelled request (terminal)

export const RETURN_TERMINAL_STATES: ReturnStatus[] = ["rejected", "refunded", "cancelled"];

// Valid status transitions
export const RETURN_TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
  pending: ["under_review", "cancelled"],
  under_review: ["approved", "rejected"],
  approved: ["picked_up", "rejected"],
  rejected: [], // Terminal
  picked_up: ["refund_approved"],
  refund_approved: ["refunded"],
  refunded: [], // Terminal
  cancelled: [], // Terminal
};

// ----------------------------------------------------------------------
// Return Reason (preserved from existing implementation)
// ----------------------------------------------------------------------
export type ReturnReason =
  "damaged" | "wrong_item" | "not_as_described" | "changed_mind" | "quality_issue" | "other";

// ----------------------------------------------------------------------
// Return Request
// Stored in: returns/{returnId} (top-level collection)
// ----------------------------------------------------------------------
export interface ReturnRequest {
  id: string;

  // Ownership
  orderId: string;
  sellerId: string;
  customerId: string;

  // Item reference
  productId: string;
  productTitle: string;
  productImage: string;
  quantity: number;

  // Customer input
  reason: ReturnReason;
  customerNote: string;
  images: string[];

  // Financial (ALL server-calculated, never client-provided)
  itemPrice: number; // Original item unit price
  itemSubtotal: number; // itemPrice * quantity
  discountAllocation: number; // Pro-rata discount share for this item
  refundableAmount: number; // Server-calculated max refundable
  approvedRefundAmount: number; // Actual approved refund (0 until approved)
  refundedAmount: number; // Actual refunded (0 until completed)

  // Status
  status: ReturnStatus;
  reviewNote: string | null;
  rejectionReason: string | null;

  // Process tracking
  processedBy: string | null; // Admin/seller uid who processed
  sellerId_reviewed: string | null; // Who reviewed (seller or admin)
  financeProcessedBy: string | null; // Who processed refund

  // Timestamps
  requestedAt: number;
  reviewedAt: number | null;
  approvedAt: number | null;
  rejectedAt: number | null;
  pickedUpAt: number | null;
  refundApprovedAt: number | null;
  refundedAt: number | null;
  cancelledAt: number | null;

  // Settlement reference
  settlementReversed: boolean; // Whether settlement was adjusted
  settlementReversalId: string | null; // Reference to settlementTx entry

  createdAt: number;
  updatedAt: number;
}

// ----------------------------------------------------------------------
// Return Refund Ledger Entry (immutable)
// Stored in: returns/{returnId}/refundLedger/{entryId}
// Append-only — entries are NEVER edited or deleted.
// ----------------------------------------------------------------------
export type RefundLedgerType =
  | "refund_approved" // Refund amount authorized
  | "refund_processed" // Refund paid out (COD: manual processing)
  | "refund_reversed" // Refund reversed (error correction)
  | "settlement_adjusted"; // Seller settlement adjusted for return

export interface RefundLedgerEntry {
  id: string;
  type: RefundLedgerType;
  returnId: string;
  orderId: string;
  sellerId: string;
  customerId: string;
  amount: number; // Positive = refund to customer
  reason: string;
  processedBy: string; // uid of admin/seller/system
  createdAt: number;
}

// ----------------------------------------------------------------------
// Return Configuration
// ----------------------------------------------------------------------
export const RETURN_CONFIG = {
  returnWindowDays: 7, // Customer can return within 7 days of delivery
  maxImages: 5, // Max evidence images per return
  autoApproveDays: 2, // Auto-approve if seller doesn't respond in 2 days
} as const;

// ----------------------------------------------------------------------
// Helper: Validate return status transition
// ----------------------------------------------------------------------
export function isValidReturnTransition(from: string, to: string): boolean {
  if (from === to) return true;
  const allowed = RETURN_TRANSITIONS[from as ReturnStatus];
  if (!allowed) return false;
  return allowed.includes(to as ReturnStatus);
}

export function isReturnTerminalStatus(status: string): boolean {
  return RETURN_TERMINAL_STATES.includes(status as ReturnStatus);
}

// ----------------------------------------------------------------------
// Admin Permission types for returns
// ----------------------------------------------------------------------
export type ReturnPermission =
  | "returns.view"
  | "returns.create"
  | "returns.review"
  | "returns.approve"
  | "returns.reject"
  | "returns.refund";
