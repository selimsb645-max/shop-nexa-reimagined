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
});

export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

/**
 * Places an order. The client sends only product ids, quantities, the address
 * and an optional coupon code; prices, discount, shipping, total, stock
 * decrements and coupon usage are all computed and written server side.
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
    });
  });
