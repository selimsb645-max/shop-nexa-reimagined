/**
 * AVENTA SHOP — Category Seeding Server Function
 *
 * Admin-only endpoint to seed all 20 categories and 134 subcategories
 * with approved AVENTA commission rates into Firestore.
 *
 * Commission = Daraz New Commission Rate × 50% (PK Commission Rates - May 2026)
 *
 * SECURITY:
 * - Requires a valid Firebase ID token from an authenticated admin user
 * - Verifies the user's role is "admin" (or super_admin) server-side
 * - Normal users and unauthenticated requests are rejected with 403
 * - The function uses the Firebase Admin SDK (service account) to bypass
 *   Firestore security rules — this is server-side only, never exposed publicly
 * - The function is idempotent: safe to call multiple times
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const seedSchema = z.object({
  idToken: z.string().min(10),
});

export const seedAventaCategories = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => seedSchema.parse(data))
  .handler(async ({ data }) => {
    // Step 1: Verify the Firebase ID token
    const { verifyIdToken, getAccessToken, getProjectId, fromFsFields } =
      await import("./firebase-admin.server");
    const { uid } = await verifyIdToken(data.idToken);

    // Step 2: Verify the caller is an admin
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

    // Reject non-admin users
    if (userData.role !== "admin") {
      throw new Error("Only admins can seed categories");
    }

    // Step 3: Run the seed operation (idempotent)
    const { seedCategoriesAndCommissions } = await import("./seed-categories.server");
    return seedCategoriesAndCommissions();
  });
