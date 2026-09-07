/**
 * AVENTA SHOP — Canonical Finance Rail Mode (Sep 7, 2026)
 *
 * Seller Finance v2 (`sellerLedger` + `sellerFinance` + `settlements`) is the
 * ONLY canonical seller-money rail. The legacy rail (settlement.server.ts →
 * `sellers/{uid}/walletTx` + `settlementTx`) is being retired in stages:
 *
 *   STAGE 1 (current, this flag):
 *     - NEW legacy withdrawals are FROZEN (sellers withdraw via the v2
 *       wallet, `requestWalletWithdrawal`).
 *     - In-flight legacy withdrawals (docs already in "pending") may still
 *       be RESOLVED by an admin (approve/reject) — otherwise money would be
 *       stuck. Resolution can never create new money movement of its own
 *       beyond settling an existing hold.
 *     - Legacy earnings releases continue ONLY for orders the v2 engine
 *       has NOT covered (pre-v2 history); v2-covered orders are skipped so
 *       an order can never be credited on BOTH rails.
 *     - Refund reversals keep their status-conditional behavior (they only
 *       debit the legacy wallet for earnings the legacy rail actually
 *       credited).
 *
 *   STAGE 2 (after reconciliation is clean + in-flight withdrawals are
 *     resolved — flip LEGACY_RESOLUTION_FROZEN):
 *     - Legacy approve/reject is refused; nothing on the legacy rail can
 *       move money anymore. Legacy docs stay frozen, retained, auditable.
 *
 * Changing these flags is a deliberate, owner-approved step recorded in
 * docs/finance-v2-canonical-rail.md. Never flip them inside application
 * logic; tests lock both stages' behavior.
 */

export const LEGACY_WITHDRAWALS_FROZEN = true as const;
export const LEGACY_RESOLUTION_FROZEN = false as const;

/** Machine-readable freeze error, localized by the calling UI. */
export const LEGACY_FROZEN_ERROR_CODE = "finance/legacy-rail-frozen" as const;

export function legacyWithdrawalsFrozenError(): Error {
  return new Error(
    `${LEGACY_FROZEN_ERROR_CODE}: legacy withdrawals are frozen — seller withdrawals now run on the v2 wallet (requestWalletWithdrawal). In-flight legacy requests are resolved by a finance admin.`,
  );
}

export function legacyResolutionFrozenError(): Error {
  return new Error(
    `${LEGACY_FROZEN_ERROR_CODE}: legacy withdrawal resolution is frozen — all legacy in-flight requests were resolved before stage 2. Use the v2 wallet console.`,
  );
}

/**
 * True when a withdrawal doc is v2-shaped (integer-minor money). The two
 * rails share the `sellers/{uid}/withdrawals` collection, so every reader
 * must classify docs before touching them.
 */
export function isV2WithdrawalDoc(data: Record<string, unknown>): boolean {
  return data["amountMinor"] !== undefined && data["amountMinor"] !== null;
}
