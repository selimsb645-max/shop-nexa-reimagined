/**
 * Tests for Aventa Shop Smart Order Tracking System (Phase 1)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  generateTrackingId,
  isValidTransition,
  getNextValidStatuses,
  canCancel,
  isTerminalStatus,
  canDeliveryAgentSet,
  computeExpectedDelivery,
  getFlowIndex,
  FULFILLMENT_FLOW,
} from "../tracking-utils";
import type { TrackingOrderStatus } from "@/types/tracking";

// ====================================================================
// 1. TRACKING ID GENERATION
// ====================================================================

describe("Tracking ID generation", () => {
  it("should generate SNX-XXXXXXXX format", () => {
    const id = generateTrackingId();
    expect(id).toMatch(/^SNX-[A-Z0-9]{8}$/);
  });

  it("should generate unique IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(generateTrackingId());
    }
    expect(ids.size).toBe(1000);
  });

  it("should not use ambiguous characters (0, O, 1, I, L)", () => {
    for (let i = 0; i < 100; i++) {
      const id = generateTrackingId();
      const chars = id.replace("SNX-", "");
      expect(chars).not.toMatch(/[0O1IL]/);
    }
  });
});

// ====================================================================
// 2. STATUS TRANSITIONS
// ====================================================================

describe("Status transitions", () => {
  it("should allow PLACED → CONFIRMED", () => {
    expect(isValidTransition("pending", "confirmed")).toBe(true);
  });

  it("should allow CONFIRMED → PROCESSING", () => {
    expect(isValidTransition("confirmed", "processing")).toBe(true);
  });

  it("should allow PROCESSING → PACKED", () => {
    expect(isValidTransition("processing", "packed")).toBe(true);
  });

  it("should allow PACKED → SHIPPED", () => {
    expect(isValidTransition("packed", "shipped")).toBe(true);
  });

  it("should allow SHIPPED → OUT_FOR_DELIVERY", () => {
    expect(isValidTransition("shipped", "out_for_delivery")).toBe(true);
  });

  it("should allow OUT_FOR_DELIVERY → DELIVERED", () => {
    expect(isValidTransition("out_for_delivery", "delivered")).toBe(true);
  });
});

// ====================================================================
// 3. INVALID STATUS TRANSITIONS
// ====================================================================

describe("Invalid status transitions", () => {
  it("should reject PLACED → SHIPPED (jump)", () => {
    expect(isValidTransition("pending", "shipped")).toBe(false);
  });

  it("should reject PLACED → DELIVERED (jump)", () => {
    expect(isValidTransition("pending", "delivered")).toBe(false);
  });

  it("should reject CONFIRMED → DELIVERED (jump)", () => {
    expect(isValidTransition("confirmed", "delivered")).toBe(false);
  });

  it("should reject PROCESSING → DELIVERED (jump)", () => {
    expect(isValidTransition("processing", "delivered")).toBe(false);
  });

  it("should reject DELIVERED → SHIPPED (backwards)", () => {
    expect(isValidTransition("delivered", "shipped")).toBe(false);
  });

  it("should reject CANCELLED → CONFIRMED (terminal)", () => {
    expect(isValidTransition("cancelled", "confirmed")).toBe(false);
  });

  it("should reject same status", () => {
    expect(isValidTransition("confirmed", "confirmed")).toBe(false);
  });

  it("should reject PACKED → OUT_FOR_DELIVERY (skip shipped)", () => {
    expect(isValidTransition("packed", "out_for_delivery")).toBe(false);
  });
});

// ====================================================================
// 4. CANCELLATION FLOWS
// ====================================================================

describe("Cancellation flows", () => {
  it("should allow cancelling from PLACED", () => {
    expect(canCancel("pending")).toBe(true);
    expect(isValidTransition("pending", "cancelled")).toBe(true);
  });

  it("should allow cancelling from CONFIRMED", () => {
    expect(canCancel("confirmed")).toBe(true);
  });

  it("should allow cancelling from SHIPPED", () => {
    expect(canCancel("shipped")).toBe(true);
  });

  it("should allow cancelling from OUT_FOR_DELIVERY", () => {
    expect(canCancel("out_for_delivery")).toBe(true);
  });

  it("should NOT allow cancelling from DELIVERED", () => {
    expect(canCancel("delivered")).toBe(false);
    expect(isValidTransition("delivered", "cancelled")).toBe(false);
  });

  it("should NOT allow cancelling from CANCELLED", () => {
    expect(canCancel("cancelled")).toBe(false);
  });
});

// ====================================================================
// 5. RETURN FLOWS
// ====================================================================

describe("Return flows", () => {
  it("should allow DELIVERED → RETURN_REQUESTED", () => {
    expect(isValidTransition("delivered", "return_requested")).toBe(true);
  });

  it("should allow RETURN_REQUESTED → RETURNED", () => {
    expect(isValidTransition("return_requested", "returned")).toBe(true);
  });

  it("should allow RETURN_REQUESTED → CANCELLED", () => {
    expect(isValidTransition("return_requested", "cancelled")).toBe(true);
  });

  it("should NOT allow RETURNED → anything", () => {
    expect(isTerminalStatus("returned")).toBe(true);
  });
});

// ====================================================================
// 6. NEXT VALID STATUSES
// ====================================================================

describe("getNextValidStatuses", () => {
  it("should return correct next statuses for PLACED", () => {
    const next = getNextValidStatuses("pending");
    expect(next).toContain("confirmed");
    expect(next).toContain("cancelled");
    expect(next.length).toBe(2);
  });

  it("should return correct next statuses for SHIPPED", () => {
    const next = getNextValidStatuses("shipped");
    expect(next).toContain("out_for_delivery");
    expect(next).toContain("delivered");
    expect(next).toContain("cancelled");
  });

  it("should return empty for CANCELLED (terminal)", () => {
    expect(getNextValidStatuses("cancelled")).toEqual([]);
  });

  it("should return empty for RETURNED (terminal)", () => {
    expect(getNextValidStatuses("returned")).toEqual([]);
  });
});

// ====================================================================
// 7. DELIVERY AGENT AUTHORIZATION
// ====================================================================

describe("Delivery agent authorization", () => {
  it("should allow agent SHIPPED → OUT_FOR_DELIVERY", () => {
    expect(canDeliveryAgentSet("shipped", "out_for_delivery")).toBe(true);
  });

  it("should allow agent OUT_FOR_DELIVERY → DELIVERED", () => {
    expect(canDeliveryAgentSet("out_for_delivery", "delivered")).toBe(true);
  });

  it("should NOT allow agent PLACED → CONFIRMED", () => {
    expect(canDeliveryAgentSet("pending", "confirmed")).toBe(false);
  });

  it("should NOT allow agent PROCESSING → PACKED", () => {
    expect(canDeliveryAgentSet("processing", "packed")).toBe(false);
  });

  it("should NOT allow agent DELIVERED → OUT_FOR_DELIVERY", () => {
    expect(canDeliveryAgentSet("delivered", "out_for_delivery")).toBe(false);
  });

  it("should NOT allow agent to cancel", () => {
    expect(canDeliveryAgentSet("shipped", "cancelled")).toBe(false);
  });
});

// ====================================================================
// 8. EXPECTED DELIVERY COMPUTATION
// ====================================================================

describe("computeExpectedDelivery", () => {
  it("should compute 7 days for pending", () => {
    const now = 1700000000000;
    const result = computeExpectedDelivery("pending", now);
    expect(result).toBe(now + 7 * 24 * 60 * 60 * 1000);
  });

  it("should compute 3 days for shipped", () => {
    const now = 1700000000000;
    const result = computeExpectedDelivery("shipped", now);
    expect(result).toBe(now + 3 * 24 * 60 * 60 * 1000);
  });

  it("should compute 1 day for out_for_delivery", () => {
    const now = 1700000000000;
    const result = computeExpectedDelivery("out_for_delivery", now);
    expect(result).toBe(now + 1 * 24 * 60 * 60 * 1000);
  });

  it("should compute 0 days for delivered", () => {
    const now = 1700000000000;
    const result = computeExpectedDelivery("delivered", now);
    expect(result).toBe(now);
  });
});

// ====================================================================
// 9. FLOW INDEX
// ====================================================================

describe("getFlowIndex", () => {
  it("should return 0 for pending", () => {
    expect(getFlowIndex("pending")).toBe(0);
  });

  it("should return 6 for delivered", () => {
    expect(getFlowIndex("delivered")).toBe(6);
  });

  it("should return -1 for cancelled", () => {
    expect(getFlowIndex("cancelled")).toBe(-1);
  });

  it("should return -1 for return_requested", () => {
    expect(getFlowIndex("return_requested")).toBe(-1);
  });
});

// ====================================================================
// 10. FULFILLMENT FLOW ORDER
// ====================================================================

describe("FULFILLMENT_FLOW", () => {
  it("should have 7 steps", () => {
    expect(FULFILLMENT_FLOW.length).toBe(7);
  });

  it("should start with pending", () => {
    expect(FULFILLMENT_FLOW[0]).toBe("pending");
  });

  it("should end with delivered", () => {
    expect(FULFILLMENT_FLOW[6]).toBe("delivered");
  });

  it("should have packed between processing and shipped", () => {
    expect(FULFILLMENT_FLOW[2]).toBe("processing");
    expect(FULFILLMENT_FLOW[3]).toBe("packed");
    expect(FULFILLMENT_FLOW[4]).toBe("shipped");
  });
});

// ====================================================================
// 11. TERMINAL STATUS CHECK
// ====================================================================

describe("isTerminalStatus", () => {
  it("should identify cancelled as terminal", () => {
    expect(isTerminalStatus("cancelled")).toBe(true);
  });

  it("should identify returned as terminal", () => {
    expect(isTerminalStatus("returned")).toBe(true);
  });

  it("should NOT identify delivered as terminal (can return)", () => {
    expect(isTerminalStatus("delivered")).toBe(false);
  });

  it("should NOT identify shipped as terminal", () => {
    expect(isTerminalStatus("shipped")).toBe(false);
  });
});

// ====================================================================
// 12. SENSITIVE DATA LEAKAGE PREVENTION
// ====================================================================

describe("Sensitive data prevention", () => {
  it("tracking ID should not contain sensitive patterns", () => {
    for (let i = 0; i < 100; i++) {
      const id = generateTrackingId();
      // Tracking ID should never look like an API key, token, or password
      expect(id).not.toMatch(/sk_|api|key|token|secret|password/i);
    }
  });

  it("tracking ID should be exactly 12 characters (SNX- + 8)", () => {
    const id = generateTrackingId();
    expect(id.length).toBe(12);
  });
});
