/**
 * AVENTA SHOP — Category Seeding Server Function
 *
 * Admin-only endpoint to seed all 20 categories and 134 subcategories
 * with approved AVENTA commission rates into Firestore.
 *
 * Commission = Daraz New Commission Rate × 50% (PK Commission Rates - May 2026)
 *
 * Call once after deploy: POST with admin idToken
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const seedSchema = z.object({
  idToken: z.string().min(10),
});

export const seedAventaCategories = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => seedSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyIdToken } = await import("./firebase-admin.server");
    const { uid } = await verifyIdToken(data.idToken);

    // Verify admin role
    const { getAccessToken, getProjectId, fromFsFields } = await import("./firebase-admin.server");
    const projectId = getProjectId();
    const token = await getAccessToken();
    const emulatorHost = Deno.env.get("FIRESTORE_EMULATOR_HOST");
    const base = emulatorHost
      ? `http://${emulatorHost}/v1/projects/${projectId}/databases/(default)/documents`
      : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

    const userRes = await fetch(`${base}/users/${uid}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!userRes.ok) throw new Error("User not found");
    const userDoc = await userRes.json();
    const userData = fromFsFields(userDoc.fields ?? {});
    if (userData.role !== "admin") throw new Error("Only admins can seed categories");

    const { seedCategoriesAndCommissions } = await import("./seed-categories.server");
    return seedCategoriesAndCommissions();
  });
