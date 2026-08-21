import { formatCurrency, type Currency } from "@/services/currency";

/**
 * Legacy formatPrice — now delegates to centralized formatCurrency.
 * Components that don't have access to the i18n context can still use this
 * with an explicit currency param. For reactive currency-aware formatting,
 * use the useCurrencyFormat() hook from @/i18n.
 *
 * @param v - Amount in BDT (base currency)
 * @param currency - Display currency (defaults to BDT)
 */
export function formatPrice(v: number, currency: Currency = "BDT"): string {
  return formatCurrency(v, currency);
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
