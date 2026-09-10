/**
 * AVENTA SHOP — Signup Reward Server Functions
 *
 * TanStack Start server functions that bridge the client to the rewards
 * server module. Each function:
 * 1. Validates the Firebase ID token (verifies caller identity)
 * 2. Delegates to rewards.server.ts
 *
 * SECURITY: Reward point creation and notification creation ONLY happen
 * through these verified endpoints. The client can NEVER create reward
 * entries, promo notifications, or manipulate balances directly.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// ====================================================================
// 1. GRANT SIGNUP REWARD (100 points + notification, idempotent)
// ====================================================================

const grantSchema = z.object({
  idToken: z.string().min(10),
});

export const grantSignupReward = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => grantSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken } = await import("./firebase-admin.server");
    const { grantSignupRewardServer } = await import("./rewards.server");

    const { uid } = await verifyIdToken(data.idToken);

    return grantSignupRewardServer(uid);
  });

// ====================================================================
// 2. ENSURE WELCOME PROMO NOTIFICATION (idempotent, data-driven)
// ====================================================================

const promoNotifSchema = z.object({
  idToken: z.string().min(10),
});

export const ensurePromoNotification = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => promoNotifSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken } = await import("./firebase-admin.server");
    const { ensureWelcomePromoNotificationServer } = await import("./rewards.server");

    const { uid } = await verifyIdToken(data.idToken);

    return ensureWelcomePromoNotificationServer(uid);
  });
