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
import { getProjectId } from "../firebase-admin.server";
import { getActiveCampaignHome } from "./campaigns.server";

export const getPublicCampaignHome = createServerFn({ method: "GET" })
  .handler(async () => {
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
