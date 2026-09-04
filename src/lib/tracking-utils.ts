/**
 * Aventa Shop — Tracking ID Generation & Status Transition Validation
 *
 * Pure functions — no Firebase, no server-only imports.
 * Safe to use on both client and server.
 */

import type { TrackingOrderStatus } from "@/types/tracking";

// ====================================================================
// TRACKING ID GENERATION
// ====================================================================

/**
 * Generates a unique tracking ID in format: SNX-XXXXXXXX
 * 8 alphanumeric characters (uppercase, unambiguous chars only).
 */
export function generateTrackingId(): string {
  // Unambiguous charset — no 0/O/1/I/L
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let id = "SNX-";
  for (const b of bytes) id += chars[b % chars.length];
  return id;
}

// ====================================================================
// STATUS TRANSITION VALIDATION
// ====================================================================

/**
 * Valid forward transitions in the main fulfillment flow.
 */
const VALID_TRANSITIONS: Record<TrackingOrderStatus, TrackingOrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["packed", "cancelled"],
  packed: ["shipped", "cancelled"],
  shipped: ["out_for_delivery", "delivered", "cancelled"],
  out_for_delivery: ["delivered", "cancelled"],
  delivered: ["return_requested"],
  cancelled: [],
  return_requested: ["returned", "cancelled"],
  returned: [],
};

/**
 * Statuses that can be cancelled from.
 */
const CANCELLABLE_STATUSES: TrackingOrderStatus[] = [
  "pending",
  "confirmed",
  "processing",
  "packed",
  "shipped",
  "out_for_delivery",
];

/**
 * Validates whether a status transition is allowed.
 */
export function isValidTransition(from: TrackingOrderStatus, to: TrackingOrderStatus): boolean {
  if (from === to) return false;
  const allowed = VALID_TRANSITIONS[from] ?? [];
  return allowed.includes(to);
}

/**
 * Returns the next valid statuses from the current status.
 */
export function getNextValidStatuses(current: TrackingOrderStatus): TrackingOrderStatus[] {
  return VALID_TRANSITIONS[current] ?? [];
}

/**
 * Checks if a status can be cancelled from.
 */
export function canCancel(from: TrackingOrderStatus): boolean {
  return CANCELLABLE_STATUSES.includes(from);
}

/**
 * Checks if the status is a terminal state (no further transitions).
 */
export function isTerminalStatus(status: TrackingOrderStatus): boolean {
  const next = VALID_TRANSITIONS[status] ?? [];
  return next.length === 0;
}

// ====================================================================
// STATUS ORDERING (for timeline UI)
// ====================================================================

/**
 * The canonical order of the fulfillment flow (excluding cancellation/return).
 */
export const FULFILLMENT_FLOW: TrackingOrderStatus[] = [
  "pending",
  "confirmed",
  "processing",
  "packed",
  "shipped",
  "out_for_delivery",
  "delivered",
];

/**
 * Returns the index of a status in the fulfillment flow.
 * Returns -1 for cancellation/return statuses.
 */
export function getFlowIndex(status: TrackingOrderStatus): number {
  return FULFILLMENT_FLOW.indexOf(status);
}

// ====================================================================
// DELIVERY AGENT AUTHORIZED STATUSES
// ====================================================================

/**
 * Statuses a delivery agent is allowed to set.
 */
export const DELIVERY_AGENT_STATUSES: TrackingOrderStatus[] = ["out_for_delivery", "delivered"];

/**
 * Checks if a delivery agent can set a given status.
 */
export function canDeliveryAgentSet(
  current: TrackingOrderStatus,
  target: TrackingOrderStatus,
): boolean {
  if (!DELIVERY_AGENT_STATUSES.includes(target)) return false;
  return isValidTransition(current, target);
}

// ====================================================================
// EXPECTED DELIVERY DATE
// ====================================================================

/**
 * Computes expected delivery date (timestamp in ms) from a given status.
 * Default: 3-7 days from now depending on current progress.
 */
export function computeExpectedDelivery(
  current: TrackingOrderStatus,
  fromTimestamp: number = Date.now(),
): number {
  const daysByStatus: Partial<Record<TrackingOrderStatus, number>> = {
    pending: 7,
    confirmed: 6,
    processing: 5,
    packed: 4,
    shipped: 3,
    out_for_delivery: 1,
    delivered: 0,
  };
  const days = daysByStatus[current] ?? 7;
  return fromTimestamp + days * 24 * 60 * 60 * 1000;
}

// Re-exports for convenience
export type { TrackingOrderStatus } from "@/types/tracking";
export { STATUS_LABELS, STATUS_SHORT } from "@/types/tracking";
