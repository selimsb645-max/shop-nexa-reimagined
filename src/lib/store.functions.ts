/**
 * AVENTA SHOP — Public Store Server Functions
 *
 * Fetches ONLY public seller/store information for the customer-facing
 * /store/{slug} route. Uses the Firebase service account (admin SDK) to
 * read seller profiles, which are otherwise restricted to self/admin
 * by Firestore security rules.
 *
 * SECURITY: These functions return ONLY public fields:
 *   shopName, shopSlug, description, logoUrl, bannerUrl, city, area, country, phone
 *
 * They NEVER return:
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

const uidSchema = z.object({
  uid: z.string().min(1).max(128),
});

const reserveSlugSchema = z.object({
  uid: z.string().min(1).max(128),
  shopName: z.string().min(2).max(120),
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

/** Map raw Firestore fields (already converted) to the public store shape. */
function toPublicStore(uid: string, fields: Record<string, unknown>): PublicStoreData {
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
    uid,
  };
}

function slugifyShopName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

async function fetchSellerDoc(uid: string) {
  const { getAccessToken, getProjectId, fromFsFields } = await import("./firebase-admin.server");
  const projectId = getProjectId();
  const token = await getAccessToken();
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/sellers/${encodeURIComponent(uid)}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Could not load store. Please try again.");
  const json = (await res.json()) as { fields?: Record<string, unknown> };
  return fromFsFields((json.fields ?? {}) as Record<string, never>) as Record<string, unknown>;
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
    return toPublicStore(doc.document.name.split("/").pop()!, fields);
  });

/**
 * Look up a seller's public store by their uid (e.g. from product.sellerId).
 * Returns null when the seller doesn't exist or isn't approved.
 */
export const getPublicStoreByUid = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => uidSchema.parse(data))
  .handler(async ({ data }) => {
    const fields = await fetchSellerDoc(data.uid);
    if (!fields) return null;

    // Only return approved sellers
    const status = String(fields.status ?? "draft");
    if (status !== "approved") return null;

    const store = toPublicStore(data.uid, fields);
    if (!store.shopSlug) return null; // no public store URL yet
    return store;
  });

/**
 * Reserves a UNIQUE shopSlug for a seller.
 *
 * Slug collisions were previously possible: two sellers named "Tech Zone"
 * would both get "tech-zone", and the public store lookup (limit: 1) would
 * show the first seller's store for both. This function queries all sellers
 * whose shopSlug falls in the [slug, slug\uf8ff] range and picks the first
 * free variant (slug, slug-2, slug-3, ...). A slug already owned by the SAME
 * seller is kept as-is, so re-saving during onboarding is stable.
 */
export const reserveShopSlug = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => reserveSlugSchema.parse(data))
  .handler(async ({ data }) => {
    const { getAccessToken, getProjectId, fromFsFields } = await import("./firebase-admin.server");

    const base = slugifyShopName(data.shopName) || data.uid;

    const projectId = getProjectId();
    const token = await getAccessToken();

    // Prefix range query: shopSlug in [base, base + '\uf8ff')
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
            select: {
              fields: [{ fieldPath: "shopSlug" }],
            },
            where: {
              compositeFilter: {
                op: "AND",
                filters: [
                  {
                    fieldFilter: {
                      field: { fieldPath: "shopSlug" },
                      op: "GREATER_THAN_OR_EQUAL",
                      value: { stringValue: base },
                    },
                  },
                  {
                    fieldFilter: {
                      field: { fieldPath: "shopSlug" },
                      op: "LESS_THAN",
                      value: { stringValue: base + "\uf8ff" },
                    },
                  },
                ],
              },
            },
            limit: 100,
          },
        }),
      },
    );

    if (!res.ok) {
      // If the uniqueness check fails, fall back to the plain slug rather
      // than blocking onboarding — the store page still resolves via limit:1.
      return base;
    }

    const json = (await res.json()) as Array<{
      document?: { name: string; fields?: Record<string, unknown> };
    }>;

    // docId -> shopSlug map of existing slugs in the range
    const takenBy = new Map<string, string>();
    for (const entry of json) {
      if (!entry.document) continue;
      const docId = entry.document.name.split("/").pop()!;
      const f = fromFsFields((entry.document.fields ?? {}) as Record<string, never>) as Record<
        string,
        unknown
      >;
      takenBy.set(docId, String(f.shopSlug ?? ""));
    }

    // Base slug owned by this seller → keep it (stable across onboarding saves)
    for (const [docId, slug] of takenBy) {
      if (docId === data.uid && slug === base) return base;
    }

    const taken = new Set(takenBy.values());
    if (!taken.has(base)) return base;
    for (let i = 2; i <= 50; i++) {
      const candidate = `${base}-${i}`;
      if (!taken.has(candidate)) return candidate;
    }
    // Extremely unlikely: 50 collisions. Append uid fragment for uniqueness.
    return `${base}-${data.uid.slice(0, 8).toLowerCase()}`;
  });
