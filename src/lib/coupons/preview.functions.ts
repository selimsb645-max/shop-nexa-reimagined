/**
 * AVENTA SHOP — Coupon preview bridge (TanStack Start server fn).
 *
 * Read-only pre-checkout validation through the canonical
 * evaluation core. The client sends its cart (product ids +
 * quantities) + a coupon code; the server loads real prices,
 * applies flash-sale pricing and returns the authoritative
 * ok/rejection — the client NEVER computes a discount itself.
 *
 * SECURITY: verifyIdToken gates the call (the per-customer counter
 * is user-specific). No writes are performed by this path.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const previewSchema = z.object({
  // Optional: the cart is a public page. An anonymous preview skips
  // the per-customer-limit check (the checkout redemption — which
  // always requires auth — remains the single authority).
  idToken: z.string().min(10).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1).max(200),
        quantity: z.number().int().min(1).max(100),
      }),
    )
    .min(1)
    .max(100),
  couponCode: z.string().min(1).max(64),
});

export const previewCoupon = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => previewSchema.parse(data))
  .handler(async ({ data }) => {
    let uid: string | null = null;
    if (data.idToken) {
      const { verifyIdToken } = await import("../firebase-admin.server");
      uid = (await verifyIdToken(data.idToken)).uid;
    }
    const { previewCouponServer } = await import("./preview.server");
    return previewCouponServer({
      uid,
      items: data.items,
      couponCode: data.couponCode,
    });
  });
