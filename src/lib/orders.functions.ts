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
 *
 * RACE CONDITION PREVENTION: The session is atomically consumed BEFORE
 * the order is created. If two concurrent requests try to use the same
 * session, only the first will succeed.
 */
export const placeOrder = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => placeOrderSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken, getProjectId } = await import("./firebase-admin.server");
    const { placeOrderServer } = await import("./checkout.server");
    const {
      validateVerificationSession,
      consumeVerificationSession,
      detectDuplicateOrder,
      computeCartFingerprint,
    } = await import("./verification.server");

    const { uid, email } = await verifyIdToken(data.idToken);

    // 1. Prepare cart data for validation
    const cartItems = data.items.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
    }));
    const deliveryLocation = `${data.shippingAddress.addressLine}, ${data.shippingAddress.city}`;
    const cartHash = await computeCartFingerprint(
      cartItems,
      0, // orderTotal intentionally excluded from fingerprint
      deliveryLocation,
    );

    // 2. Validate verification session (server-side, independent)
    // This checks: session exists, belongs to user, is "verified",
    // not expired, cart fingerprint matches, AND phone number matches.
    const validation = await validateVerificationSession({
      userId: uid,
      sessionId: data.verificationSessionId,
      cartItems,
      orderTotal: 0, // not checked — server computes real total later
      deliveryLocation,
      shippingPhone: data.shippingAddress.phone,
    });

    if (!validation.valid) {
      throw new Error(validation.reason ?? "Phone verification is required to place this order.");
    }

    // 3. Duplicate order detection (pre-check)
    const projectId = getProjectId();
    const dupCheck = await detectDuplicateOrder(
      projectId,
      uid,
      data.shippingAddress.phone,
      cartHash,
      0,
    );
    if (dupCheck.suspicious) {
      throw new Error(dupCheck.reason ?? "Duplicate order detected.");
    }

    // 4. ATOMIC SESSION CONSUMPTION (race condition prevention)
    // Consume the session BEFORE creating the order. If another request
    // already consumed it (e.g., double-click, concurrent tab), this fails.
    // We use a placeholder orderId here; the real one is set after order creation.
    const consumeResult = await consumeVerificationSession(
      uid,
      data.verificationSessionId,
      "pending_order",
    );

    if (!consumeResult.success) {
      throw new Error("This verification has already been used. Please verify your order again.");
    }

    // 5. Create the order (all financial calculations server-side)
    // If this fails, the session is already consumed — the user must
    // re-verify. This is intentional: better to require re-verification
    // than risk double-order creation.
    let result;
    try {
      result = await placeOrderServer({
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
        cartHash,
      });
    } catch (err) {
      // Order creation failed — update session back to "verified" so user
      // can retry without re-verifying their phone.
      // Session is already consumed — user must re-verify if order failed.
      // This is intentional: safer to require re-verification than risk
      // double-order creation from retry.
      console.error("Order creation failed after session consumption:", err);
      throw err;
    }

    // 6. Update session with real orderId (already consumed in step 4)
    try {
      // The session is already "consumed" from step 4, but we want to
      // record the real orderId. This is a best-effort update.
      await consumeVerificationSession(uid, data.verificationSessionId, result.orderId);
    } catch {
      // Best-effort — session is already consumed, this just updates the orderId
    }

    // 7. Send order confirmation notification (SMS/WhatsApp)
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

    // 8. Send order confirmation email
    try {
      const { sendOrderEmail } = await import("./email.server");
      await sendOrderEmail("ORDER_CREATED", email ?? "", {
        orderId: result.orderId,
        customerName: data.shippingAddress.fullName,
        orderDate: new Date().toISOString(),
        status: "confirmed",
        items: result.items.map((item) => ({
          name: item.title,
          quantity: item.quantity,
          price: item.price,
          image: item.image,
        })),
        subtotal: result.subtotal,
        discount: result.discount,
        tax: result.tax,
        taxLabel: result.taxLabel,
        deliveryFee: result.shipping,
        grandTotal: result.total,
        deliveryAddress: {
          fullName: data.shippingAddress.fullName,
          addressLine: data.shippingAddress.addressLine,
          city: data.shippingAddress.city,
          postalCode: data.shippingAddress.postalCode,
          phone: data.shippingAddress.phone,
        },
      });
    } catch {
      // Email failure should not block order creation
    }

    return result;
  });
