/**
 * AVENTA SHOP — Prompt 04 §12 TESTS: Settlement state machine (§4).
 */

import { describe, it, expect } from "vitest";
import {
  SETTLEMENT_STATES, SETTLEMENT_TRANSITIONS, BATCH_ELIGIBLE_STATE,
  isValidSettlementTransition, isSettlementState, isTerminalSettlementState,
} from "../settlementStateMachine";
import type { SettlementState } from "../settlementStateMachine";

describe("settlement state machine (§4)", () => {
  it("happy path: PENDING → … → PAID is walkable in order", () => {
    const path: SettlementState[] = ["PENDING", "DELIVERED", "RETURN_WINDOW", "ELIGIBLE", "SETTLEMENT_BATCH", "PROCESSING", "PAID"];
    for (let i = 0; i < path.length - 1; i++) {
      expect(isValidSettlementTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  it("skipping steps is forbidden (e.g. PENDING → ELIGIBLE)", () => {
    expect(isValidSettlementTransition("PENDING", "ELIGIBLE")).toBe(false);
    expect(isValidSettlementTransition("PENDING", "PAID")).toBe(false);
    expect(isValidSettlementTransition("DELIVERED", "SETTLEMENT_BATCH")).toBe(false);
  });

  it("exception states are enterable from pre-PAID states", () => {
    expect(isValidSettlementTransition("PENDING", "ON_HOLD")).toBe(true);
    expect(isValidSettlementTransition("DELIVERED", "REFUND_PENDING")).toBe(true);
    expect(isValidSettlementTransition("RETURN_WINDOW", "DISPUTED")).toBe(true);
    expect(isValidSettlementTransition("ELIGIBLE", "REVERSED")).toBe(true);
    expect(isValidSettlementTransition("PROCESSING", "FAILED")).toBe(true);
  });

  it("ON_HOLD can resume the happy path or be reversed", () => {
    expect(isValidSettlementTransition("ON_HOLD", "ELIGIBLE")).toBe(true);
    expect(isValidSettlementTransition("ON_HOLD", "RETURN_WINDOW")).toBe(true);
    expect(isValidSettlementTransition("ON_HOLD", "REVERSED")).toBe(true);
    expect(isValidSettlementTransition("ON_HOLD", "PAID")).toBe(false);
  });

  it("FAILED retries to PROCESSING or is compensated to REVERSED", () => {
    expect(isValidSettlementTransition("FAILED", "PROCESSING")).toBe(true);
    expect(isValidSettlementTransition("FAILED", "REVERSED")).toBe(true);
    expect(isValidSettlementTransition("FAILED", "PAID")).toBe(false);
  });

  it("PAID and REVERSED are terminal (idempotent no-op allowed)", () => {
    expect(isTerminalSettlementState("PAID")).toBe(true);
    expect(isTerminalSettlementState("REVERSED")).toBe(true);
    expect(isValidSettlementTransition("PAID", "PAID")).toBe(true); // replay
    expect(isValidSettlementTransition("PAID", "REVERSED")).toBe(false);
    expect(isValidSettlementTransition("REVERSED", "ELIGIBLE")).toBe(false);
  });

  it("idempotent no-ops are allowed from every state", () => {
    for (const s of SETTLEMENT_STATES) {
      expect(isValidSettlementTransition(s, s)).toBe(true);
    }
  });

  it("every state in TRANSITIONS is a valid SettlementState and vice versa", () => {
    expect(Object.keys(SETTLEMENT_TRANSITIONS).sort()).toEqual([...SETTLEMENT_STATES].sort());
    for (const s of SETTLEMENT_STATES) expect(isSettlementState(s)).toBe(true);
    expect(isSettlementState("PAID_OUT")).toBe(false);
    expect(BATCH_ELIGIBLE_STATE).toBe("ELIGIBLE");
  });
});
