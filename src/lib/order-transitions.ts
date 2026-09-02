// ═══════════════════════════════════════════════════════════════
// Order Status Transitions — Canonical Validator
// ═══════════════════════════════════════════════════════════════
// Single source of truth for valid order status transitions.
// Used by BOTH client-side services AND server-side functions.
//
// This is the ONLY place where transition rules are defined.
// All order mutation paths MUST call isValidOrderStatusTransition()
// before writing a new status.
//
// FIREBASE ADMIN SDK BYPASSES FIRESTORE RULES. Therefore this
// validation must be enforced in the service layer (client SDK)
// AND in any Admin SDK server function that mutates order status.
//
// Status types:
//   OrderStatus (customer orders): pending, confirmed, processing,
//     shipped, delivered, cancelled
//   SellerOrderStatus (seller orders): same + returned
// ═══════════════════════════════════════════════════════════════

import type { OrderStatus } from "@/types/commerce";
import type { SellerOrderStatus } from "@/types/seller";

/**
 * Valid transitions for customer OrderStatus.
 * Terminal states (delivered, cancelled) have no outgoing transitions.
 *
 * Flow: pending → confirmed → processing → shipped → delivered
 *       ↘ cancelled (from any non-terminal state)
 */
const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "processing", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered", "cancelled"],
  delivered: [], // Terminal
  cancelled: [], // Terminal
};

/**
 * Valid transitions for SellerOrderStatus.
 * Extends customer transitions with "returned" (from delivered only).
 *
 * Flow: pending → confirmed → processing → shipped → delivered → returned
 *       ↘ cancelled (from any non-terminal state)
 */
const SELLER_ORDER_TRANSITIONS: Record<SellerOrderStatus, SellerOrderStatus[]> = {
  pending: ["confirmed", "processing", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered", "cancelled"],
  delivered: ["returned"], // Can be returned after delivery
  cancelled: [], // Terminal
  returned: [], // Terminal
};

/**
 * Validate a customer order status transition.
 *
 * @param currentStatus The order's current status
 * @param nextStatus The requested new status
 * @returns true if the transition is valid (or same status = idempotent)
 */
export function isValidOrderStatusTransition(currentStatus: string, nextStatus: string): boolean {
  // Same status = idempotent, always allowed
  if (currentStatus === nextStatus) return true;

  const allowed = ORDER_TRANSITIONS[currentStatus as OrderStatus];
  if (!allowed) return false; // Unknown current status
  return allowed.includes(nextStatus as OrderStatus);
}

/**
 * Validate a seller order status transition.
 *
 * @param currentStatus The seller order's current status
 * @param nextStatus The requested new status
 * @returns true if the transition is valid (or same status = idempotent)
 */
export function isValidSellerOrderStatusTransition(
  currentStatus: string,
  nextStatus: string,
): boolean {
  // Same status = idempotent, always allowed
  if (currentStatus === nextStatus) return true;

  const allowed = SELLER_ORDER_TRANSITIONS[currentStatus as SellerOrderStatus];
  if (!allowed) return false; // Unknown current status
  return allowed.includes(nextStatus as SellerOrderStatus);
}

/**
 * Check if a status is a terminal state (no further transitions possible).
 */
export function isTerminalOrderStatus(status: string): boolean {
  return status === "delivered" || status === "cancelled" || status === "returned";
}

/**
 * Build a human-readable error message for an invalid transition.
 * Does NOT expose internal implementation details.
 */
export function transitionErrorMessage(
  currentStatus: string,
  nextStatus: string,
  isSellerOrder: boolean = false,
): string {
  if (isTerminalOrderStatus(currentStatus)) {
    return `Cannot change order status from "${currentStatus}" — it is a terminal state.`;
  }

  const allowed = isSellerOrder
    ? (SELLER_ORDER_TRANSITIONS[currentStatus as SellerOrderStatus] ?? [])
    : (ORDER_TRANSITIONS[currentStatus as OrderStatus] ?? []);

  if (allowed.length === 0) {
    return `Invalid status transition from "${currentStatus}".`;
  }

  return `Invalid status transition: ${currentStatus} → ${nextStatus}. Allowed: ${allowed.join(", ")}.`;
}

// Export transition maps for testing
export { ORDER_TRANSITIONS, SELLER_ORDER_TRANSITIONS };
