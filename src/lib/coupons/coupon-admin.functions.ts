/**
 * AVENTA SHOP — Admin coupon management transport (TanStack server fns).
 *
 * Thin, zod-validated wrappers around the coupon admin core
 * (coupon.server.ts): role-verified (COUPON_MANAGER_ROLES), canonical
 * field validation, masked updates, redemption-guarded deletes and
 * the shared kernel audit trail. The security rules deny client SDK
 * writes on coupons for EVERY role — this transport is the ONLY
 * admin write path.
 *
 * Identity/authority come from the Firebase ID token (verifyIdToken
 * → uid → verifyCouponAdmin). Nothing about the caller is trusted
 * from the wire.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Coupon } from "@/types/commerce";

const idTokenSchema = z.string().min(10);

const listSchema = z.object({ idToken: idTokenSchema });

const upsertSchema = z.object({
  idToken: idTokenSchema,
  input: z.object({
    code: z.string().min(3).max(24),
    type: z.enum(["percent", "fixed"]),
    value: z.number().positive(),
    minSubtotal: z.number().min(0),
    expiresAt: z.number().int().positive().nullable(),
    active: z.boolean(),
    usageLimit: z.number().int().min(1).nullable(),
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

export const listCouponsFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => listSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken, getProjectId } = await import("../firebase-admin.server");
    const uid = (await verifyIdToken(data.idToken)).uid;
    const { verifyCouponAdmin, listCouponsAdmin } = await import("./coupon.server");
    await verifyCouponAdmin(getProjectId(), uid);
    const rows = await listCouponsAdmin(getProjectId(), {});
    return rows.map((row) => toClientCoupon(row));
  });

export const upsertCouponFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => upsertSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken, getProjectId } = await import("../firebase-admin.server");
    const uid = (await verifyIdToken(data.idToken)).uid;
    const projectId = getProjectId();
    const { verifyCouponAdmin, readCoupon, createCoupon, updateCoupon } =
      await import("./coupon.server");
    await verifyCouponAdmin(projectId, uid);
    const actor = { id: `admin:${uid}`, role: "admin" } as const;
    const existing = await readCoupon(projectId, data.input.code);
    if (!existing) {
      // Platform coupon (sellerId null, never-redeemed start).
      const doc = await createCoupon(
        projectId,
        {
          code: data.input.code,
          type: data.input.type,
          value: data.input.value,
          sellerId: null,
          minSubtotal: data.input.minSubtotal,
          startAt: null,
          expiresAt: data.input.expiresAt,
          usageLimit: data.input.usageLimit,
          perCustomerLimit: null,
          productIds: [],
          categoryIds: [],
          maxDiscount: null,
          active: data.input.active,
        },
        { actor },
      );
      return toClientCoupon(doc);
    }
    // Masked patch — uses / sellerId / createdAt / code are immutable.
    const doc = await updateCoupon(
      projectId,
      data.input.code,
      {
        type: data.input.type,
        value: data.input.value,
        minSubtotal: data.input.minSubtotal,
        expiresAt: data.input.expiresAt,
        usageLimit: data.input.usageLimit,
        active: data.input.active,
      },
      { actor },
    );
    return toClientCoupon(doc);
  });

export const updateCouponActiveFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => toggleSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken, getProjectId } = await import("../firebase-admin.server");
    const uid = (await verifyIdToken(data.idToken)).uid;
    const projectId = getProjectId();
    const { verifyCouponAdmin, setCouponActive } = await import("./coupon.server");
    await verifyCouponAdmin(projectId, uid);
    const doc = await setCouponActive(projectId, data.code, data.active, null, {
      actor: { id: `admin:${uid}`, role: "admin" },
    });
    return toClientCoupon(doc);
  });

export const deleteCouponFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => codeSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken, getProjectId } = await import("../firebase-admin.server");
    const uid = (await verifyIdToken(data.idToken)).uid;
    const projectId = getProjectId();
    const { verifyCouponAdmin, deleteCoupon } = await import("./coupon.server");
    await verifyCouponAdmin(projectId, uid);
    // Redemption history is immutable — the core refuses used coupons.
    await deleteCoupon(projectId, data.code, {
      actor: { id: `admin:${uid}`, role: "admin" },
    });
    return { ok: true };
  });
