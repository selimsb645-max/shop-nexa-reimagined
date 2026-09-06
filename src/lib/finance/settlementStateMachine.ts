/**
 * AVENTA SHOP — Settlement State Machine (Prompt 04 §4)
 *
 * Happy path:
 *   PENDING → DELIVERED → RETURN_WINDOW → ELIGIBLE → SETTLEMENT_BATCH
 *           → PROCESSING → PAID
 *
 * Exception states (enterable from pre-PAID states, some terminal):
 *   ON_HOLD       — admin flagged / risk review (re-enter happy path)
 *   DISPUTED      — chargeback or dispute in progress
 *   REFUND_PENDING — refund requested after delivery
 *   REVERSED      — order refunded/cancelled: settlement cancelled,
 *                   ledger compensated (terminal)
 *   FAILED        — payout execution failed (retryable → PROCESSING,
 *                   or → REVERSED after compensation)
 *
 * Same design guarantees as orderStateMachine.ts (Prompt 03 §1):
 * idempotent no-ops allowed, everything else validated, single source
 * of truth mirrored 1:1 in Firestore rules via concat edge keys.
 */

export const SETTLEMENT_STATES = [
  "PENDING",
  "DELIVERED",
  "RETURN_WINDOW",
  "ELIGIBLE",
  "SETTLEMENT_BATCH",
  "PROCESSING",
  "PAID",
  "ON_HOLD",
  "DISPUTED",
  "REFUND_PENDING",
  "FAILED",
  "REVERSED",
] as const;

export type SettlementState = (typeof SETTLEMENT_STATES)[number];

export function isSettlementState(s: string): s is SettlementState {
  return (SETTLEMENT_STATES as readonly string[]).includes(s);
}

export const SETTLEMENT_TRANSITIONS: Record<SettlementState, readonly SettlementState[]> = {
  PENDING: ["DELIVERED", "REVERSED", "ON_HOLD", "REFUND_PENDING"],
  DELIVERED: ["RETURN_WINDOW", "REFUND_PENDING", "DISPUTED", "ON_HOLD", "REVERSED"],
  RETURN_WINDOW: ["ELIGIBLE", "REFUND_PENDING", "DISPUTED", "ON_HOLD", "REVERSED"],
  // ELIGIBLE enters the batch lifecycle:
  ELIGIBLE: ["SETTLEMENT_BATCH", "REFUND_PENDING", "DISPUTED", "ON_HOLD", "REVERSED"],
  SETTLEMENT_BATCH: ["PROCESSING", "FAILED", "REFUND_PENDING", "DISPUTED", "ON_HOLD", "REVERSED"],
  PROCESSING: ["PAID", "FAILED", "DISPUTED", "REVERSED"],
  PAID: [], // terminal
  ON_HOLD: ["PENDING", "DELIVERED", "RETURN_WINDOW", "ELIGIBLE", "REVERSED"],
  DISPUTED: ["ON_HOLD", "REVERSED", "REFUND_PENDING"],
  REFUND_PENDING: ["REVERSED", "ON_HOLD", "RETURN_WINDOW", "ELIGIBLE"],
  FAILED: ["PROCESSING", "REVERSED"], // retry payout or compensate
  REVERSED: [], // terminal
};

export function isValidSettlementTransition(from: SettlementState, to: SettlementState): boolean {
  if (from === to) return true; // idempotent no-op (event replay)
  const allowed = SETTLEMENT_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/** States from which a settlement may be pulled into a batch. */
export const BATCH_ELIGIBLE_STATE: SettlementState = "ELIGIBLE";

export function isTerminalSettlementState(s: SettlementState): boolean {
  return SETTLEMENT_TRANSITIONS[s]?.length === 0;
}
