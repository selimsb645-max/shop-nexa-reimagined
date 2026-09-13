/**
 * Centralized Currency Service for AVENTA SHOP.
 *
 * - Base currency: BDT (Bangladeshi Taka) — all product prices stored in BDT.
 * - Supports real-time conversion to USD via free exchange rate API.
 * - Caches rate in localStorage with 1-hour TTL to avoid excessive API calls.
 * - Falls back to a reasonable cached/last-known rate if API is unreachable.
 *
 * Usage:
 *   import { formatCurrency, convertCurrency, useCurrencyFormat } from "@/services/currency";
 *   formatCurrency(priceBDT, preferredCurrency)  // e.g. "৳1,234" or "$14.56"
 *   convertCurrency(1000, "BDT", "USD")          // e.g. 11.76
 */

export type Currency = "BDT" | "USD";

export const CURRENCY_META: Record<Currency, { symbol: string; code: string; label: string }> = {
  BDT: { symbol: "৳", code: "BDT", label: "Bangladeshi Taka" },
  USD: { symbol: "$", code: "USD", label: "US Dollar" },
};

const CACHE_KEY = "shopnexa_exchange_rates";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const FALLBACK_RATE_USD_TO_BDT = 117; // Conservative fallback if API unreachable

interface ExchangeRateCache {
  base: string;
  rates: Record<string, number>;
  fetchedAt: number;
}

/**
 * Fetches real exchange rates from the free exchangerate.host API.
 * Returns USD→BDT conversion rate.
 * Caches in localStorage for CACHE_TTL_MS.
 */
async function fetchExchangeRate(): Promise<number> {
  // Check cache first
  if (typeof window !== "undefined") {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const data: ExchangeRateCache = JSON.parse(cached);
        if (Date.now() - data.fetchedAt < CACHE_TTL_MS && data.rates?.BDT) {
          return data.rates.BDT;
        }
      }
    } catch {
      // ignore cache parse errors
    }
  }

  // Fetch fresh rate
  try {
    const res = await fetch("https://api.exchangerate.host/latest?base=USD&symbols=BDT");
    if (!res.ok) throw new Error("Exchange rate API returned non-200");
    const data = await res.json();
    const rate = data?.rates?.BDT;
    if (typeof rate !== "number" || rate <= 0) throw new Error("Invalid rate from API");

    // Cache it
    if (typeof window !== "undefined") {
      try {
        const cache: ExchangeRateCache = {
          base: "USD",
          rates: { BDT: rate },
          fetchedAt: Date.now(),
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      } catch {
        // ignore localStorage errors
      }
    }

    return rate;
  } catch {
    // Try to use stale cache even if expired
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const data: ExchangeRateCache = JSON.parse(cached);
          if (data.rates?.BDT) return data.rates.BDT;
        }
      } catch {
        // ignore
      }
    }
    // Last resort: fallback rate
    return FALLBACK_RATE_USD_TO_BDT;
  }
}

let cachedUsdToBdt: number | null = null;
let fetchPromise: Promise<number> | null = null;

/**
 * Initializes or refreshes the exchange rate. Called once on app load.
 * Safe to call multiple times — deduplicates concurrent fetches.
 */
export async function initExchangeRate(): Promise<void> {
  if (cachedUsdToBdt !== null) return;
  if (fetchPromise) {
    await fetchPromise;
    return;
  }
  fetchPromise = fetchExchangeRate()
    .then((rate) => {
      cachedUsdToBdt = rate;
      fetchPromise = null;
      return rate;
    })
    .catch(() => {
      cachedUsdToBdt = FALLBACK_RATE_USD_TO_BDT;
      fetchPromise = null;
      return FALLBACK_RATE_USD_TO_BDT;
    });
  await fetchPromise;
}

/**
 * Returns the current USD→BDT rate (cached in memory after init).
 */
export function getUsdToBdtRate(): number {
  return cachedUsdToBdt ?? FALLBACK_RATE_USD_TO_BDT;
}

/**
 * Converts an amount from one currency to another.
 * Base currency is always BDT (all product prices stored in BDT).
 *
 * @param amount - The monetary amount to convert
 * @param from - Source currency
 * @param to - Target currency
 * @returns Converted amount in target currency
 */
export function convertCurrency(amount: number, from: Currency, to: Currency): number {
  if (from === to) return amount;

  const usdToBdt = getUsdToBdtRate();

  // Convert to BDT first (base currency)
  let amountInBdt: number;
  if (from === "BDT") {
    amountInBdt = amount;
  } else {
    amountInBdt = amount * usdToBdt;
  }

  // Convert from BDT to target
  if (to === "BDT") return amountInBdt;
  return amountInBdt / usdToBdt;
}

/**
 * Formats a monetary amount in the user's preferred currency.
 * Always converts from BDT (base storage currency) to the display currency.
 *
 * @param amountInBdt - The amount in BDT (as stored in database)
 * @param displayCurrency - The user's preferred display currency
 * @returns Formatted string, e.g. "৳1,234" or "$14.56"
 */
export function formatCurrency(amountInBdt: number, displayCurrency: Currency = "BDT"): string {
  if (displayCurrency === "BDT") {
    const formatted = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amountInBdt);
    return `৳${formatted}`;
  }

  // Convert BDT → USD
  const usdAmount = convertCurrency(amountInBdt, "BDT", "USD");
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(usdAmount);
}

/**
 * Formats a currency amount with its symbol only (no conversion).
 * Useful when you already have the amount in the target currency.
 */
export function formatCurrencySymbol(amount: number, currency: Currency = "BDT"): string {
  if (currency === "BDT") {
    const formatted = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
    return `৳${formatted}`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
