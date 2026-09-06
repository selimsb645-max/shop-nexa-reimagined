// ═══════════════════════════════════════════════════════════════
// Order Status Transitions — Legacy-compatible facade
// ═══════════════════════════════════════════════════════════════
// DEPRECATED as the source of truth — the canonical machine now
// lives in `orderStateMachine.ts` (Implementation Prompt 03).
//
// This module preserves the exact public API that existing client
// services and server functions already import, while delegating
// every decision to the canonical machine. Legacy statuses are
// transparently migrated, so old orders keep flowing correctly.
// ═══════════════════════════════════════════════════════════════

import {
  CANONICAL_TRANSITIONS,
  isValidCanonicalTransition,
  normalizeOrderStatus,
  toLegacyStatus,
  type CanonicalOrderStatus,
} from "./orderStateMachine";

/**
 * Back-compat export: legacy transition maps expressed in legacy
 * status vocabulary. Existing consumers (tests, UI) may import them.
 */
export const ORDER_TRANSITIONS: Record<string, string[]> = Object.fromEntries(
  Object.entries(CANONICAL_TRANSITIONS).map(([from, tos]) => [
    toLegacyStatus(from as CanonicalOrderStatus),
    tos.map(toLegacyStatus),
  ]),
);

export const SELLER_ORDER_TRANSITIONS = ORDER_TRANSITIONS;

/**
 * Validate a customer order status transition. Accepts BOTH legacy
 * and canonical statuses on either side (normalization is internal).
 * Same-status no-ops are allowed (idempotent event replay).
 */
export function isValidOrderStatusTransition(currentStatus: string, nextStatus: string): boolean {
  return isValidCanonicalTransition(currentStatus, nextStatus);
}

/**
 * Validate a seller order status transition (same machine — seller
 * fulfillment statuses are a subset of the same lifecycle).
 */
export function isValidSellerOrderStatusTransition(
  currentStatus: string,
  nextStatus: string,
): boolean {
  return isValidCanonicalTransition(currentStatus, nextStatus);
}

/**
 * True when the (legacy or canonical) status is terminal.
 */
export function isTerminalOrderStatus(status: string): boolean {
  const canonical = normalizeOrderStatus(status);
  return canonical === "DELIVERED"
    || canonical === "CANCELLED"
    || canonical === "REFUNDED";
}

/**
 * Human-readable error message for an invalid transition.
 */
export function transitionErrorMessage(
  currentStatus: string,
  nextStatus: string,
  _seller?: boolean, // legacy 3rd arg (seller flag) — machine is shared
): string {
  const from = normalizeOrderStatus(currentStatus);
  const to = normalizeOrderStatus(nextStatus);
  const allowed = CANONICAL_TRANSITIONS[from].join(", ") || "(none)";
  return `Invalid order status transition: ${from} → ${to}. Allowed next statuses: ${allowed}.`;
}
