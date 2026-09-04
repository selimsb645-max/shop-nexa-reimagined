/**
 * Aventa Shop — Promo Code Types
 *
 * Shared types for the promo code system. Used by both client and server.
 */

export type PromoStatus = "active" | "used" | "expired" | "disabled";

export type PromoDiscountType = "percent" | "fixed";

export type PromoCampaignType =
  | "first_order" // user has placed their first order
  | "welcome" // new user welcome promo
  | "campaign" // marketing campaign promo
  | "admin_issued"; // admin manually issued

export interface PromoCode {
  code: string;
  userId: string;
  status: PromoStatus;
  campaignType: PromoCampaignType;
  discountType: PromoDiscountType;
  discountValue: number;
  minimumOrderAmount: number;
  usageLimit: number;
  usedCount: number;
  expiresAt: number; // epoch ms, 0 = no expiry
  createdAt: number;
  updatedAt: number;
  usedAt: number | null;
  usedOrderId: string | null;
}

/**
 * Configuration for the promo code generator.
 * numericLength is configurable to allow upgrading from 4 digits (10K codes)
 * to 6 digits (1M codes) without rewriting the system.
 */
export interface PromoCodeGeneratorConfig {
  prefix: string; // default: "NEXA"
  numericLength: number; // default: 4, upgrade to 6 later
}
