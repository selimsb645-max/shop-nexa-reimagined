// ═══════════════════════════════════════════════════════════════
// Aventa Mart — Order State Machine (Canonical, Event-Driven)
// ═══════════════════════════════════════════════════════════════
// Implementation Prompt 03 — Order & Logistics Automation.
//
// Single source of truth for the order lifecycle. Used by BOTH the
// service layer (client SDK) AND server functions AND Firestore
// rules mirror the same transitions (defense-in-depth).
//
// PRIMARY FLOW:
//   ORDER_CREATED → PAYMENT_CONFIRMED → INVENTORY_RESERVED →
//   SELLER_NOTIFIED → PROCESSING → PACKED → READY_TO_SHIP →
//   HANDED_OVER → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED
//
// EXCEPTION STATES:
//   CANCELLED, RETURN_REQUESTED, RETURNED, REFUND_PENDING,
//   REFUNDED, DELIVERY_FAILED
//
// LEGACY STATUS MIGRATION:
//   pending    → ORDER_CREATED
//   confirmed  → PAYMENT_CONFIRMED
//   processing → PROCESSING
//   shipped    → IN_TRANSIT
//   delivered  → DELIVERED
//   cancelled  → CANCELLED
//   returned   → RETURNED
//   out_for_delivery → OUT_FOR_DELIVERY (display-only legacy)
// ═══════════════════════════════════════════════════════════════

/**
 * Canonical order statuses (Implementation Prompt 03 §1).
 */
export type CanonicalOrderStatus =
  | "ORDER_CREATED"
  | "PAYMENT_CONFIRMED"
  | "INVENTORY_RESERVED"
  | "SELLER_NOTIFIED"
  | "PROCESSING"
  | "PACKED"
  | "READY_TO_SHIP"
  | "HANDED_OVER"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED"
  | "RETURN_REQUESTED"
  | "RETURNED"
  | "REFUND_PENDING"
  | "REFUNDED"
  | "DELIVERY_FAILED";

/**
 * Legacy statuses that existed before the state machine upgrade.
 * They are migrated on read via `normalizeOrderStatus`.
 */
export type LegacyOrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "returned"
  | "out_for_delivery"
  | "return_requested"
  | "packed"
  | "ready_to_ship"
  | "handed_over"
  | "in_transit"
  | "refund_pending"
  | "refunded"
  | "delivery_failed";

export const CANONICAL_ORDER_STATUSES: readonly CanonicalOrderStatus[] = [
  "ORDER_CREATED", "PAYMENT_CONFIRMED", "INVENTORY_RESERVED", "SELLER_NOTIFIED",
  "PROCESSING", "PACKED", "READY_TO_SHIP", "HANDED_OVER", "IN_TRANSIT",
  "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "RETURN_REQUESTED",
  "RETURNED", "REFUND_PENDING", "REFUNDED", "DELIVERY_FAILED",
];

/** Terminal statuses — no outgoing transitions (except return chain). */
export const TERMINAL_STATUSES: ReadonlySet<CanonicalOrderStatus> = new Set([
  "DELIVERED", "CANCELLED", "REFUNDED",
]);

/** Exception statuses (§1 exception states). */
export const EXCEPTION_STATUSES: ReadonlySet<CanonicalOrderStatus> = new Set([
  "CANCELLED", "RETURN_REQUESTED", "RETURNED", "REFUND_PENDING",
  "REFUNDED", "DELIVERY_FAILED",
]);

/**
 * Canonical transition table (§1 + exception flows).
 * Every allowed transition, keyed by source status.
 */
export const CANONICAL_TRANSITIONS: Readonly<
  Record<CanonicalOrderStatus, CanonicalOrderStatus[]>
> = {
  ORDER_CREATED:      ["PAYMENT_CONFIRMED", "CANCELLED"],
  PAYMENT_CONFIRMED:  ["INVENTORY_RESERVED", "CANCELLED"],
  INVENTORY_RESERVED: ["SELLER_NOTIFIED", "CANCELLED"],
  SELLER_NOTIFIED:    ["PROCESSING", "CANCELLED"],
  // PROCESSING→IN_TRANSIT is the LEGACY fast path ("shipped" jump):
  // pre-upgrade callers advance processing→shipped directly. Keep the
  // edge so the migration never bricks live traffic; the new canonical
  // flow still walks PACKED→READY_TO_SHIP→HANDED_OVER.
  PROCESSING:         ["PACKED", "CANCELLED", "IN_TRANSIT"],
  PACKED:             ["READY_TO_SHIP", "CANCELLED"],
  READY_TO_SHIP:      ["HANDED_OVER", "CANCELLED"],
  HANDED_OVER:        ["IN_TRANSIT", "DELIVERY_FAILED"],
  // IN_TRANSIT→DELIVERED is the LEGACY fast path ("delivered" jump
  // from "shipped") — same migration-safety rationale as above.
  IN_TRANSIT:         ["OUT_FOR_DELIVERY", "DELIVERY_FAILED", "DELIVERED"],
  OUT_FOR_DELIVERY:   ["DELIVERED", "DELIVERY_FAILED"],
  DELIVERED:          ["RETURN_REQUESTED"],
  DELIVERY_FAILED:    ["OUT_FOR_DELIVERY", "RETURNED", "REFUND_PENDING"],
  RETURN_REQUESTED:   ["RETURNED", "DELIVERED"], // rejected → back to delivered
  RETURNED:           ["REFUND_PENDING"],
  REFUND_PENDING:      ["REFUNDED"],
  REFUNDED:           [],
  CANCELLED:          [],
};

/**
 * LEGACY → CANONICAL migration map (§1: "existing statuses থাকলে
 * migration map তৈরি করবে"). Used by `normalizeOrderStatus` so
 * pre-upgrade orders keep flowing through the new machine.
 */
export const LEGACY_TO_CANONICAL: Readonly<
  Record<LegacyOrderStatus, CanonicalOrderStatus>
> = {
  pending:          "ORDER_CREATED",
  confirmed:        "PAYMENT_CONFIRMED",
  processing:       "PROCESSING",
  packed:           "PACKED",
  ready_to_ship:    "READY_TO_SHIP",
  handed_over:      "HANDED_OVER",
  shipped:          "IN_TRANSIT",
  in_transit:       "IN_TRANSIT",
  out_for_delivery: "OUT_FOR_DELIVERY",
  delivered:        "DELIVERED",
  cancelled:        "CANCELLED",
  return_requested: "RETURN_REQUESTED",
  returned:         "RETURNED",
  refund_pending:   "REFUND_PENDING",
  refunded:         "REFUNDED",
  delivery_failed:  "DELIVERY_FAILED",
};

/**
 * CANONICAL → LEGACY reverse map. Existing UI code (filters, badges,
 * tracking arrays) understands legacy values — `toLegacyStatus`
 * keeps every one of those code paths working without modification.
 */
export const CANONICAL_TO_LEGACY: Readonly<
  Record<CanonicalOrderStatus, LegacyOrderStatus>
> = {
  ORDER_CREATED:      "pending",
  PAYMENT_CONFIRMED:  "confirmed",
  INVENTORY_RESERVED: "confirmed",
  SELLER_NOTIFIED:    "confirmed",
  PROCESSING:         "processing",
  PACKED:             "packed",
  READY_TO_SHIP:      "ready_to_ship",
  HANDED_OVER:         "handed_over",
  IN_TRANSIT:         "shipped",
  OUT_FOR_DELIVERY:   "out_for_delivery",
  DELIVERED:          "delivered",
  CANCELLED:          "cancelled",
  RETURN_REQUESTED:   "return_requested",
  RETURNED:           "returned",
  REFUND_PENDING:     "refund_pending",
  REFUNDED:           "refunded",
  DELIVERY_FAILED:    "delivery_failed",
};

/**
 * Normalize any stored status (legacy or canonical) into the
 * canonical machine value. Unknown values map to ORDER_CREATED
 * (fail-safe default; rules prevent unknown values being written).
 */
export function normalizeOrderStatus(raw: string): CanonicalOrderStatus {
  if ((CANONICAL_ORDER_STATUSES as readonly string[]).includes(raw)) {
    return raw as CanonicalOrderStatus;
  }
  const migrated = (LEGACY_TO_CANONICAL as Record<string, CanonicalOrderStatus>)[raw];
  return migrated ?? "ORDER_CREATED";
}

/** Map a canonical status to its legacy display equivalent. */
export function toLegacyStatus(status: CanonicalOrderStatus): LegacyOrderStatus {
  return CANONICAL_TO_LEGACY[status];
}

/** True when the canonical status is terminal. */
export function isCanonicalTerminal(status: CanonicalOrderStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/** True when the canonical status is an exception state. */
export function isExceptionStatus(status: CanonicalOrderStatus): boolean {
  return EXCEPTION_STATUSES.has(status);
}

/**
 * Validate a transition between ANY two stored statuses
 * (legacy or canonical — both are normalized first).
 *
 * A no-op (same status) is allowed: idempotent event replay must
 * never be rejected by the validator (§7 idempotency requirement).
 */
export function isValidCanonicalTransition(
  fromRaw: string,
  toRaw: string,
): boolean {
  const from = normalizeOrderStatus(fromRaw);
  const to = normalizeOrderStatus(toRaw);
  if (from === to) return true; // idempotent no-op
  return CANONICAL_TRANSITIONS[from].includes(to);
}

/** Human-readable reason a transition is invalid (for logs/UI). */
export function invalidTransitionReason(
  fromRaw: string,
  toRaw: string,
): string | null {
  if (isValidCanonicalTransition(fromRaw, toRaw)) return null;
  const from = normalizeOrderStatus(fromRaw);
  const to = normalizeOrderStatus(toRaw);
  if (TERMINAL_STATUSES.has(from) && from !== "DELIVERED") {
    return `Order is ${from} (terminal) — no further transitions allowed.`;
  }
  const allowed = CANONICAL_TRANSITIONS[from];
  return `Invalid transition ${from} → ${to}. Allowed: ${allowed.join(", ") || "(none)"}.`;
}

/**
 * Human-readable labels for UI display.
 */
export const ORDER_STATUS_LABELS: Readonly<
  Record<CanonicalOrderStatus, string>
> = {
  ORDER_CREATED:      "Order Placed",
  PAYMENT_CONFIRMED:  "Payment Confirmed",
  INVENTORY_RESERVED: "Stock Reserved",
  SELLER_NOTIFIED:    "Seller Notified",
  PROCESSING:         "Processing",
  PACKED:             "Packed",
  READY_TO_SHIP:      "Ready to Ship",
  HANDED_OVER:         "Handed to Courier",
  IN_TRANSIT:         "In Transit",
  OUT_FOR_DELIVERY:   "Out for Delivery",
  DELIVERED:          "Delivered",
  CANCELLED:          "Cancelled",
  RETURN_REQUESTED:   "Return Requested",
  RETURNED:           "Returned",
  REFUND_PENDING:     "Refund Pending",
  REFUNDED:           "Refunded",
  DELIVERY_FAILED:    "Delivery Failed",
};

/** Display label for any stored status (legacy or canonical). */
export function orderStatusLabel(raw: string): string {
  return ORDER_STATUS_LABELS[normalizeOrderStatus(raw)];
}

// ═══════════════════════════════════════════════════════════════
// Order events (§7 — event-driven architecture)
// ═══════════════════════════════════════════════════════════════

/** Major state-transition events emitted to the workflow processor. */
export type OrderEventType =
  | "ORDER_CREATED"
  | "PAYMENT_CONFIRMED"
  | "INVENTORY_RESERVED"
  | "SELLER_NOTIFIED"
  | "PROCESSING"
  | "PACKED"
  | "READY_TO_SHIP"
  | "HANDED_OVER"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED"
  | "RETURN_REQUESTED"
  | "RETURNED"
  | "REFUND_PENDING"
  | "REFUNDED"
  | "DELIVERY_FAILED";

export const ORDER_EVENT_TYPES: readonly OrderEventType[] = [
  ...CANONICAL_ORDER_STATUSES,
];

/** Workflow handler ids (§7 fan-out). */
export const ORDER_WORKFLOW_HANDLERS = [
  "inventory",
  "notifySeller",
  "notifyAdmin",
  "notifyCustomer",
  "shipment",
  "finance",
  "audit",
] as const;
export type OrderWorkflowHandler = (typeof ORDER_WORKFLOW_HANDLERS)[number];

/** Which handlers each event fans out to (§7). */
export const EVENT_HANDLER_MAP: Readonly<
  Record<OrderEventType, readonly OrderWorkflowHandler[]>
> = {
  ORDER_CREATED:      ["finance", "audit"], // Prompt 04: ledger-first settlement creation
  PAYMENT_CONFIRMED:  ["notifyCustomer", "audit"],
  INVENTORY_RESERVED: ["audit"],
  SELLER_NOTIFIED:    ["notifySeller", "notifyAdmin", "audit"],
  PROCESSING:         ["audit"],
  PACKED:             ["audit"],
  READY_TO_SHIP:      ["shipment", "notifyCustomer", "audit"],
  HANDED_OVER:         ["shipment", "audit"],
  IN_TRANSIT:         ["shipment", "notifyCustomer", "audit"],
  OUT_FOR_DELIVERY:   ["shipment", "notifyCustomer", "audit"],
  DELIVERED:          ["shipment", "inventory", "finance", "notifyCustomer", "audit"],
  CANCELLED:          ["inventory", "finance", "notifySeller", "notifyCustomer", "audit"],
  RETURN_REQUESTED:   ["notifySeller", "notifyAdmin", "audit"],
  RETURNED:           ["inventory", "finance", "audit"],
  REFUND_PENDING:     ["finance", "notifyCustomer", "audit"],
  REFUNDED:           ["finance", "notifyCustomer", "audit"], // Prompt 04: refund reversal
  DELIVERY_FAILED:    ["shipment", "notifySeller", "notifyAdmin", "audit"],
};

// ═══════════════════════════════════════════════════════════════
// Tracking events (§6 — logistics milestones)
// ═══════════════════════════════════════════════════════════════

export type TrackingEventType =
  | "PICKED_UP"
  | "HANDED_OVER"
  | "IN_TRANSIT"
  | "ARRIVED_AT_HUB"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "FAILED"
  | "RETURNED";

export const TRACKING_EVENT_TYPES: readonly TrackingEventType[] = [
  "PICKED_UP", "HANDED_OVER", "IN_TRANSIT", "ARRIVED_AT_HUB",
  "OUT_FOR_DELIVERY", "DELIVERED", "FAILED", "RETURNED",
];

/**
 * Visibility of a tracking event (§6: "Internal logistics
 * information unnecessarily expose করা যাবে না").
 *  - customer: visible to customer, seller, and admins
 *  - seller:   visible to seller and admins only
 *  - internal: admins only
 */
export type TrackingVisibility = "customer" | "seller" | "internal";

/** Default visibility per tracking event type. */
export const TRACKING_EVENT_VISIBILITY: Readonly<
  Record<TrackingEventType, TrackingVisibility>
> = {
  PICKED_UP: "customer",
  HANDED_OVER: "customer",
  IN_TRANSIT: "customer",
  ARRIVED_AT_HUB: "internal", // hub internals are not customer-facing
  OUT_FOR_DELIVERY: "customer",
  DELIVERED: "customer",
  FAILED: "seller",
  RETURNED: "seller",
};
