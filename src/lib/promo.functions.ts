/**
 * Aventa Shop — Promo Code Server Functions
 *
 * TanStack Start server functions that bridge the client to the promo server
 * module. Each function:
 * 1. Validates the Firebase ID token (verifies caller identity)
 * 2. Checks permissions (user vs admin)
 * 3. Delegates to promo.server.ts
 *
 * SECURITY: Promo code generation and mutation ONLY happen through these
 * verified endpoints. The client can NEVER generate, modify, or reuse codes.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// ====================================================================
// 1. GENERATE PROMO CODE (user qualifies → code generated)
// ====================================================================

const generateSchema = z.object({
  idToken: z.string().min(10),
  campaignType: z.enum(["first_order", "welcome", "campaign", "admin_issued"]).default("welcome"),
});

export const generatePromoCode = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => generateSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken } = await import("./firebase-admin.server");
    const { createPromoCodeServer } = await import("./promo.server");

    const { uid } = await verifyIdToken(data.idToken);

    return createPromoCodeServer({
      uid,
      campaignType: data.campaignType,
    });
  });

// ====================================================================
// 2. LIST MY PROMO CODES (user reads their own codes)
// ====================================================================

const listSchema = z.object({
  idToken: z.string().min(10),
});

export const listMyPromoCodes = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => listSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken } = await import("./firebase-admin.server");
    const { listUserPromoCodesServer } = await import("./promo.server");

    const { uid } = await verifyIdToken(data.idToken);

    return listUserPromoCodesServer(uid);
  });

// ====================================================================
// 3. ADMIN: CREATE PROMO CODE FOR A USER
// ====================================================================

const adminCreateSchema = z.object({
  idToken: z.string().min(10),
  targetUid: z.string().min(1).max(200),
  campaignType: z
    .enum(["first_order", "welcome", "campaign", "admin_issued"])
    .default("admin_issued"),
  discountType: z.enum(["percent", "fixed"]).default("percent"),
  discountValue: z.number().min(0.01).max(100),
  minimumOrderAmount: z.number().min(0).max(100_000).default(0),
  usageLimit: z.number().int().min(1).max(1000).default(1),
  expiryDays: z.number().int().min(1).max(365).default(30),
});

export const adminCreatePromoCode = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => adminCreateSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken, getAccessToken, getProjectId } = await import("./firebase-admin.server");
    const { adminCreatePromoCodeServer } = await import("./promo.server");

    const { uid } = await verifyIdToken(data.idToken);

    // Verify caller is admin
    const token = await getAccessToken();
    const projectId = getProjectId();
    const userRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(uid)}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (!userRes.ok) throw new Error("Could not verify admin permissions.");
    const userDoc = await userRes.json();
    const role = userDoc.fields?.role?.stringValue ?? "customer";
    if (role !== "admin") throw new Error("Only admins can issue promo codes.");

    return adminCreatePromoCodeServer({
      uid: data.targetUid,
      adminUid: uid,
      campaignType: data.campaignType,
      discountType: data.discountType,
      discountValue: data.discountValue,
      minimumOrderAmount: data.minimumOrderAmount,
      usageLimit: data.usageLimit,
      expiryDays: data.expiryDays,
    });
  });

// ====================================================================
// 4. ADMIN: LIST ALL PROMO CODES
// ====================================================================

const adminListSchema = z.object({
  idToken: z.string().min(10),
  limit: z.number().int().min(1).max(500).default(100),
});

export const adminListPromoCodes = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => adminListSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken, getAccessToken, getProjectId } = await import("./firebase-admin.server");
    const { listAllPromoCodesServer } = await import("./promo.server");

    const { uid } = await verifyIdToken(data.idToken);

    // Verify admin
    const token = await getAccessToken();
    const projectId = getProjectId();
    const userRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(uid)}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (!userRes.ok) throw new Error("Could not verify admin permissions.");
    const userDoc = await userRes.json();
    const role = userDoc.fields?.role?.stringValue ?? "customer";
    if (role !== "admin") throw new Error("Only admins can view all promo codes.");

    return listAllPromoCodesServer(data.limit);
  });

// ====================================================================
// 5. ADMIN: DISABLE PROMO CODE
// ====================================================================

const adminDisableSchema = z.object({
  idToken: z.string().min(10),
  code: z.string().trim().min(4).max(20),
});

export const adminDisablePromoCode = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => adminDisableSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken, getAccessToken, getProjectId } = await import("./firebase-admin.server");
    const { disablePromoCodeServer } = await import("./promo.server");

    const { uid } = await verifyIdToken(data.idToken);

    // Verify admin
    const token = await getAccessToken();
    const projectId = getProjectId();
    const userRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(uid)}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (!userRes.ok) throw new Error("Could not verify admin permissions.");
    const userDoc = await userRes.json();
    const role = userDoc.fields?.role?.stringValue ?? "customer";
    if (role !== "admin") throw new Error("Only admins can disable promo codes.");

    await disablePromoCodeServer(data.code);
    return { success: true };
  });

// ====================================================================
// 6. EXPIRE OLD PROMO CODES (maintenance/cron)
// ====================================================================

const expireSchema = z.object({
  idToken: z.string().min(10),
});

export const expireOldPromoCodes = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => expireSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken, getAccessToken, getProjectId } = await import("./firebase-admin.server");
    const { expireOldPromoCodesServer } = await import("./promo.server");

    const { uid } = await verifyIdToken(data.idToken);

    // Verify admin
    const token = await getAccessToken();
    const projectId = getProjectId();
    const userRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(uid)}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (!userRes.ok) throw new Error("Could not verify admin permissions.");
    const userDoc = await userRes.json();
    const role = userDoc.fields?.role?.stringValue ?? "customer";
    if (role !== "admin") throw new Error("Only admins can run maintenance.");

    const count = await expireOldPromoCodesServer();
    return { expired: count };
  });
