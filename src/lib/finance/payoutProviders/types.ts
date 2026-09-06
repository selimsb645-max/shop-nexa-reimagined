/**
 * AVENTA SHOP — Payout Provider Interface (Prompt 04 §7)
 *
 *   Settlement Engine → Payout Provider Interface → Provider Adapter
 *
 * Providers are swappable via the registry. MO is the MOCK provider
 * used ONLY for development/testing — it is refused in production
 * unless financeConfig.mockPayoutEnabled is EXPLICITLY true.
 */

export type PayoutRequest = {
  payoutId: string;
  batchId: string;
  sellerId: string;
  /** Integer minor units (paisa). Providers must never do float math. */
  amountMinor: number;
  currency: "BDT";
  /** Deterministic idempotency reference — providers MUST treat a
   * repeated payoutReference as the SAME payout, never a second transfer. */
  payoutReference: string;
};

export type PayoutExecutionResult = {
  status: "SUBMITTED" | "FAILED";
  /** Provider-side reference for status polling. */
  providerRef: string;
  /** Human-readable detail for the audit trail (no secrets). */
  detail: string;
};

export type PayoutPollResult = {
  status: "SUBMITTED" | "COMPLETED" | "FAILED";
  detail: string;
};

export interface PayoutProvider {
  readonly id: string;
  /** Human-readable name for admin UI + audit logs. */
  readonly label: string;
  /** true for MOCK/dev providers — blocked in production mode. */
  readonly isMock: boolean;
  executePayout(req: PayoutRequest): Promise<PayoutExecutionResult>;
  pollPayout(providerRef: string): Promise<PayoutPollResult>;
}
