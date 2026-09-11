/**
 * AVENTA SHOP — Real Marketplace Stats (public)
 *
 * Backs the About page (and anywhere else) with REAL numbers computed
 * from Firestore, replacing the old hardcoded "10K+ / 50K+ / 500+"
 * marketing figures that had no basis in actual data.
 *
 * SECURITY: returns only aggregate COUNTS — no documents, no personal
 * or private data of any kind.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export interface MarketplaceStats {
  /** Total products in the catalog */
  products: number;
  /** Sellers approved to sell publicly */
  sellers: number;
  /** Registered customer accounts */
  customers: number;
  /** Orders delivered to customers */
  ordersDelivered: number;
}

/**
 * Count documents in a collection using paged list requests with a
 * single-field mask (tiny payloads). Firestore REST v1 does not expose
 * a reliable JSON count aggregation, so we page through names only.
 * Caps at 30 pages (30,000 docs) per collection — far beyond current
 * volumes, and a cap keeps a runaway collection from stalling requests.
 */
async function countDocs(
  token: string,
  projectId: string,
  collectionId: string,
  maskField: string,
  filter?: { field: string; op: string; value: { stringValue: string } },
): Promise<number> {
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionId}`;

  // Single-field filters go through runQuery with a cheap projection
  if (filter) {
    const res = await fetch(`${baseUrl}:runQuery`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId }],
          select: { fields: [{ fieldPath: maskField }] },
          where: {
            fieldFilter: {
              field: { fieldPath: filter.field },
              op: filter.op,
              value: filter.value,
            },
          },
          limit: 30000,
        },
      }),
    });
    if (!res.ok) return 0;
    const json = (await res.json()) as Array<{ document?: unknown }>;
    return json.filter((e) => e.document).length;
  }

  // No filter: page through list requests, masked to one field
  let count = 0;
  let pageToken: string | undefined;
  for (let page = 0; page < 30; page++) {
    const params = new URLSearchParams({ pageSize: "1000", "mask.fieldPaths": maskField });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetch(`${baseUrl}?${params.toString()}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) return count;
    const json = (await res.json()) as {
      documents?: unknown[];
      nextPageToken?: string;
    };
    count += json.documents?.length ?? 0;
    if (!json.nextPageToken) break;
    pageToken = json.nextPageToken;
  }
  return count;
}

export const getMarketplaceStats = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({}).parse(data ?? {}))
  .handler(async () => {
    const { getAccessToken, getProjectId } = await import("./firebase-admin.server");
    const token = await getAccessToken();
    const projectId = getProjectId();

    const [products, sellers, customers, ordersDelivered] = await Promise.all([
      countDocs(token, projectId, "products", "status"),
      countDocs(token, projectId, "sellers", "status", {
        field: "status",
        op: "EQUAL",
        value: { stringValue: "approved" },
      }),
      countDocs(token, projectId, "users", "email"),
      countDocs(token, projectId, "orders", "status", {
        field: "status",
        op: "EQUAL",
        value: { stringValue: "delivered" },
      }),
    ]);

    const stats: MarketplaceStats = { products, sellers, customers, ordersDelivered };
    return stats;
  });
