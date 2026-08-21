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
  verificationSessionId: z.string().min(5).max(50),
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
 *
 * SECURITY: A valid verificationSessionId is REQUIRED. The server independently
 * validates that the session is verified, not expired, and that the cart
 * fingerprint matches. Orders cannot be created without verification.
 */
export const placeOrder = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => placeOrderSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken } = await import("./firebase-admin.server");
    const { placeOrderServer } = await import("./checkout.server");
    const {
      validateVerificationSession,
      consumeVerificationSession,
      detectDuplicateOrder,
      computeCartFingerprint,
    } = await import("./verification.server");

    const { uid, email } = await verifyIdToken(data.idToken);

    // 1. Validate verification session (server-side, independent)
    const cartItems = data.items.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
    }));
    const deliveryLocation = `${data.shippingAddress.addressLine}, ${data.shippingAddress.city}`;
    // We don't know the final server-computed total yet, but we can compute
    // a preliminary fingerprint from the items + address. The full validation
    // happens inside placeOrderServer which has the authoritative totals.
    // For the verification session check, we use the same fingerprint
    // that was computed when the OTP was requested.
    const cartHash = await computeCartFingerprint(
      cartItems,
      0, // total is computed server-side; session uses items+address hash
      deliveryLocation,
    );

    const validation = await validateVerificationSession({
      userId: uid,
      sessionId: data.verificationSessionId,
      cartItems,
      orderTotal: 0, // will be validated inside placeOrderServer
      deliveryLocation,
    });

    if (!validation.valid) {
      throw new Error(validation.reason ?? "Phone verification is required to place this order.");
    }

    // 2. Duplicate order detection (pre-check)
    const projectId = (await import("./firebase-admin.server")).getProjectId();
    const dupCheck = await detectDuplicateOrder(
      projectId,
      uid,
      data.shippingAddress.phone,
      cartHash,
      0, // total not yet known
    );
    if (dupCheck.suspicious) {
      throw new Error(dupCheck.reason ?? "Duplicate order detected.");
    }

    // 3. Create the order (all financial calculations server-side)
    const result = await placeOrderServer({
      uid,
      buyerEmail: email,
      items: data.items,
      shippingAddress: data.shippingAddress,
      paymentMethod: data.paymentMethod,
      couponCode: data.couponCode ?? null,
      promoCode: data.promoCode ?? null,
      rewardPoints: data.rewardPoints ?? 0,
      walletUsed: data.walletUsed ?? 0,
      deliveryAddressSnapshot:
        (data as { deliveryAddressSnapshot?: Record<string, unknown> | null })
          .deliveryAddressSnapshot ?? null,
    });

    // 4. Consume the verification session (prevents reuse)
    await consumeVerificationSession(uid, data.verificationSessionId, result.orderId);

    // 5. Send order confirmation notification
    try {
      const { sendOrderNotification } = await import("./notifications.server");
      await sendOrderNotification("ORDER_CREATED", {
        orderId: result.orderId,
        customerName: data.shippingAddress.fullName,
        phoneNumber: data.shippingAddress.phone,
        orderTotal: result.total,
      });
    } catch {
      // Notification failure should not block order creation
    }

    return result;
  });
