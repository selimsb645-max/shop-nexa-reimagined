// ═══════════════════════════════════════════════════════════════
// Logistics Provider Registry (Prompt 03 §5)
// ═══════════════════════════════════════════════════════════════
// Add a provider by calling registerProvider() — no order/workflow
// code changes. The default in-house provider ("aventa-logistics")
// manages shipments internally (Firestore-backed).
// ═══════════════════════════════════════════════════════════════

import type { LogisticsProvider } from "./types";
import { LogisticsError } from "./types";

const registry = new Map<string, LogisticsProvider>();

export function registerProvider(provider: LogisticsProvider): void {
  registry.set(provider.key, provider);
}

export function getProvider(key: string): LogisticsProvider {
  const provider = registry.get(key);
  if (!provider) {
    throw new LogisticsError(
      `Unknown logistics provider "${key}" — register it before use.`,
      "PROVIDER_NOT_FOUND",
    );
  }
  return provider;
}

export function listProviderKeys(): string[] {
  return Array.from(registry.keys());
}
