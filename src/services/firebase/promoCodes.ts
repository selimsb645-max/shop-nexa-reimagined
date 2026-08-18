/**
 * Shop Nexa — Promo Code Client Service
 *
 * Read-only client-side service for fetching the current user's promo codes.
 * Promo code generation, validation, and mutation are handled exclusively by
 * server functions (promo.functions.ts). This service only reads from
 * Firestore — it can NEVER create, modify, or validate codes.
 *
 * Security: Firestore rules allow users to read only their own promo codes
 * (where userId == request.auth.uid). All writes are blocked.
 */

import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { getDb } from "./config";

const COLLECTION = "promoCodes";

export type PromoStatus = "active" | "used" | "expired" | "disabled";
export type PromoDiscountType = "percent" | "fixed";
export type PromoCampaignType =
  | "first_order"
  | "welcome"
  | "campaign"
  | "admin_issued";

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
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
  usedAt: number | null;
  usedOrderId: string | null;
}

function mapPromo(docId: string, data: Record<string, unknown>): PromoCode {
  return {
    code: docId,
    userId: String(data.userId ?? ""),
    status: (data.status as PromoStatus) ?? "active",
    campaignType: (data.campaignType as PromoCampaignType) ?? "welcome",
    discountType: (data.discountType as PromoDiscountType) ?? "percent",
    discountValue: Number(data.discountValue ?? 0),
    minimumOrderAmount: Number(data.minimumOrderAmount ?? 0),
    usageLimit: Number(data.usageLimit ?? 1),
    usedCount: Number(data.usedCount ?? 0),
    expiresAt: Number(data.expiresAt ?? 0),
    createdAt:
      typeof data.createdAt === "number"
        ? data.createdAt
        : (data.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ??
          Date.now(),
    updatedAt:
      typeof data.updatedAt === "number"
        ? data.updatedAt
        : (data.updatedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ??
          Date.now(),
    usedAt:
      data.usedAt != null
        ? typeof data.usedAt === "number"
          ? data.usedAt
          : (data.usedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? null
        : null,
    usedOrderId: data.usedOrderId != null ? String(data.usedOrderId) : null,
  };
}

/**
 * Lists the current user's promo codes.
 * Firestore rules enforce that only the owner can read their codes.
 */
export async function listMyPromoCodes(uid: string): Promise<PromoCode[]> {
  const snap = await getDocs(
    query(
      collection(getDb(), COLLECTION),
      where("userId", "==", uid),
      orderBy("createdAt", "desc"),
    ),
  );
  return snap.docs.map((d) => mapPromo(d.id, d.data() as Record<string, unknown>));
}

/**
 * Formats a promo code's discount for display.
 */
export function formatPromoDiscount(promo: PromoCode): string {
  if (promo.discountType === "percent") {
    return `${promo.discountValue}% off`;
  }
  return `${promo.discountValue.toFixed(2)} off`;
}

/**
 * Checks if a promo code is still usable (active and not expired).
 */
export function isPromoUsable(promo: PromoCode): boolean {
  if (promo.status !== "active") return false;
  if (promo.expiresAt > 0 && Date.now() > promo.expiresAt) return false;
  if (promo.usedCount >= promo.usageLimit) return false;
  return true;
}

/**
 * Formats the expiry date for display.
 */
export function formatPromoExpiry(promo: PromoCode): string {
  if (promo.expiresAt <= 0) return "No expiry";
  const date = new Date(promo.expiresAt);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
