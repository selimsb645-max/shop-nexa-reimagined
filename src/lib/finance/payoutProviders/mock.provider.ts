/**
 * AVENTA SHOP — MOCK Payout Provider (Prompt 04 §7)
 *
 * Development/testing ONLY. In production mode the registry refuses
 * to hand out this provider unless financeConfig.mockPayoutEnabled
 * is explicitly true — a fake payout can NEVER hit real money flows.
 *
 * Deterministic behaviour for tests:
 *  - sellers whose id ends in "_fail" get a simulated failure
 *    (for failed-payout and reversal tests).
 *  - everything else submits successfully with a stable providerRef.
 */

import type { PayoutProvider, PayoutRequest, PayoutExecutionResult, PayoutPollResult } from "./types";

export const MOCK_PAYOUT_PROVIDER: PayoutProvider = {
  id: "MOCK",
  label: "Mock Payout Provider (dev/test)",
  isMock: true,
  async executePayout(req: PayoutRequest): Promise<PayoutExecutionResult> {
    if (!Number.isSafeInteger(req.amountMinor) || req.amountMinor <= 0) {
      return {
        status: "FAILED",
        providerRef: `mock_${req.payoutReference}_invalid`,
        detail: `invalid amount ${req.amountMinor}`,
      };
    }
    // Deterministic test hook: sellers whose id ends in "_fail" get a
    // simulated provider failure (for §12 failed-payout tests).
    if (req.sellerId.endsWith("_fail")) {
      return {
        status: "FAILED",
        providerRef: `mock_${req.payoutReference}_failed`,
        detail: "MOCK provider simulated payout failure (sellerId test hook)",
      };
    }
    return {
      status: "SUBMITTED",
      providerRef: `mock_${req.payoutReference}`,
      detail: `MOCK payout submitted: ${req.amountMinor} paisa to seller ${req.sellerId}`,
    };
  },
  async pollPayout(providerRef: string): Promise<PayoutPollResult> {
    if (providerRef.includes("_failed") || providerRef.includes("_invalid")) {
      return { status: "FAILED", detail: "MOCK payout failed" };
    }
    return { status: "COMPLETED", detail: "MOCK payout completed" };
  },
};
