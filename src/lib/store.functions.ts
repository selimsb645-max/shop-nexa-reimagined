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
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`,
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
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`,
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

/**
 * ADMIN: Audit (and optionally repair) shopSlug collisions across ALL sellers.
 *
 * History: slugs used to be generated as slugify(shopName) with no uniqueness
 * check, so two sellers named "Tech Zone" could both own "tech-zone" — and the
 * public /store/{slug} lookup (limit: 1) would show the first seller's store
 * for both URLs. reserveShopSlug() prevents NEW collisions; this function
 * finds and fixes the ones that may already exist in production data.
 *
 * Auth: caller must be an admin (super_admin / admin / seller_manager),
 * verified via ID token — same as the Firestore rules for seller management.
 *
 * repair=false → returns a report only.
 * repair=true  → keeps the OLDEST seller's slug and renames later duplicates
 *                to slug-2, slug-3, … (never deletes or touches any other field).
 */
export const auditShopSlugCollisions = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        idToken: z.string().min(10),
        repair: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { verifyIdToken, getAccessToken, getProjectId, fromFsFields } =
      await import("./firebase-admin.server");

    // 1. Authenticate the admin caller
    const { uid } = await verifyIdToken(data.idToken);
    const projectId = getProjectId();
    const token = await getAccessToken();

    const userRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(uid)}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (!userRes.ok) throw new Error("Could not verify admin permissions.");
    const userDoc = (await userRes.json()) as { fields?: Record<string, { stringValue?: string }> };
    const role = userDoc.fields?.role?.stringValue;
    const adminRole = userDoc.fields?.adminRole?.stringValue ?? null;
    const allowed = ["super_admin", "admin", "seller_manager"];
    if (role !== "admin" || !allowed.includes(adminRole ?? "")) {
      throw new Error("Only seller-management admins can run this audit.");
    }

    // 2. Page through ALL sellers (masked to the fields we need)
    interface SellerRow {
      uid: string;
      shopSlug: string;
      shopName: string;
      status: string;
      createdAt: number;
    }
    const rows: SellerRow[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({ pageSize: "300" });
      if (pageToken) params.set("pageToken", pageToken);
      for (const f of ["shopSlug", "shopName", "status", "createdAt"]) {
        params.append("mask.fieldPaths", f);
      }
      const listRes = await fetch(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/sellers?${params.toString()}`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      if (!listRes.ok) throw new Error("Could not list sellers for the audit.");
      const page = (await listRes.json()) as {
        documents?: Array<{ name: string; fields?: Record<string, unknown> }>;
        nextPageToken?: string;
      };
      for (const doc of page.documents ?? []) {
        const f = fromFsFields((doc.fields ?? {}) as Record<string, never>) as Record<
          string,
          unknown
        >;
        const created = f.createdAt as { _seconds?: number } | number | undefined;
        rows.push({
          uid: doc.name.split("/").pop()!,
          shopSlug: String(f.shopSlug ?? ""),
          shopName: String(f.shopName ?? ""),
          status: String(f.status ?? "draft"),
          createdAt:
            typeof created === "number"
              ? created
              : typeof created?._seconds === "number"
                ? created._seconds * 1000
                : Number.MAX_SAFE_INTEGER,
        });
      }
      pageToken = page.nextPageToken;
    } while (pageToken);

    // 3. Group by slug and find collisions
    const bySlug = new Map<string, SellerRow[]>();
    for (const row of rows) {
      if (!row.shopSlug) continue;
      const list = bySlug.get(row.shopSlug) ?? [];
      list.push(row);
      bySlug.set(row.shopSlug, list);
    }
    const collisions: Array<{ slug: string; sellers: SellerRow[] }> = [];
    for (const [slug, sellers] of bySlug) {
      if (sellers.length > 1) {
        sellers.sort((a, b) => a.createdAt - b.createdAt);
        collisions.push({ slug, sellers });
      }
    }

    if (!data.repair) {
      return {
        totalSellers: rows.length,
        collisionCount: collisions.length,
        collisions: collisions.map((c) => ({
          slug: c.slug,
          sellers: c.sellers.map((s) => ({
            uid: s.uid,
            shopName: s.shopName,
            status: s.status,
            keepsSlug: s === c.sellers[0],
          })),
        })),
        repaired: [],
      };
    }

    // 4. Repair: oldest seller keeps the slug, later ones get -2, -3, …
    const taken = new Set(bySlug.keys());
    const repaired: Array<{ uid: string; shopName: string; from: string; to: string }> = [];
    for (const c of collisions) {
      const suffixes = c.sellers.slice(1);
      for (const seller of suffixes) {
        let n = 2;
        while (taken.has(`${c.slug}-${n}`)) n++;
        const newSlug = `${c.slug}-${n}`;
        const patchRes = await fetch(
          `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/sellers/${encodeURIComponent(seller.uid)}?updateMask.fieldPaths=shopSlug`,
          {
            method: "PATCH",
            headers: {
              authorization: `Bearer ${token}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              fields: { shopSlug: { stringValue: newSlug } },
            }),
          },
        );
        if (!patchRes.ok) {
          throw new Error(`Failed to rename slug for seller ${seller.shopName || seller.uid}`);
        }
        taken.add(newSlug);
        taken.delete(c.slug); // still owned by the first seller
        repaired.push({
          uid: seller.uid,
          shopName: seller.shopName,
          from: c.slug,
          to: newSlug,
        });
      }
    }

    return {
      totalSellers: rows.length,
      collisionCount: collisions.length,
      collisions: collisions.map((c) => ({
        slug: c.slug,
        sellers: c.sellers.map((s) => ({
          uid: s.uid,
          shopName: s.shopName,
          status: s.status,
          keepsSlug: s === c.sellers[0],
        })),
      })),
      repaired,
    };
  });

/**
 * List ALL approved sellers' public store profiles, for the /stores directory.
 * Same public-fields contract as getPublicStoreBySlug — never exposes
 * financial data, bank info, identity docs, or email.
 */
export const listPublicStores = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({}).parse(data ?? {}))
  .handler(async () => {
    const { getAccessToken, getProjectId, fromFsFields } = await import("./firebase-admin.server");

    const projectId = getProjectId();
    const token = await getAccessToken();

    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`,
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
              fields: [
                { fieldPath: "shopName" },
                { fieldPath: "shopSlug" },
                { fieldPath: "description" },
                { fieldPath: "logoUrl" },
                { fieldPath: "city" },
                { fieldPath: "area" },
                { fieldPath: "country" },
                { fieldPath: "createdAt" },
              ],
            },
            where: {
              fieldFilter: {
                field: { fieldPath: "status" },
                op: "EQUAL",
                value: { stringValue: "approved" },
              },
            },
            limit: 500,
          },
        }),
      },
    );

    if (!res.ok) {
      throw new Error("Could not load stores. Please try again.");
    }

    const json = (await res.json()) as Array<{
      document?: { name: string; fields?: Record<string, unknown> };
    }>;

    const stores: Array<
      Pick<
        PublicStoreData,
        "shopName" | "shopSlug" | "description" | "logoUrl" | "city" | "area" | "country"
      >
    > = [];

    for (const entry of json) {
      if (!entry.document) continue;
      const fields = fromFsFields((entry.document.fields ?? {}) as Record<string, never>) as Record<
        string,
        unknown
      >;
      const slug = String(fields.shopSlug ?? "").trim();
      const name = String(fields.shopName ?? "").trim();
      if (!slug || !name) continue; // not publicly reachable yet
      stores.push({
        shopName: name,
        shopSlug: slug,
        description: String(fields.description ?? ""),
        logoUrl: (fields.logoUrl as string | null) ?? null,
        city: String(fields.city ?? ""),
        area: (fields.area as string | null) ?? null,
        country: String(fields.country ?? ""),
      });
    }

    // Sort by shop name for a stable, browsable directory
    stores.sort((a, b) => a.shopName.localeCompare(b.shopName));
    return stores;
  });
