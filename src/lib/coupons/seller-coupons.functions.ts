/**
 * AVENTA SHOP — Seller coupons transport (TanStack Start server fns).
 *
 * Thin, zod-validated wrappers around seller-coupons.server.ts. ALL
 * seller coupon mutations happen ONLY through these server functions
 * — the security rules deny client SDK writes on coupons, and the
 * server core (not this layer, not the client) is the authority for
 * seller verification, field validation, ownership and audit.
 *
 * Identity: Firebase ID token (verifyIdToken) → uid. The uid passed
 * to the core IS the owner identity — the client-supplied sellerId
 * is ignored entirely (never trusted from the wire).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Coupon } from "@/types/commerce";

const idTokenSchema = z.string().min(10);

const listSchema = z.object({ idToken: idTokenSchema });

const createSchema = z.object({
  idToken: idTokenSchema,
  input: z.object({
    code: z.string().min(3).max(24),
    type: z.enum(["percent", "fixed"]),
    value: z.number().positive(),
    minSubtotal: z.number().min(0).nullable(),
    expiresAt: z.number().int().positive().nullable(),
    usageLimit: z.number().int().min(1).nullable(),
    productIds: z.array(z.string().min(1).max(200)).max(200),
    maxDiscount: z.number().positive().nullable(),
    active: z.boolean(),
  }),
});

const codeSchema = z.object({
  idToken: idTokenSchema,
  code: z.string().min(3).max(24),
});

const toggleSchema = codeSchema.extend({ active: z.boolean() });

/** Map the server CouponDoc onto the client Coupon shape. */
function toClientCoupon(doc: {
  code: string;
  type: string;
  value: number;
  minSubtotal: number | null;
  expiresAt: number | null;
  active: boolean;
  usageLimit: number | null;
  uses: number;
  sellerId: string | null;
  productIds: string[];
  maxDiscount: number | null;
}): Coupon {
  return {
    code: doc.code,
    type: doc.type as Coupon["type"],
    value: doc.value,
    minSubtotal: doc.minSubtotal ?? 0,
    expiresAt: doc.expiresAt,
    active: doc.active,
    usageLimit: doc.usageLimit,
    uses: doc.uses,
    sellerId: doc.sellerId,
    productIds: doc.productIds ?? [],
    maxDiscount: doc.maxDiscount,
  };
}

export const listSellerCouponsFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => listSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken, getProjectId } = await import("../firebase-admin.server");
    const uid = (await verifyIdToken(data.idToken)).uid;
    const { listSellerCouponsServer } = await import("./seller-coupons.server");
    const docs = await listSellerCouponsServer(getProjectId(), uid);
    return docs.map(toClientCoupon);
  });

export const createSellerCouponFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => createSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken, getProjectId } = await import("../firebase-admin.server");
    const uid = (await verifyIdToken(data.idToken)).uid;
    const { createSellerCouponServer } = await import("./seller-coupons.server");
    const doc = await createSellerCouponServer(getProjectId(), uid, data.input);
    return toClientCoupon(doc);
  });

export const toggleSellerCouponFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => toggleSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken, getProjectId } = await import("../firebase-admin.server");
    const uid = (await verifyIdToken(data.idToken)).uid;
    const { setSellerCouponActiveServer } = await import("./seller-coupons.server");
    const doc = await setSellerCouponActiveServer(getProjectId(), uid, data.code, data.active);
    return toClientCoupon(doc);
  });

export const deleteSellerCouponFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => codeSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken, getProjectId } = await import("../firebase-admin.server");
    const uid = (await verifyIdToken(data.idToken)).uid;
    const { deleteSellerCouponServer } = await import("./seller-coupons.server");
    await deleteSellerCouponServer(getProjectId(), uid, data.code);
    return { ok: true };
  });
