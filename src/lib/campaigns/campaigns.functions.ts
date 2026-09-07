/**
 * AVENTA SHOP — Public Campaign Server Function (Prompt 05 §5, §12)
 *
 * The storefront fetches campaign/homepage content ONLY through this
 * function. It:
 *
 *   1. Lazily advances campaign states against the SERVER clock
 *      (§4 — never trusts a device countdown).
 *   2. Returns a SANITIZED public view: banner, name, description and
 *      the countdown endAt. Coupon rules, discount configuration,
 *      seller eligibility lists and admin internals are NEVER exposed
 *      (§12).
 *
 * Additive only — no existing storefront code is modified by this module.
 */
import { createServerFn } from "@tanstack/react-start";
import { getProjectId, batchGetDocs, docPath } from "../firebase-admin.server";
import { getActiveCampaignHome } from "./campaigns.server";

import type { PublicFlashSale } from "./flashSale.server";

export const getPublicCampaignHome = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const projectId = getProjectId();
    return await getActiveCampaignHome(projectId);
  } catch {
    // Campaign infrastructure is best-effort on the storefront —
    // a campaign error must never break the homepage.
    return {
      campaign: null,
      home: {
        campaignId: null,
        campaignName: null,
        heroBanner: null,
        campaignBanner: null,
        flashSaleSection: false,
        featuredProductIds: [],
        switchedAt: null,
      },
    };
  }
});

/**
 * Public flash-sale view for the storefront (Prompt 05 §5 wiring).
 * Runs off the ACTIVE campaign home; when the homepage has no
 * campaign or the flash sale is out of window/sold out, returns null
 * so the storefront can drop the section. Never throws — flash-sale
 * failures must never break a customer page.
 */
export const getPublicCampaignFlashSale = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const projectId = getProjectId();
    const home = await getActiveCampaignHome(projectId);
    if (!home.campaign || !home.home.flashSaleSection) return null;
    const { getPublicActiveFlashSale } = await import("./flashSale.server");
    const sale = await getPublicActiveFlashSale(projectId, home.campaign.campaignId);
    if (!sale?.productId) return sale;
    // Reserve→order wiring: attach the PUBLIC product info the bar
    // needs for its Buy Now link (all product fields here are
    // already public on every storefront listing — sanitized).
    const path = docPath(projectId, ["products", sale.productId]);
    const docs = await batchGetDocs(projectId, [path]);
    const p = docs.get(path);
    if (!p?.exists) return sale;
    const d = p.data as Record<string, unknown>;
    const enriched: PublicFlashSale = {
      ...sale,
      product: {
        slug: (d["slug"] as string | null) ?? null,
        title: (d["title"] as string | null) ?? null,
        image: (d["image"] as string | null) ?? (d["images"] as string[] | null)?.[0] ?? null,
      },
    };
    return enriched;
  } catch {
    return null;
  }
});
