// ═══════════════════════════════════════════════════════════════
// Order State Machine tests (Implementation Prompt 03 §1, §10)
// ═══════════════════════════════════════════════════════════════
import { describe, expect, it } from "vitest";
import {
  CANONICAL_ORDER_STATUSES,
  CANONICAL_TRANSITIONS,
  EXCEPTION_STATUSES,
  EVENT_HANDLER_MAP,
  LEGACY_TO_CANONICAL,
  TERMINAL_STATUSES,
  TRACKING_EVENT_VISIBILITY,
  invalidTransitionReason,
  isCanonicalTerminal,
  isExceptionStatus,
  isValidCanonicalTransition,
  normalizeOrderStatus,
  orderStatusLabel,
  toLegacyStatus,
} from "../orderStateMachine";

describe("§1 state machine — primary flow", () => {
  it("walks the full happy path ORDER_CREATED → DELIVERED", () => {
    const happy = [
      "ORDER_CREATED",
      "PAYMENT_CONFIRMED",
      "INVENTORY_RESERVED",
      "SELLER_NOTIFIED",
      "PROCESSING",
      "PACKED",
      "READY_TO_SHIP",
      "HANDED_OVER",
      "IN_TRANSIT",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
    ];
    for (let i = 0; i < happy.length - 1; i++) {
      expect(isValidCanonicalTransition(happy[i], happy[i + 1])).toBe(true);
    }
  });

  it("rejects skipping steps in the primary flow", () => {
    expect(isValidCanonicalTransition("ORDER_CREATED", "DELIVERED")).toBe(false);
    expect(isValidCanonicalTransition("PAYMENT_CONFIRMED", "PACKED")).toBe(false);
    expect(isValidCanonicalTransition("SELLER_NOTIFIED", "IN_TRANSIT")).toBe(false);
  });

  it("rejects moving BACKWARD", () => {
    expect(isValidCanonicalTransition("PROCESSING", "PAYMENT_CONFIRMED")).toBe(false);
    expect(isValidCanonicalTransition("IN_TRANSIT", "PACKED")).toBe(false);
    expect(isValidCanonicalTransition("RETURNED", "OUT_FOR_DELIVERY")).toBe(false);
  });
});

describe("§1 state machine — exception states", () => {
  it("allows cancellation only before handover", () => {
    for (const from of [
      "ORDER_CREATED",
      "PAYMENT_CONFIRMED",
      "INVENTORY_RESERVED",
      "SELLER_NOTIFIED",
      "PROCESSING",
      "PACKED",
      "READY_TO_SHIP",
    ]) {
      expect(isValidCanonicalTransition(from, "CANCELLED"), from).toBe(true);
    }
    // After handover the parcel is with the courier — no silent cancel.
    for (const from of ["HANDED_OVER", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"]) {
      expect(isValidCanonicalTransition(from, "CANCELLED"), from).toBe(false);
    }
  });

  it("covers the return/refund chain", () => {
    expect(isValidCanonicalTransition("DELIVERED", "RETURN_REQUESTED")).toBe(true);
    expect(isValidCanonicalTransition("RETURN_REQUESTED", "RETURNED")).toBe(true);
    expect(isValidCanonicalTransition("RETURN_REQUESTED", "DELIVERED")).toBe(true); // rejected
    expect(isValidCanonicalTransition("RETURNED", "REFUND_PENDING")).toBe(true);
    expect(isValidCanonicalTransition("REFUND_PENDING", "REFUNDED")).toBe(true);
  });

  it("covers failed delivery with retry and return paths", () => {
    expect(isValidCanonicalTransition("IN_TRANSIT", "DELIVERY_FAILED")).toBe(true);
    expect(isValidCanonicalTransition("OUT_FOR_DELIVERY", "DELIVERY_FAILED")).toBe(true);
    expect(isValidCanonicalTransition("HANDED_OVER", "DELIVERY_FAILED")).toBe(true);
    expect(isValidCanonicalTransition("DELIVERY_FAILED", "OUT_FOR_DELIVERY")).toBe(true);
    expect(isValidCanonicalTransition("DELIVERY_FAILED", "RETURNED")).toBe(true);
    expect(isValidCanonicalTransition("DELIVERY_FAILED", "REFUND_PENDING")).toBe(true);
  });

  it("terminal states have no outgoing transitions (except DELIVERED→RETURN_REQUESTED)", () => {
    expect(isCanonicalTerminal("CANCELLED")).toBe(true);
    expect(isCanonicalTerminal("REFUNDED")).toBe(true);
    expect(CANONICAL_TRANSITIONS["CANCELLED"]).toEqual([]);
    expect(CANONICAL_TRANSITIONS["REFUNDED"]).toEqual([]);
  });

  it("flags all 6 exception statuses", () => {
    expect(EXCEPTION_STATUSES.size).toBe(6);
    for (const s of EXCEPTION_STATUSES) expect(isExceptionStatus(s)).toBe(true);
    expect(isExceptionStatus("PROCESSING")).toBe(false);
  });
});

describe("§1 migration map (legacy → canonical)", () => {
  it("migrates every legacy status to the expected canonical value", () => {
    expect(normalizeOrderStatus("pending")).toBe("ORDER_CREATED");
    expect(normalizeOrderStatus("confirmed")).toBe("PAYMENT_CONFIRMED");
    expect(normalizeOrderStatus("processing")).toBe("PROCESSING");
    expect(normalizeOrderStatus("shipped")).toBe("IN_TRANSIT");
    expect(normalizeOrderStatus("out_for_delivery")).toBe("OUT_FOR_DELIVERY");
    expect(normalizeOrderStatus("delivered")).toBe("DELIVERED");
    expect(normalizeOrderStatus("cancelled")).toBe("CANCELLED");
    expect(normalizeOrderStatus("returned")).toBe("RETURNED");
  });

  it("keeps canonical values as-is", () => {
    for (const s of CANONICAL_ORDER_STATUSES) {
      expect(normalizeOrderStatus(s)).toBe(s);
    }
  });

  it("legacy fast paths survive the migration (never brick live traffic)", () => {
    // Pre-upgrade callers jump processing→shipped and shipped→delivered:
    expect(isValidCanonicalTransition("processing", "shipped")).toBe(true);
    expect(isValidCanonicalTransition("shipped", "delivered")).toBe(true);
    expect(isValidCanonicalTransition("PROCESSING", "IN_TRANSIT")).toBe(true);
    expect(isValidCanonicalTransition("IN_TRANSIT", "DELIVERED")).toBe(true);
  });

  it("legacy orders can continue the NEW flow (normalized transitions)", () => {
    // A pre-upgrade order at legacy "processing" can advance into the
    // canonical machine:
    expect(isValidCanonicalTransition("processing", "PACKED")).toBe(true);
    expect(isValidCanonicalTransition("shipped", "OUT_FOR_DELIVERY")).toBe(true);
    expect(isValidCanonicalTransition("delivered", "RETURN_REQUESTED")).toBe(true);
  });

  it("reverse map covers every canonical status", () => {
    for (const s of CANONICAL_ORDER_STATUSES) {
      expect(typeof toLegacyStatus(s)).toBe("string");
    }
    // Round-trip: legacy values that existed pre-upgrade map back exactly.
    expect(toLegacyStatus("ORDER_CREATED")).toBe("pending");
    expect(toLegacyStatus("IN_TRANSIT")).toBe("shipped");
  });

  it("fail-safe default: unknown status normalizes to ORDER_CREATED", () => {
    expect(normalizeOrderStatus("garbage_status")).toBe("ORDER_CREATED");
  });

  it("every legacy status has a migration entry and a label", () => {
    expect(Object.keys(LEGACY_TO_CANONICAL).length).toBeGreaterThanOrEqual(16);
    for (const s of CANONICAL_ORDER_STATUSES) {
      expect(orderStatusLabel(s)).toBeTruthy();
    }
  });
});

describe("idempotency & no-op transitions (§7)", () => {
  it("same-status no-op is always allowed", () => {
    for (const s of CANONICAL_ORDER_STATUSES) {
      expect(isValidCanonicalTransition(s, s), s).toBe(true);
    }
  });

  it("invalid transition reason is human-readable", () => {
    expect(invalidTransitionReason("REFUNDED", "PROCESSING")).toMatch(/terminal/i);
    expect(invalidTransitionReason("PACKED", "DELIVERED")).toMatch(/Invalid transition/);
    expect(invalidTransitionReason("PACKED", "READY_TO_SHIP")).toBeNull();
  });
});

describe("§7 workflow fan-out map", () => {
  it("every event type has handlers", () => {
    for (const type of CANONICAL_ORDER_STATUSES) {
      expect(EVENT_HANDLER_MAP[type].length).toBeGreaterThan(0);
    }
  });

  it("critical events hit the critical branches", () => {
    expect(EVENT_HANDLER_MAP["SELLER_NOTIFIED"]).toContain("notifySeller");
    expect(EVENT_HANDLER_MAP["SELLER_NOTIFIED"]).toContain("notifyAdmin");
    expect(EVENT_HANDLER_MAP["READY_TO_SHIP"]).toContain("shipment");
    expect(EVENT_HANDLER_MAP["DELIVERED"]).toContain("inventory");
    expect(EVENT_HANDLER_MAP["DELIVERED"]).toContain("finance");
    expect(EVENT_HANDLER_MAP["CANCELLED"]).toContain("inventory");
    expect(EVENT_HANDLER_MAP["ORDER_CREATED"]).toContain("audit");
  });
});

describe("§6 tracking event visibility defaults", () => {
  it("internal hub events are never customer-visible", () => {
    expect(TRACKING_EVENT_VISIBILITY["ARRIVED_AT_HUB"]).toBe("internal");
  });

  it("customer-facing milestones default to customer visibility", () => {
    const customerMilestones = [
      "PICKED_UP",
      "HANDED_OVER",
      "IN_TRANSIT",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
    ] as const;
    for (const t of customerMilestones) {
      expect(TRACKING_EVENT_VISIBILITY[t]).toBe("customer");
    }
  });

  it("failure events are seller-visible but not customer-visible", () => {
    expect(TRACKING_EVENT_VISIBILITY["FAILED"]).toBe("seller");
    expect(TRACKING_EVENT_VISIBILITY["RETURNED"]).toBe("seller");
  });
});
