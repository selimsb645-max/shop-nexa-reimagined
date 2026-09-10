/**
 * Dynamic Sitemap Generator for AVENTA SHOP
 *
 * Server-side sitemap that reads from Firestore via the REST API
 * (same pattern as checkout.server.ts / promo.server.ts).
 *
 * Only fetches slug, status, approved, updatedAt, createdAt fields.
 * Caches the result for 15 minutes to avoid hammering Firestore.
 */

import { getProjectId, getAccessToken, fromFsFields, type FsValue } from "./firebase-admin.server";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority: string;
}

interface ProductSitemapData {
  slug: string;
  updatedAt?: number;
  createdAt?: number;
}

interface CategorySitemapData {
  slug: string;
  updatedAt?: number;
  createdAt?: number;
}

interface SubcategorySitemapData {
  slug: string;
  parentSlug: string;
}

/* ------------------------------------------------------------------ */
/* Config                                                             */
/* ------------------------------------------------------------------ */

function getSiteUrl(): string {
  return (
    (typeof Deno !== "undefined" && (Deno.env.get("SITE_URL") ?? Deno.env.get("VITE_SITE_URL"))) ||
    "https://aventa-shop.com"
  );
}
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/* ------------------------------------------------------------------ */
/* In-memory cache                                                    */
/* ------------------------------------------------------------------ */

let cachedXml: string | null = null;
let cachedAt = 0;

/* ------------------------------------------------------------------ */
/* Firestore REST helpers                                            */
/* ------------------------------------------------------------------ */

function fsBaseUrl(projectId: string): string {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

/** Run a structured query and return parsed field maps. */
async function runQuery(
  projectId: string,
  collectionId: string,
  fields: string[],
  filters?: unknown,
  limit?: number,
): Promise<Record<string, unknown>[]> {
  const token = await getAccessToken();
  const structuredQuery: Record<string, unknown> = {
    from: [{ collectionId }],
    select: { fields: fields.map((f) => ({ fieldPath: f })) },
  };
  if (filters) structuredQuery.where = filters;
  if (limit) structuredQuery.limit = limit;

  const res = await fetch(`${fsBaseUrl(projectId)}:runQuery`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ structuredQuery }),
  });
  if (!res.ok) {
    throw new Error(`Firestore query failed for ${collectionId} (${res.status})`);
  }
  const json = (await res.json()) as Array<{
    document?: { fields?: Record<string, FsValue> };
  }>;
  const results: Record<string, unknown>[] = [];
  for (const entry of json) {
    if (entry.document?.fields) {
      results.push(fromFsFields(entry.document.fields));
    }
  }
  return results;
}

/* ------------------------------------------------------------------ */
/* Data fetchers                                                      */
/* ------------------------------------------------------------------ */

async function fetchProducts(projectId: string): Promise<ProductSitemapData[]> {
  const filters = {
    compositeFilter: {
      op: "AND",
      filters: [
        {
          fieldFilter: {
            field: { fieldPath: "status" },
            op: "EQUAL",
            value: { stringValue: "published" },
          },
        },
      ],
    },
  };
  const docs = await runQuery(
    projectId,
    "products",
    ["slug", "status", "approved", "updatedAt", "createdAt"],
    filters,
    50000,
  );
  const products: ProductSitemapData[] = [];
  const seen = new Set<string>();
  for (const d of docs) {
    const slug = String(d.slug ?? "").trim();
    if (!slug || seen.has(slug)) continue;
    if (d.approved === false) continue; // skip pending
    seen.add(slug);
    products.push({
      slug,
      updatedAt: typeof d.updatedAt === "number" ? d.updatedAt : undefined,
      createdAt: typeof d.createdAt === "number" ? d.createdAt : undefined,
    });
  }
  return products;
}

async function fetchCategoriesAndSubs(
  projectId: string,
): Promise<{ categories: CategorySitemapData[]; subcategories: SubcategorySitemapData[] }> {
  const token = await getAccessToken();

  // List all category documents (includes doc IDs)
  const listRes = await fetch(`${fsBaseUrl(projectId)}/categories?pageSize=1000`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!listRes.ok) {
    throw new Error(`Failed to list categories (${listRes.status})`);
  }
  const listJson = (await listRes.json()) as {
    documents?: Array<{ name: string; fields?: Record<string, FsValue> }>;
  };

  const categories: CategorySitemapData[] = [];
  const subcategories: SubcategorySitemapData[] = [];
  const catSeen = new Set<string>();

  for (const doc of listJson.documents ?? []) {
    const docId = doc.name.split("/").pop() ?? "";
    const fields = doc.fields ? fromFsFields(doc.fields) : {};
    const catSlug = String(fields.slug ?? "").trim();
    if (!catSlug || catSeen.has(catSlug)) continue;
    catSeen.add(catSlug);
    categories.push({
      slug: catSlug,
      updatedAt: typeof fields.updatedAt === "number" ? fields.updatedAt : undefined,
      createdAt: typeof fields.createdAt === "number" ? fields.createdAt : undefined,
    });

    // List subcategories for this category
    try {
      const subRes = await fetch(
        `${fsBaseUrl(projectId)}/categories/${docId}/subcategories?pageSize=1000`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      if (!subRes.ok) continue;
      const subJson = (await subRes.json()) as {
        documents?: Array<{ fields?: Record<string, FsValue> }>;
      };
      const subSeen = new Set<string>();
      for (const subDoc of subJson.documents ?? []) {
        const subFields = subDoc.fields ? fromFsFields(subDoc.fields) : {};
        const subSlug = String(subFields.slug ?? "").trim();
        if (!subSlug || subSeen.has(subSlug)) continue;
        subSeen.add(subSlug);
        subcategories.push({ slug: subSlug, parentSlug: catSlug });
      }
    } catch {
      // Subcategories are best-effort; skip on error
    }
  }

  return { categories, subcategories };
}

/* ------------------------------------------------------------------ */
/* XML generation                                                     */
/* ------------------------------------------------------------------ */

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function tsToIso(ts?: number): string | undefined {
  if (!ts || ts <= 0) return undefined;
  try {
    return new Date(ts).toISOString().split(".")[0] + "Z";
  } catch {
    return undefined;
  }
}

function urlEntry(u: SitemapUrl): string {
  const lines = ["  <url>", `    <loc>${escapeXml(u.loc)}</loc>`];
  if (u.lastmod) lines.push(`    <lastmod>${u.lastmod}</lastmod>`);
  if (u.changefreq) lines.push(`    <changefreq>${u.changefreq}</changefreq>`);
  lines.push(`    <priority>${u.priority}</priority>`);
  lines.push("  </url>");
  return lines.join("\n");
}

/** Static public pages that actually exist in the app. */
function staticPages(): SitemapUrl[] {
  return [
    { loc: `${getSiteUrl()}/`, changefreq: "daily", priority: "1.0" },
    { loc: `${getSiteUrl()}/shop`, changefreq: "daily", priority: "0.9" },
    { loc: `${getSiteUrl()}/flash-sales`, changefreq: "daily", priority: "0.8" },
    { loc: `${getSiteUrl()}/blog`, changefreq: "weekly", priority: "0.7" },
    { loc: `${getSiteUrl()}/compare`, changefreq: "weekly", priority: "0.5" },
    { loc: `${getSiteUrl()}/help-center`, changefreq: "monthly", priority: "0.5" },
    { loc: `${getSiteUrl()}/about`, changefreq: "monthly", priority: "0.5" },
    { loc: `${getSiteUrl()}/contact`, changefreq: "monthly", priority: "0.5" },
    { loc: `${getSiteUrl()}/mart`, changefreq: "weekly", priority: "0.6" },
    { loc: `${getSiteUrl()}/returns-policy`, changefreq: "monthly", priority: "0.4" },
    { loc: `${getSiteUrl()}/how-to-buy`, changefreq: "monthly", priority: "0.4" },
    { loc: `${getSiteUrl()}/track-orders-info`, changefreq: "monthly", priority: "0.4" },
    { loc: `${getSiteUrl()}/digital-payments`, changefreq: "monthly", priority: "0.4" },
    { loc: `${getSiteUrl()}/affiliate`, changefreq: "monthly", priority: "0.4" },
    { loc: `${getSiteUrl()}/privacy`, changefreq: "yearly", priority: "0.3" },
    { loc: `${getSiteUrl()}/terms`, changefreq: "yearly", priority: "0.3" },
  ];
}

/** Static blog post URLs */
function blogPostPages(): SitemapUrl[] {
  const slugs = [
    "best-deals-flash-sales",
    "buying-electronics-online-bangladesh",
    "bkash-vs-nagad-vs-rocket",
    "top-10-fashion-trends-2026",
  ];
  return slugs.map((slug) => ({
    loc: `${getSiteUrl()}/blog/${slug}`,
    changefreq: "weekly" as const,
    priority: "0.6",
  }));
}

function buildXml(urls: SitemapUrl[]): string {
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls.map(urlEntry),
    `</urlset>`,
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* Main generator                                                      */
/* ------------------------------------------------------------------ */

export async function generateSitemap(): Promise<{ xml: string; count: number }> {
  // Return cache if fresh
  if (cachedXml && Date.now() - cachedAt < CACHE_TTL_MS) {
    return { xml: cachedXml, count: 0 };
  }

  const projectId = getProjectId();
  const urls: SitemapUrl[] = [];
  const seenUrls = new Set<string>();

  function addUrl(
    loc: string,
    lastmod?: string,
    changefreq?: SitemapUrl["changefreq"],
    priority = "0.6",
  ) {
    const normalized = loc.replace(/\/+$/, "");
    const key = normalized === getSiteUrl() ? `${getSiteUrl()}/` : normalized;
    if (seenUrls.has(key)) return;
    seenUrls.add(key);
    urls.push({ loc, lastmod, changefreq, priority });
  }

  // 1. Static pages
  for (const page of staticPages()) {
    addUrl(page.loc, page.lastmod, page.changefreq, page.priority);
  }

  // 1b. Blog posts
  for (const page of blogPostPages()) {
    addUrl(page.loc, page.lastmod, page.changefreq, page.priority);
  }

  // 2. Categories + Subcategories
  try {
    const { categories, subcategories } = await fetchCategoriesAndSubs(projectId);
    for (const cat of categories) {
      addUrl(
        `${getSiteUrl()}/category/${encodeURIComponent(cat.slug)}`,
        tsToIso(cat.updatedAt ?? cat.createdAt),
        "weekly",
        "0.7",
      );
    }
    for (const sub of subcategories) {
      addUrl(
        `${getSiteUrl()}/category/${encodeURIComponent(sub.parentSlug)}/${encodeURIComponent(sub.slug)}`,
        undefined,
        "weekly",
        "0.6",
      );
    }
  } catch (err) {
    console.error("[sitemap] Failed to fetch categories:", err);
  }

  // 3. Products
  try {
    const products = await fetchProducts(projectId);
    for (const p of products) {
      addUrl(
        `${getSiteUrl()}/product/${encodeURIComponent(p.slug)}`,
        tsToIso(p.updatedAt ?? p.createdAt),
        "weekly",
        "0.8",
      );
    }
  } catch (err) {
    console.error("[sitemap] Failed to fetch products:", err);
  }

  // 4. Stores/Sellers
  // FIX: store data lives in the `sellers` collection with a `shopSlug`
  // field (not a `stores` collection with `slug`) — the old query read a
  // non-existent collection and produced no store URLs at all.
  try {
    const sellerRows = await runQuery(
      projectId,
      "sellers",
      ["shopSlug", "status"],
      {
        fieldFilter: {
          field: { fieldPath: "status" },
          op: "EQUAL",
          value: { stringValue: "approved" },
        },
      },
      1000,
    );
    for (const fields of sellerRows) {
      const slug = String(fields.shopSlug ?? "").trim();
      if (!slug) continue;
      addUrl(
        `${getSiteUrl()}/store/${encodeURIComponent(slug)}`,
        undefined,
        "weekly",
        "0.6",
      );
    }
  } catch (err) {
    console.error("[sitemap] Failed to fetch stores:", err);
  }

  const xml = buildXml(urls);
  cachedXml = xml;
  cachedAt = Date.now();

  return { xml, count: urls.length };
}

/** Force-clear the cache (e.g. after a product/category change). */
export function invalidateSitemapCache(): void {
  cachedXml = null;
  cachedAt = 0;
}
