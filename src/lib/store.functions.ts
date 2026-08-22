/**
 * Shop Nexa — Public Store Server Function
 *
 * Fetches ONLY public seller/store information for the customer-facing
 * /store/{slug} route. Uses the Firebase service account (admin SDK) to
 * read seller profiles, which are otherwise restricted to self/admin
 * by Firestore security rules.
 *
 * SECURITY: This function returns ONLY public fields:
 *   shopName, shopSlug, description, logoUrl, bannerUrl, city, area, country, phone
 *
 * It NEVER returns:
 *   - Financial data (earnings, balance, commission)
 *   - Bank information
 *   - Identity documents
 *   - Email address
 *   - Private settings
 *   - Internal status details
 *
 * Only "approved" sellers are returned — draft/pending/rejected/suspended
 * sellers are not publicly visible.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const storeSchema = z.object({
  slug: z.string().min(1).max(100),
});

export interface PublicStoreData {
  shopName: string;
  shopSlug: string;
  description: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  city: string;
  area: string | null;
  country: string;
  phone: string;
  uid: string; // needed to query products by sellerId
}

export const getPublicStoreBySlug = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => storeSchema.parse(data))
  .handler(async ({ data }) => {
    const { getAccessToken, getProjectId, fromFsFields } = await import("./firebase-admin.server");

    const projectId = getProjectId();
    const token = await getAccessToken();

    // Query sellers collection by shopSlug
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/sellers:runQuery`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: "sellers" }],
            where: {
              fieldFilter: {
                field: { fieldPath: "shopSlug" },
                op: "EQUAL",
                value: { stringValue: data.slug },
              },
            },
            limit: 1,
          },
        }),
      },
    );

    if (!res.ok) {
      throw new Error("Could not load store. Please try again.");
    }

    const json = (await res.json()) as Array<{
      document?: { name: string; fields?: Record<string, unknown> };
    }>;

    const doc = json.find((r) => r.document);
    if (!doc?.document) {
      return null; // Store not found
    }

    const fields = fromFsFields((doc.document.fields ?? {}) as Record<string, never>) as Record<
      string,
      unknown
    >;

    // Only return approved sellers
    const status = String(fields.status ?? "draft");
    if (status !== "approved") {
      return null;
    }

    // Return ONLY public fields
    return {
      shopName: String(fields.shopName ?? ""),
      shopSlug: String(fields.shopSlug ?? ""),
      description: String(fields.description ?? ""),
      logoUrl: (fields.logoUrl as string | null) ?? null,
      bannerUrl: (fields.bannerUrl as string | null) ?? null,
      city: String(fields.city ?? ""),
      area: (fields.area as string | null) ?? null,
      country: String(fields.country ?? ""),
      phone: String(fields.phone ?? ""),
      uid: doc.document.name.split("/").pop()!,
    } satisfies PublicStoreData;
  });
