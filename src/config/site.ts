/**
 * Central site configuration.
 * Contact channels are environment-driven so they can be changed
 * without touching component code (avoid hard-coding personal details).
 */

const env = import.meta.env;

export const SITE = {
  name: "Aventa Shop",
  supportEmail: env.VITE_SUPPORT_EMAIL ?? "support@shopnexa.com",
  supportPhone: env.VITE_SUPPORT_PHONE ?? "+8801324997271",
  whatsappNumber: env.VITE_SUPPORT_WHATSAPP ?? "8801324997271",
} as const;
