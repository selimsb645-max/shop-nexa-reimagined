// ═══════════════════════════════════════════════════════════════
// Return Status Transitions — Canonical Validator
// ═══════════════════════════════════════════════════════════════
// Single source of truth for valid return status transitions.
// Used by BOTH client-side services AND server-side functions.
//
// Status machine:
//   pending → under_review → approved → picked_up → refund_approved → refunded
//                    ↘ rejected (terminal)
//   pending → cancelled (terminal)
// ═══════════════════════════════════════════════════════════════

import { RETURN_TRANSITIONS, RETURN_TERMINAL_STATES, type ReturnStatus } from "@/types/returns";

/**
 * Validate a return status transition.
 * Same status = idempotent, always allowed.
 */
export function isValidReturnStatusTransition(currentStatus: string, nextStatus: string): boolean {
  if (currentStatus === nextStatus) return true;
  const allowed = RETURN_TRANSITIONS[currentStatus as ReturnStatus];
  if (!allowed) return false;
  return allowed.includes(nextStatus as ReturnStatus);
}

/**
 * Check if a return status is terminal (no further transitions).
 */
export function isReturnTerminalStatus(status: string): boolean {
  return RETURN_TERMINAL_STATES.includes(status as ReturnStatus);
}

/**
 * Build a human-readable error message for an invalid return transition.
 */
export function returnTransitionErrorMessage(currentStatus: string, nextStatus: string): string {
  if (isReturnTerminalStatus(currentStatus)) {
    return `Cannot change return status from "${currentStatus}" — it is a terminal state.`;
  }

  const allowed = RETURN_TRANSITIONS[currentStatus as ReturnStatus] ?? [];
  if (allowed.length === 0) {
    return `Invalid status transition from "${currentStatus}".`;
  }

  return `Invalid return status transition: ${currentStatus} → ${nextStatus}. Allowed: ${allowed.join(", ")}.`;
}
