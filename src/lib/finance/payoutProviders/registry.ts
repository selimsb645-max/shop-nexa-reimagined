/**
 * AVENTA SHOP — Payout Provider Registry (Prompt 04 §7)
 *
 * The settlement engine asks the registry for the configured provider.
 * Swapping providers = adding an adapter + changing one config field —
 * no engine code changes.
 *
 * PRODUCTION GUARD: in production mode the MOCK provider is refused
 * unless financeConfig.mockPayoutEnabled === true (explicit opt-in
 * for load tests on staging). A fake payout must never be treated as
 * a real money transfer.
 */

import { MOCK_PAYOUT_PROVIDER } from "./mock.provider";
import type { PayoutProvider } from "./types";

const PROVIDERS: Record<string, PayoutProvider> = {
  [MOCK_PAYOUT_PROVIDER.id]: MOCK_PAYOUT_PROVIDER,
  // Future adapters register here: BKASH, NAGAD, BANK_BATCH, etc.
};

/**
 * Resolve the configured payout provider.
 *
 * @param providerId      financeConfig.payoutProvider (e.g. "MOCK")
 * @param productionMode  true when running against the production
 *                        Firebase project (any env without explicit
 *                        dev/test markers).
 * @param mockEnabled     financeConfig.mockPayoutEnabled — explicit
 *                        opt-in that survives even in production mode
 *                        (used for controlled load tests).
 */
export function resolvePayoutProvider(
  providerId: string,
  productionMode: boolean,
  mockEnabled: boolean,
): PayoutProvider {
  const provider = PROVIDERS[providerId];
  if (!provider) {
    throw new Error(`finance/payout: unknown payout provider "${providerId}"`);
  }
  if (provider.isMock && productionMode && !mockEnabled) {
    throw new Error(
      `finance/payout: provider "${providerId}" is a MOCK provider and is ` +
        `refused in production. Configure a real payout provider or set ` +
        `financeConfig.mockPayoutEnabled for a controlled test.`,
    );
  }
  return provider;
}

export function listPayoutProviders(): { id: string; label: string; isMock: boolean }[] {
  return Object.values(PROVIDERS).map((p) => ({ id: p.id, label: p.label, isMock: p.isMock }));
}
