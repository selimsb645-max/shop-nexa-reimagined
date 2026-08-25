/**
 * Server-side coupon auto-expiry logic.
 *
 * Runs at checkout (inline) and as a standalone admin-triggered function
 * to bulk-deactivate expired coupons. This ensures expired coupons are
 * never accepted — even if the client-side filter misses them.
 */
import { createServerFn } from "@tanstack/react-start";
import { getProjectId, getAccessToken, commitWrites, docPath, toFsFields, type FsWrite } from "./firebase-admin.server";

/**
 * Queries the Firestore REST API for coupons that are active but expired,
 * and deactivates them in a single batch.
 *
 * @returns number of coupons deactivated
 */
export async function deactivateExpiredCoupons(): Promise<number> {
  const projectId = getProjectId();
  const token = await getAccessToken();
  const nowMs = Date.now();

  // Query: WHERE active == true AND expiresAt != null AND expiresAt < now
  // Firestore structured query
  const queryRes = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/coupons:runQuery`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "coupons" }],
          where: {
            compositeFilter: {
              op: "AND",
              filters: [
                { fieldFilter: { field: { fieldPath: "active" }, op: "==", value: { booleanValue: true } } },
                { fieldFilter: { field: { fieldPath: "expiresAt" }, op: "<", value: { integerValue: String(nowMs) } } },
              ],
            },
          },
          limit: 500,
        },
      }),
    },
  );

  if (!queryRes.ok) {
    console.error("coupon-expiry: query failed", await queryRes.text());
    return 0;
  }

  const queryJson = (await queryRes.json()) as Array<{
    document?: { name: string };
  }>;

  const expiredDocs = queryJson.filter((r) => r.document);
  if (expiredDocs.length === 0) return 0;

  // Batch update: set active=false on all expired coupons
  const writes: FsWrite[] = expiredDocs.map((r) => ({
    update: {
      name: r.document!.name,
      fields: toFsFields({
        active: false,
        autoExpiredAt: nowMs,
      }),
    },
    updateMask: { fieldPaths: ["active", "autoExpiredAt"] },
  }));

  await commitWrites(projectId, writes);
  console.log(`coupon-expiry: deactivated ${expiredDocs.length} expired coupons`);
  return expiredDocs.length;
}

/**
 * Admin-triggered server function to manually run coupon expiry sweep.
 * Can be called from the admin coupons page or scheduled via cron.
 */
export const runCouponExpirySweep = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const d = data as { idToken?: string };
    if (!d.idToken || typeof d.idToken !== "string" || d.idToken.length < 10) {
      throw new Error("Authentication required.");
    }
    return d;
  })
  .handler(async ({ data }) => {
    // Verify the caller is an admin
    const { verifyIdToken } = await import("./firebase-admin.server");
    const { uid } = await verifyIdToken(data.idToken!);

    // Check admin role
    const token = await getAccessToken();
    const projectId = getProjectId();
    const userRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(uid)}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (!userRes.ok) throw new Error("Failed to verify admin status.");
    const userJson = await userRes.json();
    const role = String(userJson.fields?.role?.stringValue ?? "customer");
    if (role !== "admin") throw new Error("Only admins can run this action.");

    const count = await deactivateExpiredCoupons();
    return { deactivated: count };
  });
