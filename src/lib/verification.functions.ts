/**
 * Server functions for checkout verification.
 *
 * These are the client-facing entry points that delegate to the
 * trusted server-side verification logic in verification.server.ts.
 *
 * Security:
 * - Every call requires a valid Firebase ID token
 * - OTP is never returned to the client (except in mock mode)
 * - Verification status is validated server-side at order creation
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const requestOtpSchema = z.object({
  idToken: z.string().min(10),
  phoneNumber: z.string().trim().min(6).max(20),
  cartItems: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().min(1).max(100),
      }),
    )
    .min(1)
    .max(100),
  orderTotal: z.number().min(0),
  itemCount: z.number().int().min(1),
  deliveryLocation: z.string().min(1).max(500),
});

const verifyOtpSchema = z.object({
  idToken: z.string().min(10),
  sessionId: z.string().min(5).max(50),
  otp: z.string().trim().min(4).max(10),
});

/**
 * Request a verification OTP. Creates a verification session bound to
 * the current cart state. OTP is sent via the configured provider.
 */
export const requestOtpFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => requestOtpSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken } = await import("./firebase-admin.server");
    const { requestOtp } = await import("./verification.server");

    const { uid } = await verifyIdToken(data.idToken);

    const result = await requestOtp({
      userId: uid,
      phoneNumber: data.phoneNumber,
      cartItems: data.cartItems,
      orderTotal: data.orderTotal,
      itemCount: data.itemCount,
      deliveryLocation: data.deliveryLocation,
    });

    // Never expose the OTP to the client unless we're in mock mode
    if (result.mockOtp) {
      return {
        sessionId: result.sessionId,
        expiresAt: result.expiresAt,
        resendAvailableAt: result.resendAvailableAt,
        remainingResends: result.remainingResends,
        mockOtp: result.mockOtp,
      };
    }

    return {
      sessionId: result.sessionId,
      expiresAt: result.expiresAt,
      resendAvailableAt: result.resendAvailableAt,
      remainingResends: result.remainingResends,
    };
  });

/**
 * Verify the OTP. If successful, the verification session is marked
 * as verified and can be used to authorize order creation.
 */
export const verifyOtpFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => verifyOtpSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken } = await import("./firebase-admin.server");
    const { verifyOtp } = await import("./verification.server");

    const { uid } = await verifyIdToken(data.idToken);

    const result = await verifyOtp({
      userId: uid,
      sessionId: data.sessionId,
      otp: data.otp,
    });

    return {
      success: result.success,
      message: result.message,
      remainingAttempts: result.remainingAttempts,
      verified: result.verified,
    };
  });
