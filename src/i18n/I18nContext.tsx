import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Locale, TranslationKeys } from "./types";
import { en } from "./locales/en";
import { bn } from "./locales/bn";
import type { Currency } from "@/services/currency";
import { initExchangeRate, formatCurrency as formatCurrencyFn } from "@/services/currency";

/**
 * All available translation dictionaries.
 * To add a new language: import the locale file and add it here.
 */
const TRANSLATIONS: Record<Locale, TranslationKeys> = {
  en,
  bn,
};

// ---- Firestore settings sync (lazy import to avoid circular deps) ----

async function fetchSettingsFromFirestore(uid: string): Promise<{ language: Locale; currency: Currency } | null> {
  try {
    const { getCustomerSettings } = await import("@/services/firebase/customerSettings");
    const s = await getCustomerSettings(uid);
    return { language: s.language, currency: s.currency };
  } catch {
    return null;
  }
}

async function saveSettingsToFirestore(uid: string, patch: { language?: Locale; currency?: Currency }): Promise<void> {
  try {
    const { saveCustomerSettings } = await import("@/services/firebase/customerSettings");
    await saveCustomerSettings(uid, patch);
  } catch {
    // non-fatal
  }
}

// ---- localStorage keys ----
const LANG_KEY = "shopnexa_lang";
const CURRENCY_KEY = "shopnexa_currency";

function getStoredLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const stored = localStorage.getItem(LANG_KEY);
  return stored === "bn" ? "bn" : "en";
}

function getStoredCurrency(): Currency {
  if (typeof window === "undefined") return "BDT";
  const stored = localStorage.getItem(CURRENCY_KEY);
  return stored === "USD" ? "USD" : "BDT";
}

// ---- Context type ----
interface I18nContextValue {
  locale: Locale;
  currency: Currency;
  t: (key: keyof TranslationKeys, params?: Record<string, string | number>) => string;
  setLocale: (locale: Locale) => void;
  setCurrency: (currency: Currency) => void;
  /** Called from Settings page — updates both localStorage and Firestore */
  updatePreferences: (locale: Locale, currency: Currency) => Promise<void>;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function I18nProvider({ children, uid }: { children: ReactNode; uid?: string }) {
  const [locale, setLocaleState] = useState<Locale>(getStoredLocale);
  const [currency, setCurrencyState] = useState<Currency>(getStoredCurrency);

  // Initialize exchange rate on mount
  useEffect(() => {
    void initExchangeRate();
  }, []);

  // Load user preferences from Firestore on login / mount
  useEffect(() => {
    if (!uid) return;
    void (async () => {
      const prefs = await fetchSettingsFromFirestore(uid);
      if (prefs) {
        setLocaleState(prefs.language);
        setCurrencyState(prefs.currency);
        if (typeof window !== "undefined") {
          localStorage.setItem(LANG_KEY, prefs.language);
          localStorage.setItem(CURRENCY_KEY, prefs.currency);
        }
      }
    })();
  }, [uid]);

  // Update <html lang="..."> when locale changes
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale === "bn" ? "bn" : "en";
    }
  }, [locale]);

  const t = useCallback(
    (key: keyof TranslationKeys, params?: Record<string, string | number>) => {
      const dict = TRANSLATIONS[locale] ?? en;
      let str = dict[key] ?? en[key] ?? String(key);
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        }
      }
      return str;
    },
    [locale],
  );

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    if (typeof window !== "undefined") localStorage.setItem(LANG_KEY, l);
  }, []);

  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c);
    if (typeof window !== "undefined") localStorage.setItem(CURRENCY_KEY, c);
  }, []);

  const updatePreferences = useCallback(
    async (l: Locale, c: Currency) => {
      setLocale(l);
      setCurrency(c);
      if (uid) {
        await saveSettingsToFirestore(uid, { language: l, currency: c });
      }
    },
    [uid, setLocale, setCurrency],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, currency, t, setLocale, setCurrency, updatePreferences }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale, currency, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}

/**
 * Convenience hook: returns the currency formatter for current currency.
 */
export function useCurrencyFormat() {
  const { currency } = useI18n();
  return useMemo(() => {
    return {
      format: (amountInBdt: number) => formatCurrencyFn(amountInBdt, currency),
      currency,
    };
  }, [currency]);
}


