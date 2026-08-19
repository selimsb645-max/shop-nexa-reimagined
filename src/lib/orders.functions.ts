import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const addressSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(6).max(20),
  addressLine: z.string().trim().min(4).max(200),
  city: z.string().trim().min(2).max(60),
  postalCode: z.string().trim().min(2).max(20),
  country: z.string().trim().min(2).max(60),
  notes: z.string().max(500).optional(),
});

const placeOrderSchema = z.object({
  idToken: z.string().min(10),
  items: z
    .array(
      z.object({
        productId: z.string().min(1).max(200),
        quantity: z.number().int().min(1).max(100),
      }),
    )
    .min(1)
    .max(100),
  shippingAddress: addressSchema,
  paymentMethod: z.enum(["cash_on_delivery", "card", "mobile_banking"]),
  couponCode: z.string().max(64).nullable().optional(),
  promoCode: z.string().max(20).nullable().optional(),
  deliveryMethod: z.enum(["standard", "express"]).optional(),
  rewardPoints: z.number().int().min(0).max(1_000_000).optional(),
  walletUsed: z.number().min(0).max(1_000_000).optional(),
  deliveryAddressSnapshot: z.record(z.string(), z.unknown()).nullable().optional(),
});

export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

/**
 * Places an order. The client sends only product ids, quantities, the address
 * and an optional coupon code; prices, discount, shipping, total, stock
 * decrements, coupon usage, reward points, wallet and delivery method are all
 * computed and written server side.
 */
export const placeOrder = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => placeOrderSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken } = await import("./firebase-admin.server");
    const { placeOrderServer } = await import("./checkout.server");

    const { uid, email } = await verifyIdToken(data.idToken);

    return placeOrderServer({
      uid,
      buyerEmail: email,
      items: data.items,
      shippingAddress: data.shippingAddress,
      paymentMethod: data.paymentMethod,
      couponCode: data.couponCode ?? null,
      promoCode: data.promoCode ?? null,
      deliveryMethod: data.deliveryMethod ?? "standard",
      rewardPoints: data.rewardPoints ?? 0,
      walletUsed: data.walletUsed ?? 0,
      deliveryAddressSnapshot: (data as { deliveryAddressSnapshot?: Record<string, unknown> | null }).deliveryAddressSnapshot ?? null,
    });
  });
